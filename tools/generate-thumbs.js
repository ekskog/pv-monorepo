#!/usr/bin/env node
/**
 * Generate 400px-wide AVIF thumbnails for all existing photos in MinIO.
 * Thumbnails are stored at <album>/thumbs/<filename>.
 * Safe to re-run: skips photos that already have a thumbnail.
 *
 * Usage:
 *   cd tools && npm install
 *   MINIO_ACCESS_KEY=xxx MINIO_SECRET_KEY=xxx node generate-thumbs.js
 */

const Minio = require('minio');
const sharp = require('sharp');
const { Readable } = require('stream');

const albumFilter = (() => {
  const i = process.argv.indexOf('--album');
  return i !== -1 ? process.argv[i + 1] : null;
})();

const ENDPOINT = 'objects.ekskog.net';
const BUCKET = 'photovault';
const THUMB_WIDTH = 400;
const WEBP_QUALITY = 75;

const client = new Minio.Client({
  endPoint: ENDPOINT,
  port: 443,
  useSSL: true,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

function listAllObjects(prefix = '') {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = client.listObjects(BUCKET, prefix, true);
    stream.on('data', obj => { if (obj.name) objects.push(obj.name); });
    stream.on('end', () => resolve(objects));
    stream.on('error', reject);
  });
}

function downloadObject(name) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    client.getObject(BUCKET, name, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

function generateThumbnail(buffer) {
  return sharp(buffer)
    .resize(THUMB_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

function uploadObject(name, buffer, contentType) {
  return new Promise((resolve, reject) => {
    const readable = Readable.from(buffer);
    client.putObject(BUCKET, name, readable, buffer.length, { 'Content-Type': contentType }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
    console.error('Missing MINIO_ACCESS_KEY or MINIO_SECRET_KEY env vars');
    process.exit(1);
  }

  const forceRegen = process.argv.includes('--force');
  if (albumFilter) console.log(`Album filter: ${albumFilter}`);
  if (forceRegen) console.log('Force mode: regenerating all thumbnails');
  console.log(`Connecting to ${ENDPOINT}/${BUCKET}...`);

  const prefix = albumFilter ? albumFilter + '/' : '';
  const allObjects = await listAllObjects(prefix);

  const photos = allObjects.filter(name =>
    name.endsWith('.avif') && !name.includes('/thumbs/')
  );
  const existingThumbs = new Set(
    allObjects.filter(name => name.includes('/thumbs/'))
  );

  console.log(`Found ${photos.length} photos, ${existingThumbs.size} thumbnails already exist\n`);

  let done = 0, skipped = 0, failed = 0;

  for (const photoName of photos) {
    const parts = photoName.split('/');
    const avifFilename = parts[parts.length - 1];
    const album = parts.slice(0, -1).join('/');
    const thumbFilename = avifFilename.replace(/\.avif$/, '.webp');
    const thumbName = `${album}/thumbs/${thumbFilename}`;

    if (!forceRegen && existingThumbs.has(thumbName)) {
      skipped++;
      continue;
    }

    process.stdout.write(`  [${done + skipped + failed + 1}/${photos.length}] ${photoName} → `);

    try {
      const buffer = await downloadObject(photoName);
      const thumb = await generateThumbnail(buffer);
      await uploadObject(thumbName, thumb, 'image/webp');
      done++;
      console.log(`✓ ${Math.round(thumb.length / 1024)} KB`);
    } catch (err) {
      failed++;
      console.log(`✗ ${err.message}`);
    }
  }

  console.log(`\nDone: ${done} generated, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
