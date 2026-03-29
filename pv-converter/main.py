# rebuild image on 06.03.2026 / 15:00 - Memory Optimized Version
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import Response
from converter import convert_to_avif
from minio import Minio
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

# --- Logging Setup ---
log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(log_dir, exist_ok=True)
log_path = os.path.join(log_dir, "converter.log")
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)
file_handler = TimedRotatingFileHandler(log_path, when="midnight", interval=1, backupCount=30, utc=True, encoding="utf-8")
file_handler.setFormatter(formatter)

logging.basicConfig(level=logging.INFO, handlers=[stream_handler, file_handler])

class HealthEndpointFilter(logging.Filter):
    def filter(self, record):
        return "/health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(HealthEndpointFilter())

# --- MinIO Client ---
minio_client = Minio(
    endpoint=os.environ.get("MINIO_ENDPOINT", "localhost:9000"),
    access_key=os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
    secret_key=os.environ.get("MINIO_SECRET_KEY", "minioadmin"),
    secure=False,
)

def get_memory_info():
    process = psutil.Process(os.getpid())
    mem = process.memory_info()
    return {
        "rss_mb": round(mem.rss / 1024 / 1024, 2),
        "percent": round(process.memory_percent(), 2)
    }

@app.get("/health")
async def health_check():
    """Checks if both required OS binaries are present"""
    avifenc_ok = subprocess.run(["avifenc", "--version"], capture_output=True).returncode == 0
    heifenc_ok = subprocess.run(["heif-enc", "--version"], capture_output=True).returncode == 0
    
    return {
        "status": "healthy" if (avifenc_ok and heifenc_ok) else "unhealthy",
        "memory": get_memory_info(),
        "binaries": {"avifenc": avifenc_ok, "heif-enc": heifenc_ok}
    }

@app.post("/convert")
async def convert_image(
    image: UploadFile = File(...),
    object_name: str = Form(...),
    bucket: str = Form(...),
):
    logging.info(f"[API] Request: {image.filename} -> {object_name}")
    start_time = time.time()
    tracemalloc.start()

    # 1. Validate Type
    mime_type = image.content_type
    if mime_type not in ["image/jpeg", "image/heic"]:
        raise HTTPException(status_code=400, detail=f"Unsupported type: {mime_type}")
    
    file_type = "jpeg" if mime_type == "image/jpeg" else "heic"

    try:
        # 2. Read into RAM (FastAPI requirement)
        image_bytes = await image.read()
        logging.info(f"[API] Received {len(image_bytes) / 1024 / 1024:.2f}MB")

        # 3. CONVERT (This handles disk-offloading internally)
        avif_data = convert_to_avif(image_bytes, file_type)

        # 4. CRITICAL: Clear source image from RAM immediately
        del image_bytes
        gc.collect()

        # 5. Write Result to MinIO
        # Note: We use io.BytesIO to stream the avif_data
        minio_client.put_object(
            bucket,
            object_name,
            io.BytesIO(avif_data),
            length=len(avif_data),
            content_type="image/avif",
        )
        
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        logging.info(f"[API] Success. Peak RAM: {peak / 1024 / 1024:.2f}MB. Time: {time.time() - start_time:.2f}s")

        return {
            "success": True,
            "object_name": object_name,
            "metrics": {
                "peak_mb": round(peak / 1024 / 1024, 2),
                "duration_sec": round(time.time() - start_time, 2)
            }
        }

    except Exception as e:
        logging.error(f"[API] Conversion failed: {str(e)}")
        if tracemalloc.is_tracing():
            tracemalloc.stop()
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Final cleanup for this request cycle
        if 'avif_data' in locals():
            del avif_data
        gc.collect()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)