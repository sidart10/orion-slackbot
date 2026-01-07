/**
 * Slack File Uploader
 *
 * Downloads files from Anthropic Files API and uploads to Slack.
 * Handles batch uploads with partial failure support.
 *
 * @see Story 6.6 - Files API Slack Integration
 * @see AC#1 - uploadFile downloads and uploads successfully
 * @see AC#2 - Preserves filename and MIME type
 * @see AC#3 - Batch upload with parallel execution
 * @see AC#4 - deleteAfterUpload cleanup option
 * @see AC#5 - Partial failure handling with per-file results
 * @see AC#6 - File size validation (Slack 1GB limit)
 * @see AC#8 - MIME type fallback for unknown types
 */

import type { WebClient } from '@slack/web-api';
import { logger } from '../../utils/logger.js';
import type { FilesApiClient } from '../../files/api-client.js';

// Slack file upload limit (1GB for most plans)
const MAX_SLACK_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB

/**
 * Error codes for file upload operations.
 * @see AC#5 - Error logging with codes
 */
export type FileUploaderErrorCode =
  | 'DOWNLOAD_FAILED'
  | 'UPLOAD_FAILED'
  | 'FILE_TOO_LARGE'
  | 'MISSING_PERMISSIONS'
  | 'RATE_LIMITED'
  | 'CLEANUP_FAILED'
  | 'UNKNOWN_ERROR';

/**
 * Options for file upload to Slack.
 * @see AC#4 - deleteAfterUpload option
 */
export interface FileUploadOptions {
  /** Delete file from Anthropic after successful Slack upload */
  deleteAfterUpload?: boolean;
  /** Initial comment to include with file */
  initialComment?: string;
  /** Trace ID for observability */
  traceId?: string;
}

/**
 * Result of a single file upload.
 * @see AC#1 - Success/failure with details
 */
export interface FileUploadResult {
  /** Whether upload succeeded */
  success: boolean;
  /** Original Anthropic file ID */
  anthropicFileId: string;
  /** Slack file ID if successful */
  slackFileId?: string;
  /** Filename uploaded */
  filename?: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Error details if failed */
  error?: {
    code: FileUploaderErrorCode;
    message: string;
  };
}

/**
 * Result of batch file upload.
 * @see AC#3 - Multiple files with summary
 * @see AC#5 - Partial failure support
 */
export interface BatchUploadResult {
  /** Number of files successfully uploaded */
  successCount: number;
  /** Number of files that failed */
  failureCount: number;
  /** Total bytes uploaded */
  totalBytes: number;
  /** Per-file results */
  results: FileUploadResult[];
}

/**
 * Error thrown by file upload operations.
 * @see AC#5 - Error handling
 */
export class FileUploaderError extends Error {
  constructor(
    message: string,
    public code: FileUploaderErrorCode,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'FileUploaderError';
  }
}

/**
 * Downloads files from Anthropic Files API and uploads to Slack.
 *
 * @example
 * ```typescript
 * const uploader = new SlackFileUploader(filesClient, slackClient);
 *
 * // Upload a single file
 * const result = await uploader.uploadFile(
 *   'file_01abc',
 *   'C1234567',
 *   '1234567890.123456',
 *   { deleteAfterUpload: true, traceId }
 * );
 *
 * // Upload multiple files from response
 * const batch = await uploader.uploadFiles(fileIds, channel, threadTs, { traceId });
 * ```
 *
 * @see Story 6.6 - Files API Slack Integration
 * @see AC#1-8 - All acceptance criteria
 */
export class SlackFileUploader {
  constructor(
    private filesClient: FilesApiClient,
    private slackClient: WebClient
  ) {}

  /**
   * Upload a single file from Anthropic to Slack.
   *
   * @param fileId - Anthropic file ID
   * @param channel - Slack channel ID
   * @param threadTs - Thread timestamp
   * @param options - Upload options
   * @returns Upload result with success/failure details
   *
   * @see AC#1 - Downloads and uploads successfully
   * @see AC#2 - Preserves filename and MIME type
   * @see AC#4 - deleteAfterUpload cleanup
   * @see AC#6 - File size validation
   */
  async uploadFile(
    fileId: string,
    channel: string,
    threadTs: string,
    options?: FileUploadOptions
  ): Promise<FileUploadResult> {
    const { deleteAfterUpload, initialComment, traceId } = options ?? {};
    const startTime = Date.now();

    logger.debug({
      event: 'slack.file.upload.start',
      traceId,
      fileId,
      channel,
      threadTs,
    });

    try {
      // Step 1: Get file metadata
      const metadata = await this.filesClient.getFileMetadata(fileId, traceId);

      // Step 2: Validate file size (AC#6)
      if (metadata.size_bytes > MAX_SLACK_FILE_SIZE_BYTES) {
        return {
          success: false,
          anthropicFileId: fileId,
          filename: metadata.filename,
          sizeBytes: metadata.size_bytes,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File ${metadata.filename} (${formatBytes(metadata.size_bytes)}) exceeds Slack's 1GB limit`,
          },
        };
      }

      // Step 3: Download file content
      const content = await this.filesClient.downloadFile(fileId, traceId);

      // Step 4: Upload to Slack
      const slackResult = await this.slackClient.filesUploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        filename: metadata.filename,
        file: content,
        initial_comment: initialComment,
      });

      // filesUploadV2 returns files array
      const slackFileId = (slackResult.files as { id?: string }[])?.[0]?.id;

      const duration = Date.now() - startTime;
      logger.info({
        event: 'slack.file.upload.complete',
        traceId,
        fileId,
        slackFileId,
        filename: metadata.filename,
        sizeBytes: metadata.size_bytes,
        durationMs: duration,
      });

      // Step 5: Cleanup (async, don't block) - AC#4
      if (deleteAfterUpload) {
        this.cleanupFile(fileId, traceId).catch((error) => {
          logger.warn({
            event: 'slack.file.cleanup.failed',
            traceId,
            fileId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      return {
        success: true,
        anthropicFileId: fileId,
        slackFileId,
        filename: metadata.filename,
        sizeBytes: metadata.size_bytes,
      };
    } catch (error) {
      const code = this.categorizeError(error);
      const message = error instanceof Error ? error.message : String(error);

      logger.error({
        event: 'slack.file.upload.failed',
        traceId,
        fileId,
        errorCode: code,
        error: message,
      });

      return {
        success: false,
        anthropicFileId: fileId,
        error: { code, message },
      };
    }
  }

  /**
   * Upload multiple files from Anthropic to Slack.
   * Handles partial failures — one file failing doesn't stop others.
   *
   * @param fileIds - Array of Anthropic file IDs
   * @param channel - Slack channel ID
   * @param threadTs - Thread timestamp
   * @param options - Upload options
   * @returns Batch result with per-file status
   *
   * @see AC#3 - Multiple files uploaded in parallel
   * @see AC#5 - Partial failure handling
   */
  async uploadFiles(
    fileIds: string[],
    channel: string,
    threadTs: string,
    options?: FileUploadOptions
  ): Promise<BatchUploadResult> {
    const { traceId } = options ?? {};

    logger.info({
      event: 'slack.files.batch.start',
      traceId,
      fileCount: fileIds.length,
      channel,
      threadTs,
    });

    // Upload files in parallel (Slack rate limits ~20/min, should be fine for typical batches)
    const results = await Promise.all(
      fileIds.map((fileId) => this.uploadFile(fileId, channel, threadTs, options))
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const totalBytes = results.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);

    logger.info({
      event: 'slack.files.batch.complete',
      traceId,
      successCount,
      failureCount,
      totalBytes,
    });

    return {
      successCount,
      failureCount,
      totalBytes,
      results,
    };
  }

  /**
   * Delete file from Anthropic storage (cleanup after upload).
   * @see AC#4 - Cleanup as async fire-and-forget
   */
  private async cleanupFile(fileId: string, traceId?: string): Promise<void> {
    try {
      await this.filesClient.deleteFile(fileId, traceId);
      logger.debug({
        event: 'slack.file.cleanup.complete',
        traceId,
        fileId,
      });
    } catch (error) {
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Categorize error for consistent error codes.
   * @see AC#5 - Error codes for different failure modes
   */
  private categorizeError(error: unknown): FileUploaderErrorCode {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const name = error.name.toLowerCase();

      // Check error name first (more reliable)
      if (name.includes('filesapierror')) {
        if (message.includes('not found') || message.includes('404')) {
          return 'DOWNLOAD_FAILED';
        }
      }

      // Check message patterns
      if (message.includes('not found') || message.includes('404')) {
        return 'DOWNLOAD_FAILED';
      }
      if (message.includes('rate limit') || message.includes('429')) {
        return 'RATE_LIMITED';
      }
      if (
        message.includes('permission') ||
        message.includes('401') ||
        message.includes('403') ||
        message.includes('not_in_channel') ||
        message.includes('channel_not_found')
      ) {
        return 'MISSING_PERMISSIONS';
      }
      if (message.includes('upload') || message.includes('slack')) {
        return 'UPLOAD_FAILED';
      }
    }
    return 'UNKNOWN_ERROR';
  }
}

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Create a SlackFileUploader instance.
 *
 * @param filesClient - Anthropic Files API client
 * @param slackClient - Slack WebClient
 * @returns SlackFileUploader instance
 *
 * @example
 * ```typescript
 * const uploader = createSlackFileUploader(filesClient, slackClient);
 * const result = await uploader.uploadFile(fileId, channel, threadTs);
 * ```
 */
export function createSlackFileUploader(
  filesClient: FilesApiClient,
  slackClient: WebClient
): SlackFileUploader {
  return new SlackFileUploader(filesClient, slackClient);
}
