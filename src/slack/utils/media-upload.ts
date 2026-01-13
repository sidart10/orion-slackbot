/**
 * Media Upload Utility for Slack
 *
 * Detects media/file URLs in agent responses, downloads them,
 * and uploads them to Slack for inline display.
 *
 * Supports:
 * - GCS gs:// URLs (from Imagen/Veo and other tools)
 * - GCS signed URLs (https://storage.googleapis.com/...)
 * - Direct file URLs (images, videos, documents, etc.)
 */

import type { WebClient } from '@slack/web-api';
import { Storage } from '@google-cloud/storage';
import { logger } from '../../utils/logger.js';

/** GCS client for downloading from gs:// URLs */
const storage = new Storage();

/**
 * Supported file extensions for Slack upload.
 * Includes images, videos, documents, and other common formats.
 */
const SUPPORTED_EXTENSIONS = [
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif',
  // Videos
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'flv', 'wmv',
  // Audio
  'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac',
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv',
  // Web/Code
  'html', 'htm', 'css', 'js', 'json', 'xml', 'yaml', 'yml', 'md',
  // Archives
  'zip', 'tar', 'gz', 'rar', '7z',
].join('|');

/**
 * Regex to find GCS gs:// URLs.
 * Matches URLs WITH extensions (any supported type) OR
 * URLs from orion-genmedia bucket (Veo/Imagen outputs may lack extensions).
 */
const GCS_URI_PATTERN = new RegExp(
  // Match: gs://bucket/path/file.ext OR gs://orion-genmedia/veo_outputs/... (no extension required)
  `gs:\\/\\/(?:` +
    // Option 1: orion-genmedia bucket (Imagen/Veo) - extension optional
    `orion-genmedia\\/(?:imagen_outputs|veo_outputs)\\/[^\\s<>"]+` +
    `|` +
    // Option 2: Any bucket with known extension
    `[^/]+\\/[^\\s<>"]+\\.(?:${SUPPORTED_EXTENSIONS})` +
  `)`,
  'gi'
);

/**
 * Regex to find GCS signed URLs (multiple domains).
 * Matches URLs WITH extensions OR from orion-genmedia bucket (extension optional).
 */
const HTTP_MEDIA_URL_PATTERN = new RegExp(
  `https?:\\/\\/storage\\.(?:googleapis|mtls\\.cloud\\.google)\\.com\\/(?:` +
    // Option 1: orion-genmedia bucket - extension optional
    `orion-genmedia\\/(?:imagen_outputs|veo_outputs)\\/[^\\s<>"?]+(?:\\?[^\\s<>"]*)?` +
    `|` +
    // Option 2: Any path with known extension
    `[^\\s<>"]+\\.(?:${SUPPORTED_EXTENSIONS})(?:\\?[^\\s<>"]*)?` +
  `)`,
  'gi'
);

interface ImageUploadResult {
  url: string;
  success: boolean;
  fileId?: string;
  error?: string;
}

/**
 * Extract media/file URLs from text content.
 * Handles both gs:// URIs and HTTP URLs.
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];

  // Find gs:// URLs (Imagen/Veo output format)
  const gcsMatches = text.matchAll(GCS_URI_PATTERN);
  for (const match of gcsMatches) {
    if (match[0]) urls.push(match[0]);
  }

  // Find HTTP media URLs (GCS signed URLs)
  const httpMatches = text.matchAll(HTTP_MEDIA_URL_PATTERN);
  for (const match of httpMatches) {
    if (match[0]) urls.push(match[0]);
  }

  // Deduplicate
  return [...new Set(urls)];
}

/**
 * Strip media/file URLs from text content.
 * Used to clean up response text before displaying in Slack since files
 * are uploaded separately.
 *
 * Preserves single trailing spaces (needed for streaming word boundaries)
 * but collapses multiple spaces and excessive newlines.
 *
 * @param text - Text that may contain media URLs
 * @returns Text with media URLs removed and cleaned up
 */
export function stripImageUrls(text: string): string {
  // Remove gs:// URLs
  let cleaned = text.replace(GCS_URI_PATTERN, '');

  // Remove HTTP media URLs (GCS signed URLs)
  cleaned = cleaned.replace(HTTP_MEDIA_URL_PATTERN, '');

  // Clean up artifacts only if URLs were actually removed (preserve original spacing for normal text)
  if (cleaned !== text) {
    cleaned = cleaned
      .replace(/ {2,}/g, ' ')      // Multiple spaces -> single space
      .replace(/ +$/gm, '')        // Remove trailing spaces on each line
      .replace(/\n{3,}/g, '\n\n')  // 3+ newlines -> double newline
      .trim();
  }

  return cleaned;
}

/**
 * Get file extension from filename for Slack filetype parameter.
 * Returns the extension as-is for most types (Slack auto-detects from extension).
 */
function getFiletypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  // Slack recognizes most extensions directly
  // Only normalize a few special cases
  const filetypeMap: Record<string, string> = {
    jpeg: 'jpg',
    tiff: 'tif',
    htm: 'html',
    yml: 'yaml',
  };
  return filetypeMap[ext] || ext || 'binary';
}

/**
 * Determine filename from URL.
 * For Veo outputs (veo_outputs/), defaults to .mp4 if no extension.
 * For Imagen outputs (imagen_outputs/), defaults to .png if no extension.
 */
function getFilenameFromUrl(url: string): string {
  try {
    // Handle gs:// URLs by converting to parseable format
    const parseableUrl = url.startsWith('gs://')
      ? url.replace('gs://', 'https://storage.googleapis.com/')
      : url;

    const urlObj = new URL(parseableUrl);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/');
    const lastSegment = segments[segments.length - 1] || 'media';

    // Remove query params from filename
    const filename = lastSegment.split('?')[0];

    // If no extension, infer from path type
    if (!filename.includes('.')) {
      // Check if this is a Veo video output
      if (pathname.includes('veo_outputs')) {
        return `${filename}.mp4`;
      }
      // Default to png for images
      return `${filename}.png`;
    }
    return filename;
  } catch {
    return `image-${Date.now()}.png`;
  }
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
    // Determine filetype for Slack to properly render as image
    const filetype = getFiletypeFromFilename(filename);

    const result = await client.filesUploadV2({
      channel_id: channelId,
      thread_ts: threadTs,
      file: imageBuffer,
      filename,
      filetype,  // Explicit filetype helps Slack render images correctly
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

  // Process media files sequentially to avoid rate limits
  for (const url of imageUrls) {
    const downloaded = await downloadImage(url, traceId);

    if (!downloaded) {
      results.push({ url, success: false, error: 'Download failed' });
      continue;
    }

    // Determine media type from filename extension
    const ext = downloaded.filename.split('.').pop()?.toLowerCase() ?? '';
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'flv', 'wmv'];
    const mediaTitle = videoExtensions.includes(ext) ? 'Generated Video' : 'Generated Image';

    const fileId = await uploadToSlack(
      client,
      channelId,
      threadTs,
      downloaded.buffer,
      downloaded.filename,
      mediaTitle,
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

