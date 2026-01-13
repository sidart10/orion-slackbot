/**
 * File Ingestion Orchestration
 *
 * Orchestrates the flow from Slack file download to Anthropic Files API upload.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see AC#8 - Upload downloaded file to Anthropic Files API
 * @see AC#9 - Reuse existing FilesApiClient
 * @see AC#10 - Track upload success/failure in Langfuse
 */

import { downloadSlackFile, SlackFileDownloadError } from '../slack/files/index.js';
import { FilesApiClient, FilesApiError } from './api-client.js';
import type { SlackFile, DownloadedFile, FileIngestionResult } from '../slack/files/types.js';
import { getLangfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';

/**
 * Options for file ingestion.
 */
export interface FileIngestionOptions {
  /** Slack bot token for download auth */
  botToken?: string;
  /** Trace ID for observability */
  traceId?: string;
  /** Pre-initialized Files API client (for testing) */
  filesClient?: FilesApiClient;
}

/**
 * Result of ingesting multiple files.
 */
export interface BatchIngestionResult {
  /** Results for each file */
  results: FileIngestionResult[];
  /** Count of successful uploads */
  successCount: number;
  /** Count of failed uploads */
  failureCount: number;
  /** Total bytes processed (successful uploads only) */
  totalBytes: number;
}

/**
 * Ingest a single Slack file to Anthropic Files API.
 *
 * Downloads the file from Slack, uploads to Anthropic, and returns the file ID.
 *
 * @param slackFile - Slack file metadata
 * @param options - Ingestion options
 * @returns Ingestion result with file ID or error
 *
 * @see AC#8 - Upload to Anthropic Files API
 * @see AC#9 - Reuse FilesApiClient.uploadBuffer()
 */
export async function ingestSlackFile(
  slackFile: SlackFile,
  options?: FileIngestionOptions
): Promise<FileIngestionResult> {
  const traceId = options?.traceId ?? 'unknown';
  const filesClient = options?.filesClient ?? new FilesApiClient();
  const langfuse = getLangfuse();

  const startTime = Date.now();

  logger.info({
    event: 'file.ingestion.start',
    traceId,
    fileId: slackFile.id,
    filename: slackFile.name,
    mimetype: slackFile.mimetype,
    size: slackFile.size,
  });

  // AC#10: Track ingestion start in Langfuse
  if (langfuse?.event) {
    langfuse.event({
      name: 'file.ingestion.start',
      metadata: {
        traceId,
        slackFileId: slackFile.id,
        filename: slackFile.name,
        mimetype: slackFile.mimetype,
        size: slackFile.size,
      },
    });
  }

  let downloadedFile: DownloadedFile;

  // Step 1: Download from Slack
  try {
    downloadedFile = await downloadSlackFile(slackFile, {
      botToken: options?.botToken,
      traceId,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    if (error instanceof SlackFileDownloadError) {
      logger.warn({
        event: 'file.ingestion.download_failed',
        traceId,
        filename: slackFile.name,
        errorCode: error.code,
        error: error.message,
        durationMs,
      });

      // AC#10: Track failure in Langfuse
      if (langfuse?.event) {
        langfuse.event({
          name: 'file.ingestion.failed',
          metadata: {
            traceId,
            slackFileId: slackFile.id,
            filename: slackFile.name,
            phase: 'download',
            errorCode: error.code,
            error: error.message,
            durationMs,
          },
        });
      }

      return {
        success: false,
        slackFile,
        error: error.message,
        errorCode: error.code,
      };
    }

    // Unknown error
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      event: 'file.ingestion.download_error',
      traceId,
      filename: slackFile.name,
      error: errorMessage,
      durationMs,
    });

    if (langfuse?.event) {
      langfuse.event({
        name: 'file.ingestion.failed',
        metadata: {
          traceId,
          slackFileId: slackFile.id,
          filename: slackFile.name,
          phase: 'download',
          errorCode: 'UNKNOWN_ERROR',
          error: errorMessage,
          durationMs,
        },
      });
    }

    return {
      success: false,
      slackFile,
      error: errorMessage,
      errorCode: 'UNKNOWN_ERROR',
    };
  }

  // Step 2: Upload to Anthropic Files API
  try {
    // AC#9: Use existing uploadBuffer() method
    const fileMetadata = await filesClient.uploadBuffer(
      downloadedFile.content,
      downloadedFile.filename,
      downloadedFile.mimetype,
      traceId
    );

    const durationMs = Date.now() - startTime;

    logger.info({
      event: 'file.ingestion.success',
      traceId,
      slackFileId: slackFile.id,
      anthropicFileId: fileMetadata.id,
      filename: downloadedFile.filename,
      size: downloadedFile.size,
      durationMs,
    });

    // AC#10: Track success in Langfuse
    if (langfuse?.event) {
      langfuse.event({
        name: 'file.ingestion.success',
        metadata: {
          traceId,
          slackFileId: slackFile.id,
          anthropicFileId: fileMetadata.id,
          filename: downloadedFile.filename,
          mimetype: downloadedFile.mimetype,
          size: downloadedFile.size,
          durationMs,
        },
      });
    }

    return {
      success: true,
      fileId: fileMetadata.id,
      slackFile,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    if (error instanceof FilesApiError) {
      logger.error({
        event: 'file.ingestion.upload_failed',
        traceId,
        filename: slackFile.name,
        errorCode: error.code,
        error: error.message,
        durationMs,
      });

      if (langfuse?.event) {
        langfuse.event({
          name: 'file.ingestion.failed',
          metadata: {
            traceId,
            slackFileId: slackFile.id,
            filename: slackFile.name,
            phase: 'upload',
            errorCode: error.code,
            error: error.message,
            durationMs,
          },
        });
      }

      return {
        success: false,
        slackFile,
        error: error.message,
        errorCode: 'UPLOAD_FAILED',
      };
    }

    // Unknown error
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      event: 'file.ingestion.upload_error',
      traceId,
      filename: slackFile.name,
      error: errorMessage,
      durationMs,
    });

    if (langfuse?.event) {
      langfuse.event({
        name: 'file.ingestion.failed',
        metadata: {
          traceId,
          slackFileId: slackFile.id,
          filename: slackFile.name,
          phase: 'upload',
          errorCode: 'UNKNOWN_ERROR',
          error: errorMessage,
          durationMs,
        },
      });
    }

    return {
      success: false,
      slackFile,
      error: errorMessage,
      errorCode: 'UPLOAD_FAILED',
    };
  }
}

/**
 * Ingest multiple Slack files in parallel.
 *
 * Processes all files concurrently, collecting results.
 * Failures on individual files don't stop other files from processing.
 *
 * @param slackFiles - Array of Slack file metadata
 * @param options - Ingestion options
 * @returns Batch result with per-file outcomes
 *
 * @see AC#2 - Support multiple files in a single message
 */
export async function ingestSlackFiles(
  slackFiles: SlackFile[],
  options?: FileIngestionOptions
): Promise<BatchIngestionResult> {
  const traceId = options?.traceId ?? 'unknown';
  const filesClient = options?.filesClient ?? new FilesApiClient();
  const langfuse = getLangfuse();

  if (slackFiles.length === 0) {
    return {
      results: [],
      successCount: 0,
      failureCount: 0,
      totalBytes: 0,
    };
  }

  logger.info({
    event: 'file.ingestion.batch_start',
    traceId,
    fileCount: slackFiles.length,
    filenames: slackFiles.map((f) => f.name),
  });

  // AC#24: Track batch start
  if (langfuse?.event) {
    langfuse.event({
      name: 'file.ingestion.batch_start',
      metadata: {
        traceId,
        fileCount: slackFiles.length,
        totalSize: slackFiles.reduce((sum, f) => sum + f.size, 0),
        mimeTypes: [...new Set(slackFiles.map((f) => f.mimetype))],
      },
    });
  }

  // Process files concurrently
  const results = await Promise.all(
    slackFiles.map((file) =>
      ingestSlackFile(file, {
        ...options,
        filesClient,
      })
    )
  );

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;
  const totalBytes = results
    .filter((r) => r.success)
    .reduce((sum, r) => sum + r.slackFile.size, 0);

  logger.info({
    event: 'file.ingestion.batch_complete',
    traceId,
    fileCount: slackFiles.length,
    successCount,
    failureCount,
    totalBytes,
  });

  // AC#24: Track batch completion with metrics
  if (langfuse?.event) {
    langfuse.event({
      name: 'file.ingestion.batch_complete',
      metadata: {
        traceId,
        fileCount: slackFiles.length,
        successCount,
        failureCount,
        totalBytes,
        successRate: slackFiles.length > 0 ? successCount / slackFiles.length : 0,
        mimeTypes: [...new Set(results.filter((r) => r.success).map((r) => r.slackFile.mimetype))],
        errorCodes: [...new Set(results.filter((r) => !r.success).map((r) => r.errorCode))],
      },
    });
  }

  return {
    results,
    successCount,
    failureCount,
    totalBytes,
  };
}
