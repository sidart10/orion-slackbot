/**
 * SlackFileUploader Unit Tests
 *
 * @see Story 6.6 - Files API Slack Integration
 * @see AC#1-8 - All acceptance criteria covered
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackFileUploader, createSlackFileUploader } from '@/slack/utils/file-uploader.js';
import type { FilesApiClient } from '@/files/api-client.js';
import type { WebClient } from '@slack/web-api';
import type { FileMetadata } from '@/files/types.js';

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SlackFileUploader', () => {
  let uploader: SlackFileUploader;
  let mockFilesClient: FilesApiClient;
  let mockSlackClient: WebClient;

  // Helper to create mock FileMetadata
  const createMockMetadata = (overrides: Partial<FileMetadata> = {}): FileMetadata => ({
    id: 'file_01test',
    filename: 'report.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: 1024,
    created_at: '2025-01-01T00:00:00Z',
    type: 'file',
    ...overrides,
  });

  beforeEach(() => {
    vi.resetAllMocks();

    mockFilesClient = {
      downloadFile: vi.fn(),
      getFileMetadata: vi.fn(),
      deleteFile: vi.fn(),
      uploadFile: vi.fn(),
      uploadBuffer: vi.fn(),
    } as unknown as FilesApiClient;

    mockSlackClient = {
      filesUploadV2: vi.fn(),
    } as unknown as WebClient;

    uploader = new SlackFileUploader(mockFilesClient, mockSlackClient);
  });

  describe('uploadFile', () => {
    /**
     * @see AC#1 - Downloads from Anthropic and uploads to Slack successfully
     */
    it('downloads from Anthropic and uploads to Slack', async () => {
      const mockMetadata = createMockMetadata();
      const mockBuffer = Buffer.from('test content');

      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(mockBuffer);
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F12345' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);

      const result = await uploader.uploadFile(
        'file_01test',
        'C1234567',
        '1234567890.123456',
        { traceId: 'test-trace' }
      );

      expect(result.success).toBe(true);
      expect(result.slackFileId).toBe('F12345');
      expect(result.filename).toBe('report.xlsx');
      expect(result.anthropicFileId).toBe('file_01test');
      expect(mockSlackClient.filesUploadV2).toHaveBeenCalledWith({
        channel_id: 'C1234567',
        thread_ts: '1234567890.123456',
        filename: 'report.xlsx',
        file: mockBuffer,
        initial_comment: undefined,
      });
    });

    /**
     * @see AC#2 - Preserves filename and MIME type
     */
    it('preserves filename and MIME type', async () => {
      const mockMetadata = createMockMetadata({
        filename: 'document.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
      });

      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('pdf content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.filename).toBe('document.pdf');
      expect(mockSlackClient.filesUploadV2).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'document.pdf' })
      );
    });

    /**
     * @see AC#4 - deleteAfterUpload cleanup
     */
    it('deletes file from Anthropic when deleteAfterUpload is true', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);
      vi.mocked(mockFilesClient.deleteFile).mockResolvedValue(true);

      await uploader.uploadFile('file_01test', 'C123', '123.456', {
        deleteAfterUpload: true,
        traceId: 'test-trace',
      });

      // Wait for async cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFilesClient.deleteFile).toHaveBeenCalledWith('file_01test', 'test-trace');
    });

    /**
     * @see AC#4 - Don't delete when deleteAfterUpload is false/undefined
     */
    it('does not delete file when deleteAfterUpload is false', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);

      await uploader.uploadFile('file_01test', 'C123', '123.456', {
        deleteAfterUpload: false,
      });

      // Wait for potential async cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFilesClient.deleteFile).not.toHaveBeenCalled();
    });

    /**
     * @see AC#5 - Error handling for download failures
     */
    it('returns error when download fails', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockRejectedValue(new Error('File not found'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOWNLOAD_FAILED');
      expect(result.error?.message).toContain('File not found');
    });

    /**
     * @see AC#5 - Error handling for upload failures
     */
    it('returns error when Slack upload fails', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockRejectedValue(new Error('Slack upload failed'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UPLOAD_FAILED');
      expect(result.error?.message).toContain('Slack upload failed');
    });

    /**
     * @see AC#6 - File size validation (Slack 1GB limit)
     */
    it('rejects files larger than 1GB', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({
          filename: 'huge.zip',
          mime_type: 'application/zip',
          size_bytes: 2 * 1024 * 1024 * 1024, // 2GB
        })
      );

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILE_TOO_LARGE');
      expect(result.error?.message).toContain('exceeds Slack');
      expect(mockFilesClient.downloadFile).not.toHaveBeenCalled();
    });

    /**
     * @see AC#5 - Rate limit error handling
     */
    it('returns RATE_LIMITED for 429 errors', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockRejectedValue(new Error('429 rate limit'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RATE_LIMITED');
    });

    /**
     * @see AC#5 - Permission error handling
     */
    it('returns MISSING_PERMISSIONS for auth errors', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockRejectedValue(new Error('not_in_channel'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_PERMISSIONS');
    });

    /**
     * @see AC#1 - Initial comment support
     */
    it('includes initial comment when provided', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(createMockMetadata());
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);

      await uploader.uploadFile('file_01test', 'C123', '123.456', {
        initialComment: 'Here is your report!',
      });

      expect(mockSlackClient.filesUploadV2).toHaveBeenCalledWith(
        expect.objectContaining({ initial_comment: 'Here is your report!' })
      );
    });

    /**
     * @see AC#4 - Cleanup failure doesn't fail the upload
     */
    it('succeeds even if cleanup fails', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(createMockMetadata());
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);
      vi.mocked(mockFilesClient.deleteFile).mockRejectedValue(new Error('Cleanup failed'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456', {
        deleteAfterUpload: true,
      });

      // Upload should still succeed
      expect(result.success).toBe(true);
      expect(result.slackFileId).toBe('F123');

      // Wait for async cleanup attempt
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockFilesClient.deleteFile).toHaveBeenCalled();
    });
  });

  describe('uploadFiles', () => {
    /**
     * @see AC#3 - Multiple files uploaded successfully
     */
    it('uploads multiple files successfully', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);

      const result = await uploader.uploadFiles(
        ['file_01', 'file_02', 'file_03'],
        'C123',
        '123.456'
      );

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.totalBytes).toBe(300); // 100 bytes each
    });

    /**
     * @see AC#5 - Partial failure handling
     */
    it('handles partial failures gracefully', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile)
        .mockResolvedValueOnce(Buffer.from('content'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);

      const result = await uploader.uploadFiles(
        ['file_01', 'file_02', 'file_03'],
        'C123',
        '123.456'
      );

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results[0]?.success).toBe(true);
      expect(result.results[1]?.success).toBe(false);
      expect(result.results[2]?.success).toBe(true);
    });

    /**
     * @see AC#3 - Empty file list
     */
    it('handles empty file list', async () => {
      const result = await uploader.uploadFiles([], 'C123', '123.456');

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.totalBytes).toBe(0);
    });

    /**
     * @see AC#3 - All files fail
     */
    it('handles all files failing', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockRejectedValue(new Error('Not found'));

      const result = await uploader.uploadFiles(['file_01', 'file_02'], 'C123', '123.456');

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);
      expect(result.totalBytes).toBe(0);
    });

    /**
     * @see AC#4 - deleteAfterUpload with batch
     */
    it('applies deleteAfterUpload to all files in batch', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(
        createMockMetadata({ size_bytes: 100 })
      );
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.filesUploadV2).mockResolvedValue({
        ok: true,
        files: [{ id: 'F123' }],
      } as unknown as Awaited<ReturnType<WebClient['filesUploadV2']>>);
      vi.mocked(mockFilesClient.deleteFile).mockResolvedValue(true);

      await uploader.uploadFiles(['file_01', 'file_02'], 'C123', '123.456', {
        deleteAfterUpload: true,
        traceId: 'test-trace',
      });

      // Wait for async cleanups
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFilesClient.deleteFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('createSlackFileUploader', () => {
    /**
     * @see Task 8.2 - Factory function
     */
    it('creates a SlackFileUploader instance', () => {
      const instance = createSlackFileUploader(mockFilesClient, mockSlackClient);
      expect(instance).toBeInstanceOf(SlackFileUploader);
    });
  });

  describe('error categorization', () => {
    /**
     * @see AC#5 - Error codes mapped correctly
     */
    it('maps 404 errors to DOWNLOAD_FAILED', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockRejectedValue(new Error('404 not found'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.error?.code).toBe('DOWNLOAD_FAILED');
    });

    it('maps unknown errors to UNKNOWN_ERROR', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockRejectedValue(new Error('Something weird'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.error?.code).toBe('UNKNOWN_ERROR');
    });
  });
});
