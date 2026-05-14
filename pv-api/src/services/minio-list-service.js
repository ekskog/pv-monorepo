'use strict';

const crypto = require('crypto');
const http   = require('http');
const https  = require('https');

const REGION = 'us-east-1';

function sha256hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secretKey, dateStr) {
  const kDate    = hmacSha256('AWS4' + secretKey, dateStr);
  const kRegion  = hmacSha256(kDate,    REGION);
  const kService = hmacSha256(kRegion,  's3');
  return           hmacSha256(kService, 'aws4_request');
}

// AWS Sig v4 requires unreserved chars only un-encoded: A-Za-z0-9 - _ . ~
function awsEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function fetchPage(endpoint, port, useSSL, accessKey, secretKey, bucket, queryObj) {
  const now         = new Date();
  const dateStr     = now.toISOString().slice(0, 10).replace(/-/g, '');
  const datetimeStr = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const queryStr = Object.keys(queryObj).sort()
    .map(k => `${awsEncode(k)}=${awsEncode(queryObj[k])}`).join('&');

  const host        = `${endpoint}:${port}`;
  const path        = `/${bucket}`;
  const payloadHash = sha256hex('');

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetimeStr}\n`;
  const signedHeaders    = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalReq     = `GET\n${path}\n${queryStr}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const scope        = `${dateStr}/${REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${datetimeStr}\n${scope}\n${sha256hex(canonicalReq)}`;
  const signature    = hmacSha256(getSigningKey(secretKey, dateStr), stringToSign).toString('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const req = (useSSL ? https : http).request(
      {
        hostname: endpoint,
        port,
        path: `${path}?${queryStr}`,
        method: 'GET',
        headers: {
          Authorization:          authHeader,
          'x-amz-date':           datetimeStr,
          'x-amz-content-sha256': payloadHash,
        },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function parseXml(xml) {
  const objects = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const get = tag =>
      (block.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`)) || [])[1] || '';
    objects.push({
      name:         get('Key'),
      size:         parseInt(get('Size') || '0', 10),
      lastModified: new Date(get('LastModified')),
      etag:         get('ETag').replace(/&quot;/g, '"'),
    });
  }
  const isTruncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
  const tokenMatch  = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
  return { objects, isTruncated, nextToken: tokenMatch ? tokenMatch[1] : '' };
}

async function* listAllObjects(endpoint, port, useSSL, accessKey, secretKey, bucket, prefix, maxKeys = 200) {
  let continuationToken = '';
  do {
    const queryObj = { 'list-type': '2', 'max-keys': String(maxKeys), prefix };
    if (continuationToken) queryObj['continuation-token'] = continuationToken;

    const xml = await fetchPage(endpoint, port, useSSL, accessKey, secretKey, bucket, queryObj);
    const { objects, isTruncated, nextToken } = parseXml(xml);

    for (const obj of objects) yield obj;
    if (!isTruncated) break;
    continuationToken = nextToken;
  } while (true);
}

module.exports = { listAllObjects };
