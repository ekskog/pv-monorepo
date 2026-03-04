# PhotoVault API

![Build and Deploy](https://github.com/ekskog/pv-api/workflows/Build%20and%20Deploy%20PhotoVault%20API/badge.svg)

A Node.js Express API for managing photo storage with MinIO backend. This API provides comprehensive file and folder management capabilities for building photo gallery applications.

## Features

- 🗂️ **Bucket Management** - List and create MinIO buckets
- 📁 **Folder Operations** - Create, delete, and list folders with recursive support
- 📤 **File Upload** - Multi-file upload with folder organization
- �️ **Image Processing** - HEIC/HEIF conversion to AVIF with multiple variants
- 🎥 **Video Support** - Upload iPhone videos (MOV/MP4) directly to storage
- �🔍 **Object Listing** - List objects with folder structure or recursive traversal
- 🔐 **MinIO Integration** - S3-compatible storage backend
- 🐳 **Docker Ready** - Containerized deployment
- ☸️ **Kubernetes Native** - Production-ready manifests
- 🚀 **CI/CD Pipeline** - Automated GitHub Actions deployment

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your MinIO credentials

# Start development server
npm run dev

# Test the API
curl http://localhost:3001/health
```

## API Endpoints

### System Endpoints

#### `GET /`
Get API information and status.

**Response:**
```json
{
  "message": "PhotoVault API is running!",
  "timestamp": "2025-06-04T16:00:00.000Z",
  "version": "1.0.0"
}
```

#### `GET /health`
Health check with MinIO connection status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-06-04T16:00:00.000Z",
  "minio": {
    "connected": true,
    "buckets": 3,
    "endpoint": "objects.hbvu.su"
  }
}
```

### Bucket Management

#### `GET /buckets`
List all available buckets.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "pv",
      "creationDate": "2025-06-03T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

#### `POST /buckets`
Create a new bucket.

**Request Body:**
```json
{
  "bucketName": "my-photos",
  "region": "us-east-1"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bucket 'my-photos' created successfully",
  "data": {
    "bucketName": "my-photos",
    "region": "us-east-1"
  }
}
```

### Object and Folder Operations

#### `GET /buckets/:bucketName/objects`
List objects and folders in a bucket with flexible filtering options.

**Query Parameters:**
- `prefix` (string, optional) - Filter objects by prefix/folder path
- `recursive` (boolean, optional) - List all objects recursively (default: false)

**Examples:**

**List top-level folders:**
```bash
GET /buckets/pv/objects
```

**List contents of a specific folder:**
```bash
GET /buckets/pv/objects?prefix=250604/
```

**List all objects recursively:**
```bash
GET /buckets/pv/objects?recursive=true
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bucket": "pv",
    "prefix": "250604/",
    "recursive": false,
    "folders": [],
    "objects": [
      {
        "name": "250604/tattoo.jpg",
        "size": 41795,
        "lastModified": "2025-06-04T15:59:25.710Z",
        "etag": "64f995db039249ffb42ac5dc7c0c2135",
        "type": "file"
      },
      {
        "name": "250604/dlu.png", 
        "size": 47750,
        "lastModified": "2025-06-04T06:03:40.216Z",
        "etag": "dcb0e1f4cf9a0cf4db2a9e7a0e993c5e",
        "type": "file"
      }
    ],
    "totalFolders": 0,
    "totalObjects": 2
  }
}
```

#### `POST /buckets/:bucketName/folders`
Create a new folder in the bucket.

**Request Body:**
```json
{
  "folderPath": "vacation-2025"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Folder 'vacation-2025/' created successfully",
  "data": {
    "bucket": "pv",
    "folderPath": "vacation-2025/"
  }
}
```

#### `DELETE /buckets/:bucketName/folders`
Delete a folder and all its contents.

**Request Body:**
```json
{
  "folderPath": "old-photos"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Folder 'old-photos/' and 15 objects deleted successfully",
  "data": {
    "bucket": "pv",
    "folderPath": "old-photos/",
    "deletedObjects": 15
  }
}
```

### File Upload

#### `POST /buckets/:bucketName/upload`
Upload one or multiple files to a bucket with optional folder organization.

**Supported File Types:**
- **Images:** JPG, PNG, WebP, TIFF, BMP (converted to AVIF variants)
- **HEIC/HEIF:** Apple's high-efficiency formats (converted to AVIF variants)
- **Videos:** MOV, MP4, M4V, AVI, MKV, WebM, FLV, WMV, 3GP, M2TS, MTS (stored as-is)
- **Other:** Any file type (stored as-is)

**File Size Limits:**
- Images: 100MB
- Videos: 2GB  
- Other files: 500MB

**Form Data:**
- `files` (file[], required) - Files to upload
- `folderPath` (string, optional) - Target folder path

**Example using curl:**
```bash
# Upload photos to root of bucket
curl -X POST \
  -F "files=@photo1.jpg" \
  -F "files=@photo2.heic" \
  http://localhost:3001/buckets/pv/upload

# Upload iPhone video to specific folder
curl -X POST \
  -F "files=@IMG_1234.MOV" \
  -F "folderPath=videos/iphone" \
  http://localhost:3001/buckets/pv/upload

# Mix of photos and videos
curl -X POST \
  -F "files=@vacation.jpg" \
  -F "files=@sunset.MOV" \
  -F "folderPath=trips/summer-2025" \
  http://localhost:3001/buckets/pv/upload
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bucket": "pv",
    "folderPath": "trips/summer-2025/",
    "uploaded": [
      {
        "originalName": "vacation.jpg",
        "objectName": "trips/summer-2025/vacation.jpg",
        "size": 2048576,
        "mimetype": "image/jpeg",
        "etag": "abc123def456...",
        "versionId": null
      }
    ],
    "uploadedCount": 1,
    "totalFiles": 1
  }
}
```

### File Download

#### `GET /buckets/:bucketName/download`
Download a specific file from a bucket.

**Query Parameters:**
- `object` (string, required) - The object path to download

**Examples:**

**Download file from folder:**
```bash
GET /buckets/pv/download?object=250604/tattoo.jpg
```

**Download file from root:**
```bash
GET /buckets/pv/download?object=photo.jpg
```

**Response:**
- Returns the actual file content with appropriate headers
- Sets `Content-Type` based on file type
- Sets `Content-Disposition` with original filename
- Streams file directly (no JSON wrapper)

#### `GET /supported-formats`
Get information about supported file formats and processing behavior.

**Response:**
```json
{
  "success": true,
  "data": {
    "images": {
      "regular": ["jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp"],
      "heic": ["heic", "heif"]
    },
    "videos": ["mov", "mp4", "m4v", "avi", "mkv", "webm", "flv", "wmv", "3gp", "m2ts", "mts"],
    "maxFileSizes": {
      "images": "100MB",
      "videos": "2GB", 
      "other": "500MB"
    },
    "processing": {
      "images": "Converted to AVIF variants",
      "heic": "Converted to AVIF variants",
      "videos": "Stored as-is (no conversion)",
      "other": "Stored as-is"
    }
  }
}
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# MinIO Configuration
MINIO_ENDPOINT=objects.hbvu.su
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key

# Server Configuration  
PORT=3001
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created successfully
- `400` - Bad request (missing parameters)
- `404` - Resource not found
- `409` - Conflict (resource already exists)
- `500` - Internal server error

## Development

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Test endpoints
curl http://localhost:3001/health
curl http://localhost:3001/buckets
```

## Production Deployment

### Docker

```bash
# Build image
docker build -t pv-api .

# Run container
docker run -p 3001:3001 --env-file .env pv-api
```

### Kubernetes

The application includes production-ready Kubernetes manifests in the `k8s/` directory:

- `deployment.yaml` - Application deployment
- `service.yaml` - LoadBalancer service  
- `configmap.yaml` - Configuration
- `secret.yaml` - Sensitive data

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/
```

### CI/CD

Automated deployment via GitHub Actions on push to main branch:

1. **Build** - Docker image creation
2. **Push** - Image pushed to registry
3. **Deploy** - Kubernetes deployment update
4. **Verify** - Health check confirmation

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │────│  PhotoVault API │────│   MinIO Server  │
│  (Vue.js/etc)   │    │   (Express.js)  │    │ (S3 Compatible) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Usage Examples

### Photo Gallery Workflow

1. **Create album folder:**
   ```bash
   curl -X POST http://localhost:3001/buckets/pv/folders \
     -H "Content-Type: application/json" \
     -d '{"folderPath": "wedding-2025"}'
   ```

2. **Upload photos:**
   ```bash
   curl -X POST http://localhost:3001/buckets/pv/upload \
     -F "files=@IMG_001.jpg" \
     -F "files=@IMG_002.jpg" \
     -F "folderPath=wedding-2025"
   ```

3. **List album contents:**
   ```bash
   curl "http://localhost:3001/buckets/pv/objects?prefix=wedding-2025/"
   ```

4. **Get all photos (recursive):**
   ```bash
   curl "http://localhost:3001/buckets/pv/objects?recursive=true"
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License - see LICENSE file for details.
# Build Docker image
docker build -t pv-api .

# Deploy to Kubernetes
kubectl apply -f k8s/
```
