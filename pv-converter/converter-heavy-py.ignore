import subprocess
import tempfile
from pathlib import Path
import psutil
import os
import gc
import logging
import traceback
import resource


def get_memory_usage():
    """Returns current memory usage in MB"""
    process = psutil.Process(os.getpid())
    return round(process.memory_info().rss / 1024 / 1024, 2)


def get_system_memory():
    """Returns system memory info"""
    mem = psutil.virtual_memory()
    return {
        'total': round(mem.total / 1024 / 1024, 2),
        'available': round(mem.available / 1024 / 1024, 2),
        'percent': mem.percent,
        'used': round(mem.used / 1024 / 1024, 2),
    }


def get_memory_limit():
    """Get memory limit for current process"""
    try:
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        soft_mb = soft / 1024 / 1024 if soft != resource.RLIM_INFINITY else "unlimited"
        hard_mb = hard / 1024 / 1024 if hard != resource.RLIM_INFINITY else "unlimited"
        return {'soft': soft_mb, 'hard': hard_mb}
    except Exception:
        return {'soft': 'unknown', 'hard': 'unknown'}


def log_memory_state(context: str):
    """Log comprehensive memory state"""
    process_mem = get_memory_usage()
    system_mem = get_system_memory()
    limits = get_memory_limit()

    logging.info(f"[MEMORY-{context}] Process: {process_mem}MB")
    logging.info(
        f"[MEMORY-{context}] System: {system_mem['used']}/{system_mem['total']}MB "
        f"({system_mem['percent']:.1f}% used, {system_mem['available']}MB available)"
    )
    logging.info(f"[MEMORY-{context}] Limits: soft={limits['soft']}, hard={limits['hard']}")
    print(
        f"[MEMORY-{context}] Process: {process_mem}MB | "
        f"System: {system_mem['percent']:.1f}% used ({system_mem['available']}MB available)"
    )


def get_file_size_mb(data: bytes) -> float:
    """Get size of a bytes object in MB"""
    return round(len(data) / 1024 / 1024, 2)


def get_path_size_mb(path: Path) -> float:
    """Get size of a file on disk in MB without reading it into memory"""
    return round(path.stat().st_size / 1024 / 1024, 2)


# ---------------------------------------------------------------------------
# Subprocess memory limiter
# ---------------------------------------------------------------------------

# Hard cap applied to every child process (ImageMagick, avifenc).
# These subprocesses escape the Kubernetes container cgroup, so without this
# they can consume unlimited host memory and OOM the node.
_SUBPROCESS_MEMORY_LIMIT_BYTES = 700 * 1024 * 1024  # 700 MB


def _limit_subprocess_memory():
    """
    Limit subprocess heap memory rather than virtual address space.
    RLIMIT_AS counts all virtual mappings including shared libs (~1GB+ for ImageMagick)
    which causes false OOM errors even when real RAM is plentiful.
    RLIMIT_DATA limits only the heap/data segment — much closer to actual RAM usage.
    """
    try:
        limit = 800 * 1024 * 1024  # 800MB heap limit
        resource.setrlimit(resource.RLIMIT_DATA, (limit, limit))
    except Exception as e:
        logging.warning(f"[SUBPROCESS] Could not set memory limit: {e}")


# ---------------------------------------------------------------------------
# Subprocess runner
# ---------------------------------------------------------------------------

def run_with_memory_monitoring(
    process_name: str,
    cmd: list,
    capture_stdout: bool = False,
    capture_stderr: bool = True,
    text: bool = False,
    check: bool = False,
):
    """
    Run a subprocess with:
    - per-process memory cap via RLIMIT_AS (prevents node OOM)
    - stderr-only capture by default (avoids buffering large stdout in memory)
    - memory state logged before and after
    """
    logging.info(f"[SUBPROCESS] Starting {process_name}: {' '.join(cmd)}")
    log_memory_state(f"PRE-{process_name}")

    stdout_pipe = subprocess.PIPE if capture_stdout else subprocess.DEVNULL
    stderr_pipe = subprocess.PIPE if capture_stderr else subprocess.DEVNULL

    try:
        result = subprocess.run(
            cmd,
            stdout=stdout_pipe,
            stderr=stderr_pipe,
            text=text,
            check=False,
            preexec_fn=_limit_subprocess_memory,  # ← memory cap applied here
        )

        log_memory_state(f"POST-{process_name}")
        logging.info(f"[SUBPROCESS] {process_name} return code: {result.returncode}")

        if result.returncode != 0:
            error_msg = (
                result.stderr if (capture_stderr and result.stderr) else "Unknown error"
            )
            logging.error(f"[SUBPROCESS] {process_name} failed: {error_msg}")
            if check:
                raise subprocess.CalledProcessError(
                    result.returncode, cmd,
                    output=result.stdout if capture_stdout else None,
                    stderr=result.stderr if capture_stderr else None,
                )

        return result

    except Exception as e:
        log_memory_state(f"ERROR-{process_name}")
        logging.error(f"[SUBPROCESS] {process_name} exception: {str(e)}")
        raise


# ---------------------------------------------------------------------------
# JPEG → AVIF
# ---------------------------------------------------------------------------

def convert_jpeg_to_avif(jpeg_data: bytes, original_filename: str = "image.jpg") -> bytes:
    """JPEG to AVIF conversion using avifenc directly"""
    input_size = get_file_size_mb(jpeg_data)
    logging.info(f"[CONVERTER] JPEG input size: {input_size}MB")

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.jpg"
        output_path = Path(tmpdir) / "output.avif"

        log_memory_state("PRE-JPEG-WRITE")
        input_path.write_bytes(jpeg_data)
        log_memory_state("POST-JPEG-WRITE")

        del jpeg_data
        gc.collect()
        log_memory_state("POST-JPEG-GC")

        try:
            result = run_with_memory_monitoring(
                "avifenc",
                ["avifenc", "--speed", "6", "--jobs", "1", str(input_path), str(output_path)],
                capture_stdout=True,
                capture_stderr=True,
                text=True,
                check=True,
            )
            logging.info(f"[CONVERTER] avifenc stdout: {result.stdout}")
            if result.stderr:
                logging.info(f"[CONVERTER] avifenc stderr: {result.stderr}")

        except subprocess.CalledProcessError as e:
            logging.error(f"[CONVERTER] avifenc failed: {e}")
            if e.stderr:
                logging.error(f"[CONVERTER] avifenc stderr: {e.stderr}")
            raise

        log_memory_state("PRE-AVIF-READ")
        output_data = output_path.read_bytes()
        output_size = get_file_size_mb(output_data)
        logging.info(
            f"[CONVERTER] AVIF output size: {output_size}MB "
            f"(compression: {(1 - output_size / input_size) * 100:.1f}%)"
        )
        log_memory_state("POST-AVIF-READ")

        return output_data


# ---------------------------------------------------------------------------
# HEIC → AVIF
# ---------------------------------------------------------------------------

def convert_heic_to_avif_cli(heic_data: bytes, original_filename: str = "image.heic") -> bytes:
    """HEIC to AVIF conversion using ImageMagick and avifenc"""
    input_size = get_file_size_mb(heic_data)
    logging.info(f"[CONVERTER] HEIC input size: {input_size}MB")

    with tempfile.TemporaryDirectory() as tmpdir:
        heic_path = Path(tmpdir) / "input.heic"
        jpeg_path = Path(tmpdir) / "intermediate.jpg"
        avif_path = Path(tmpdir) / "output.avif"

        log_memory_state("PRE-HEIC-WRITE")
        heic_path.write_bytes(heic_data)
        log_memory_state("POST-HEIC-WRITE")

        del heic_data
        gc.collect()
        log_memory_state("POST-HEIC-GC")

        # --- ImageMagick: HEIC → JPEG ---
        # Only capture stderr (for error reporting); stdout is empty for `convert`
        try:
            run_with_memory_monitoring(
                "ImageMagick",
                ["convert", str(heic_path), str(jpeg_path)],
                capture_stdout=False,   # ImageMagick writes nothing useful to stdout
                capture_stderr=True,    # keep stderr for error messages only
                check=True,
            )
            logging.info(f"[CONVERTER] ImageMagick converted HEIC to JPEG")

            # Use stat() — no need to read the file into memory just to get its size
            if jpeg_path.exists():
                jpeg_size = get_path_size_mb(jpeg_path)
                logging.info(f"[CONVERTER] Intermediate JPEG size: {jpeg_size}MB")

        except subprocess.CalledProcessError as e:
            error_msg = (
                e.stderr.decode(errors='ignore') if isinstance(e.stderr, bytes)
                else (e.stderr or "Unknown error")
            )
            logging.error(f"[CONVERTER] ImageMagick conversion failed: {error_msg}")
            raise RuntimeError("HEIC to JPEG conversion failed") from e

        # --- avifenc: JPEG → AVIF ---
        try:
            result = run_with_memory_monitoring(
                "avifenc",
                ["avifenc", "--speed", "6", "--jobs", "1", str(jpeg_path), str(avif_path)],
                capture_stdout=True,
                capture_stderr=True,
                text=True,
                check=True,
            )
            logging.info(f"[CONVERTER] avifenc stdout: {result.stdout}")
            if result.stderr:
                logging.info(f"[CONVERTER] avifenc stderr: {result.stderr}")

        except subprocess.CalledProcessError as e:
            error_msg = (
                e.stderr if isinstance(e.stderr, str)
                else e.stderr.decode(errors='ignore') if e.stderr
                else "Unknown error"
            )
            logging.error(f"[CONVERTER] avifenc failed: {error_msg}")
            raise RuntimeError("JPEG to AVIF conversion failed") from e

        log_memory_state("PRE-FINAL-AVIF-READ")
        output_data = avif_path.read_bytes()
        output_size = get_file_size_mb(output_data)
        logging.info(
            f"[CONVERTER] Final AVIF size: {output_size}MB "
            f"(compression: {(1 - output_size / input_size) * 100:.1f}%)"
        )
        log_memory_state("POST-FINAL-AVIF-READ")

        return output_data


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

def convert_to_avif(data: bytes, file_type: str, original_filename: str) -> bytes:
    """Unified conversion with detailed memory tracking"""
    input_size = get_file_size_mb(data)
    logging.info(f"[CONVERTER] ===== Starting conversion =====")
    logging.info(f"[CONVERTER] File: {original_filename}")
    logging.info(f"[CONVERTER] Type: {file_type.upper()}")
    logging.info(f"[CONVERTER] Input size: {input_size}MB")
    logging.info(
        f"[CONVERTER] Subprocess heap cap: "
        f"{800}MB (RLIMIT_DATA)"
    )
    
    log_memory_state("START")

    limits = get_memory_limit()
    system_mem = get_system_memory()
    logging.info(f"[CONVERTER] Memory limits: {limits}")
    logging.info(f"[CONVERTER] System memory: {system_mem}")

    try:
        if file_type.lower() == "jpeg":
            result = convert_jpeg_to_avif(data, original_filename)
        elif file_type.lower() == "heic":
            result = convert_heic_to_avif_cli(data, original_filename)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        del data
        gc.collect()
        log_memory_state("SUCCESS")

        output_size = get_file_size_mb(result)
        logging.info(f"[CONVERTER] ===== Conversion successful =====")
        logging.info(f"[CONVERTER] Output size: {output_size}MB")
        logging.info(
            f"[CONVERTER] Overall compression: {(1 - output_size / input_size) * 100:.1f}%"
        )

        return result

    except Exception as e:
        try:
            del data
        except Exception:
            pass
        gc.collect()
        log_memory_state("FAILURE")

        logging.error(f"[CONVERTER] ===== Conversion failed =====")
        logging.error(f"[CONVERTER] Error: {str(e)}")
        logging.error(f"[CONVERTER] Error type: {type(e).__name__}")
        logging.error(f"[CONVERTER] Traceback: {traceback.format_exc()}")

        system_mem = get_system_memory()
        if system_mem['available'] < 100:
            logging.error(
                f"[CONVERTER] LOW MEMORY WARNING: Only {system_mem['available']}MB available"
            )

        raise