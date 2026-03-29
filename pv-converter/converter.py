import subprocess
import tempfile
from pathlib import Path
import os
import gc
import logging
import resource

logger = logging.getLogger(__name__)

def _set_limits():
    # Hard cap the subprocesses at 800MB to protect the 1GB container limit
    # This prevents an unusually large image from killing the whole API
    limit = 800 * 1024 * 1024 
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))

def convert_to_avif(input_bytes: bytes, file_type: str) -> bytes:
    """
    Two-step conversion for HEIC to AVIF to avoid OOM in 1GB containers.
    1. HEIC -> PNG (Disk-offloaded)
    2. PNG -> AVIF (Disk-offloaded)
    """
    file_type = file_type.lower().strip('.')
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        in_p = tmp_path / f"input.{file_type}"
        out_p = tmp_path / "output.avif"
        png_p = tmp_path / "intermediate.png"

        # Write input to disk and PURGE from Python RAM immediately
        in_p.write_bytes(input_bytes)
        del input_bytes
        gc.collect()

        try:
            if file_type == "heic":
                # STEP 1: Decode HEIC to PNG via heif-convert (Alpine binary name)
                decode_res = subprocess.run(
                    ["heif-convert", str(in_p), str(png_p)],
                    capture_output=True, text=True, preexec_fn=_set_limits
                )
                if decode_res.returncode != 0:
                    logger.error(f"Decode failed: {decode_res.stderr}")
                    raise RuntimeError(f"Decode failed: {decode_res.stderr}")

                # STEP 2: Encode PNG to AVIF via heif-enc
                # Using only flags verified by your --help output
                encode_res = subprocess.run(
                    ["heif-enc", "--avif", "-q", "60", str(png_p), "-o", str(out_p)],
                    capture_output=True, text=True, preexec_fn=_set_limits
                )
                if encode_res.returncode != 0:
                    logger.error(f"Encode failed: {encode_res.stderr}")
                    raise RuntimeError(f"Encode failed: {encode_res.stderr}")
            
            else:
                # Direct JPEG to AVIF using avifenc (which handles JPEGs natively)
                res = subprocess.run(
                    ["avifenc", "--speed", "6", "--jobs", "1", str(in_p), str(out_p)],
                    capture_output=True, text=True, preexec_fn=_set_limits
                )
                if res.returncode != 0:
                    raise RuntimeError(f"avifenc failed: {res.stderr}")

            # Return the resulting bytes
            if not out_p.exists():
                raise FileNotFoundError("Output file was not created by the encoder.")
                
            return out_p.read_bytes()

        finally:
            # Explicitly cleanup the intermediate PNG if it exists
            if png_p.exists():
                png_p.unlink()
            gc.collect()