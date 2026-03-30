# Alpine is much more up-to-date for image libraries
FROM python:3.11-alpine

WORKDIR /app

# Install the latest conversion tools + build dependencies for psutil
RUN apk add --no-cache \
    libheif-tools \
    libavif-apps \
    gcc \
    musl-dev \
    python3-dev \
    linux-headers

# Disk-backed scratch dir for intermediate files (NOT tmpfs).
# Intermediate PNGs from HEIC decoding land here so they don't count against RAM.
RUN mkdir -p /app/scratch

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]