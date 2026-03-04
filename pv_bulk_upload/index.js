#!/usr/bin/env node

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

console.log('starting....')

const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const FormData = require('form-data');
const EventSource = require('eventsource');

// Configuration - prioritize .env file over shell environment
const API_BASE_URL = process.env.API_BASE_URL || 'https://vault-api.ekskog.net';
const USERNAME = process.env.USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || 'adminPWD4pv';
const BUCKET_NAME = process.env.BUCKET_NAME || 'pv';

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function log(level, message) {
    const color = colors[level] || colors.reset;
    console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

function logInfo(message) {
    log('info', message);
}

function logSuccess(message) {
    log('green', message);
}

function logWarning(message) {
    log('yellow', message);
}

function logError(message) {
    log('red', message);
}

// Capitalize album name (all uppercase)
function capitalizeAlbumName(name) {
    return name.toUpperCase();
}

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// Find photo files in directory
function findPhotoFiles(dirPath) {
    const photoExtensions = ['.jpg', '.jpeg', '.heic', '.heif'];
    const files = [];

    function scanDir(currentPath) {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                scanDir(fullPath);
            } else if (stat.isFile()) {
                const ext = path.extname(item).toLowerCase();
                if (photoExtensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }

    scanDir(dirPath);
    return files;
}

// Authenticate and get token
async function getAuthToken() {
    try {
        logInfo('Authenticating with PhotoVault API...');

        const response = await axios.post(`${API_BASE_URL}/auth/login`, {
            username: USERNAME,
            password: PASSWORD,
            turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX'
        });

        if (!response.data.success) {
            throw new Error('Authentication failed: ' + JSON.stringify(response.data));
        }

        const token = response.data.data.token;
        if (!token) {
            throw new Error('No token received');
        }

        logSuccess('Authentication successful');
        return token;
    } catch (error) {
        logError('Authentication failed: ' + error.message);
        throw error;
    }
}

// Check if album exists
async function albumExists(token, albumName) {
    try {
        const response = await axios.get(`${API_BASE_URL}/albums`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.data.success) {
            return false;
        }

        return response.data.albums.some(album => album.name === albumName);
    } catch (error) {
        logError('Failed to check album existence: ' + error.message);
        return false;
    }
}

// Create album
async function createAlbum(token, albumName, description, month, year) {
    try {
        logInfo(`Creating new album: ${albumName}`);

        const response = await axios.post(`${API_BASE_URL}/album/${albumName}`, {
            description: description,
            month: month,
            year: year
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.data.success) {
            throw new Error('Failed to create album: ' + JSON.stringify(response.data));
        }

        logSuccess(`Album '${albumName}' created successfully with date ${month}/${year}`);
        return true;
    } catch (error) {
        logError('Failed to create album: ' + error.message);
        return false;
    }
}

// Upload files
async function uploadFiles(token, albumName, files) {
    try {
        logInfo(`Starting upload of ${files.length} file(s) to album: ${albumName}`);

        const form = new FormData();

        // Add files to form
        for (const file of files) {
            form.append('files', fs.createReadStream(file), path.basename(file));
        }

        // Add folder path
        form.append('folderPath', albumName);

        logInfo('Sending upload request...');

        const response = await axios.post(`${API_BASE_URL}/buckets/${BUCKET_NAME}/upload`, form, {
            headers: {
                Authorization: `Bearer ${token}`,
                ...form.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (!response.data.success) {
            throw new Error('Upload failed: ' + JSON.stringify(response.data));
        }

        const jobId = response.data.data.jobId;
        if (!jobId) {
            throw new Error('No job ID received');
        }

        logSuccess(`Upload initiated. Job ID: ${jobId}`);
        return jobId;
    } catch (error) {
        logError('Upload failed: ' + error.message);
        throw error;
    }
}

// Monitor upload progress
function monitorProgress(token, jobId, expectedFiles) {
    return new Promise((resolve, reject) => {
        const sseUrl = `${API_BASE_URL}/processing-status/${jobId}`;
        logInfo(`Connecting to progress stream: ${sseUrl}`);

        const es = new EventSource(sseUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        let completed = false;
        let messageCount = 0;
        let successCount = 0;
        let lastMessageTime = Date.now();
        let connectionOpened = false;

        es.onmessage = (event) => {
            try {
                messageCount++;
                lastMessageTime = Date.now();
                const data = JSON.parse(event.data);
                const eventType = data.type;

                switch (eventType) {
                    case 'started':
                        logInfo('Upload started');
                        break;
                    case 'progress':
                        if (data.message) {
                            logSuccess(data.message);
                            // Count successful processing messages
                            if (data.message.includes('Successfully processed')) {
                                successCount++;
                            }
                        }
                        break;
                    case 'complete':
                        if (data.message) {
                            logSuccess(data.message);
                        }
                        // Check if the upload actually succeeded or failed
                        if (data.status === 'failed') {
                            logError('Upload failed on server side');
                            completed = true;
                            es.close();
                            reject(new Error('Upload failed: ' + (data.message || 'Server reported failure')));
                            break;
                        }
                        logSuccess('Upload completed successfully!');
                        completed = true;
                        es.close();
                        resolve();
                        break;
                    default:
                        logInfo(`Progress: ${JSON.stringify(data)}`);
                }

                // If we've received success messages for all expected files, consider it complete
                if (successCount >= expectedFiles && !completed) {
                    logSuccess(`All ${expectedFiles} files processed successfully!`);
                    completed = true;
                    es.close();
                    resolve();
                }
            } catch (error) {
                logInfo(`Progress data: ${event.data}`);
            }
        };

        es.onerror = (error) => {
            logError('SSE connection error: ' + error.message);
            es.close();
            if (!completed) {
                // If we got success messages for all files, consider it successful
                if (successCount >= expectedFiles) {
                    logSuccess(`Upload completed successfully (${successCount}/${expectedFiles} files processed)`);
                    resolve();
                } else if (messageCount > 0) {
                    logSuccess('Upload appears to have completed (connection closed)');
                    resolve();
                } else {
                    reject(error);
                }
            }
        };

        es.onopen = () => {
            connectionOpened = true;
            logInfo('SSE connection opened');
        };

        // Check for completion based on inactivity
        const checkCompletion = () => {
            if (completed) return;

            const now = Date.now();
            const timeSinceLastMessage = now - lastMessageTime;

            // If we've been inactive for 30 seconds and have success messages, consider complete
            if (timeSinceLastMessage > 30000 && successCount > 0) {
                logSuccess(`Upload monitoring completed (${successCount} files processed)`);
                completed = true;
                es.close();
                resolve();
                return;
            }

            // Continue checking
            setTimeout(checkCompletion, 5000);
        };

        // Start completion checking after connection opens
        const startMonitoring = () => {
            if (connectionOpened) {
                setTimeout(checkCompletion, 5000);
            } else {
                setTimeout(startMonitoring, 1000);
            }
        };
        startMonitoring();

        // Fallback timeout after 10 minutes
        setTimeout(() => {
            es.close();
            if (!completed) {
                if (successCount > 0) {
                    logSuccess(`Upload monitoring timed out, but ${successCount} files were processed successfully`);
                    resolve();
                } else {
                    logWarning('Upload monitoring timed out, but upload may have completed');
                    resolve(); // Still resolve since files might have been processed
                }
            }
        }, 10 * 60 * 1000);
    });
}

// Main function
async function main() {
    try {
        logInfo('PhotoVault Bulk Upload Tool');
        logInfo(`Server: ${API_BASE_URL}`);
        logInfo(`Bucket: ${BUCKET_NAME}`);
        logInfo(`HERE Username: ${USERNAME}`);

        // Authenticate once at startup
        const token = await getAuthToken();

        let continueUploading = true;

        while (continueUploading) {
            // Prompt for album name
            const albumName = await question('Enter album name (or "quit" to exit): ');
            if (albumName.toLowerCase() === 'quit') {
                logInfo('Goodbye!');
                return;
            }

            if (!albumName.trim()) {
                logError('Album name cannot be empty');
                continue;
            }

            const capitalizedAlbumName = capitalizeAlbumName(albumName.trim());
            if (capitalizedAlbumName !== albumName.trim()) {
                logInfo(`Album name capitalized to: ${capitalizedAlbumName}`);
            }

            // Prompt for folder
            const folderPath = await question('Enter folder containing photos: ');
            if (!fs.existsSync(folderPath)) {
                logError(`Folder not found: ${folderPath}`);
                continue;
            }

            // Find photo files
            const files = findPhotoFiles(folderPath);
            if (files.length === 0) {
                logError(`No photo files found in folder: ${folderPath}`);
                continue;
            }

            logInfo(`Found ${files.length} photo file(s) in ${folderPath}`);

            // Check album existence
            const exists = await albumExists(token, capitalizedAlbumName);
            if (!exists) {
                logWarning(`Album '${capitalizedAlbumName}' does not exist.`);
                const answer = await question('Would you like to create it? (y/N): ');
                if (!['y', 'yes'].includes(answer.toLowerCase())) {
                    logInfo('Album creation cancelled. Skipping this upload.');
                    continue;
                }

                // Prompt for album description
                const description = await question('Enter album description (optional): ');

                // Prompt for month/year
                const monthYear = await question('Enter month/year for album (MM/YYYY, e.g. 05/2024): ');
                if (!monthYear.trim()) {
                    logError('Month/year is required for album creation');
                    continue;
                }

                // Validate format (MM/YYYY)
                const monthYearRegex = /^(0[1-9]|1[0-2])\/(20\d{2})$/;
                if (!monthYearRegex.test(monthYear.trim())) {
                    logError('Invalid format. Please use MM/YYYY format (e.g. 05/2024)');
                    continue;
                }

                // Parse month and year
                const [month, year] = monthYear.trim().split('/');

                if (!await createAlbum(token, capitalizedAlbumName, description.trim() || 'Created via bulk upload script', month, year)) {
                    logError('Failed to create album. Skipping this upload.');
                    continue;
                }
            } else {
                logInfo(`Album '${capitalizedAlbumName}' exists. Proceeding with upload.`);
            }

            // Upload files
            try {
                const jobId = await uploadFiles(token, capitalizedAlbumName, files);
                // Monitor progress
                await monitorProgress(token, jobId, files.length);
                logSuccess('Upload completed successfully!');
            } catch (uploadError) {
                logError('Upload failed: ' + uploadError.message);
                continue;
            }

            // Ask if user wants to upload another album
            const continueAnswer = await question('Would you like to upload another album? (y/N): ');
            continueUploading = ['y', 'yes'].includes(continueAnswer.toLowerCase());
        }

        logInfo('All uploads completed. Goodbye!');

    } catch (error) {
        logError('Script failed: ' + error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Run the script
main();