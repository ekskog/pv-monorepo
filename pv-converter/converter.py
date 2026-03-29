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
    """
    Converts HEIC/JPEG to AVIF while respecting a 1GB RAM limit.
    """
    file_type = file_type.lower().strip('.')
    log_mem("START_CONVERSION")

    # Use /tmp (RAM disk in many containers, but safer than Python Heap)
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        in_p = tmp_path / f"input.{file_type}"
        out_p = tmp_path / "output.avif"

        # --- STEP 1: FLUSH RAM TO DISK ---
        in_p.write_bytes(input_bytes)
        
        # Explicitly delete the large bytes object and force GC
        del input_bytes
        gc.collect() 
        log_mem("RAM_CLEARED_BEFORE_ENCODER")

        try:
            # --- STEP 2: RUN ENCODER ---
            if file_type == "heic":
                # Direct HEIC -> AVIF (libheif)
                cmd = ["heif-enc", "--avif", "-q", "60", "--speed", "6", str(in_p), "-o", str(out_p)]
            elif file_type in ["jpg", "jpeg"]:
                # JPEG -> AVIF (libavif)
                cmd = ["avifenc", "--speed", "6", "--jobs", "1", str(in_p), str(out_p)]
            else:
                raise ValueError(f"Unsupported format: {file_type}")

            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                preexec_fn=_set_subprocess_limits
            )

            if result.returncode != 0:
                logger.error(f"Encoder failed: {result.stderr}")
                raise RuntimeError(f"Conversion failed: {result.stderr}")

            # --- STEP 3: READ RESULT AND CLEAN UP ---
            if not out_p.exists():
                raise FileNotFoundError("Output file was not created.")

            output_bytes = out_p.read_bytes()
            log_mem("RESULT_READ_INTO_RAM")
            
            return output_bytes

        except Exception as e:
            logger.error(f"Conversion error: {traceback.format_exc()}")
            raise
        finally:
            # Final cleanup inside the function
            gc.collect()

# Example cleanup for your API Route
def cleanup_after_request():
    """Call this after sending the response to ensure RAM resets"""
    gc.collect()
    log_mem("POST_REQUEST_CLEANUP")