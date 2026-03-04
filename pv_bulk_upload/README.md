# PhotoVault Bulk Upload Tool

A Node.js command-line tool for bulk uploading photos to PhotoVault API with interactive album management.

## Features

- Interactive prompts for album name, photo folder, and date information
- Automatic photo file detection (JPG/JPEG and HEIC/HEIF only)
- Album existence checking with creation prompts
- Month/year tagging for album organization
- Batch upload processing with real-time progress monitoring
- Loop mode for uploading multiple albums in one session
- Support for environment variable configuration

## Installation

1. Navigate to the tool directory:
   ```bash
   cd pv_bulk_upload
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Basic Usage

Run the tool interactively:
```bash
node index.js
```

The tool will:
1. Authenticate once at startup
2. Loop through album uploads until you choose to quit
3. For each album: prompt for name, folder, and date (if creating new)
4. Ask if you want to upload another album after each completion

### Commands

- Enter album name (or type "quit" to exit)
- Enter folder path containing photos
- For new albums: enter month/year in MM/YYYY format
- After each upload: choose to continue or quit

### Configuration

Create a `.env` file in the project directory with your settings:

```env
API_BASE_URL=https://vault-api.hbvu.su
USERNAME=your_username
PASSWORD=your_password
BUCKET_NAME=pv
```

Or set environment variables directly:

```bash
export API_BASE_URL=https://your-api-server.com
export USERNAME=your_username
export PASSWORD=your_password
export BUCKET_NAME=your_bucket
```

### Supported File Types

The tool automatically detects and uploads only these photo formats:
- JPG/JPEG
- HEIC/HEIF

Other formats (PNG, GIF, BMP, TIFF, WebP, MOV, etc.) are ignored.

### Album Name Capitalization

The tool automatically converts album names to ALL UPPERCASE for consistency.

### Album Date Information

When creating a new album, you'll be prompted to enter the month/year in MM/YYYY format (e.g. 05/2024). This date information is sent to the server for album organization.

### Example

```bash
$ node index.js
[INFO] PhotoVault Bulk Upload Tool
[INFO] Server: https://vault-api.hbvu.su
[INFO] Bucket: pv
[INFO] Username: admin
[INFO] Authenticating with PhotoVault API...
[GREEN] Authentication successful
Enter album name (or "quit" to exit): OXBERG
[INFO] Album name capitalized to: OXBERG
[YELLOW] Album 'OXBERG' does not exist.
Would you like to create it? (y/N): y
Enter month/year for album (MM/YYYY, e.g. 05/2024): 05/2024
[INFO] Creating new album: OXBERG
[GREEN] Album 'OXBERG' created successfully with date 05/2024
Enter folder containing photos: /path/to/photos
[INFO] Found 15 photo file(s) in /path/to/photos
[INFO] Starting upload of 15 file(s) to album: OXBERG
[INFO] Sending upload request...
[GREEN] Upload initiated. Job ID: abc123
[INFO] Connecting to progress stream...
[INFO] Upload started
[GREEN] Processing image 1/15...
[GREEN] Processing image 2/15...
...
[GREEN] Upload completed successfully!
Would you like to upload another album? (y/N): y
Enter album name (or "quit" to exit): SUMMER2024
[INFO] Album name capitalized to: SUMMER2024
[YELLOW] Album 'SUMMER2024' does not exist.
Would you like to create it? (y/N): y
Enter month/year for album (MM/YYYY, e.g. 05/2024): 07/2024
[INFO] Creating new album: SUMMER2024
[GREEN] Album 'SUMMER2024' created successfully with date 07/2024
Enter folder containing photos: /path/to/summer/photos
[INFO] Found 23 photo file(s) in /path/to/summer/photos
[INFO] Starting upload of 23 file(s) to album: SUMMER2024
...
[GREEN] Upload completed successfully!
Would you like to upload another album? (y/N): n
[INFO] All uploads completed. Goodbye!
```

## Error Handling

The tool provides clear error messages for:
- Network connectivity issues
- Authentication failures
- Invalid folder paths
- Empty photo directories
- API response errors

## Requirements

- Node.js 14+
- npm
- Access to PhotoVault API server

## Troubleshooting

### Authentication Issues
- Verify your username and password
- Check API server URL
- Ensure the server is running and accessible

### Upload Failures
- Check file permissions
- Verify bucket name configuration
- Ensure sufficient disk space on server

### Network Issues
- Test connectivity to API server
- Check firewall settings
- Verify SSL certificates if using HTTPS