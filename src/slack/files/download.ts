/**
 * Slack File Download Service
 *
 * Downloads files from Slack using authenticated requests.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see AC#4 - Download file content via Slack API using url_private_download
 * @see AC#5 - Use bot token for authentication
 * @see AC#6 - Handle download failures gracefully
 * @see AC#7 - Respect file size limits
 */

import { config } from '../../config/environment.js';
import { logger } from '../../utils/logger.js';
import type {
  SlackFile,
  DownloadedFile,
  FileIngestionErrorCode,
} from './types.js';
import {
  getMaxSizeForMimeType,
  isSupportedMimeType,
  formatFileSize,
  formatSupportedTypes,
} from './types.js';

/**
 * Custom error class for Slack file download failures.
 *
 * @see AC#6 - Handle download failures gracefully
 * @see AC#20 - File too large error
 * @see AC#21 - Download failed error
 */
export class SlackFileDownloadError extends Error {
  constructor(
    message: string,
    public code: FileIngestionErrorCode,
    public filename: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'SlackFileDownloadError';
  }
}

/**
 * Validate file before download.
 *
 * @param file - Slack file metadata
 * @throws SlackFileDownloadError if validation fails
 */
function validateFile(file: SlackFile): void {
  // AC#7: Check zero-byte file
  if (file.size === 0) {
    throw new SlackFileDownloadError(
      `File "${file.name}" has no content (0 bytes)`,
      'ZERO_BYTE_FILE',
      file.name
    );
  }

  // AC#14, AC#19: Check MIME type support
  if (!isSupportedMimeType(file.mimetype)) {
    throw new SlackFileDownloadError(
      `Unsupported file type: ${file.mimetype}\n\n${formatSupportedTypes()}`,
      'UNSUPPORTED_TYPE',
      file.name
    );
  }

  // AC#7, AC#20: Check file size against type-specific limit
  const maxSize = getMaxSizeForMimeType(file.mimetype);
  if (maxSize !== null && file.size > maxSize) {
    throw new SlackFileDownloadError(
      `File "${file.name}" is too large (${formatFileSize(file.size)}). ` +
        `Maximum size for ${file.mimetype} is ${formatFileSize(maxSize)}.`,
      'FILE_TOO_LARGE',
      file.name
    );
  }
}

/**
 * Download options for customization.
 */
export interface DownloadOptions {
  /** Slack bot token (defaults to config.slackBotToken) */
  botToken?: string;
  /** Trace ID for observability */
  traceId?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Download a file from Slack.
 *
 * Validates file before download, then fetches content using
 * authenticated request to url_private_download.
 *
 * @param file - Slack file metadata
 * @param options - Download options
 * @returns Downloaded file with content buffer
 * @throws SlackFileDownloadError on validation or download failure
 *
 * @see AC#4 - Download via url_private_download
 * @see AC#5 - Bot token authentication
 */
export async function downloadSlackFile(
  file: SlackFile,
  options?: DownloadOptions
): Promise<DownloadedFile> {
  const botToken = options?.botToken ?? config.slackBotToken;
  const traceId = options?.traceId ?? 'unknown';
  const timeoutMs = options?.timeoutMs ?? 30000;

  logger.debug({
    event: 'slack.file.download.start',
    traceId,
    fileId: file.id,
    filename: file.name,
    mimetype: file.mimetype,
    size: file.size,
  });

  // Validate before downloading
  validateFile(file);

  // Set up abort controller for timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    // AC#4, AC#5: Download with bot token auth
    const response = await fetch(file.url_private_download, {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    // Check for HTTP errors
    if (!response.ok) {
      // AC#6, AC#21: Handle specific error codes
      if (response.status === 404 || response.status === 410) {
        throw new SlackFileDownloadError(
          `File "${file.name}" is no longer available. ` +
            'The file may have been deleted or the URL has expired.',
          'FILE_EXPIRED',
          file.name
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new SlackFileDownloadError(
          `Access denied when downloading "${file.name}". ` +
            'The bot may not have permission to access this file.',
          'DOWNLOAD_FAILED',
          file.name
        );
      }

      throw new SlackFileDownloadError(
        `Failed to download "${file.name}": HTTP ${response.status}`,
        'DOWNLOAD_FAILED',
        file.name
      );
    }

    // Get content as buffer
    const arrayBuffer = await response.arrayBuffer();
    const content = Buffer.from(arrayBuffer);

    // Verify downloaded size matches expected
    if (content.length !== file.size) {
      logger.warn({
        event: 'slack.file.download.size_mismatch',
        traceId,
        fileId: file.id,
        expectedSize: file.size,
        actualSize: content.length,
      });
    }

    logger.info({
      event: 'slack.file.download.complete',
      traceId,
      fileId: file.id,
      filename: file.name,
      size: content.length,
    });

    return {
      content,
      filename: file.name,
      mimetype: file.mimetype,
      size: content.length,
      slackFileId: file.id,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Re-throw SlackFileDownloadError as-is
    if (error instanceof SlackFileDownloadError) {
      throw error;
    }

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SlackFileDownloadError(
        `Download of "${file.name}" timed out after ${timeoutMs}ms`,
        'DOWNLOAD_FAILED',
        file.name,
        error
      );
    }

    // Wrap other errors
    throw new SlackFileDownloadError(
      `Failed to download "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      'DOWNLOAD_FAILED',
      file.name,
      error
    );
  }
}
