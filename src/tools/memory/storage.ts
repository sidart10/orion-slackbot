/**
 * GCS Storage Layer for Memory Tool
 *
 * Provides CRUD operations for memory files in Google Cloud Storage.
 * Bucket is passed as parameter — no config import at module level.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1-4 - GCS operations for view/create/update/delete
 */

import { Storage, Bucket } from '@google-cloud/storage';

const storage = new Storage();
const bucketCache = new Map<string, Bucket>();

/**
 * Get or create a cached bucket reference.
 */
function getBucket(bucketName: string): Bucket {
  if (!bucketCache.has(bucketName)) {
    bucketCache.set(bucketName, storage.bucket(bucketName));
  }
  return bucketCache.get(bucketName)!;
}

/**
 * Read file content from GCS.
 *
 * @param bucketName - GCS bucket name
 * @param path - File path within bucket (without /memories/ prefix)
 * @returns File content as string
 * @throws Error if file does not exist or GCS error occurs
 */
export async function readFile(bucketName: string, path: string): Promise<string> {
  const bucket = getBucket(bucketName);
  const file = bucket.file(path);
  const [exists] = await file.exists();

  if (!exists) {
    throw new Error(`File not found: ${path}`);
  }

  const [content] = await file.download();
  return content.toString('utf-8');
}

/**
 * Write file content to GCS.
 *
 * @param bucketName - GCS bucket name
 * @param path - File path within bucket (without /memories/ prefix)
 * @param content - Content to write
 */
export async function writeFile(
  bucketName: string,
  path: string,
  content: string
): Promise<void> {
  const bucket = getBucket(bucketName);
  const file = bucket.file(path);
  await file.save(content, {
    contentType: 'text/plain',
    metadata: { cacheControl: 'no-cache' },
  });
}

/**
 * Delete file from GCS.
 *
 * @param bucketName - GCS bucket name
 * @param path - File path within bucket (without /memories/ prefix)
 * @throws Error if file does not exist
 */
export async function deleteFile(bucketName: string, path: string): Promise<void> {
  const bucket = getBucket(bucketName);
  const file = bucket.file(path);
  const [exists] = await file.exists();

  if (!exists) {
    throw new Error(`File not found: ${path}`);
  }

  await file.delete();
}

/**
 * List files with given prefix in GCS.
 *
 * @param bucketName - GCS bucket name
 * @param prefix - Directory prefix to list
 * @returns Array of file paths with /memories/ prefix
 */
export async function listFiles(bucketName: string, prefix: string): Promise<string[]> {
  const bucket = getBucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  return files.map((f) => `/memories/${f.name}`);
}

