from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from pillow_heif import register_heif_opener
import io
import logging

# Simple logger that prints to stdout/stderr so container logs capture errors
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pv-metadata")

register_heif_opener()
app = FastAPI(title="HEIC Metadata Microservice")

def dms_to_decimal(coords, ref):
    if not coords or not ref: return None
    try:
        d, m, s = [float(x) for x in coords]
        decimal = d + (m / 60.0) + (s / 3600.0)
        if ref in ['S', 'W']: decimal = -decimal
        return round(decimal, 6)
    except: return None

@app.post("/extract")
async def extract_metadata(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.heic', '.heif')):
        raise HTTPException(status_code=400, detail="Only HEIC/HEIF files supported")

    try:
        content = await file.read()
        img = Image.open(io.BytesIO(content))
        exif_raw = img.getexif()

        if not exif_raw:
            return {"filename": file.filename, "metadata": {}}

        # Extract sub-IFDs
        exif_details = exif_raw.get_ifd(0x8769)
        gps_details = exif_raw.get_ifd(0x8825)

        # Build clean response
        payload = {
            "device": {
                "make": exif_raw.get(271),
                "model": exif_raw.get(272),
                "software": exif_raw.get(305)
            },
            "exposure": {
                "iso": exif_details.get(34855) if exif_details else None,
                "f_number": str(exif_details.get(33437)) if exif_details else None,
                "exposure_time": str(exif_details.get(33434)) if exif_details else None,
                "lens": exif_details.get(42036) if exif_details else None
            },
            "location": None
        }

        if gps_details:
            lat = dms_to_decimal(gps_details.get(2), gps_details.get(1))
            lon = dms_to_decimal(gps_details.get(4), gps_details.get(3))
            if lat and lon:
                payload["location"] = {"lat": lat, "lon": lon, "alt": float(gps_details.get(6, 0))}

        return payload

    except Exception as e:
        # Log full exception with traceback for diagnostics
        try:
            logger.exception("Error extracting metadata for %s", getattr(file, 'filename', '<unknown>'))
        except Exception:
            # Fallback to printing if logger fails for any reason
            import traceback

            print("Error extracting metadata:", str(e))
            traceback.print_exc()
        # Surface a concise error to the client
        raise HTTPException(status_code=500, detail=str(e))