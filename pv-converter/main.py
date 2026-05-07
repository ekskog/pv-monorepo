from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import Response
from converter import convert_to_avif, generate_thumbnail_webp, cleanup_after_request
from minio import Minio
import psutil
import os
import subprocess
import logging
from logging.handlers import TimedRotatingFileHandler
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
file_handler = TimedRotatingFileHandler(
    log_path, when="midnight", interval=1, backupCount=30, utc=True, encoding="utf-8"
)
file_handler.setFormatter(formatter)

logging.basicConfig(level=logging.INFO, handlers=[stream_handler, file_handler])
logger = logging.getLogger(__name__)


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

# Max input size: 15MB covers all standard iPhone shots including Pro Max 48MP HEIC
MAX_INPUT_BYTES = 15 * 1024 * 1024

SUPPORTED_MIME_TYPES = {
    "image/jpeg": "jpeg",
    "image/heic": "heic",
}


def get_memory_info():
    process = psutil.Process(os.getpid())
    mem = process.memory_info()
    return {
        "rss_mb": round(mem.rss / 1024 / 1024, 2),
        "percent": round(process.memory_percent(), 2),
    }


@app.get("/health")
async def health_check():
    """Checks if both required OS binaries are present."""
    avifenc_ok = subprocess.run(["avifenc", "--version"], capture_output=True).returncode == 0
    heifenc_ok = subprocess.run(["heif-enc", "--version"], capture_output=True).returncode == 0

    return {
        "status": "healthy" if (avifenc_ok and heifenc_ok) else "unhealthy",
        "memory": get_memory_info(),
        "binaries": {"avifenc": avifenc_ok, "heif-enc": heifenc_ok},
    }


@app.post("/convert")
async def convert_image(
    image: UploadFile = File(...),
    object_name: str = Form(...),
    bucket: str = Form(...),
):
    logger.info(f"[API] Request: {image.filename} -> {object_name}")
    start_time = time.time()
    avif_data = None

    # 1. Validate MIME type
    mime_type = image.content_type
    file_type = SUPPORTED_MIME_TYPES.get(mime_type)
    if not file_type:
        raise HTTPException(status_code=400, detail=f"Unsupported type: {mime_type}")

    try:
        # 2. Read into RAM
        image_bytes = await image.read()
        size_mb = len(image_bytes) / 1024 / 1024
        logger.info(f"[API] Received {size_mb:.2f}MB ({image.filename})")

        # 3. Guard against oversized inputs before doing any work
        if len(image_bytes) > MAX_INPUT_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large ({size_mb:.1f}MB). Max allowed: {MAX_INPUT_BYTES // 1024 // 1024}MB",
            )

        # 4. Convert to AVIF
        avif_data = convert_to_avif(image_bytes, file_type)

        # 4b. Generate WebP thumbnail from source before freeing source bytes
        try:
            thumb_data = generate_thumbnail_webp(image_bytes)
        except Exception as e:
            logger.warning(f"[API] Thumbnail generation failed for {image.filename}: {e}")
            thumb_data = None

        # 5. Free source bytes immediately — avif_data is all we need now
        del image_bytes
        gc.collect()

        # 6. Stream AVIF to MinIO
        minio_client.put_object(
            bucket,
            object_name,
            io.BytesIO(avif_data),
            length=len(avif_data),
            content_type="image/avif",
        )

        # 7. Upload WebP thumbnail
        if thumb_data:
            parts = object_name.split("/")
            thumb_object_name = "/".join(parts[:-1]) + "/thumbs/" + parts[-1].replace(".avif", ".webp")
            try:
                minio_client.put_object(
                    bucket,
                    thumb_object_name,
                    io.BytesIO(thumb_data),
                    length=len(thumb_data),
                    content_type="image/webp",
                )
                logger.info(f"[API] Thumbnail uploaded: {thumb_object_name}")
            except Exception as e:
                logger.warning(f"[API] Thumbnail upload failed: {e}")

        duration = round(time.time() - start_time, 2)
        avif_mb = round(len(avif_data) / 1024 / 1024, 3)
        logger.info(f"[API] Success: {object_name} ({avif_mb}MB avif) in {duration}s")

        return {
            "success": True,
            "object_name": object_name,
            "metrics": {
                "input_mb": round(size_mb, 2),
                "output_mb": avif_mb,
                "duration_sec": duration,
            },
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"[API] Conversion failed for {image.filename}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Always clean up avif_data from RAM after MinIO upload (or on error)
        if avif_data is not None:
            del avif_data
        cleanup_after_request()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)

# Force rebuild 30/03 13:40    