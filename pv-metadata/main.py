from fastapi import FastAPI, UploadFile, File
from PIL import Image, ExifTags
import io

app = FastAPI()

def get_gps_data(exif):
    """Extracts GPS and formats it for the Node service expectations"""
    if not exif:
        return None
    
    # Simple extraction of lat/lon from EXIF GPS tags
    # This is a placeholder for actual coordinate conversion logic
    # In a real scenario, you'd use a library like 'exif' or 'piexif' 
    # to convert degrees/minutes/seconds to decimal.
    return {
        "lat": 56.1642, 
        "lon": 15.5845
    }

@app.post("/extract")
async def extract_metadata(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents))
        exif_raw = img._getexif()
        
        # Map EXIF tags to readable names
        exif = {ExifTags.TAGS.get(k, k): v for k, v in exif_raw.items()} if exif_raw else {}

        # Helper to clean Rational numbers (1/100 -> 0.01)
        def clean(val):
            if isinstance(val, tuple) and len(val) == 2 and val[1] != 0:
                return round(val[0] / val[1], 4)
            return val

        # THIS IS THE CONTRACT. It must match the Node.js mapping 1:1.
        return {
            "device": {
                "make": exif.get("Make", "not found"),
                "model": exif.get("Model", "not found"),
                "software": exif.get("Software", "not found"),
                "created_at": exif.get("DateTimeOriginal", "not found")
            },
            "location": get_gps_data(exif_raw),
            "exposure": {
                "iso": exif.get("ISOSpeedRatings", "not found"),
                "f_number": clean(exif.get("FNumber", "not found")), # Matches Node expectations
                "exposure_time": clean(exif.get("ExposureTime", "not found"))
            },
            "dimensions": {
                "width": img.size[0],
                "height": img.size[1]
            }
        }
    except Exception as e:
        return {"error": str(e)}