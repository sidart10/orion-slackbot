/**
 * Unit tests for Slack file download service.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see Task 2.5 - Write unit tests for download service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadSlackFile, SlackFileDownloadError } from './download.js';
import type { SlackFile } from './types.js';

// Mock config
vi.mock('../../config/environment.js', () => ({
  config: {
    slackBotToken: 'xoxb-test-token',
  },
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('downloadSlackFile', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const createMockFile = (overrides: Partial<SlackFile> = {}): SlackFile => ({
    id: 'F12345',
    name: 'test-document.pdf',
    mimetype: 'application/pdf',
    filetype: 'pdf',
    size: 1024,
    url_private_download: 'https://files.slack.com/files-pri/T123-F456/test.pdf',
    ...overrides,
  });

  describe('successful downloads', () => {
    it('should download PDF file successfully', async () => {
      const file = createMockFile();
      const content = Buffer.from('PDF content');

      mockFetch.mockResolvedValueOnce(
        new Response(content, { status: 200 })
      );

      const result = await downloadSlackFile(file, { traceId: 'test-trace' });

      expect(result.filename).toBe('test-document.pdf');
      expect(result.mimetype).toBe('application/pdf');
      expect(result.slackFileId).toBe('F12345');
      expect(result.content).toEqual(content);

      expect(mockFetch).toHaveBeenCalledWith(
        file.url_private_download,
        expect.objectContaining({
          headers: { Authorization: 'Bearer xoxb-test-token' },
        })
      );
    });

    it('should download image file successfully', async () => {
      const file = createMockFile({
        name: 'image.png',
        mimetype: 'image/png',
        filetype: 'png',
        size: 500,
      });
      const content = Buffer.from('PNG content');

      mockFetch.mockResolvedValueOnce(
        new Response(content, { status: 200 })
      );

      const result = await downloadSlackFile(file);

      expect(result.filename).toBe('image.png');
      expect(result.mimetype).toBe('image/png');
    });

    it('should download CSV file successfully', async () => {
      const file = createMockFile({
        name: 'data.csv',
        mimetype: 'text/csv',
        filetype: 'csv',
        size: 2048,
      });
      const content = Buffer.from('col1,col2\nval1,val2');

      mockFetch.mockResolvedValueOnce(
        new Response(content, { status: 200 })
      );

      const result = await downloadSlackFile(file);

      expect(result.filename).toBe('data.csv');
      expect(result.mimetype).toBe('text/csv');
    });

    it('should download text file successfully', async () => {
      const file = createMockFile({
        name: 'readme.md',
        mimetype: 'text/markdown',
        filetype: 'md',
        size: 512,
      });
      const content = Buffer.from('# Readme');

      mockFetch.mockResolvedValueOnce(
        new Response(content, { status: 200 })
      );

      const result = await downloadSlackFile(file);

      expect(result.filename).toBe('readme.md');
      expect(result.mimetype).toBe('text/markdown');
    });

    it('should use custom bot token when provided', async () => {
      const file = createMockFile();
      const content = Buffer.from('content');

      mockFetch.mockResolvedValueOnce(
        new Response(content, { status: 200 })
      );

      await downloadSlackFile(file, { botToken: 'xoxb-custom-token' });

      expect(mockFetch).toHaveBeenCalledWith(
        file.url_private_download,
        expect.objectContaining({
          headers: { Authorization: 'Bearer xoxb-custom-token' },
        })
      );
    });
  });

  describe('validation errors', () => {
    it('should reject zero-byte files', async () => {
      const file = createMockFile({ size: 0 });

      await expect(downloadSlackFile(file)).rejects.toThrow(
        SlackFileDownloadError
      );
      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'ZERO_BYTE_FILE',
        filename: 'test-document.pdf',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject unsupported file types', async () => {
      const file = createMockFile({
        name: 'archive.zip',
        mimetype: 'application/zip',
        filetype: 'zip',
      });

      await expect(downloadSlackFile(file)).rejects.toThrow(
        SlackFileDownloadError
      );
      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'UNSUPPORTED_TYPE',
        filename: 'archive.zip',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject files exceeding size limit for PDFs', async () => {
      const file = createMockFile({
        size: 150 * 1024 * 1024, // 150MB, limit is 100MB
      });

      await expect(downloadSlackFile(file)).rejects.toThrow(
        SlackFileDownloadError
      );
      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
        filename: 'test-document.pdf',
      });
    });

    it('should reject images exceeding 20MB limit', async () => {
      const file = createMockFile({
        name: 'huge-image.png',
        mimetype: 'image/png',
        filetype: 'png',
        size: 25 * 1024 * 1024, // 25MB, limit is 20MB
      });

      await expect(downloadSlackFile(file)).rejects.toThrow(
        SlackFileDownloadError
      );
      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
      });
    });
  });

  describe('HTTP error handling', () => {
    it('should handle 404 Not Found as expired file', async () => {
      const file = createMockFile();

      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 404 })
      );

      const promise = downloadSlackFile(file);
      await expect(promise).rejects.toThrow(SlackFileDownloadError);

      // Reset mock for second test
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 404 })
      );

      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'FILE_EXPIRED',
      });
    });

    it('should handle 410 Gone as expired file', async () => {
      const file = createMockFile();

      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 410 })
      );

      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'FILE_EXPIRED',
      });
    });

    it('should handle 401 Unauthorized', async () => {
      const file = createMockFile();

      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 401 })
      );

      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
      });
    });

    it('should handle 403 Forbidden', async () => {
      const file = createMockFile();

      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 403 })
      );

      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
      });
    });

    it('should handle 500 Server Error', async () => {
      const file = createMockFile();

      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 500 })
      );

      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
      });
    });
  });

  describe('network error handling', () => {
    it('should handle network failure', async () => {
      const file = createMockFile();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(downloadSlackFile(file)).rejects.toThrow(
        SlackFileDownloadError
      );
      await expect(downloadSlackFile(file)).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
      });
    });

    it('should handle timeout', async () => {
      const file = createMockFile();

      // Simulate abort error
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(
        downloadSlackFile(file, { timeoutMs: 100 })
      ).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
      });
    });
  });

  describe('supported file types', () => {
    const supportedTypes = [
      { name: 'file.pdf', mimetype: 'application/pdf' },
      { name: 'file.png', mimetype: 'image/png' },
      { name: 'file.jpg', mimetype: 'image/jpeg' },
      { name: 'file.jpeg', mimetype: 'image/jpeg' },
      { name: 'file.gif', mimetype: 'image/gif' },
      { name: 'file.webp', mimetype: 'image/webp' },
      { name: 'file.csv', mimetype: 'text/csv' },
      { name: 'file.txt', mimetype: 'text/plain' },
      { name: 'file.md', mimetype: 'text/markdown' },
      { name: 'file.json', mimetype: 'application/json' },
      { name: 'file.xml', mimetype: 'text/xml' },
      { name: 'file.yaml', mimetype: 'text/yaml' },
    ];

    it.each(supportedTypes)(
      'should accept $mimetype files',
      async ({ name, mimetype }) => {
        const file = createMockFile({
          name,
          mimetype,
          filetype: name.split('.').pop() ?? '',
          size: 1024,
        });
        const content = Buffer.from('test content');

        mockFetch.mockResolvedValueOnce(
          new Response(content, { status: 200 })
        );

        const result = await downloadSlackFile(file);

        expect(result.mimetype).toBe(mimetype);
        expect(result.filename).toBe(name);
      }
    );

    const unsupportedTypes = [
      { name: 'file.zip', mimetype: 'application/zip' },
      { name: 'file.exe', mimetype: 'application/x-msdownload' },
      { name: 'file.dmg', mimetype: 'application/x-apple-diskimage' },
      { name: 'file.mp3', mimetype: 'audio/mpeg' },
      { name: 'file.mp4', mimetype: 'video/mp4' },
      { name: 'file.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    ];

    it.each(unsupportedTypes)(
      'should reject $mimetype files',
      async ({ name, mimetype }) => {
        const file = createMockFile({
          name,
          mimetype,
          filetype: name.split('.').pop() ?? '',
          size: 1024,
        });

        await expect(downloadSlackFile(file)).rejects.toMatchObject({
          code: 'UNSUPPORTED_TYPE',
        });
      }
    );
  });
});
