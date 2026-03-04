# Photovault Uploader

A simple web interface for uploading images to your pv server.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser to `http://localhost:3002`

## Usage

1. Enter the directory name where you want to upload images
2. Click "Choose images..." and select one or more image files
3. Click "Upload Images"

The app will upload the selected images to your pv at `http://192.168.1.212:3001/upload/[DIRECTORY]`

## Configuration

- The app runs on port 3002 by default. You can change this by setting the `PORT` environment variable.
- The pv server URL is hardcoded to `http://192.168.1.212:3001`. You can modify this in `server.js` if needed.

## Features

- Multiple file selection
- Support for HEIC files and standard image formats
- Real-time upload progress
- Success/error feedback
- Clean, responsive UI
