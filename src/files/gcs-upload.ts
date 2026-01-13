/**
 * GCS Upload Client for User-Uploaded Files
 *
 * Uploads user files to GCS for MCP tool access. Uses patterns from
 * src/tools/memory/storage.ts for consistency.
 *
 * @see MCP Tool File Access (Phase 3 of File Upload)
 * @see Task 1 - Create GCS Upload Client
 */

import { Storage, Bucket } from '@google-cloud/storage';
import { getLangfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';

/**
 * GCS bucket for user uploads.
 * Same bucket as genmedia outputs (imagen_outputs/, veo_outputs/).
 * User uploads go to user_uploads/ prefix.
 */
export const GCS_USER_UPLOADS_BUCKET = 'orion-genmedia';

/**
 * Prefix for user-uploaded files within the bucket.
 */
const USER_UPLOADS_PREFIX = 'user_uploads';

// Singleton Storage instance with bucket cache
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
 * Sanitize filename for GCS object key.
 * Replaces spaces and special characters with underscores.
 *
 * @param filename - Original filename
 * @returns Sanitized filename safe for GCS
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\s+/g, '_')          // spaces to underscores
    .replace(/[()[\]{}]/g, '_')    // brackets to underscores
    .replace(/[^a-zA-Z0-9._-]/g, '_') // other special chars to underscores
    .replace(/_+/g, '_');          // collapse multiple underscores
}

/**
 * Upload a file buffer to GCS for MCP tool access.
 *
 * Files are uploaded to: gs://orion-genmedia/user_uploads/{traceId}/{filename}
 *
 * @param buffer - File content as Buffer
 * @param filename - Original filename
 * @param mimeType - MIME type (e.g., 'image/png', 'video/mp4')
 * @param traceId - Trace ID for observability and path organization
 * @returns GCS URI (e.g., 'gs://orion-genmedia/user_uploads/abc123/photo.png') or undefined on failure
 *
 * @see Task 1 - AC: Upload to gs://orion-genmedia/user_uploads/{traceId}/{filename}
 * @see Task 1 - AC: Return GCS URI
 * @see Task 1 - AC: Handle errors gracefully (return undefined, don't throw)
 */
export async function uploadFileToGcs(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  traceId: string
): Promise<string | undefined> {
  const langfuse = getLangfuse();
  const startTime = Date.now();

  // Sanitize filename for safe GCS object key
  const safeFilename = sanitizeFilename(filename);
  const objectPath = `${USER_UPLOADS_PREFIX}/${traceId}/${safeFilename}`;
  const gcsUri = `gs://${GCS_USER_UPLOADS_BUCKET}/${objectPath}`;

  logger.info({
    event: 'gcs.upload.start',
    traceId,
    filename,
    safeFilename,
    mimeType,
    sizeBytes: buffer.length,
    objectPath,
  });

  try {
    const bucket = getBucket(GCS_USER_UPLOADS_BUCKET);
    const file = bucket.file(objectPath);

    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        traceId,
        originalFilename: filename,
        uploadedAt: new Date().toISOString(),
      },
    });

    const durationMs = Date.now() - startTime;

    logger.info({
      event: 'gcs.upload.success',
      traceId,
      filename,
      mimeType,
      sizeBytes: buffer.length,
      gcsUri,
      durationMs,
    });

    // Track Langfuse event for observability
    if (langfuse?.event) {
      langfuse.event({
        name: 'gcs.upload.success',
        metadata: {
          traceId,
          filename,
          mimeType,
          sizeBytes: buffer.length,
          gcsUri,
          durationMs,
        },
      });
    }

    return gcsUri;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      event: 'gcs.upload.failed',
      traceId,
      filename,
      mimeType,
      error: errorMessage,
      durationMs,
    });

    // Track failure in Langfuse
    if (langfuse?.event) {
      langfuse.event({
        name: 'gcs.upload.failed',
        metadata: {
          traceId,
          filename,
          mimeType,
          error: errorMessage,
          durationMs,
        },
      });
    }

    // Return undefined instead of throwing (graceful degradation)
    return undefined;
  }
}
