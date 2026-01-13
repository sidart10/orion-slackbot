/**
 * Memory Tool Handler Tests
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1-7 - Memory operations, validation, observability
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/tools/memory/storage.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  listFiles: vi.fn(),
}));

vi.mock('@/observability/langfuse.js', () => ({
  getLangfuse: vi.fn().mockReturnValue({
    // M2 fix: Mock langfuse.span() directly (not trace().span())
    span: vi.fn().mockReturnValue({
      end: vi.fn(),
    }),
  }),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { handleMemoryTool, type MemoryToolInput } from '@/tools/memory/handler.js';
import { readFile, writeFile, deleteFile, listFiles } from '@/tools/memory/storage.js';
import { logger } from '@/utils/logger.js';

describe('handleMemoryTool', () => {
  const mockContext = {
    traceId: 'test-trace-123',
    bucket: 'test-bucket',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('view command (AC#1)', () => {
    it('should read file content from GCS', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/memories/users/U123/prefs.json',
      };
      vi.mocked(readFile).mockResolvedValue('{"theme": "dark"}');

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe('{"theme": "dark"}');
        expect(result.data.path).toBe('/memories/users/U123/prefs.json');
      }
      expect(readFile).toHaveBeenCalledWith('test-bucket', 'users/U123/prefs.json');
    });

    it('should list directory contents when path ends with /', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/memories/users/',
      };
      vi.mocked(listFiles).mockResolvedValue([
        { path: '/memories/users/U123/prefs.json', size: 1024 },
        { path: '/memories/users/U456/prefs.json', size: 2048 },
      ]);

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain('/memories/users/U123/prefs.json');
        expect(result.data.content).toContain('/memories/users/U456/prefs.json');
      }
      expect(listFiles).toHaveBeenCalledWith('test-bucket', 'users/');
    });
  });

  describe('create command (AC#2)', () => {
    it('should create new file in GCS', async () => {
      const input: MemoryToolInput = {
        command: 'create',
        path: '/memories/users/U123/prefs.json',
        content: '{"theme": "dark"}',
      };
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain('created');
      }
      expect(writeFile).toHaveBeenCalledWith(
        'test-bucket',
        'users/U123/prefs.json',
        '{"theme": "dark"}'
      );
    });

    it('should fail when content is missing', async () => {
      const input: MemoryToolInput = {
        command: 'create',
        path: '/memories/users/U123/prefs.json',
      };

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMORY_WRITE_FAILED');
        expect(result.error.message).toContain('Content required');
      }
    });

    it('should fail when content exceeds 100KB limit (M3 fix)', async () => {
      // Create content larger than 100KB
      const largeContent = 'x'.repeat(101 * 1024);
      const input: MemoryToolInput = {
        command: 'create',
        path: '/memories/users/U123/large.json',
        content: largeContent,
      };

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMORY_WRITE_FAILED');
        expect(result.error.message).toContain('exceeds maximum size');
        expect(result.error.retryable).toBe(false);
      }
      // Should not call writeFile
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should allow content at exactly 100KB limit', async () => {
      // Create content exactly at 100KB
      const exactContent = 'x'.repeat(100 * 1024);
      const input: MemoryToolInput = {
        command: 'create',
        path: '/memories/users/U123/exact.json',
        content: exactContent,
      };
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(true);
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('update command (AC#3)', () => {
    it('should update existing file in GCS', async () => {
      const input: MemoryToolInput = {
        command: 'update',
        path: '/memories/users/U123/prefs.json',
        content: '{"theme": "light"}',
      };
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain('updated');
      }
      expect(writeFile).toHaveBeenCalledWith(
        'test-bucket',
        'users/U123/prefs.json',
        '{"theme": "light"}'
      );
    });
  });

  describe('delete command (AC#4)', () => {
    it('should delete file from GCS', async () => {
      const input: MemoryToolInput = {
        command: 'delete',
        path: '/memories/users/U123/prefs.json',
      };
      vi.mocked(deleteFile).mockResolvedValue(undefined);

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain('deleted');
      }
      expect(deleteFile).toHaveBeenCalledWith('test-bucket', 'users/U123/prefs.json');
    });
  });

  describe('path validation (AC#5)', () => {
    it('should reject paths not starting with /memories/', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/other/path/file.json',
      };

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMORY_NOT_FOUND');
        expect(result.error.message).toContain('/memories/');
      }
    });

    it('should reject paths containing ../', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/memories/../etc/passwd',
      };

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Path validation now returns MEMORY_NOT_FOUND for all validation failures
        expect(result.error.code).toBe('MEMORY_NOT_FOUND');
        expect(result.error.message).toContain('traversal');
      }
    });
  });

  describe('observability (AC#6)', () => {
    it('should log success with traceId', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/memories/users/U123/prefs.json',
      };
      vi.mocked(readFile).mockResolvedValue('content');

      await handleMemoryTool(input, mockContext);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.memory.success',
          traceId: 'test-trace-123',
          command: 'view',
          path: '/memories/users/U123/prefs.json',
        })
      );
    });

    it('should log failure with traceId', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/memories/users/U123/missing.json',
      };
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      await handleMemoryTool(input, mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.memory.failed',
          traceId: 'test-trace-123',
          command: 'view',
          path: '/memories/users/U123/missing.json',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should return retryable=true for 503 errors', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/memories/users/U123/prefs.json',
      };
      vi.mocked(readFile).mockRejectedValue(new Error('GCS 503 Service Unavailable'));

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should return retryable=false for not found errors', async () => {
      const input: MemoryToolInput = {
        command: 'view',
        path: '/memories/users/U123/missing.json',
      };
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMORY_NOT_FOUND');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should handle unknown commands', async () => {
      const input = {
        command: 'unknown' as 'view',
        path: '/memories/global/test.json',
      };

      const result = await handleMemoryTool(input, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('Unknown command');
      }
    });
  });
});

