/**
 * Files API Module
 *
 * Exports for Anthropic Files API operations.
 *
 * @see Story 6.5 - Files API Client
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 */

export { FilesApiClient, FilesApiError, extractFileIds, createFilesApiClient } from './api-client.js';
export { MAX_FILE_SIZE_BYTES } from './types.js';
export type {
  FileMetadata,
  FileUploadOptions,
  FileContentResult,
  ExtractedFile,
  FilesApiErrorCode,
} from './types.js';

// Story 8.3: File Ingestion exports
export {
  ingestSlackFile,
  ingestSlackFiles,
  type FileIngestionOptions,
  type BatchIngestionResult,
} from './ingestion.js';
