/**
 * Files API Client
 *
 * Handles upload, download, metadata, and deletion of files via Anthropic's Files API.
 *
 * @see Story 6.5 - Files API Client
 * @see AC#1 - uploadFile returns FileMetadata
 * @see AC#2 - downloadFile returns Buffer
 * @see AC#3 - getFileMetadata returns FileMetadata
 * @see AC#4 - deleteFile returns true on success
 * @see AC#5 - extractFileIds extracts file IDs from response
 * @see AC#6 - files-api-2025-04-14 beta header included
 * @see AC#7 - Logging with traceId
 * @see AC#8 - Meaningful errors with error codes
 * @see AC#9 - FILE_TOO_LARGE for >100MB before API call
 */

import Anthropic from '@anthropic-ai/sdk';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import type { FileMetadata, FileUploadOptions, FilesApiErrorCode } from './types.js';
import { MAX_FILE_SIZE_BYTES } from './types.js';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/index.js';

/** Beta header for Files API */
const FILES_API_BETA = 'files-api-2025-04-14';

/**
 * Custom error class for Files API operations.
 * @see AC#8 - Meaningful error with error code
 */
export class FilesApiError extends Error {
  constructor(
    message: string,
    public code: FilesApiErrorCode,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'FilesApiError';
  }
}

/**
 * Files API client - handles upload, download, metadata, delete.
 *
 * Non-singleton design allows dependency injection for testing.
 *
 * @example
 * ```typescript
 * const client = new FilesApiClient(anthropicClient);
 * const metadata = await client.uploadFile('./data.csv');
 * const buffer = await client.downloadFile(metadata.id);
 * ```
 *
 * @see AC#1-4 - Core file operations
 * @see AC#6 - Beta header included on all requests
 */
export class FilesApiClient {
  private client: Anthropic;

  /**
   * Create a new FilesApiClient.
   *
   * @param client - Optional Anthropic client. If not provided, creates a new one using environment config.
   */
  constructor(client?: Anthropic) {
    if (client) {
      this.client = client;
    } else {
      // Initialize with config - matches SkillsApiClient pattern
      this.client = new Anthropic({
        apiKey: config.anthropicApiKey,
      });
    }
  }

  /**
   * Upload a file from disk.
   *
   * @param filePath - Path to the file to upload
   * @param options - Optional filename override and traceId
   * @returns File metadata from Anthropic
   * @throws FilesApiError with FILE_TOO_LARGE if >100MB
   * @throws FilesApiError with FILE_UPLOAD_FAILED if file doesn't exist or API fails
   *
   * @see AC#1 - Returns FileMetadata with id, filename, mime_type, size_bytes
   * @see AC#9 - Throws FILE_TOO_LARGE before API call
   */
  async uploadFile(filePath: string, options?: FileUploadOptions): Promise<FileMetadata> {
    const { traceId } = options ?? {};
    const startTime = Date.now();
    const filename = options?.filename ?? basename(filePath);

    // Validate file exists
    if (!existsSync(filePath)) {
      throw new FilesApiError(`File not found: ${filePath}`, 'FILE_UPLOAD_FAILED');
    }

    // AC#9: Check file size before API call
    const fileSize = statSync(filePath).size;
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      throw new FilesApiError(
        `File too large: ${fileSize} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`,
        'FILE_TOO_LARGE'
      );
    }

    logger.debug({ event: 'files.upload.start', traceId, filename, fileSize });

    try {
      const result = await this.client.beta.files.upload({
        file: createReadStream(filePath),
        betas: [FILES_API_BETA],
      });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'files.upload.complete',
        traceId,
        fileId: result.id,
        filename: result.filename,
        sizeBytes: result.size_bytes,
        durationMs,
      });

      return result as FileMetadata;
    } catch (error) {
      throw this.wrapError(error, 'FILE_UPLOAD_FAILED', `Failed to upload file: ${filename}`);
    }
  }

  /**
   * Upload a buffer as a file.
   *
   * @param buffer - File content as Buffer
   * @param filename - Filename for the upload
   * @param mimeType - MIME type of the file
   * @param traceId - Optional trace ID for observability
   * @returns File metadata from Anthropic
   *
   * @see AC#1 - Returns FileMetadata
   */
  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    traceId?: string
  ): Promise<FileMetadata> {
    const startTime = Date.now();

    // AC#9: Check buffer size before API call
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new FilesApiError(
        `Buffer too large: ${buffer.length} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`,
        'FILE_TOO_LARGE'
      );
    }

    logger.debug({ event: 'files.upload.start', traceId, filename, fileSize: buffer.length });

    try {
      // Convert Buffer to File for the SDK
      const uint8Array = new Uint8Array(buffer);
      const blob = new Blob([uint8Array], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType });

      const result = await this.client.beta.files.upload({
        file,
        betas: [FILES_API_BETA],
      });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'files.upload.complete',
        traceId,
        fileId: result.id,
        filename: result.filename,
        sizeBytes: result.size_bytes,
        durationMs,
      });

      return result as FileMetadata;
    } catch (error) {
      throw this.wrapError(error, 'FILE_UPLOAD_FAILED', `Failed to upload buffer: ${filename}`);
    }
  }

  /**
   * Download a file by ID.
   *
   * @param fileId - Anthropic file ID
   * @param traceId - Optional trace ID for observability
   * @returns File content as Buffer
   * @throws FilesApiError with FILE_NOT_FOUND for 404
   *
   * @see AC#2 - Returns file content as Buffer
   */
  async downloadFile(fileId: string, traceId?: string): Promise<Buffer> {
    const startTime = Date.now();
    logger.debug({ event: 'files.download.start', traceId, fileId });

    try {
      const response = await this.client.beta.files.download(fileId, {
        betas: [FILES_API_BETA],
      });
      const buffer = Buffer.from(await response.arrayBuffer());

      const durationMs = Date.now() - startTime;
      logger.info({
        event: 'files.download.complete',
        traceId,
        fileId,
        sizeBytes: buffer.length,
        durationMs,
      });

      return buffer;
    } catch (error) {
      throw this.wrapError(error, 'FILE_DOWNLOAD_FAILED', `Failed to download file: ${fileId}`);
    }
  }

  /**
   * Get file metadata.
   *
   * @param fileId - Anthropic file ID
   * @param traceId - Optional trace ID for observability
   * @returns File metadata
   * @throws FilesApiError with FILE_NOT_FOUND for 404
   *
   * @see AC#3 - Returns FileMetadata object
   */
  async getFileMetadata(fileId: string, traceId?: string): Promise<FileMetadata> {
    logger.debug({ event: 'files.metadata.fetch', traceId, fileId });

    try {
      const result = await this.client.beta.files.retrieveMetadata(fileId, {
        betas: [FILES_API_BETA],
      });
      return result as FileMetadata;
    } catch (error) {
      throw this.wrapError(error, 'FILE_NOT_FOUND', `Failed to get metadata: ${fileId}`);
    }
  }

  /**
   * Delete a file.
   *
   * @param fileId - Anthropic file ID
   * @param traceId - Optional trace ID for observability
   * @returns true on successful deletion
   * @throws FilesApiError with FILE_DELETE_FAILED on error
   *
   * @see AC#4 - Returns true on success
   */
  async deleteFile(fileId: string, traceId?: string): Promise<boolean> {
    logger.debug({ event: 'files.delete.start', traceId, fileId });

    try {
      await this.client.beta.files.delete(fileId, { betas: [FILES_API_BETA] });
      logger.info({ event: 'files.delete.complete', traceId, fileId });
      return true;
    } catch (error) {
      throw this.wrapError(error, 'FILE_DELETE_FAILED', `Failed to delete file: ${fileId}`);
    }
  }

  /**
   * Wrap SDK errors with appropriate error codes.
   *
   * @see AC#8 - Meaningful errors with error codes
   */
  private wrapError(error: unknown, defaultCode: FilesApiErrorCode, message: string): FilesApiError {
    // Check for status property (Anthropic.APIError or mock with status)
    const apiError = error as { status?: number } | undefined;
    if (apiError && typeof apiError.status === 'number') {
      if (apiError.status === 404) {
        return new FilesApiError(message, 'FILE_NOT_FOUND', error);
      }
      if (apiError.status === 401 || apiError.status === 403) {
        return new FilesApiError('Authentication failed', 'AUTHENTICATION_ERROR', error);
      }
      if (apiError.status === 429) {
        return new FilesApiError('Rate limited', 'RATE_LIMITED', error);
      }
    }
    return new FilesApiError(message, defaultCode, error);
  }
}

/**
 * Extract file IDs from a code execution response.
 *
 * Iterates through response content looking for tool_result blocks
 * that contain file_id references from code execution.
 *
 * @param response - BetaMessage from Anthropic API
 * @returns Array of file IDs
 *
 * @see AC#5 - Extract file IDs from bash_code_execution_tool_result
 */
export function extractFileIds(response: BetaMessage): string[] {
  const fileIds: string[] = [];

  for (const item of response.content) {
    // Cast to unknown for flexible type checking
    const contentItem = item as unknown as { type: string; content?: unknown[]; tool_use_id?: string };

    // Handle bash_code_execution_tool_result / code_execution_tool_result / tool_result
    if (
      contentItem.type === 'bash_code_execution_tool_result' ||
      contentItem.type === 'code_execution_tool_result' ||
      contentItem.type === 'tool_result'
    ) {
      if (Array.isArray(contentItem.content)) {
        for (const block of contentItem.content) {
          if (typeof block === 'object' && block !== null && 'file_id' in block) {
            fileIds.push((block as { file_id: string }).file_id);
          }
        }
      }
    }

    // Handle server_tool_use content (code execution results)
    if (contentItem.type === 'server_tool_use') {
      if (Array.isArray(contentItem.content)) {
        for (const block of contentItem.content) {
          if (typeof block === 'object' && block !== null && 'file_id' in block) {
            fileIds.push((block as { file_id: string }).file_id);
          }
        }
      }
    }
  }

  return fileIds;
}

/**
 * Factory function to create a FilesApiClient.
 *
 * @param anthropicClient - Anthropic SDK client instance
 * @returns FilesApiClient instance
 *
 * @example
 * ```typescript
 * import { createFilesApiClient } from './files/index.js';
 * import Anthropic from '@anthropic-ai/sdk';
 *
 * const client = new Anthropic({ apiKey: 'key' });
 * const filesClient = createFilesApiClient(client);
 * ```
 */
export function createFilesApiClient(anthropicClient?: Anthropic): FilesApiClient {
  return new FilesApiClient(anthropicClient);
}
