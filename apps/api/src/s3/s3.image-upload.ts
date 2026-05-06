import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const SIGNED_URL_TTL_SECONDS = 60 * 2; // 2 minutes

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw);
  const sanitized = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.+$/g, '');
  return sanitized.length ? sanitized : 'image';
}

function encodeKeyForUrl(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const region = requireEnv('AWS_REGION');
  const endpoint = requireEnv('AWS_S3_ENDPOINT');
  const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');

  s3Client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true, // for S3-compatible endpoints
    credentials: { accessKeyId, secretAccessKey },
  });

  return s3Client;
}

function assertAllowedImage(
  contentType: string | null,
  filename: string,
  size: number,
) {
  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error('Разрешены только изображения');
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    throw new Error('Слишком большой файл (лимит 10MB)');
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Недопустимый формат файла');
  }
}

export type SignedImageUpload = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
};

export async function signImageUpload(opts: {
  tripId: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<SignedImageUpload> {
  const { tripId, filename, contentType, size } = opts;

  assertAllowedImage(contentType, filename, size);

  const bucket = requireEnv('AWS_S3_BUCKET');
  const endpoint = requireEnv('AWS_S3_ENDPOINT').replace(/\/$/, '');

  const safeName = sanitizeFilename(filename);
  const ext = path.extname(safeName).toLowerCase();
  const allowed = ALLOWED_EXTENSIONS.has(ext);
  const finalName = allowed ? safeName : `${safeName}.jpg`;

  const objectId = randomBytes(16).toString('hex');
  const objectKey = `trips/${tripId}/accommodations/${objectId}/${finalName}`;

  const s3 = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });

  const publicUrl = `${endpoint}/${bucket}/${encodeKeyForUrl(objectKey)}`;

  return { uploadUrl, objectKey, publicUrl };
}

/** Публичный URL аватара только из нашего bucket и пути users/{userId}/avatar/ */
export function assertTrustedUserAvatarUrl(url: string, userId: string): void {
  const endpointRaw = process.env.AWS_S3_ENDPOINT ?? '';
  const bucket = process.env.AWS_S3_BUCKET ?? '';
  if (!endpointRaw || !bucket) {
    throw new Error('S3 не настроен (AWS_S3_*)');
  }
  const endpoint = endpointRaw.replace(/\/$/, '');
  const expectedPrefix = `${endpoint}/${bucket}/users/${userId}/avatar/`;
  const normalizedUrl = decodeURI(url.trim());
  if (!normalizedUrl.startsWith(expectedPrefix)) {
    throw new Error('URL аватара не из вашей папки загрузок в S3');
  }
}

export async function signUserAvatarUpload(opts: {
  userId: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<SignedImageUpload> {
  const { userId, filename, contentType, size } = opts;

  assertAllowedImage(contentType, filename, size);

  const bucket = requireEnv('AWS_S3_BUCKET');
  const endpoint = requireEnv('AWS_S3_ENDPOINT').replace(/\/$/, '');

  const safeName = sanitizeFilename(filename);
  const ext = path.extname(safeName).toLowerCase();
  const allowed = ALLOWED_EXTENSIONS.has(ext);
  const finalName = allowed ? safeName : `${safeName}.jpg`;

  const objectId = randomBytes(16).toString('hex');
  const objectKey = `users/${userId}/avatar/${objectId}/${finalName}`;

  const s3 = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });

  const publicUrl = `${endpoint}/${bucket}/${encodeKeyForUrl(objectKey)}`;

  return { uploadUrl, objectKey, publicUrl };
}

export async function signReceiptImageUpload(opts: {
  tripId: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<SignedImageUpload> {
  const { tripId, filename, contentType, size } = opts;

  assertAllowedImage(contentType, filename, size);

  const bucket = requireEnv('AWS_S3_BUCKET');
  const endpoint = requireEnv('AWS_S3_ENDPOINT').replace(/\/$/, '');

  const safeName = sanitizeFilename(filename);
  const ext = path.extname(safeName).toLowerCase();
  const allowed = ALLOWED_EXTENSIONS.has(ext);
  const finalName = allowed ? safeName : `${safeName}.jpg`;

  const objectId = randomBytes(16).toString('hex');
  const objectKey = `trips/${tripId}/receipts/${objectId}/${finalName}`;

  const s3 = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });

  const publicUrl = `${endpoint}/${bucket}/${encodeKeyForUrl(objectKey)}`;

  return { uploadUrl, objectKey, publicUrl };
}
