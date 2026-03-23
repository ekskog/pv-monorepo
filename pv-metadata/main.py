from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from PIL import Image
from pillow_heif import register_heif_opener
from datetime import datetime
from minio import Minio
from minio.error import S3Error
import io
import json
import logging
import os
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pv-metadata")

class EndpointFilter(logging.Filter):
    def filter(self, record):
        return "GET /health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

register_heif_opener()

# MinIO client — credentials from k8s secret (pv-api-secret)
minio_client = Minio(
    endpoint=os.environ["MINIO_ENDPOINT"],        # e.g. "192.168.1.8:9000"
    access_key=os.environ["MINIO_ACCESS_KEY"],
    secret_key=os.environ["MINIO_SECRET_KEY"],
    secure=False,
)

MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "photovault")

app = FastAPI(title="PV Metadata Microservice")

@app.get("/health")
def health():
    return {"status": "ok"}

# ── Helpers ────────────────────────────────────────────────────────────────────

def dms_to_decimal(coords, ref):
    if not coords or not ref:
        return None
    try:
        d, m, s = [float(x) for x in coords]
        decimal = d + (m / 60.0) + (s / 3600.0)
        if ref in ['S', 'W']:
            decimal = -decimal
        return round(decimal, 6)
    except:
        return None

def parse_timestamp(raw, offset=None):
    if not raw:
        return None
    try:
        dt = datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
        if offset:
            return dt.strftime("%Y-%m-%dT%H:%M:%S") + str(offset)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except:
        try:
            return datetime.fromisoformat(str(raw)).isoformat()
        except:
            return str(raw)

def format_rational(value):
    if value is None:
        return None
    try:
        f = float(value)
        if 0 < f < 1:
            return f"1/{round(1/f)}"
        return round(f, 4)
    except:
        return str(value)

async def reverse_geocode(lat, lon):
    if not MAPBOX_TOKEN:
        logger.warning("MAPBOX_TOKEN not set, skipping reverse geocoding")
        return "not found"
    try:
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{lon},{lat}.json"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params={
                "access_token": MAPBOX_TOKEN,
                "types": "address,poi,place"
            })
        if resp.status_code == 200:
            data = resp.json()
            if data.get("features"):
                return data["features"][0].get("place_name", "not found")
    except Exception as e:
        logger.warning(f"Reverse geocode failed: {e}")
    return "not found"

def write_metadata_to_minio(bucket, object_name, metadata):
    """
    Read existing album JSON from MinIO, upsert this image's metadata, write back.
    object_name is e.g. "test/IMG_4293.avif"
    JSON file is e.g. "test/test.json"
    """
    folder = object_name.split("/")[0]
    json_key = f"{folder}/{folder}.json"

    # Try to load existing JSON
    try:
        response = minio_client.get_object(bucket, json_key)
        folder_data = json.loads(response.read().decode("utf-8"))
    except S3Error as e:
        if e.code == "NoSuchKey":
            folder_data = {
                "album": {
                    "name": folder,
                    "created": datetime.utcnow().isoformat() + "Z",
                    "totalObjects": 0,
                    "totalSize": 0,
                    "lastModified": datetime.utcnow().isoformat() + "Z",
                },
                "media": [],
                "lastUpdated": datetime.utcnow().isoformat() + "Z",
            }
        else:
            raise

    # Upsert — remove existing entry for this image if present
    folder_data["media"] = [
        m for m in folder_data.get("media", [])
        if m.get("sourceImage") != object_name
    ]
    folder_data["media"].append(metadata)
    folder_data["lastUpdated"] = datetime.utcnow().isoformat() + "Z"

    json_bytes = json.dumps(folder_data, indent=2).encode("utf-8")
    minio_client.put_object(
        bucket,
        json_key,
        io.BytesIO(json_bytes),
        length=len(json_bytes),
        content_type="application/json",
    )
    logger.info(f"Metadata written to MinIO: {bucket}/{json_key}")

# ── Endpoint ───────────────────────────────────────────────────────────────────

@app.post("/extract")
async def extract_metadata(
    file: UploadFile = File(...),
    object_name: str = Form(...),   # e.g. "test/IMG_4293.avif"
    bucket: str = Form(MINIO_BUCKET),
):
    if not file.filename.lower().endswith(('.heic', '.heif', '.jpg', '.jpeg', '.png')):
        raise HTTPException(status_code=400, detail="Unsupported file type")

    try:
        content = await file.read()
        img = Image.open(io.BytesIO(content))
        exif_raw = img.getexif()

        if not exif_raw:
            logger.warning(f"No EXIF data found in {file.filename}")
            return {"object_name": object_name, "metadata": {}}

        exif_details = exif_raw.get_ifd(0x8769)
        gps_details  = exif_raw.get_ifd(0x8825)

        # Timestamp
        raw_date = (
            (exif_details.get(36867) if exif_details else None) or
            (exif_details.get(36868) if exif_details else None) or
            exif_raw.get(306)
        )
        offset = (
            exif_details.get(36881) or
            exif_details.get(36882) or
            exif_details.get(36880)
        ) if exif_details else None
        timestamp = parse_timestamp(raw_date, offset)

        # GPS + reverse geocode
        coordinates = None
        altitude    = None
        location    = "not found"
        if gps_details:
            lat = dms_to_decimal(gps_details.get(2), gps_details.get(1))
            lon = dms_to_decimal(gps_details.get(4), gps_details.get(3))
            if lat is not None and lon is not None:
                coordinates = f"{lat},{lon}"
                alt = gps_details.get(6)
                if alt is not None:
                    altitude = round(float(alt), 2)
                location = await reverse_geocode(lat, lon)

        metadata = {
            "sourceImage": object_name,
            "timestamp":   timestamp   or "not found",
            "location":    location,
            "coordinates": coordinates or "not found",
            "altitude":    altitude,
            "camera": {
                "make":     exif_raw.get(271)                              or "not found",
                "model":    exif_raw.get(272)                              or "not found",
                "software": exif_raw.get(305)                              or "not found",
                "lens":     (exif_details.get(42036) if exif_details else None) or "not found",
            },
            "settings": {
                "iso":           (exif_details.get(34855) if exif_details else None) or "not found",
                "aperture":      format_rational(exif_details.get(33437) if exif_details else None) or "not found",
                "shutterSpeed":  format_rational(exif_details.get(33434) if exif_details else None) or "not found",
                "focalLength":   format_rational(exif_details.get(37386) if exif_details else None) or "not found",
                "flash":         (exif_details.get(37385) if exif_details else None) or "not found",
                "whiteBalance":  (exif_details.get(41987) if exif_details else None) or "not found",
            },
            "dimensions": {
                "width":       exif_raw.get(256) or (exif_details.get(40962) if exif_details else None) or "not found",
                "height":      exif_raw.get(257) or (exif_details.get(40963) if exif_details else None) or "not found",
                "orientation": exif_raw.get(274) or "not found",
                "colorSpace":  (exif_details.get(40961) if exif_details else None) or "not found",
                "resolution": {
                    "x": format_rational(exif_raw.get(282)) or "not found",
                    "y": format_rational(exif_raw.get(283)) or "not found",
                },
            },
        }

        # Write to MinIO
        write_metadata_to_minio(bucket, object_name, metadata)

        return {"object_name": object_name, "status": "ok", "metadata": metadata}

    except Exception as e:
        logger.exception("Error extracting metadata for %s", getattr(file, 'filename', '<unknown>'))
        raise HTTPException(status_code=500, detail=str(e))