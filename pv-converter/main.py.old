# rebuild image on 06.03.2026 / 13.33
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import Response
from converter import convert_to_avif
from minio import Minio
from minio.error import S3Error
import psutil
import os
import subprocess
import logging
from logging.handlers import TimedRotatingFileHandler
import tracemalloc
import time
import gc
import io

app = FastAPI()

log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(log_dir, exist_ok=True)
log_path = os.path.join(log_dir, "converter.log")

formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)

file_handler = TimedRotatingFileHandler(log_path, when="midnight", interval=1, backupCount=30, utc=True, encoding="utf-8")
file_handler.suffix = "%Y-%m-%d"
file_handler.setFormatter(formatter)

logging.basicConfig(level=logging.INFO, handlers=[stream_handler, file_handler])

class HealthEndpointFilter(logging.Filter):
    def filter(self, record):
        return "/health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(HealthEndpointFilter())

# MinIO client
minio_client = Minio(
    endpoint=os.environ["MINIO_ENDPOINT"],
    access_key=os.environ["MINIO_ACCESS_KEY"],
    secret_key=os.environ["MINIO_SECRET_KEY"],
    secure=False,
)

def get_memory_info():
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    return {
        "rss_mb": round(memory_info.rss / 1024 / 1024, 2),
        "vms_mb": round(memory_info.vms / 1024 / 1024, 2),
        "percent": round(process.memory_percent(), 2)
    }

@app.get("/health")
async def health_check():
    avifenc_available = False
    try:
        result = subprocess.run(["avifenc", "--version"], capture_output=True, text=True, timeout=5)
        avifenc_available = result.returncode == 0
    except subprocess.TimeoutExpired:
        logging.error("[HEALTH] avifenc check timed out")
    except Exception as e:
        logging.error(f"[HEALTH] avifenc check error: {e}")

    try:
        memory = get_memory_info()
    except Exception as e:
        logging.error(f"[HEALTH] Error fetching memory info: {e}")
        memory = {"error": str(e)}

    return {
        "status": "healthy" if avifenc_available else "unhealthy",
        "service": "pv-avif-converter",
        "memory": memory,
        "capabilities": {"avifenc": avifenc_available}
    }

@app.post("/convert")
async def convert_image(
    image: UploadFile = File(...),
    object_name: str = Form(...),   # e.g. "test/IMG_4293.avif"
    bucket: str = Form(...),
):
    logging.info(f"[CONVERT] Request received for {image.filename} -> {object_name}")

    memory_before = get_memory_info()
    logging.info(f"[CONVERT] Memory before conversion: {memory_before}")

    mime_type = image.content_type
    if mime_type not in ["image/jpeg", "image/heic"]:
        logging.error(f"[CONVERT] Unsupported mime type: {mime_type}")
        raise HTTPException(status_code=400, detail="Only JPEG and HEIC images are supported.")

    file_type = "jpeg" if mime_type == "image/jpeg" else "heic"
    image_data = await image.read()
    logging.info(f"[CONVERT] File size: {len(image_data)} bytes")

    tracemalloc.start()
    gc.collect()
    start_time = time.time()

    try:
        avif_data = convert_to_avif(image_data, file_type, image.filename)
    except Exception as e:
        logging.error(f"[CONVERT] Conversion failed: {str(e)}")
        tracemalloc.stop()
        raise HTTPException(status_code=500, detail="Conversion failed.")

    end_time = time.time()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    memory_after = get_memory_info()
    logging.info(f"[CONVERT] Memory after conversion: {memory_after}")
    logging.info(f"[CONVERT] Peak memory during conversion: {peak / 1024 / 1024:.2f}MB")
    logging.info(f"[CONVERT] Conversion time: {end_time - start_time:.2f}s")

    # Write AVIF directly to MinIO
    try:
        minio_client.put_object(
            bucket,
            object_name,
            io.BytesIO(avif_data),
            length=len(avif_data),
            content_type="image/avif",
        )
        logging.info(f"[CONVERT] Written to MinIO: {bucket}/{object_name}")
    except Exception as e:
        logging.error(f"[CONVERT] MinIO write failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"MinIO write failed: {str(e)}")

    return {
        "success": True,
        "object_name": object_name,
        "metrics": {
            "memoryBeforeMB": memory_before,
            "memoryAfterMB": memory_after,
            "peakMemoryMB": round(peak / 1024 / 1024, 2),
            "conversionTimeSec": round(end_time - start_time, 2)
        }
    }