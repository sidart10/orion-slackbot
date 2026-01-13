/**
 * Document Block Builder
 *
 * Builds Anthropic document blocks from ingested files for Claude context.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see AC#11 - Create document block with file_id reference
 * @see AC#12 - Enable citations on document blocks
 * @see AC#13 - Include document blocks in messages array
 * @see AC#14 - Handle unsupported file types gracefully
 */

import type { SlackFile, FileIngestionResult } from '../slack/files/types.js';
import {
  isSupportedMimeType,
  formatSupportedTypes,
} from '../slack/files/types.js';
import { logger } from '../utils/logger.js';

/**
 * Anthropic document block for Claude context.
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
 * Result of building document blocks.
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
 * Build document blocks from file ingestion results.
 *
 * Converts successful ingestion results to document blocks for Claude.
 * Collects user-friendly error messages for failures.
 *
 * @param results - Array of ingestion results
 * @param options - Build options
 * @returns Document blocks and error messages
 *
 * @see AC#11 - Document blocks from ingested files
 * @see AC#14 - Handle unsupported types gracefully
 * @see AC#19-23 - Error handling with user-friendly messages
 */
export function buildDocumentBlocks(
  results: FileIngestionResult[],
  options?: BuildDocumentBlocksOptions
): BuildDocumentBlocksResult {
  const traceId = options?.traceId ?? 'unknown';
  const enableCitations = options?.enableCitations ?? true;

  const documentBlocks: DocumentBlock[] = [];
  const errors: string[] = [];
  const processedFiles: string[] = [];
  const failedFiles: string[] = [];

  for (const result of results) {
    if (result.success && result.fileId) {
      // Build document block for successful ingestion
      documentBlocks.push(
        buildDocumentBlock(result.fileId, result.slackFile.name, enableCitations)
      );
      processedFiles.push(result.slackFile.name);

      logger.debug({
        event: 'document_block.created',
        traceId,
        filename: result.slackFile.name,
        fileId: result.fileId,
        citationsEnabled: enableCitations,
      });
    } else {
      // Collect error message for failed ingestion
      errors.push(formatIngestionError(result));
      failedFiles.push(result.slackFile.name);

      logger.debug({
        event: 'document_block.skipped',
        traceId,
        filename: result.slackFile.name,
        errorCode: result.errorCode,
      });
    }
  }

  logger.info({
    event: 'document_blocks.built',
    traceId,
    documentBlockCount: documentBlocks.length,
    errorCount: errors.length,
    processedFiles,
    failedFiles,
  });

  return {
    documentBlocks,
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
