/**
 * Files API Test Data Factories
 *
 * Factories for creating realistic test data for Files API tests.
 * Uses @faker-js/faker to generate varied, realistic data.
 *
 * @see Story 6.5 - Files API Client
 * @see docs/testing-standards.md - Data Factory pattern
 *
 * Usage:
 *   import { createFileMetadata, createFileId } from '../../../tests/factories/files-factory';
 *
 *   const metadata = createFileMetadata({ filename: 'report.xlsx' });
 *   const fileId = createFileId(); // 'file_01AbCdEf...'
 */

import { faker } from '@faker-js/faker';

// ============================================================================
// File Metadata Factory (Story 6.5)
// ============================================================================

/**
 * File metadata from Anthropic Files API.
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
 * Common MIME types for testing.
 */
const COMMON_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
] as const;

/**
 * File extensions mapped to MIME types.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * Creates a realistic file metadata response.
 *
 * @param overrides - Partial metadata to override defaults
 * @returns Complete FileMetadata with realistic data
 *
 * @example
 * // Default file with random data
 * const metadata = createFileMetadata();
 *
 * @example
 * // Override specific fields
 * const metadata = createFileMetadata({
 *   filename: 'report.xlsx',
 *   size_bytes: 15360,
 * });
 */
export function createFileMetadata(overrides: Partial<FileMetadata> = {}): FileMetadata {
  const filename = overrides.filename ?? createFilename();
  const extension = filename.split('.').pop() ?? 'pdf';
  const mimeType = overrides.mime_type ?? EXTENSION_TO_MIME[extension] ?? 'application/octet-stream';

  return {
    id: overrides.id ?? createFileId(),
    created_at: overrides.created_at ?? faker.date.recent().toISOString(),
    filename,
    mime_type: mimeType,
    size_bytes: overrides.size_bytes ?? faker.number.int({ min: 1024, max: 10 * 1024 * 1024 }),
    type: 'file',
    downloadable: overrides.downloadable ?? true,
  };
}

/**
 * Creates multiple file metadata objects.
 *
 * @param count - Number of files to create
 * @returns Array of FileMetadata objects
 */
export function createFileMetadataArray(count: number): FileMetadata[] {
  return Array.from({ length: count }, () => createFileMetadata());
}

// ============================================================================
// File ID Factory
// ============================================================================

/**
 * Generates a valid Anthropic file ID.
 * Format: file_01{22 alphanumeric chars}
 *
 * @returns File ID string (e.g., 'file_01AbCdEfGhIjKlMnOpQrStUv')
 */
export function createFileId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const suffix = Array.from(
    { length: 22 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `file_01${suffix}`;
}

// ============================================================================
// Filename Factory
// ============================================================================

/**
 * Common file extensions for testing.
 */
const COMMON_EXTENSIONS = ['pdf', 'xlsx', 'docx', 'pptx', 'csv', 'txt'] as const;

/**
 * Generates a realistic filename with extension.
 *
 * @param extension - Optional specific extension
 * @returns Filename string (e.g., 'quarterly_report_2026.xlsx')
 */
export function createFilename(extension?: string): string {
  const ext = extension ?? faker.helpers.arrayElement(COMMON_EXTENSIONS);
  const words = faker.lorem.words({ min: 1, max: 3 }).replace(/\s+/g, '_').toLowerCase();
  const suffix = faker.number.int({ min: 1, max: 999 });
  return `${words}_${suffix}.${ext}`;
}

// ============================================================================
// Extracted File Factory (for extractFileIds response parsing)
// ============================================================================

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
 * Creates extracted file info.
 *
 * @param overrides - Partial file info to override defaults
 * @returns Complete ExtractedFile
 */
export function createExtractedFile(overrides: Partial<ExtractedFile> = {}): ExtractedFile {
  return {
    fileId: overrides.fileId ?? createFileId(),
    filename: overrides.filename ?? createFilename(),
  };
}

// ============================================================================
// BetaMessage Factory (for extractFileIds testing)
// ============================================================================

/**
 * Creates a mock BetaMessage containing file IDs in tool_result content.
 *
 * @param fileIds - Array of file IDs to include
 * @returns Mock BetaMessage with tool_result containing files
 *
 * @example
 * const response = createBetaMessageWithFiles(['file_01abc', 'file_02def']);
 * const ids = extractFileIds(response); // ['file_01abc', 'file_02def']
 */
export function createBetaMessageWithFiles(fileIds: string[]): BetaMessageMock {
  return {
    id: `msg_${faker.string.alphanumeric(24)}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_result',
        tool_use_id: `toolu_${faker.string.alphanumeric(20)}`,
        content: fileIds.map((fileId) => ({
          type: 'file',
          file_id: fileId,
        })),
      },
    ],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: faker.number.int({ min: 100, max: 1000 }),
      output_tokens: faker.number.int({ min: 50, max: 500 }),
    },
  };
}

/**
 * Creates a mock BetaMessage without any files.
 *
 * @returns Mock BetaMessage with text content only
 */
export function createBetaMessageWithoutFiles(): BetaMessageMock {
  return {
    id: `msg_${faker.string.alphanumeric(24)}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: faker.lorem.paragraph(),
      },
    ],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: faker.number.int({ min: 100, max: 1000 }),
      output_tokens: faker.number.int({ min: 50, max: 500 }),
    },
  };
}

/**
 * Mock type for BetaMessage (minimal structure for testing).
 */
export interface BetaMessageMock {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_result'; tool_use_id: string; content: Array<{ type: string; file_id?: string }> }
  >;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============================================================================
// Error Factory
// ============================================================================

/**
 * Error codes for Files API.
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

/**
 * Creates a mock Anthropic API error.
 *
 * @param status - HTTP status code
 * @param message - Error message
 * @returns Mock API error object
 */
export function createApiError(status: number, message?: string): { status: number; message: string } {
  const defaultMessages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Rate Limited',
    500: 'Internal Server Error',
  };

  return {
    status,
    message: message ?? defaultMessages[status] ?? 'Unknown Error',
  };
}

// ============================================================================
// File Size Constants
// ============================================================================

/** Max file size: 100MB */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** 1MB in bytes */
export const ONE_MB = 1024 * 1024;

/** 50MB in bytes (under limit) */
export const FIFTY_MB = 50 * 1024 * 1024;

/** 101MB in bytes (over limit) */
export const OVER_LIMIT_SIZE = 101 * 1024 * 1024;
