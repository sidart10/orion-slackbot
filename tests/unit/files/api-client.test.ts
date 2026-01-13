/**
 * Files API Client Tests
 *
 * Tests for Anthropic Files API client operations: upload, download, metadata, delete.
 *
 * @see Story 6.5 - Files API Client
 * @see AC#1 - uploadFile returns FileMetadata
 * @see AC#2 - downloadFile returns Buffer
 * @see AC#3 - getFileMetadata returns FileMetadata
 * @see AC#4 - deleteFile returns true
 * @see AC#5 - extractFileIds extracts file IDs from response
 * @see AC#6 - Beta header included on all calls
 * @see AC#7 - Logging with traceId
 * @see AC#8 - Error handling with error codes
 * @see AC#9 - FILE_TOO_LARGE for files > 100MB
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock functions for Anthropic SDK
const mockFilesUpload = vi.fn();
const mockFilesDownload = vi.fn();
const mockFilesRetrieveMetadata = vi.fn();
const mockFilesDelete = vi.fn();

// Mock Anthropic SDK - matches skills/api-client.test.ts pattern
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      files: {
        upload: mockFilesUpload,
        download: mockFilesDownload,
        retrieveMetadata: mockFilesRetrieveMetadata,
        delete: mockFilesDelete,
      },
    },
  })),
}));

// Mock Node.js fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  createReadStream: vi.fn(),
}));

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock('@/config/environment.js', () => ({
  config: {
    anthropicApiKey: 'test-api-key',
    anthropic: {
      allBetas: [
        'context-management-2025-06-27',
        'code-execution-2025-08-25',
        'skills-2025-10-02',
        'files-api-2025-04-14',
      ],
    },
  },
}));

// Import after mocks are set up
import { existsSync, statSync, createReadStream } from 'fs';
import { logger } from '@/utils/logger.js';
import {
  createFileMetadata,
  createFileId,
  createBetaMessageWithFiles,
  createBetaMessageWithoutFiles,
  createApiError,
  OVER_LIMIT_SIZE,
} from '@test/factories/files-factory.js';
import { FilesApiClient, FilesApiError, extractFileIds, createFilesApiClient } from '@/files/api-client.js';

describe('files/api-client', () => {
  beforeEach(() => {
    // Reset mock call history
    mockFilesUpload.mockReset();
    mockFilesDownload.mockReset();
    mockFilesRetrieveMetadata.mockReset();
    mockFilesDelete.mockReset();
  });

  // ===========================================================================
  // AC#1: uploadFile returns FileMetadata
  // ===========================================================================

  describe('uploadFile', () => {
    it('uploads file and returns metadata', async () => {
      // GIVEN: File exists and is under size limit
      const filePath = './test-file.xlsx';
      const mockMetadata = createFileMetadata({
        filename: 'test-file.xlsx',
        size_bytes: 1024,
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as ReturnType<typeof statSync>);
      vi.mocked(createReadStream).mockReturnValue({} as ReturnType<typeof createReadStream>);
      mockFilesUpload.mockResolvedValueOnce(mockMetadata);

      // WHEN: Uploading file
      const client = new FilesApiClient();
      const result = await client.uploadFile(filePath, { traceId: 'test-trace' });

      // THEN: FileMetadata returned with correct fields
      expect(result).toBeDefined();
      expect(result.id).toMatch(/^file_/);
      expect(result.filename).toBe('test-file.xlsx');
      expect(result.mime_type).toBeDefined();
      expect(result.size_bytes).toBe(1024);
      expect(result.type).toBe('file');
    });

    it('throws FILE_UPLOAD_FAILED when file does not exist', async () => {
      // GIVEN: File does not exist
      const filePath = './nonexistent.pdf';
      vi.mocked(existsSync).mockReturnValue(false);

      // WHEN/THEN: Uploading throws error
      const client = new FilesApiClient();
      await expect(client.uploadFile(filePath)).rejects.toMatchObject({
        code: 'FILE_UPLOAD_FAILED',
      });

      // AND: API was NOT called
      expect(mockFilesUpload).not.toHaveBeenCalled();
    });

    it('throws FILE_TOO_LARGE before API call when file exceeds 100MB', async () => {
      // GIVEN: File exists but exceeds 100MB limit
      const filePath = './large-file.csv';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: OVER_LIMIT_SIZE } as ReturnType<typeof statSync>);

      // WHEN/THEN: Uploading throws FILE_TOO_LARGE error
      const client = new FilesApiClient();
      await expect(client.uploadFile(filePath)).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
      });

      // AND: API was NOT called (validation happens before API call)
      expect(mockFilesUpload).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC#1 (uploadBuffer variant): uploadBuffer with metadata
  // ===========================================================================

  describe('uploadBuffer', () => {
    it('uploads buffer with metadata and returns FileMetadata', async () => {
      // GIVEN: Buffer with filename and MIME type
      const buffer = Buffer.from('test content');
      const filename = 'report.xlsx';
      const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const mockMetadata = createFileMetadata({
        filename,
        mime_type: mimeType,
        size_bytes: buffer.length,
      });

      mockFilesUpload.mockResolvedValueOnce(mockMetadata);

      // WHEN: Uploading buffer
      const client = new FilesApiClient();
      const result = await client.uploadBuffer(buffer, filename, mimeType, 'test-trace');

      // THEN: FileMetadata returned
      expect(result).toBeDefined();
      expect(result.id).toMatch(/^file_/);
      expect(result.filename).toBe(filename);
      expect(mockFilesUpload).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC#2: downloadFile returns Buffer
  // ===========================================================================

  describe('downloadFile', () => {
    it('downloads file and returns buffer', async () => {
      // GIVEN: File exists in Anthropic
      const fileId = createFileId();
      const testContent = 'test file content';
      const mockArrayBuffer = new TextEncoder().encode(testContent).buffer;
      const mockResponse = {
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
      };
      mockFilesDownload.mockResolvedValueOnce(mockResponse);

      // WHEN: Downloading file
      const client = new FilesApiClient();
      const result = await client.downloadFile(fileId, 'test-trace');

      // THEN: Buffer returned with correct content
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe(testContent);
      expect(mockFilesDownload).toHaveBeenCalledWith(fileId, expect.any(Object));
    });

    it('throws FILE_NOT_FOUND for 404 response', async () => {
      // GIVEN: File does not exist
      const fileId = 'file_nonexistent';
      const notFoundError = createApiError(404);
      mockFilesDownload.mockRejectedValueOnce(notFoundError);

      // WHEN/THEN: Download throws FILE_NOT_FOUND error
      const client = new FilesApiClient();
      await expect(client.downloadFile(fileId)).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });
  });

  // ===========================================================================
  // AC#3: getFileMetadata returns FileMetadata
  // ===========================================================================

  describe('getFileMetadata', () => {
    it('retrieves file metadata successfully', async () => {
      // GIVEN: File exists
      const fileId = createFileId();
      const mockMetadata = createFileMetadata({ id: fileId });
      mockFilesRetrieveMetadata.mockResolvedValueOnce(mockMetadata);

      // WHEN: Getting metadata
      const client = new FilesApiClient();
      const result = await client.getFileMetadata(fileId, 'test-trace');

      // THEN: Metadata returned with correct structure
      expect(result).toBeDefined();
      expect(result.id).toBe(fileId);
      expect(result.filename).toBeDefined();
      expect(result.mime_type).toBeDefined();
      expect(result.size_bytes).toBeGreaterThan(0);
      expect(mockFilesRetrieveMetadata).toHaveBeenCalledWith(fileId, expect.any(Object));
    });
  });

  // ===========================================================================
  // AC#4: deleteFile returns true
  // ===========================================================================

  describe('deleteFile', () => {
    it('deletes file and returns true', async () => {
      // GIVEN: File exists
      const fileId = createFileId();
      mockFilesDelete.mockResolvedValueOnce({});

      // WHEN: Deleting file
      const client = new FilesApiClient();
      const result = await client.deleteFile(fileId, 'test-trace');

      // THEN: Returns true
      expect(result).toBe(true);
      expect(mockFilesDelete).toHaveBeenCalledWith(fileId, expect.any(Object));
    });
  });

  // ===========================================================================
  // AC#5: extractFileIds extracts file IDs from response
  // ===========================================================================

  describe('extractFileIds', () => {
    it('extracts file IDs from tool_result content', () => {
      // GIVEN: BetaMessage with files in tool_result
      const fileIds = ['file_01abc', 'file_02def', 'file_03ghi'];
      const response = createBetaMessageWithFiles(fileIds);

      // WHEN: Extracting file IDs
      const result = extractFileIds(response as never);

      // THEN: All file IDs extracted
      expect(result).toEqual(fileIds);
    });

    it('returns empty array when no files in response', () => {
      // GIVEN: BetaMessage without files
      const response = createBetaMessageWithoutFiles();

      // WHEN: Extracting file IDs
      const result = extractFileIds(response as never);

      // THEN: Empty array returned
      expect(result).toEqual([]);
    });

    it('returns empty array for empty content', () => {
      // GIVEN: BetaMessage with empty content
      const response = { content: [] };

      // WHEN: Extracting file IDs
      const result = extractFileIds(response as never);

      // THEN: Empty array returned
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // AC#6: Beta header included on all calls
  // ===========================================================================

  describe('beta headers', () => {
    it('includes files-api-2025-04-14 beta header on upload', async () => {
      // GIVEN: Valid upload setup
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as ReturnType<typeof statSync>);
      vi.mocked(createReadStream).mockReturnValue({} as ReturnType<typeof createReadStream>);
      mockFilesUpload.mockResolvedValueOnce(createFileMetadata());

      // WHEN: Uploading file
      const client = new FilesApiClient();
      await client.uploadFile('./test.pdf');

      // THEN: Beta header included
      expect(mockFilesUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          betas: expect.arrayContaining(['files-api-2025-04-14']),
        })
      );
    });

    it('includes files-api-2025-04-14 beta header on download', async () => {
      // GIVEN: Valid download setup
      const fileId = createFileId();
      mockFilesDownload.mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      });

      // WHEN: Downloading file
      const client = new FilesApiClient();
      await client.downloadFile(fileId);

      // THEN: Beta header included
      expect(mockFilesDownload).toHaveBeenCalledWith(
        fileId,
        expect.objectContaining({
          betas: expect.arrayContaining(['files-api-2025-04-14']),
        })
      );
    });
  });

  // ===========================================================================
  // AC#7: Logging with traceId
  // ===========================================================================

  describe('observability', () => {
    it('logs upload operations with traceId', async () => {
      // GIVEN: Valid upload setup
      const traceId = 'trace-123';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as ReturnType<typeof statSync>);
      vi.mocked(createReadStream).mockReturnValue({} as ReturnType<typeof createReadStream>);
      mockFilesUpload.mockResolvedValueOnce(createFileMetadata());

      // WHEN: Uploading file
      const client = new FilesApiClient();
      await client.uploadFile('./test.pdf', { traceId });

      // THEN: Logger called with traceId
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.stringMatching(/files\.upload/),
          traceId,
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.stringMatching(/files\.upload/),
          traceId,
        })
      );
    });

    it('logs download operations with traceId', async () => {
      // GIVEN: Valid download setup
      const traceId = 'trace-456';
      const fileId = createFileId();
      mockFilesDownload.mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
      });

      // WHEN: Downloading file
      const client = new FilesApiClient();
      await client.downloadFile(fileId, traceId);

      // THEN: Logger called with traceId
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId,
        })
      );
    });
  });

  // ===========================================================================
  // AC#8: Error handling with error codes
  // ===========================================================================

  describe('error handling', () => {
    it('throws AUTHENTICATION_ERROR for 401 response', async () => {
      // GIVEN: API returns 401
      const fileId = createFileId();
      mockFilesDownload.mockRejectedValueOnce(createApiError(401));

      // WHEN/THEN: Throws AUTHENTICATION_ERROR
      const client = new FilesApiClient();
      await expect(client.downloadFile(fileId)).rejects.toMatchObject({
        code: 'AUTHENTICATION_ERROR',
      });
    });

    it('throws AUTHENTICATION_ERROR for 403 response', async () => {
      // GIVEN: API returns 403
      const fileId = createFileId();
      mockFilesDownload.mockRejectedValueOnce(createApiError(403));

      // WHEN/THEN: Throws AUTHENTICATION_ERROR
      const client = new FilesApiClient();
      await expect(client.downloadFile(fileId)).rejects.toMatchObject({
        code: 'AUTHENTICATION_ERROR',
      });
    });

    it('throws RATE_LIMITED for 429 response', async () => {
      // GIVEN: API returns 429
      const fileId = createFileId();
      mockFilesDownload.mockRejectedValueOnce(createApiError(429));

      // WHEN/THEN: Throws RATE_LIMITED
      const client = new FilesApiClient();
      await expect(client.downloadFile(fileId)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });
  });

  // ===========================================================================
  // Factory function
  // ===========================================================================

  describe('createFilesApiClient', () => {
    it('creates FilesApiClient instance', () => {
      // WHEN: Creating client via factory
      const client = createFilesApiClient();

      // THEN: Client is created
      expect(client).toBeInstanceOf(FilesApiClient);
    });
  });

  // ===========================================================================
  // FilesApiError
  // ===========================================================================

  describe('FilesApiError', () => {
    it('has correct name and properties', () => {
      const error = new FilesApiError('Test error', 'FILE_NOT_FOUND', new Error('cause'));

      expect(error.name).toBe('FilesApiError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.cause).toBeInstanceOf(Error);
    });
  });
});
