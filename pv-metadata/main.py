from fastapi import FastAPI, UploadFile, File
from PIL import Image, ExifTags
import io

app = FastAPI()

def parse_exif(exif_data):
    if not exif_data:
        return {}
    
    # Map numerical tags to human-readable labels
    data = {ExifTags.TAGS.get(k, k): v for k, v in exif_data.items()}
    
    # Helper to clean Rational types (e.g., (1, 100) -> 0.01)
    def clean_val(val):
        if isinstance(val, tuple) and len(val) == 2 and val[1] != 0:
            return round(val[0] / val[1], 4)
        return val

    return {
        "make": data.get("Make"),
        "model": data.get("Model"),
        "software": data.get("Software"),
        "iso": data.get("ISOSpeedRatings"),
        "aperture": clean_val(data.get("FNumber")),
        "shutter_speed": clean_val(data.get("ExposureTime")),
        "focal_length": clean_val(data.get("FocalLength")),
        "lens": data.get("LensModel"),
        "created_at": data.get("DateTimeOriginal") or data.get("DateTime"),
        "flash": data.get("Flash"),
        "white_balance": data.get("WhiteBalance"),
        "orientation": data.get("Orientation")
    }

@app.post("/extract")
async def extract_metadata(file: UploadFile = File(...)):
    contents = await file.read()
    img = Image.open(io.BytesIO(contents))
    
    # Dimensions are always available via Pillow, regardless of EXIF
    width, height = img.size
    exif = parse_exif(img._getexif())

    return {
        "dimensions": {
            "width": width,
            "height": height,
            "orientation": exif.get("orientation")
        },
        "device": {
            "make": exif.get("make"),
            "model": exif.get("model"),
            "software": exif.get("software"),
            "lens": exif.get("lens"),
            "created_at": exif.get("created_at")
        },
        "exposure": {
            "iso": exif.get("iso"),
            "aperture": exif.get("aperture"),
            "shutter_speed": exif.get("shutter_speed"),
            "focal_length": exif.get("focal_length"),
            "flash": exif.get("flash"),
            "white_balance": exif.get("white_balance")
        }
    }