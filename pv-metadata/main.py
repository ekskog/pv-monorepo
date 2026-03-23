from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from pillow_heif import register_heif_opener
from datetime import datetime
import io
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pv-metadata")

class EndpointFilter(logging.Filter):
    def filter(self, record):
        return "GET /health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

register_heif_opener()

app = FastAPI(title="HEIC Metadata Microservice")

@app.get("/health")
def health():
    return {"status": "ok"}

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

def parse_timestamp(raw):
    if not raw:
        return None
    try:
        dt = datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except:
        try:
            return datetime.fromisoformat(str(raw)).isoformat() + "Z"
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

@app.post("/extract")
async def extract_metadata(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.heic', '.heif', '.jpg', '.jpeg', '.png')):
        raise HTTPException(status_code=400, detail="Unsupported file type")

    try:
        content = await file.read()
        img = Image.open(io.BytesIO(content))
        exif_raw = img.getexif()

        if not exif_raw:
            return {"filename": file.filename, "metadata": {}}

        exif_details = exif_raw.get_ifd(0x8769)
        gps_details  = exif_raw.get_ifd(0x8825)

        # Timestamp
        raw_date = (
            exif_details.get(36867) or
            exif_details.get(36868) or
            exif_raw.get(306)
        )
        timestamp = parse_timestamp(raw_date)

        # GPS
        coordinates = None
        altitude = None
        if gps_details:
            lat = dms_to_decimal(gps_details.get(2), gps_details.get(1))
            lon = dms_to_decimal(gps_details.get(4), gps_details.get(3))
            if lat is not None and lon is not None:
                coordinates = f"{lat},{lon}"
                alt = gps_details.get(6)
                if alt is not None:
                    altitude = round(float(alt), 2)

        payload = {
            "timestamp":   timestamp,
            "coordinates": coordinates,
            "altitude":    altitude,
            "device": {
                "make":     exif_raw.get(271),
                "model":    exif_raw.get(272),
                "software": exif_raw.get(305)
            },
            "exposure": {
                "iso":           exif_details.get(34855) if exif_details else None,
                "f_number":      format_rational(exif_details.get(33437)) if exif_details else None,
                "exposure_time": format_rational(exif_details.get(33434)) if exif_details else None,
                "focal_length":  format_rational(exif_details.get(37386)) if exif_details else None,
                "flash":         exif_details.get(37385) if exif_details else None,
                "white_balance": exif_details.get(41987) if exif_details else None,
                "lens":          exif_details.get(42036) if exif_details else None
            },
            "dimensions": {
                "width":       exif_raw.get(256) or (exif_details.get(40962) if exif_details else None),
                "height":      exif_raw.get(257) or (exif_details.get(40963) if exif_details else None),
                "orientation": exif_raw.get(274),
                "color_space": exif_details.get(40961) if exif_details else None,
                "resolution": {
                    "x": format_rational(exif_raw.get(282)),
                    "y": format_rational(exif_raw.get(283))
                }
            }
        }

        return payload

    except Exception as e:
        logger.exception("Error extracting metadata for %s", getattr(file, 'filename', '<unknown>'))
        raise HTTPException(status_code=500, detail=str(e))