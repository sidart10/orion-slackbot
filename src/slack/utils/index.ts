/**
 * Slack Utilities Module
 *
 * Exports utilities for Slack file operations.
 *
 * @see Story 6.6 - Files API Slack Integration (file-uploader)
 * @see Story 7.3 - Contextual Tool Feedback (media-upload)
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

// Media uploader - Extracts, strips URLs from text, and uploads media from responses
export { extractImageUrls, stripImageUrls, uploadImagesFromResponse } from './media-upload.js';
