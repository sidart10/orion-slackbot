/**
 * GCS Storage Layer Tests
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1-4 - CRUD operations via GCS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mock state is available before vi.mock runs
const { mockState } = vi.hoisted(() => ({
  mockState: {
    exists: vi.fn(),
    download: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
    getFiles: vi.fn(),
  },
}));

// Mock @google-cloud/storage
vi.mock('@google-cloud/storage', () => {
  const mockStorage = {
    bucket: vi.fn().mockImplementation(() => ({
      file: vi.fn().mockImplementation(() => ({
        exists: (...args: unknown[]) => mockState.exists(...args),
        download: (...args: unknown[]) => mockState.download(...args),
        save: (...args: unknown[]) => mockState.save(...args),
        delete: (...args: unknown[]) => mockState.delete(...args),
        copy: (...args: unknown[]) => mockState.copy(...args),
      })),
      getFiles: (...args: unknown[]) => mockState.getFiles(...args),
    })),
  };
  return {
    Storage: vi.fn().mockImplementation(() => mockStorage),
  };
});

import { readFile, writeFile, deleteFile, listFiles, copyFile, fileExists } from './storage.js';

describe('GCS Storage Layer', () => {
  const TEST_BUCKET = 'test-bucket';
  const TEST_PATH = 'users/U123/prefs.json';
  const TEST_CONTENT = '{"theme": "dark"}';

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.exists.mockReset();
    mockState.download.mockReset();
    mockState.save.mockReset();
    mockState.delete.mockReset();
    mockState.copy.mockReset();
    mockState.getFiles.mockReset();
  });

  describe('readFile', () => {
    it('should read file content from GCS', async () => {
      mockState.exists.mockResolvedValue([true]);
      mockState.download.mockResolvedValue([Buffer.from(TEST_CONTENT)]);

      const result = await readFile(TEST_BUCKET, TEST_PATH);

      expect(result).toBe(TEST_CONTENT);
      expect(mockState.exists).toHaveBeenCalled();
      expect(mockState.download).toHaveBeenCalled();
    });

    it('should throw error when file does not exist', async () => {
      mockState.exists.mockResolvedValue([false]);

      await expect(readFile(TEST_BUCKET, TEST_PATH)).rejects.toThrow(
        `File not found: ${TEST_PATH}`
      );
    });

    it('should propagate GCS errors', async () => {
      mockState.exists.mockRejectedValue(new Error('GCS 503 Service Unavailable'));

      await expect(readFile(TEST_BUCKET, TEST_PATH)).rejects.toThrow(
        'GCS 503 Service Unavailable'
      );
    });
  });

  describe('writeFile', () => {
    it('should write content to GCS', async () => {
      mockState.save.mockResolvedValue(undefined);

      await writeFile(TEST_BUCKET, TEST_PATH, TEST_CONTENT);

      expect(mockState.save).toHaveBeenCalledWith(TEST_CONTENT, {
        contentType: 'text/plain',
        metadata: { cacheControl: 'no-cache' },
      });
    });

    it('should propagate GCS write errors', async () => {
      mockState.save.mockRejectedValue(new Error('GCS write failed'));

      await expect(writeFile(TEST_BUCKET, TEST_PATH, TEST_CONTENT)).rejects.toThrow(
        'GCS write failed'
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file from GCS', async () => {
      mockState.exists.mockResolvedValue([true]);
      mockState.delete.mockResolvedValue(undefined);

      await deleteFile(TEST_BUCKET, TEST_PATH);

      expect(mockState.exists).toHaveBeenCalled();
      expect(mockState.delete).toHaveBeenCalled();
    });

    it('should throw error when file does not exist', async () => {
      mockState.exists.mockResolvedValue([false]);

      await expect(deleteFile(TEST_BUCKET, TEST_PATH)).rejects.toThrow(
        `File not found: ${TEST_PATH}`
      );
    });
  });

  describe('listFiles', () => {
    it('should list files with prefix and sizes', async () => {
      const mockFiles = [
        { name: 'users/U123/file1.json', metadata: { size: '1024' } },
        { name: 'users/U123/file2.json', metadata: { size: '2048' } },
      ];
      mockState.getFiles.mockResolvedValue([mockFiles]);

      const result = await listFiles(TEST_BUCKET, 'users/U123/');

      expect(result).toEqual([
        { path: '/memories/users/U123/file1.json', size: 1024 },
        { path: '/memories/users/U123/file2.json', size: 2048 },
      ]);
      expect(mockState.getFiles).toHaveBeenCalledWith({ prefix: 'users/U123/' });
    });

    it('should return empty array for no files', async () => {
      mockState.getFiles.mockResolvedValue([[]]);

      const result = await listFiles(TEST_BUCKET, 'empty/');

      expect(result).toEqual([]);
    });
  });

  describe('copyFile', () => {
    it('should copy file within GCS bucket', async () => {
      mockState.exists.mockResolvedValue([true]);
      mockState.copy.mockResolvedValue(undefined);

      await copyFile(TEST_BUCKET, 'source.txt', 'dest.txt');

      expect(mockState.exists).toHaveBeenCalled();
      expect(mockState.copy).toHaveBeenCalled();
    });

    it('should throw error when source file does not exist', async () => {
      mockState.exists.mockResolvedValue([false]);

      await expect(copyFile(TEST_BUCKET, 'missing.txt', 'dest.txt')).rejects.toThrow(
        'File not found: missing.txt'
      );
    });

    it('should propagate GCS copy errors', async () => {
      mockState.exists.mockResolvedValue([true]);
      mockState.copy.mockRejectedValue(new Error('GCS copy failed'));

      await expect(copyFile(TEST_BUCKET, 'source.txt', 'dest.txt')).rejects.toThrow(
        'GCS copy failed'
      );
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockState.exists.mockResolvedValue([true]);

      const result = await fileExists(TEST_BUCKET, TEST_PATH);

      expect(result).toBe(true);
      expect(mockState.exists).toHaveBeenCalled();
    });

    it('should return false when file does not exist', async () => {
      mockState.exists.mockResolvedValue([false]);

      const result = await fileExists(TEST_BUCKET, TEST_PATH);

      expect(result).toBe(false);
    });
  });
});
