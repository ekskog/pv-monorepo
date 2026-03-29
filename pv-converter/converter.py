import subprocess
import tempfile
from pathlib import Path
import psutil
import os
import gc
import logging
import resource
import traceback

# Setup logging for container transparency
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def _set_subprocess_limits():
    """
    Prevents a single image from taking down the whole container.
    Caps the encoder at 750MB.
    """
    limit = 750 * 1024 * 1024 
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))

def log_mem(context: str):
    process = psutil.Process(os.getpid())
    mem = psutil.virtual_memory()
    logger.info(
        f"[{context}] Process RAM: {process.memory_info().rss / 1024 / 1024:.2f}MB | "
        f"System Avail: {mem.available / 1024 / 1024:.2f}MB"
    )

def convert_to_avif(input_bytes: bytes, file_type: str) -> bytes:
    file_type = file_type.lower().strip('.')
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        in_p = tmp_path / f"input.{file_type}"
        out_p = tmp_path / "output.avif"

        in_p.write_bytes(input_bytes)
        del input_bytes
        gc.collect()

        try:
            if file_type == "heic":
                # Modern libheif command
                cmd = ["heif-enc", "--avif", "-q", "60", "--speed", "6", str(in_p), "-o", str(out_p)]
            else:
                cmd = ["avifenc", "--speed", "6", "--jobs", "1", str(in_p), str(out_p)]

            result = subprocess.run(cmd, capture_output=True, text=True, preexec_fn=_set_subprocess_limits)

            # FALLBACK: If the version still hates '--speed', try one more time without it
            if result.returncode != 0 and "unrecognized option '--speed'" in result.stderr:
                logger.warning("Falling back to basic command (no --speed flag)")
                cmd = ["heif-enc", "--avif", "-q", "60", str(in_p), "-o", str(out_p)]
                result = subprocess.run(cmd, capture_output=True, text=True, preexec_fn=_set_subprocess_limits)

            if result.returncode != 0:
                raise RuntimeError(f"Encoder failed: {result.stderr}")

            return out_p.read_bytes()

        except Exception as e:
            logger.error(f"Conversion error: {e}")
            raise

# Example cleanup for your API Route
def cleanup_after_request():
    """Call this after sending the response to ensure RAM resets"""
    gc.collect()
    log_mem("POST_REQUEST_CLEANUP")