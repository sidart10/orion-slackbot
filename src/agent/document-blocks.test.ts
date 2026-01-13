/**
 * Unit tests for document block builder.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see Task 4.6 - Write unit tests for document block builder
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildDocumentBlock,
  buildDocumentBlocks,
  validateSlackFiles,
  formatFileErrors,
} from './document-blocks.js';
import type { SlackFile, FileIngestionResult } from '../slack/files/types.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('buildDocumentBlock', () => {
  it('should create document block with citations enabled', () => {
    const block = buildDocumentBlock('file_123', 'report.pdf', true);

    expect(block).toEqual({
      type: 'document',
      source: {
        type: 'file',
        file_id: 'file_123',
      },
      title: 'report.pdf',
      citations: { enabled: true },
    });
  });

  it('should create document block with citations disabled', () => {
    const block = buildDocumentBlock('file_456', 'data.csv', false);

    expect(block).toEqual({
      type: 'document',
      source: {
        type: 'file',
        file_id: 'file_456',
      },
      title: 'data.csv',
      citations: { enabled: false },
    });
  });

  it('should default to citations enabled', () => {
    const block = buildDocumentBlock('file_789', 'notes.md');

    expect(block.citations).toEqual({ enabled: true });
  });
});

describe('buildDocumentBlocks', () => {
  const createSuccessResult = (
    fileId: string,
    filename: string,
    mimetype = 'application/pdf'
  ): FileIngestionResult => ({
    success: true,
    fileId,
    slackFile: {
      id: `F_${fileId}`,
      name: filename,
      mimetype,
      filetype: filename.split('.').pop() ?? '',
      size: 1024,
      url_private_download: 'https://files.slack.com/test',
    },
  });

  const createFailureResult = (
    filename: string,
    errorCode: FileIngestionResult['errorCode'],
    error: string
  ): FileIngestionResult => ({
    success: false,
    slackFile: {
      id: `F_${filename}`,
      name: filename,
      mimetype: 'application/pdf',
      filetype: 'pdf',
      size: 1024,
      url_private_download: 'https://files.slack.com/test',
    },
    error,
    errorCode,
  });

  it('should build document blocks from successful results', () => {
    const results: FileIngestionResult[] = [
      createSuccessResult('file_1', 'report.pdf'),
      createSuccessResult('file_2', 'data.csv', 'text/csv'),
    ];

    const { documentBlocks, errors, processedFiles, failedFiles } =
      buildDocumentBlocks(results);

    expect(documentBlocks).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(processedFiles).toEqual(['report.pdf', 'data.csv']);
    expect(failedFiles).toEqual([]);

    expect(documentBlocks[0]).toEqual({
      type: 'document',
      source: { type: 'file', file_id: 'file_1' },
      title: 'report.pdf',
      citations: { enabled: true },
    });
  });

  it('should collect errors from failed results', () => {
    const results: FileIngestionResult[] = [
      createSuccessResult('file_1', 'report.pdf'),
      createFailureResult('archive.zip', 'UNSUPPORTED_TYPE', 'Unsupported type'),
      createFailureResult('huge.pdf', 'FILE_TOO_LARGE', 'File too large'),
    ];

    const { documentBlocks, errors, processedFiles, failedFiles } =
      buildDocumentBlocks(results, { traceId: 'test' });

    expect(documentBlocks).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(processedFiles).toEqual(['report.pdf']);
    expect(failedFiles).toEqual(['archive.zip', 'huge.pdf']);
  });

  it('should format error messages with file context', () => {
    const results: FileIngestionResult[] = [
      createFailureResult('data.xlsx', 'UNSUPPORTED_TYPE', 'Unsupported type'),
    ];

    const { errors } = buildDocumentBlocks(results);

    expect(errors[0]).toContain('*data.xlsx*');
    expect(errors[0]).toContain('Unsupported file type');
  });

  it('should handle empty results array', () => {
    const { documentBlocks, errors, processedFiles, failedFiles } =
      buildDocumentBlocks([]);

    expect(documentBlocks).toEqual([]);
    expect(errors).toEqual([]);
    expect(processedFiles).toEqual([]);
    expect(failedFiles).toEqual([]);
  });

  it('should respect enableCitations option', () => {
    const results: FileIngestionResult[] = [
      createSuccessResult('file_1', 'report.pdf'),
    ];

    const { documentBlocks } = buildDocumentBlocks(results, {
      enableCitations: false,
    });

    expect(documentBlocks[0]?.citations).toEqual({ enabled: false });
  });

  describe('error message formatting', () => {
    it('should format FILE_TOO_LARGE error', () => {
      const results: FileIngestionResult[] = [
        createFailureResult('huge.pdf', 'FILE_TOO_LARGE', 'Exceeds 100MB limit'),
      ];

      const { errors } = buildDocumentBlocks(results);

      expect(errors[0]).toContain('*huge.pdf*');
      expect(errors[0]).toContain('File too large');
    });

    it('should format ZERO_BYTE_FILE error', () => {
      const results: FileIngestionResult[] = [
        createFailureResult('empty.txt', 'ZERO_BYTE_FILE', 'Zero bytes'),
      ];

      const { errors } = buildDocumentBlocks(results);

      expect(errors[0]).toContain('*empty.txt*');
      expect(errors[0]).toContain('empty (0 bytes)');
    });

    it('should format FILE_EXPIRED error', () => {
      const results: FileIngestionResult[] = [
        createFailureResult('old.pdf', 'FILE_EXPIRED', 'URL expired'),
      ];

      const { errors } = buildDocumentBlocks(results);

      expect(errors[0]).toContain('*old.pdf*');
      expect(errors[0]).toContain('no longer available');
    });

    it('should format DOWNLOAD_FAILED error', () => {
      const results: FileIngestionResult[] = [
        createFailureResult('doc.pdf', 'DOWNLOAD_FAILED', 'HTTP 500'),
      ];

      const { errors } = buildDocumentBlocks(results);

      expect(errors[0]).toContain('*doc.pdf*');
      expect(errors[0]).toContain('Could not download');
    });

    it('should format UPLOAD_FAILED error', () => {
      const results: FileIngestionResult[] = [
        createFailureResult('doc.pdf', 'UPLOAD_FAILED', 'API error'),
      ];

      const { errors } = buildDocumentBlocks(results);

      expect(errors[0]).toContain('*doc.pdf*');
      expect(errors[0]).toContain('Could not process');
    });
  });
});

describe('validateSlackFiles', () => {
  const createSlackFile = (
    name: string,
    mimetype: string,
    size = 1024
  ): SlackFile => ({
    id: `F_${name}`,
    name,
    mimetype,
    filetype: name.split('.').pop() ?? '',
    size,
    url_private_download: 'https://files.slack.com/test',
  });

  it('should pass valid files', () => {
    const files = [
      createSlackFile('report.pdf', 'application/pdf'),
      createSlackFile('image.png', 'image/png'),
      createSlackFile('data.csv', 'text/csv'),
      createSlackFile('notes.md', 'text/markdown'),
    ];

    const { validFiles, errors } = validateSlackFiles(files);

    expect(validFiles).toHaveLength(4);
    expect(errors).toHaveLength(0);
  });

  it('should reject unsupported file types', () => {
    const files = [
      createSlackFile('report.pdf', 'application/pdf'),
      createSlackFile('archive.zip', 'application/zip'),
      createSlackFile('video.mp4', 'video/mp4'),
    ];

    const { validFiles, errors } = validateSlackFiles(files);

    expect(validFiles).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('*archive.zip*');
    expect(errors[1]).toContain('*video.mp4*');
  });

  it('should reject zero-byte files', () => {
    const files = [
      createSlackFile('report.pdf', 'application/pdf'),
      createSlackFile('empty.txt', 'text/plain', 0),
    ];

    const { validFiles, errors } = validateSlackFiles(files);

    expect(validFiles).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('*empty.txt*');
    expect(errors[0]).toContain('empty (0 bytes)');
  });

  it('should handle empty array', () => {
    const { validFiles, errors } = validateSlackFiles([]);

    expect(validFiles).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe('formatFileErrors', () => {
  it('should return null for empty errors', () => {
    expect(formatFileErrors([])).toBeNull();
  });

  it('should format single error', () => {
    const result = formatFileErrors(['*file.zip*: Unsupported type']);

    expect(result).toBe('Unable to process file:\n*file.zip*: Unsupported type');
  });

  it('should format multiple errors', () => {
    const result = formatFileErrors([
      '*file1.zip*: Unsupported type',
      '*file2.exe*: Unsupported type',
    ]);

    expect(result).toContain('Unable to process 2 files');
    expect(result).toContain('*file1.zip*');
    expect(result).toContain('*file2.exe*');
  });
});
