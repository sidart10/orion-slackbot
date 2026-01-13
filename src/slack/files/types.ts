/**
 * Slack File Types
 *
 * Type definitions for Slack file operations and file ingestion.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see AC#1 - Detect files array in Slack message events
 * @see AC#15-18 - Supported file formats and size limits
 */

/**
 * Slack file metadata from message events.
 * @see https://api.slack.com/types/file
 */
export interface SlackFile {
  /** Unique Slack file ID */
  id: string;
  /** Original filename */
  name: string;
  /** MIME type (e.g., 'application/pdf') */
  mimetype: string;
  /** Slack file type identifier (e.g., 'pdf', 'png') */
  filetype: string;
  /** File size in bytes */
  size: number;
  /** Private download URL (requires auth) */
  url_private_download: string;
  /** File title if provided */
  title?: string;
  /** Pretty file type name */
  pretty_type?: string;
}

/**
 * Downloaded file with content buffer.
 * Result from downloadSlackFile().
 */
export interface DownloadedFile {
  /** File content as Buffer */
  content: Buffer;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** Original Slack file ID for tracing */
  slackFileId: string;
}

/**
 * File category for content block routing.
 * @see Story - File Upload & Multimodal Support
 */
export type FileCategory = 'image' | 'document' | 'text';

/**
 * File ingestion result for a single file.
 */
export interface FileIngestionResult {
  /** Whether ingestion succeeded */
  success: boolean;
  /** Anthropic file ID if successful */
  fileId?: string;
  /** Original Slack file for reference */
  slackFile: SlackFile;
  /** Error message if failed */
  error?: string;
  /** Error code for categorization */
  errorCode?: FileIngestionErrorCode;
  /**
   * File category for content block routing.
   * - 'image' → ImageBlock (no citations)
   * - 'document' → DocumentBlock (with citations)
   * - 'text' → DocumentBlock or text extraction
   * Only present on successful ingestion.
   */
  category?: FileCategory;
}

/**
 * Error codes for file ingestion operations.
 */
export type FileIngestionErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'DOWNLOAD_FAILED'
  | 'UPLOAD_FAILED'
  | 'ZERO_BYTE_FILE'
  | 'FILE_EXPIRED'
  | 'UNKNOWN_ERROR';

/**
 * Supported file categories with size limits.
 *
 * @see AC#15 - PDF files max 100MB
 * @see AC#16 - Images max 20MB
 * @see AC#17 - CSV files max 100MB
 * @see AC#18 - Text files max 100MB
 */
export const FILE_LIMITS = {
  PDF: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  IMAGE: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
  CSV: {
    extensions: ['.csv'],
    mimeTypes: ['text/csv', 'application/csv'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  TEXT: {
    extensions: ['.txt', '.md', '.json', '.xml', '.yaml', '.yml'],
    mimeTypes: [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/xml',
      'application/xml',
      'text/yaml',
      'application/x-yaml',
    ],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
} as const;

/**
 * All supported file extensions (flattened).
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = [
  ...FILE_LIMITS.PDF.extensions,
  ...FILE_LIMITS.IMAGE.extensions,
  ...FILE_LIMITS.CSV.extensions,
  ...FILE_LIMITS.TEXT.extensions,
];

/**
 * All supported MIME types (flattened).
 */
export const SUPPORTED_MIME_TYPES: readonly string[] = [
  ...FILE_LIMITS.PDF.mimeTypes,
  ...FILE_LIMITS.IMAGE.mimeTypes,
  ...FILE_LIMITS.CSV.mimeTypes,
  ...FILE_LIMITS.TEXT.mimeTypes,
];

/**
 * Get file category from MIME type.
 *
 * @param mimetype - File MIME type
 * @returns Category name or null if unsupported
 */
export function getFileCategory(
  mimetype: string
): keyof typeof FILE_LIMITS | null {
  const normalizedMime = mimetype.toLowerCase();

  for (const [category, config] of Object.entries(FILE_LIMITS)) {
    if (config.mimeTypes.some((m) => normalizedMime.startsWith(m))) {
      return category as keyof typeof FILE_LIMITS;
    }
  }

  return null;
}

/**
 * Get max file size for a given MIME type.
 *
 * @param mimetype - File MIME type
 * @returns Max size in bytes or null if unsupported
 */
export function getMaxSizeForMimeType(mimetype: string): number | null {
  const category = getFileCategory(mimetype);
  if (!category) return null;
  return FILE_LIMITS[category].maxSize;
}

/**
 * Check if a MIME type is supported.
 *
 * @param mimetype - File MIME type
 * @returns true if supported
 */
export function isSupportedMimeType(mimetype: string): boolean {
  return getFileCategory(mimetype) !== null;
}

/**
 * Get file category for content block routing.
 *
 * Maps FILE_LIMITS categories to FileCategory:
 * - IMAGE → 'image' (uses ImageBlock)
 * - PDF → 'document' (uses DocumentBlock with citations)
 * - CSV, TEXT → 'text' (uses DocumentBlock or text extraction)
 *
 * @param mimetype - File MIME type
 * @returns FileCategory or null if unsupported
 */
export function getFileCategoryForRouting(mimetype: string): FileCategory | null {
  const category = getFileCategory(mimetype);
  if (!category) return null;

  switch (category) {
    case 'IMAGE':
      return 'image';
    case 'PDF':
      return 'document';
    case 'CSV':
    case 'TEXT':
      return 'text';
    default:
      return null;
  }
}

/**
 * Format supported types as a user-friendly string.
 * Used in error messages.
 */
export function formatSupportedTypes(): string {
  return (
    'Supported formats:\n' +
    '  - PDF files (.pdf)\n' +
    '  - Images (.png, .jpg, .jpeg, .gif, .webp)\n' +
    '  - CSV files (.csv)\n' +
    '  - Text files (.txt, .md, .json, .xml, .yaml, .yml)'
  );
}

/**
 * Format file size as human-readable string.
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "5.2 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
