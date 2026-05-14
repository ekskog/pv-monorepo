import subprocess
import tempfile
from pathlib import Path
import psutil
import os
import gc
import io
import logging

import pillow_heif
from PIL import Image, ImageOps

pillow_heif.register_heif_opener()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# Disk-backed scratch dir (not tmpfs) — keeps intermediate files off RAM
SCRATCH_DIR = Path("/app/scratch")

def log_mem(context: str):
    process = psutil.Process(os.getpid())
    mem = psutil.virtual_memory()
    logger.info(
        f"[{context}] Process RAM: {process.memory_info().rss / 1024 / 1024:.2f}MB | "
        f"System Avail: {mem.available / 1024 / 1024:.2f}MB"
    )

def convert_to_avif(input_bytes: bytes, file_type: str) -> bytes:
    """
    Converts JPEG or HEIC bytes to AVIF bytes.

    HEIC pipeline: pillow-heif decodes in Python RAM → PNG written to disk-backed
    scratch dir → heif-enc encodes to AVIF → PNG deleted immediately.

    JPEG pipeline: avifenc encodes directly, no intermediate file needed.

    All intermediate files are deleted in finally blocks regardless of success/failure.
    """
    file_type = file_type.lower().strip('.')

    with tempfile.TemporaryDirectory(dir=SCRATCH_DIR) as tmpdir:
        tmp_path = Path(tmpdir)
        in_p = tmp_path / f"input.{file_type}"
        out_p = tmp_path / "output.avif"

        in_p.write_bytes(input_bytes)
        del input_bytes
        gc.collect()

        if file_type == "heic":
            _convert_heic_to_avif(in_p, out_p)
        else:
            _convert_jpeg_to_avif(in_p, out_p)

        avif_bytes = out_p.read_bytes()

        # Explicitly unlink before the TemporaryDirectory context manager
        # closes, just to be safe about disk space on concurrent requests
        try:
            in_p.unlink(missing_ok=True)
            out_p.unlink(missing_ok=True)
        except Exception:
            pass

        return avif_bytes


def _convert_heic_to_avif(in_p: Path, out_p: Path):
    """
    HEIC → PNG (disk) → AVIF

    pillow-heif decodes the HEIC in Python RAM (unavoidable — the pixels have
    to live somewhere). The PNG is written to the disk-backed scratch dir so it
    doesn't count against the container's RAM budget.
    The PNG is deleted immediately after encoding regardless of success/failure.
    """
    png_p = in_p.parent / "decoded.png"

    try:
        log_mem("HEIC_DECODE_START")

        # Decode HEIC → PIL Image in RAM, then flush to disk as PNG
        with Image.open(in_p) as img:
            # Convert to RGB — HEIC can be RGBA or P mode which avifenc may reject
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.save(png_p, format="PNG")

        # PIL Image is now out of scope and freed
        gc.collect()
        log_mem("HEIC_DECODE_DONE_PNG_ON_DISK")

        # Encode PNG → AVIF
        # No --speed flag: not supported in Alpine's libheif-tools 1.21.x
        result = subprocess.run(
            ["heif-enc", "--avif", "-q", "60", str(png_p), "-o", str(out_p)],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"heif-enc failed: {result.stderr.strip()}")

        log_mem("HEIC_ENCODE_DONE")

    except Exception as e:
        logger.error(f"HEIC conversion error: {e}")
        raise

    finally:
        # Always remove the intermediate PNG from disk
        png_p.unlink(missing_ok=True)
        gc.collect()


def _convert_jpeg_to_avif(in_p: Path, out_p: Path):
    """
    JPEG → AVIF directly via avifenc. No intermediate file needed.
    """
    try:
        log_mem("JPEG_ENCODE_START")

        result = subprocess.run(
            ["avifenc", "--jobs", "1", str(in_p), str(out_p)],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"avifenc failed: {result.stderr.strip()}")

        log_mem("JPEG_ENCODE_DONE")

    except Exception as e:
        logger.error(f"JPEG conversion error: {e}")
        raise


def generate_thumbnail_webp(image_bytes: bytes, max_width: int = 400) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='WEBP', quality=75)
        return buf.getvalue()


def cleanup_after_request():
    """Call this after sending the response to ensure RAM is released."""
    gc.collect()
    log_mem("POST_REQUEST_CLEANUP")