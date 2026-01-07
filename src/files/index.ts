/**
 * Files API Module
 *
 * Exports for Anthropic Files API operations.
 *
 * @see Story 6.5 - Files API Client
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
