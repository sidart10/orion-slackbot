/**
 * Document Block Builder
 *
 * Builds Anthropic document and image blocks from ingested files for Claude context.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see AC#11 - Create document block with file_id reference
 * @see AC#12 - Enable citations on document blocks
 * @see AC#13 - Include document blocks in messages array
 * @see AC#14 - Handle unsupported file types gracefully
 * @see File Upload Plan Task 1 - Add image block support
 */

import type { SlackFile, FileIngestionResult } from '../slack/files/types.js';
import {
  isSupportedMimeType,
  formatSupportedTypes,
  FILE_LIMITS,
} from '../slack/files/types.js';
import { logger } from '../utils/logger.js';

/**
 * Anthropic document block for Claude context.
 *
 * Documents support titles and citations.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/document-understanding
 */
export interface DocumentBlock {
  type: 'document';
  source: {
    type: 'file';
    file_id: string;
  };
  /** Display title for the document */
  title?: string;
  /** Enable citations for document content */
  citations?: { enabled: boolean };
}

/**
 * Anthropic image block for Claude context.
 *
 * NOTE: Images do NOT support the `title` or `citations` fields that documents do.
 * Including these fields may cause API errors.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/vision
 * @see File Upload Plan Task 1 - Image block support
 */
export interface ImageBlock {
  type: 'image';
  source: {
    type: 'file';
    file_id: string;
  };
}

/**
 * Union type for content blocks that can be built from files.
 */
export type ContentBlock = DocumentBlock | ImageBlock;

/**
 * Result of building content blocks (documents and images).
 */
export interface BuildContentBlocksResult {
  /**
   * All content blocks (documents + images).
   * Use this for building Claude messages.
   */
  contentBlocks: ContentBlock[];
  /**
   * Only document blocks (backward compatibility).
   * Use when callers specifically need DocumentBlock[] type.
   * @deprecated Use contentBlocks for new code
   */
  documentBlocks: DocumentBlock[];
  /**
   * Only image blocks.
   */
  imageBlocks: ImageBlock[];
  /** User-friendly error messages for failed files */
  errors: string[];
  /** Files that were successfully processed */
  processedFiles: string[];
  /** Files that failed processing */
  failedFiles: string[];
}

/**
 * Result of building document blocks.
 * @deprecated Use BuildContentBlocksResult instead
 */
export interface BuildDocumentBlocksResult {
  /** Successfully built document blocks */
  documentBlocks: DocumentBlock[];
  /** User-friendly error messages for failed files */
  errors: string[];
  /** Files that were successfully processed */
  processedFiles: string[];
  /** Files that failed processing */
  failedFiles: string[];
}

/**
 * Options for building document blocks.
 */
export interface BuildDocumentBlocksOptions {
  /** Enable citations on all document blocks (default: true) */
  enableCitations?: boolean;
  /** Trace ID for logging */
  traceId?: string;
}

/**
 * Build a single document block from a file ID.
 *
 * @param fileId - Anthropic file ID
 * @param filename - Original filename for title
 * @param enableCitations - Whether to enable citations
 * @returns Document block
 *
 * @see AC#11 - Document block with file_id reference
 * @see AC#12 - Citations enabled
 */
export function buildDocumentBlock(
  fileId: string,
  filename: string,
  enableCitations = true
): DocumentBlock {
  return {
    type: 'document',
    source: {
      type: 'file',
      file_id: fileId,
    },
    title: filename,
    citations: { enabled: enableCitations },
  };
}

/**
 * Build a single image block from a file ID.
 *
 * NOTE: Image blocks do NOT support title or citations fields.
 * Unlike document blocks, we only include type and source.
 *
 * @param fileId - Anthropic file ID
 * @returns Image block
 *
 * @see File Upload Plan Task 1 - Image block support
 */
export function buildImageBlock(fileId: string): ImageBlock {
  return {
    type: 'image',
    source: {
      type: 'file',
      file_id: fileId,
    },
  };
}

/**
 * Check if a MIME type is an image type.
 *
 * Uses FILE_LIMITS.IMAGE.mimeTypes to determine if the MIME type
 * should be handled as an image block rather than a document block.
 *
 * @param mimeType - MIME type to check (e.g., 'image/png')
 * @returns true if the MIME type is an image type
 *
 * @see File Upload Plan Task 1 - Image block support
 */
export function isImageMimeType(mimeType: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  return FILE_LIMITS.IMAGE.mimeTypes.some((imageMime) =>
    normalizedMime.startsWith(imageMime)
  );
}

/**
 * Format user-friendly error message for file ingestion failure.
 *
 * @param result - Failed ingestion result
 * @returns Formatted error message for Slack mrkdwn
 */
function formatIngestionError(result: FileIngestionResult): string {
  const filename = result.slackFile.name;

  switch (result.errorCode) {
    case 'FILE_TOO_LARGE':
      return `*${filename}*: File too large. ${result.error ?? ''}`;

    case 'UNSUPPORTED_TYPE':
      return `*${filename}*: Unsupported file type (${result.slackFile.mimetype}).\n${formatSupportedTypes()}`;

    case 'ZERO_BYTE_FILE':
      return `*${filename}*: File is empty (0 bytes)`;

    case 'FILE_EXPIRED':
      return `*${filename}*: File is no longer available`;

    case 'DOWNLOAD_FAILED':
      return `*${filename}*: Could not download file from Slack`;

    case 'UPLOAD_FAILED':
      return `*${filename}*: Could not process file for analysis`;

    default:
      return `*${filename}*: ${result.error ?? 'Unknown error'}`;
  }
}

/**
 * Build content blocks from file ingestion results.
 *
 * Routes files to appropriate block types based on MIME type:
 * - Images (image/*) -> ImageBlock
 * - PDFs, CSV, Text -> DocumentBlock
 *
 * Collects user-friendly error messages for failures.
 *
 * @param results - Array of ingestion results
 * @param options - Build options
 * @returns Content blocks (both types), document blocks (backward compat), and error messages
 *
 * @see AC#11 - Document blocks from ingested files
 * @see AC#14 - Handle unsupported types gracefully
 * @see AC#19-23 - Error handling with user-friendly messages
 * @see File Upload Plan Task 1 - Image block routing
 */
export function buildDocumentBlocks(
  results: FileIngestionResult[],
  options?: BuildDocumentBlocksOptions
): BuildContentBlocksResult {
  const traceId = options?.traceId ?? 'unknown';
  const enableCitations = options?.enableCitations ?? true;

  const contentBlocks: ContentBlock[] = [];
  const documentBlocks: DocumentBlock[] = [];
  const imageBlocks: ImageBlock[] = [];
  const errors: string[] = [];
  const processedFiles: string[] = [];
  const failedFiles: string[] = [];

  for (const result of results) {
    if (result.success && result.fileId) {
      const mimeType = result.slackFile.mimetype;

      if (isImageMimeType(mimeType)) {
        // Route images to ImageBlock
        // NOTE: Images do NOT support citations - omit the field entirely
        const imageBlock = buildImageBlock(result.fileId);
        imageBlocks.push(imageBlock);
        contentBlocks.push(imageBlock);

        logger.debug({
          event: 'image_block.created',
          traceId,
          filename: result.slackFile.name,
          fileId: result.fileId,
          mimeType,
        });
      } else {
        // Route PDFs, CSV, text to DocumentBlock
        // Documents support citations
        const docBlock = buildDocumentBlock(
          result.fileId,
          result.slackFile.name,
          enableCitations
        );
        documentBlocks.push(docBlock);
        contentBlocks.push(docBlock);

        logger.debug({
          event: 'document_block.created',
          traceId,
          filename: result.slackFile.name,
          fileId: result.fileId,
          mimeType,
          citationsEnabled: enableCitations,
        });
      }

      processedFiles.push(result.slackFile.name);
    } else {
      // Collect error message for failed ingestion
      errors.push(formatIngestionError(result));
      failedFiles.push(result.slackFile.name);

      logger.debug({
        event: 'content_block.skipped',
        traceId,
        filename: result.slackFile.name,
        errorCode: result.errorCode,
      });
    }
  }

  logger.info({
    event: 'content_blocks.built',
    traceId,
    contentBlockCount: contentBlocks.length,
    documentBlockCount: documentBlocks.length,
    imageBlockCount: imageBlocks.length,
    errorCount: errors.length,
    processedFiles,
    failedFiles,
  });

  return {
    contentBlocks,
    documentBlocks,
    imageBlocks,
    errors,
    processedFiles,
    failedFiles,
  };
}

/**
 * Validate Slack files before ingestion.
 *
 * Returns user-friendly error messages for files that will fail.
 * Call this before starting ingestion to provide immediate feedback.
 *
 * @param files - Slack file metadata array
 * @returns Error messages for invalid files
 *
 * @see AC#14 - Handle unsupported file types gracefully
 * @see AC#19 - Reject unsupported formats with helpful message
 */
export function validateSlackFiles(files: SlackFile[]): {
  validFiles: SlackFile[];
  errors: string[];
} {
  const validFiles: SlackFile[] = [];
  const errors: string[] = [];

  for (const file of files) {
    // Check MIME type support
    if (!isSupportedMimeType(file.mimetype)) {
      errors.push(
        `*${file.name}*: Unsupported file type (${file.mimetype}).\n${formatSupportedTypes()}`
      );
      continue;
    }

    // Check for zero-byte files
    if (file.size === 0) {
      errors.push(`*${file.name}*: File is empty (0 bytes)`);
      continue;
    }

    validFiles.push(file);
  }

  return { validFiles, errors };
}

/**
 * Format combined error message for Slack.
 *
 * Creates a single message with all file errors.
 *
 * @param errors - Array of error messages
 * @returns Formatted message for Slack mrkdwn
 */
export function formatFileErrors(errors: string[]): string | null {
  if (errors.length === 0) return null;

  if (errors.length === 1) {
    return `Unable to process file:\n${errors[0]}`;
  }

  return `Unable to process ${errors.length} files:\n${errors.join('\n\n')}`;
}
