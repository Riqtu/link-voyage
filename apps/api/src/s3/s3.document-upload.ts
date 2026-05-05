import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25MB
const SIGNED_URL_TTL_SECONDS = 60 * 2;

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.rtf',
]);

const ALLOWED_CONTENT_PREFIXES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'application/rtf',
];

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
  return sanitized.length ? sanitized : 'document';
}

export function encodeKeyForUrlSegments(key: string): string {
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
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  return s3Client;
}

export function buildPublicDocumentUrl(objectKey: string): string {
  const bucket = requireEnv('AWS_S3_BUCKET');
  const endpoint = requireEnv('AWS_S3_ENDPOINT').replace(/\/$/, '');
  return `${endpoint}/${bucket}/${encodeKeyForUrlSegments(objectKey)}`;
}

/** Если браузер шлёт пустой type / octet-stream, берём MIME по расширению. */
function resolveDocumentContentType(contentType: string, filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Недопустимое расширение файла');
  }

  const fromExtMap: Partial<Record<string, string>> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf',
  };
  const fromExt = fromExtMap[ext];
  const raw = contentType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (fromExt && (!raw || raw === 'application/octet-stream')) {
    return fromExt;
  }
  return contentType.split(';')[0]?.trim() || contentType;
}

function assertAllowedDocument(
  contentTypeRaw: string,
  filename: string,
  size: number,
): string {
  const resolved = resolveDocumentContentType(contentTypeRaw, filename);
  const normal = resolved.split(';')[0]?.trim().toLowerCase() ?? '';
  const okPrefix = ALLOWED_CONTENT_PREFIXES.some((p) => normal.startsWith(p));
  if (!okPrefix) {
    throw new Error('Недопустимый тип файла (разрешены PDF, Office, текст)');
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_DOCUMENT_BYTES) {
    throw new Error('Слишком большой файл (лимит 25MB)');
  }
  return resolved;
}

export type SignedDocumentUpload = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  /** Тот же MIME, что в подписанном PUT (после нормализации по расширению). */
  contentType: string;
};

export async function signDocumentUpload(opts: {
  tripId: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<SignedDocumentUpload> {
  const { tripId, filename, contentType, size } = opts;

  const mimeForPut = assertAllowedDocument(contentType, filename, size);

  const bucket = requireEnv('AWS_S3_BUCKET');

  const safeName = sanitizeFilename(filename);
  const ext = path.extname(safeName).toLowerCase();
  const finalName = ALLOWED_EXTENSIONS.has(ext) ? safeName : `${safeName}.pdf`;

  const objectId = randomBytes(16).toString('hex');
  const objectKey = `trips/${tripId}/documents/${objectId}/${finalName}`;

  const s3 = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimeForPut.split(';')[0]?.trim() || mimeForPut,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });

  const publicUrl = buildPublicDocumentUrl(objectKey);
  const normalizedMime = mimeForPut.split(';')[0]?.trim() || mimeForPut;

  return { uploadUrl, objectKey, publicUrl, contentType: normalizedMime };
}

export async function deleteDocumentObject(objectKey: string): Promise<void> {
  const bucket = requireEnv('AWS_S3_BUCKET');
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export function assertDocumentObjectKeyForTrip(
  tripId: string,
  objectKey: string,
): void {
  const expectedPrefix = `trips/${tripId}/documents/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    throw new Error('Некорректный ключ файла для этой поездки');
  }
  if (objectKey.includes('..') || objectKey.includes('//')) {
    throw new Error('Некорректный ключ файла');
  }
}
