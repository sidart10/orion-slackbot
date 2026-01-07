/**
 * Image Upload Utility for Slack
 *
 * Detects image URLs in agent responses, downloads them,
 * and uploads them to Slack for inline display.
 *
 * Supports:
 * - GCS gs:// URLs (from Imagen/Veo)
 * - GCS signed URLs (https://storage.googleapis.com/...)
 * - Direct image URLs (png, jpg, gif, webp)
 */

import type { WebClient } from '@slack/web-api';
import { Storage } from '@google-cloud/storage';
import { logger } from '../../utils/logger.js';

/** GCS client for downloading from gs:// URLs */
const storage = new Storage();

/** Regex to find GCS gs:// URLs */
const GCS_URI_PATTERN = /gs:\/\/([^/]+)\/([^\s<>"]+\.(?:png|jpg|jpeg|gif|webp))/gi;

/** Regex to find GCS signed URLs (multiple domains) or direct image URLs */
const HTTP_IMAGE_URL_PATTERN =
  /https?:\/\/storage\.(?:googleapis|mtls\.cloud\.google)\.com\/[^\s<>"]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s<>"]*)?|https?:\/\/[^\s<>"]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s<>"]*)?/gi;

/** Supported image MIME types */
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

interface ImageUploadResult {
  url: string;
  success: boolean;
  fileId?: string;
  error?: string;
}

/**
 * Extract image URLs from text content.
 * Handles both gs:// URIs and HTTP URLs.
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];

  // Find gs:// URLs (Imagen/Veo output format)
  const gcsMatches = text.matchAll(GCS_URI_PATTERN);
  for (const match of gcsMatches) {
    if (match[0]) urls.push(match[0]);
  }

  // Find HTTP image URLs
  const httpMatches = text.matchAll(HTTP_IMAGE_URL_PATTERN);
  for (const match of httpMatches) {
    if (match[0]) urls.push(match[0]);
  }

  // Deduplicate
  return [...new Set(urls)];
}

/**
 * Determine filename from URL.
 */
function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/');
    const lastSegment = segments[segments.length - 1] || 'image';

    // Remove query params from filename
    const filename = lastSegment.split('?')[0];

    // If no extension, default to png
    if (!filename.includes('.')) {
      return `${filename}.png`;
    }
    return filename;
  } catch {
    return `image-${Date.now()}.png`;
  }
}

/**
 * Get MIME type from filename.
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  return IMAGE_MIME_TYPES[ext] || 'image/png';
}

/**
 * Download an image from a GCS gs:// URI using the GCS client.
 */
async function downloadFromGcs(
  gcsUri: string,
  traceId?: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    // Parse gs://bucket/path format
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match || !match[1] || !match[2]) {
      logger.warn({
        event: 'image_download.invalid_gcs_uri',
        uri: gcsUri.slice(0, 100),
        traceId,
      });
      return null;
    }

    const bucketName = match[1];
    const objectPath = match[2];
    const filename = objectPath.split('/').pop() || 'image.png';

    // Best-effort timeout guard (GCS client doesn't support AbortController here)
    const timeoutMs = 15000;
    let timeoutId: NodeJS.Timeout | null = null;
    const downloadPromise = storage.bucket(bucketName).file(objectPath).download();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('GCS download timeout')), timeoutMs);
    });

    try {
      const downloaded = await Promise.race([downloadPromise, timeoutPromise]);
      const [buffer] = downloaded;

      logger.info({
        event: 'image_download.gcs_success',
        bucket: bucketName,
        filename,
        bytes: buffer.length,
        traceId,
      });

      return { buffer, filename };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.warn({
      event: 'image_download.gcs_error',
      uri: gcsUri.slice(0, 100),
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });
    return null;
  }
}

/**
 * Download an image from an HTTP URL.
 */
async function downloadFromHttp(
  url: string,
  traceId?: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Orion-Slack-Agent/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn({
          event: 'image_download.http_failed',
          url: url.slice(0, 100),
          status: response.status,
          traceId,
        });
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = getFilenameFromUrl(url);

      return { buffer, filename };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.warn({
      event: 'image_download.http_error',
      url: url.slice(0, 100),
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });
    return null;
  }
}

/**
 * Download an image from a URL (handles both gs:// and http://).
 */
async function downloadImage(
  url: string,
  traceId?: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  if (url.startsWith('gs://')) {
    return downloadFromGcs(url, traceId);
  }
  return downloadFromHttp(url, traceId);
}

/**
 * Upload an image to Slack.
 *
 * @param client - Slack WebClient
 * @param channelId - Channel to upload to
 * @param threadTs - Thread timestamp (for threading)
 * @param imageBuffer - Image data
 * @param filename - Filename for the image
 * @param altText - Alt text / title
 */
async function uploadToSlack(
  client: WebClient,
  channelId: string,
  threadTs: string,
  imageBuffer: Buffer,
  filename: string,
  altText?: string,
  traceId?: string
): Promise<string | null> {
  try {
    const result = await client.filesUploadV2({
      channel_id: channelId,
      thread_ts: threadTs,
      file: imageBuffer,
      filename,
      title: altText || filename,
      alt_text: altText,
    });

    // filesUploadV2 returns files array
    const fileId = (result.files as { id?: string }[])?.[0]?.id;

    logger.info({
      event: 'image_upload.success',
      channelId,
      threadTs,
      filename,
      fileId,
      traceId,
    });

    return fileId ?? null;
  } catch (error) {
    logger.error({
      event: 'image_upload.failed',
      channelId,
      threadTs,
      filename,
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });
    return null;
  }
}

/**
 * Process agent response text, find image URLs, download and upload them to Slack.
 *
 * @param client - Slack WebClient
 * @param channelId - Channel ID
 * @param threadTs - Thread timestamp
 * @param responseText - Agent response text containing image URLs
 * @returns Results for each image URL found
 */
export async function uploadImagesFromResponse(
  client: WebClient,
  channelId: string,
  threadTs: string,
  responseText: string,
  traceId?: string
): Promise<ImageUploadResult[]> {
  const imageUrls = extractImageUrls(responseText);

  if (imageUrls.length === 0) {
    return [];
  }

  logger.info({
    event: 'image_upload.processing',
    channelId,
    threadTs,
    imageCount: imageUrls.length,
    traceId,
  });

  const results: ImageUploadResult[] = [];

  // Process images sequentially to avoid rate limits
  for (const url of imageUrls) {
    const downloaded = await downloadImage(url, traceId);

    if (!downloaded) {
      results.push({ url, success: false, error: 'Download failed' });
      continue;
    }

    const fileId = await uploadToSlack(
      client,
      channelId,
      threadTs,
      downloaded.buffer,
      downloaded.filename,
      'Generated Image',
      traceId
    );

    results.push({
      url,
      success: !!fileId,
      fileId: fileId ?? undefined,
      error: fileId ? undefined : 'Upload failed',
    });
  }

  return results;
}

