const fs = require('fs-extra');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ---------------------------------------------------------------------------
// Cloudflare R2 is S3-compatible. The S3 client is configured with an R2
// endpoint + credentials. All video files (originals and trimmed versions)
// are stored in R2 so they survive ephemeral deploys / restarts.
// ---------------------------------------------------------------------------

const R2_ENABLED = () => {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
};

function getS3Client() {
  if (!R2_ENABLED()) {
    return null;
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function bucketName() {
  return process.env.R2_BUCKET_NAME;
}

// Public base URL for direct playback, e.g. a custom domain / CDN attached to
// the R2 bucket. If empty, the server will proxy/generate signed URLs instead.
function publicBaseUrl() {
  const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return base;
}

// Key (path) used inside the bucket for a stored file.
// We keep uploaded originals under "videos/" and trimmed files under "videos/".
function objectKeyForFilename(filename) {
  // strip any path separators to keep keys clean
  return `videos/${path.basename(filename)}`;
}

// Upload a local file to R2. Returns the object key.
async function uploadFile(localPath, filename, contentType) {
  const client = getS3Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured');
  }

  const key = objectKeyForFilename(filename);
  const stream = fs.createReadStream(localPath);
  const mime =
    contentType ||
    (filename.toLowerCase().endsWith('.mp4')
      ? 'video/mp4'
      : 'application/octet-stream');

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: stream,
      ContentType: mime,
    })
  );

  return key;
}

// Download an object from R2 to a local path. Returns the local path.
async function downloadFile(filename, localPath) {
  const client = getS3Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured');
  }

  const stream = await client.send(
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: objectKeyForFilename(filename),
    })
  );

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(localPath);
    stream.Body.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    stream.Body.on('error', reject);
  });

  return localPath;
}

// Delete an object from R2 (best effort, does not throw on missing objects).
async function deleteFile(filename) {
  const client = getS3Client();
  if (!client) {
    return;
  }
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName(),
        Key: objectKeyForFilename(filename),
      })
    );
  } catch (err) {
    console.error('R2 delete error:', err.message);
  }
}

// Check if an object exists in R2.
async function objectExists(filename) {
  const client = getS3Client();
  if (!client) {
    return false;
  }
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName(),
        Key: objectKeyForFilename(filename),
      })
    );
    return true;
  } catch (err) {
    return false;
  }
}

// Return the public URL for a stored file (if R2_PUBLIC_BASE_URL is set)
// or a signed, short-lived URL.
async function getFileUrl(filename, expiresInSeconds = 3600) {
  const key = objectKeyForFilename(filename);

  const base = publicBaseUrl();
  if (base) {
    return `${base}/${key}`;
  }

  const client = getS3Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured');
  }

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  );
}

// Resolve a playback URL for a stored file. Returns null when R2 is not
// configured (caller should fall back to local file serving).
async function resolvePlaybackUrl(filename, expiresInSeconds = 3600) {
  if (!R2_ENABLED()) {
    return null;
  }

  const key = objectKeyForFilename(filename);

  const base = publicBaseUrl();
  if (base) {
    return `${base}/${key}`;
  }

  return getFileUrl(filename, expiresInSeconds);
}

module.exports = {
  R2_ENABLED,
  getS3Client,
  bucketName,
  publicBaseUrl,
  objectKeyForFilename,
  uploadFile,
  downloadFile,
  deleteFile,
  objectExists,
  getFileUrl,
  resolvePlaybackUrl,
};
