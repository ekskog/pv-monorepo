# Use a patched slim image to avoid vulnerabilities
FROM python:3.11-slim-bookworm

WORKDIR /app

# Install ONLY the necessary binaries. 
# No ImageMagick = Less Bloat = More RAM for your app.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif-examples \
    libavif-bin \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python requirements (must include psutil)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Unbuffered logs are crucial for debugging OOM crashes
ENV PYTHONUNBUFFERED=1

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]