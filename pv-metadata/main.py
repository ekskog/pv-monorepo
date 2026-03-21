from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from pillow_heif import register_heif_opener
import io

# Register HEIF opener for Pillow
register_heif_opener()

app = FastAPI(title="PV Metadata Extractor")

def dms_to_decimal(coords, ref):
    """Helper to convert GPS (degrees, minutes, seconds) to decimal."""
    if not coords or not ref:
        return None
    try:
        d, m, s = [float(x) for x in coords]
        decimal = d + (m / 60.0) + (s / 3600.0)
        if ref in ['S', 'W']:
            decimal = -decimal
        return round(decimal, 6)
    except Exception:
        return None

@app.post("/extract")
async def extract_metadata(file: UploadFile = File(...)):
    # Basic validation
    if not file.filename.lower().endswith(('.heic', '.heif')):
        raise HTTPException(status_code=400, detail="Unsupported file format. HEIC/HEIF only.")

    try:
        # Read file into memory
        content = await file.read()
        img = Image.open(io.BytesIO(content))
        exif_raw = img.getexif()
        
        if not exif_raw:
            return {"filename": file.filename, "metadata": {}}

        # Extract standard sub-IFDs (0x8769 = Exif, 0x8825 = GPS)
        exif_details = exif_raw.get_ifd(0x8769)
        gps_details = exif_raw.get_ifd(0x8825)

        # Build response payload
        payload = {
            "device": {
                "make": exif_raw.get(271),
                "model": exif_raw.get(272),
                "software": exif_raw.get(305),
                "created_at": exif_raw.get(306)
            },
            "exposure": {
                "iso": exif_details.get(34855) if exif_details else None,
                "f_number": str(exif_details.get(33437)) if exif_details else None,
                "exposure_time": str(exif_details.get(33434)) if exif_details else None,
                "lens": exif_details.get(42036) if exif_details else None
            },
            "location": None
        }

        # Parse GPS if available
        if gps_details:
            lat = dms_to_decimal(gps_details.get(2), gps_details.get(1))
            lon = dms_to_decimal(gps_details.get(4), gps_details.get(3))
            if lat is not None and lon is not None:
                payload["location"] = {
                    "lat": lat,
                    "lon": lon,
                    "alt": float(gps_details.get(6, 0))
                }

        return payload

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal parsing error: {str(e)}")

@app.get("/health")
async def health():
    return {"status": "ok"}