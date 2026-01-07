/**
 * Slack Utilities Module
 *
 * Exports utilities for Slack file operations.
 *
 * @see Story 6.6 - Files API Slack Integration (file-uploader)
 * @see Story 7.3 - Contextual Tool Feedback (image-upload)
 */

// File uploader - Downloads from Anthropic Files API, uploads to Slack
export {
  SlackFileUploader,
  FileUploaderError,
  createSlackFileUploader,
} from './file-uploader.js';
export type {
  FileUploadOptions,
  FileUploadResult,
  BatchUploadResult,
  FileUploaderErrorCode,
} from './file-uploader.js';

// Image uploader - Extracts and uploads images from responses
export { extractImageUrls, uploadImagesFromResponse } from './image-upload.js';
