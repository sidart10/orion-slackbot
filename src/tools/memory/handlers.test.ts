/**
 * Memory Tool Handlers Tests (SDK Interface)
 *
 * Tests for MemoryToolHandlers implementation used with betaMemoryTool.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1-6 - Memory operations
 * @see AC#10 - betaMemoryTool integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage
vi.mock('./storage.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  listFiles: vi.fn(),
  copyFile: vi.fn(),
}));

// Mock observability
vi.mock('../../observability/langfuse.js', () => ({
  getLangfuse: vi.fn().mockReturnValue({
    span: vi.fn().mockReturnValue({ end: vi.fn() }),
  }),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createMemoryHandlers } from './handlers.js';
import { readFile, writeFile, deleteFile, listFiles, copyFile } from './storage.js';

describe('createMemoryHandlers', () => {
  const bucket = 'test-bucket';
  const traceId = 'test-trace-123';
  let handlers: ReturnType<typeof createMemoryHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = createMemoryHandlers(bucket, traceId);
  });

  describe('view (AC#1)', () => {
    it('returns file content with line numbers', async () => {
      vi.mocked(readFile).mockResolvedValue('line 1\nline 2');

      const result = await handlers.view({
        command: 'view',
        path: '/memories/test.md',
      });

      expect(result).toBe('     1\tline 1\n     2\tline 2');
      expect(readFile).toHaveBeenCalledWith(bucket, 'test.md');
    });

    it('returns directory listing for paths ending with /', async () => {
      vi.mocked(listFiles).mockResolvedValue([
        { path: '/memories/users/a.txt', size: 1024 },
        { path: '/memories/users/b.txt', size: 2048 },
      ]);

      const result = await handlers.view({
        command: 'view',
        path: '/memories/users/',
      });

      expect(result).toContain('/memories/users/a.txt');
      expect(result).toContain('1.0K');
      expect(listFiles).toHaveBeenCalledWith(bucket, 'users/');
    });

    it('supports view_range parameter', async () => {
      vi.mocked(readFile).mockResolvedValue('line 1\nline 2\nline 3\nline 4\nline 5');

      const result = await handlers.view({
        command: 'view',
        path: '/memories/test.md',
        view_range: [2, 4],
      });

      expect(result).toBe('     2\tline 2\n     3\tline 3\n     4\tline 4');
    });

    it('throws on invalid path', async () => {
      await expect(
        handlers.view({ command: 'view', path: '/other/path' })
      ).rejects.toThrow('Path must start with /memories/');
    });

    it('throws on path traversal', async () => {
      await expect(
        handlers.view({ command: 'view', path: '/memories/../etc/passwd' })
      ).rejects.toThrow('traversal');
    });
  });

  describe('create (AC#2)', () => {
    it('creates new file in GCS', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await handlers.create({
        command: 'create',
        path: '/memories/new.md',
        file_text: 'new content',
      });

      expect(result).toBe('File created at /memories/new.md');
      expect(writeFile).toHaveBeenCalledWith(bucket, 'new.md', 'new content');
    });

    it('rejects content exceeding 100KB', async () => {
      const largeContent = 'x'.repeat(101 * 1024);

      await expect(
        handlers.create({
          command: 'create',
          path: '/memories/large.md',
          file_text: largeContent,
        })
      ).rejects.toThrow('exceeds maximum size');
    });
  });

  describe('str_replace (AC#3)', () => {
    it('replaces text in file', async () => {
      vi.mocked(readFile).mockResolvedValue('hello world');
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await handlers.str_replace({
        command: 'str_replace',
        path: '/memories/test.md',
        old_str: 'world',
        new_str: 'universe',
      });

      expect(result).toBe('Replaced text in /memories/test.md');
      expect(writeFile).toHaveBeenCalledWith(bucket, 'test.md', 'hello universe');
    });

    it('throws when old_str not found', async () => {
      vi.mocked(readFile).mockResolvedValue('hello world');

      await expect(
        handlers.str_replace({
          command: 'str_replace',
          path: '/memories/test.md',
          old_str: 'notfound',
          new_str: 'replacement',
        })
      ).rejects.toThrow('String not found');
    });
  });

  describe('insert (AC#4)', () => {
    it('inserts text at specified line', async () => {
      vi.mocked(readFile).mockResolvedValue('line 1\nline 2\nline 3');
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await handlers.insert({
        command: 'insert',
        path: '/memories/test.md',
        insert_line: 1,
        insert_text: 'inserted line',
      });

      expect(result).toBe('Inserted text at line 1 in /memories/test.md');
      expect(writeFile).toHaveBeenCalledWith(
        bucket,
        'test.md',
        'line 1\ninserted line\nline 2\nline 3'
      );
    });

    it('throws on invalid insert_line', async () => {
      vi.mocked(readFile).mockResolvedValue('line 1\nline 2');

      await expect(
        handlers.insert({
          command: 'insert',
          path: '/memories/test.md',
          insert_line: 10,
          insert_text: 'too far',
        })
      ).rejects.toThrow('Invalid insert_line');
    });
  });

  describe('delete (AC#5)', () => {
    it('deletes file from GCS', async () => {
      vi.mocked(deleteFile).mockResolvedValue(undefined);

      const result = await handlers.delete({
        command: 'delete',
        path: '/memories/todelete.md',
      });

      expect(result).toBe('Deleted /memories/todelete.md');
      expect(deleteFile).toHaveBeenCalledWith(bucket, 'todelete.md');
    });
  });

  describe('rename (AC#6)', () => {
    it('renames file (copy + delete)', async () => {
      vi.mocked(copyFile).mockResolvedValue(undefined);
      vi.mocked(deleteFile).mockResolvedValue(undefined);

      const result = await handlers.rename({
        command: 'rename',
        old_path: '/memories/old.md',
        new_path: '/memories/new.md',
      });

      expect(result).toBe('Renamed /memories/old.md to /memories/new.md');
      expect(copyFile).toHaveBeenCalledWith(bucket, 'old.md', 'new.md');
      expect(deleteFile).toHaveBeenCalledWith(bucket, 'old.md');
    });

    it('validates both paths', async () => {
      await expect(
        handlers.rename({
          command: 'rename',
          old_path: '/other/old.md',
          new_path: '/memories/new.md',
        })
      ).rejects.toThrow('Path must start with /memories/');
    });
  });
});

