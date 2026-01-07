/**
 * Files API Types
 *
 * Type definitions for Anthropic Files API operations.
 *
 * @see Story 6.5 - Files API Client
 * @see AC#1 - FileMetadata with id, filename, mime_type, size_bytes
 * @see AC#3 - FileMetadata for getFileMetadata
 */

/**
 * File metadata from Anthropic Files API.
 * @see https://docs.anthropic.com/claude/docs/files-api
 */
export interface FileMetadata {
  /** File ID (e.g., 'file_01AbCdEf...') */
  id: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'application/pdf') */
  mime_type: string;
  /** File size in bytes */
  size_bytes: number;
  /** Always 'file' */
  type: 'file';
  /** Whether file can be downloaded */
  downloadable?: boolean;
}

/**
 * Options for file upload.
 */
export interface FileUploadOptions {
  /** Override filename for upload */
  filename?: string;
  /** Trace ID for observability */
  traceId?: string;
}

/**
 * Result from file download.
 */
export interface FileContentResult {
  /** File content as buffer */
  content: Buffer;
  /** File metadata */
  metadata: FileMetadata;
}

/**
 * Extracted file info from API response.
 */
export interface ExtractedFile {
  /** File ID */
  fileId: string;
  /** Original filename if available */
  filename?: string;
}

/**
 * Error codes for Files API operations.
 */
export type FilesApiErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'FILE_UPLOAD_FAILED'
  | 'FILE_DOWNLOAD_FAILED'
  | 'FILE_DELETE_FAILED'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ERROR';

/** Max file size: 100MB */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
