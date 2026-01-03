/**
 * Image Upload Utility for Slack
 *
 * Detects image URLs in agent responses, downloads them,
 * and uploads them to Slack for inline display.
 *
 * Supports:
 * - GCS signed URLs (from Imagen/Veo)
 * - Direct image URLs (png, jpg, gif, webp)
 */

import type { WebClient } from '@slack/web-api';
import { logger } from '../../utils/logger.js';

/** Regex to find GCS URLs (multiple domains) or direct image URLs */
const IMAGE_URL_PATTERN =
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
 */
export function extractImageUrls(text: string): string[] {
  const matches = text.match(IMAGE_URL_PATTERN);
  if (!matches) return [];

  // Deduplicate
  return [...new Set(matches)];
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
 * Download an image from a URL.
 */
async function downloadImage(url: string): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Orion-Slack-Agent/1.0',
      },
    });

    if (!response.ok) {
      logger.warn({
        event: 'image_download.failed',
        url: url.slice(0, 100),
        status: response.status,
      });
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = getFilenameFromUrl(url);

    return { buffer, filename };
  } catch (error) {
    logger.warn({
      event: 'image_download.error',
      url: url.slice(0, 100),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
  altText?: string
): Promise<string | null> {
  try {
    const result = await client.filesUploadV2({
      channel_id: channelId,
      thread_ts: threadTs,
      file: imageBuffer,
      filename,
      title: altText || filename,
      alt_txt: altText,
    });

    // filesUploadV2 returns files array
    const fileId = (result.files as { id?: string }[])?.[0]?.id;

    logger.info({
      event: 'image_upload.success',
      channelId,
      threadTs,
      filename,
      fileId,
    });

    return fileId ?? null;
  } catch (error) {
    logger.error({
      event: 'image_upload.failed',
      channelId,
      threadTs,
      filename,
      error: error instanceof Error ? error.message : String(error),
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
  responseText: string
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
  });

  const results: ImageUploadResult[] = [];

  // Process images sequentially to avoid rate limits
  for (const url of imageUrls) {
    const downloaded = await downloadImage(url);

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
      'Generated Image'
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

