/**
 * Memory Storage Tests
 *
 * Tests for low-level file operations for memory persistence.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#1 - Information saved to orion-context/ as files
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  readdir: vi.fn().mockResolvedValue([]),
}));

describe('memory/storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ORION_CONTEXT_ROOT', () => {
    it('should export the root directory constant', async () => {
      const { ORION_CONTEXT_ROOT } = await import('./storage.js');
      expect(ORION_CONTEXT_ROOT).toBe('./orion-context');
    });
  });

  describe('TYPE_DIRECTORIES', () => {
    it('should map conversation type to conversations directory', async () => {
      const { TYPE_DIRECTORIES } = await import('./storage.js');
      expect(TYPE_DIRECTORIES.conversation).toBe('conversations');
    });

    it('should map preference type to user-preferences directory', async () => {
      const { TYPE_DIRECTORIES } = await import('./storage.js');
      expect(TYPE_DIRECTORIES.preference).toBe('user-preferences');
    });

    it('should map knowledge type to knowledge directory', async () => {
      const { TYPE_DIRECTORIES } = await import('./storage.js');
      expect(TYPE_DIRECTORIES.knowledge).toBe('knowledge');
    });
  });

  describe('getTypeDirectory', () => {
    it('should return full path for conversation type', async () => {
      const { getTypeDirectory } = await import('./storage.js');
      const path = getTypeDirectory('conversation');
      expect(path).toBe('orion-context/conversations');
    });

    it('should return full path for preference type', async () => {
      const { getTypeDirectory } = await import('./storage.js');
      const path = getTypeDirectory('preference');
      expect(path).toBe('orion-context/user-preferences');
    });

    it('should return full path for knowledge type', async () => {
      const { getTypeDirectory } = await import('./storage.js');
      const path = getTypeDirectory('knowledge');
      expect(path).toBe('orion-context/knowledge');
    });
  });

  describe('listMemoryFiles', () => {
    it('should return empty array when directory does not exist', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockRejectedValue(new Error('ENOENT'));

      const { listMemoryFiles } = await import('./storage.js');
      const files = await listMemoryFiles('./nonexistent');

      expect(files).toEqual([]);
    });

    it('should return only .md and .yaml files', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([
        { name: 'test.md', isFile: () => true, parentPath: './dir' },
        { name: 'data.yaml', isFile: () => true, parentPath: './dir' },
        { name: 'other.txt', isFile: () => true, parentPath: './dir' },
        { name: 'subdir', isFile: () => false, parentPath: './dir' },
      ] as unknown as import('fs').Dirent[]);

      const { listMemoryFiles } = await import('./storage.js');
      const files = await listMemoryFiles('./dir');

      expect(files).toHaveLength(2);
      expect(files).toContain('dir/test.md');
      expect(files).toContain('dir/data.yaml');
    });
  });

  describe('parseMemoryFile', () => {
    it('should parse YAML preference files', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockResolvedValue(`type: preference
userId: U123
createdAt: 2025-01-01T00:00:00.000Z
theme: dark
language: en
`);

      const { parseMemoryFile } = await import('./storage.js');
      const memory = await parseMemoryFile('./test.yaml');

      expect(memory).not.toBeNull();
      expect(memory?.type).toBe('preference');
      expect(memory?.metadata.userId).toBe('U123');
    });

    it('should parse Markdown files with frontmatter', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
createdAt: 2025-01-01T00:00:00.000Z
tags:
  - test
  - example
---
# Test Knowledge

This is test content.
`);

      const { parseMemoryFile } = await import('./storage.js');
      const memory = await parseMemoryFile('./test.md');

      expect(memory).not.toBeNull();
      expect(memory?.type).toBe('knowledge');
      expect(memory?.content).toContain('Test Knowledge');
      expect(memory?.metadata.tags).toEqual(['test', 'example']);
    });

    it('should return null for invalid files', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const { parseMemoryFile } = await import('./storage.js');
      const memory = await parseMemoryFile('./nonexistent.md');

      expect(memory).toBeNull();
    });

    it('should default to knowledge type when type not specified', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockResolvedValue(`---
createdAt: 2025-01-01T00:00:00.000Z
---
Content without explicit type
`);

      const { parseMemoryFile } = await import('./storage.js');
      const memory = await parseMemoryFile('./test.md');

      expect(memory?.type).toBe('knowledge');
    });
  });

  describe('writeMemoryFile', () => {
    it('should create directory and write file', async () => {
      const { mkdir, writeFile } = await import('fs/promises');
      const { writeMemoryFile } = await import('./storage.js');

      await writeMemoryFile('./orion-context/knowledge/test.md', 'content');

      expect(mkdir).toHaveBeenCalledWith('./orion-context/knowledge', { recursive: true });
      expect(writeFile).toHaveBeenCalledWith('./orion-context/knowledge/test.md', 'content');
    });
  });

  describe('readMemoryFile', () => {
    it('should read file content', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockResolvedValue('file content');

      const { readMemoryFile } = await import('./storage.js');
      const content = await readMemoryFile('./test.md');

      expect(content).toBe('file content');
      expect(readFile).toHaveBeenCalledWith('./test.md', 'utf-8');
    });

    it('should return null when file does not exist', async () => {
      const { readFile } = await import('fs/promises');
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const { readMemoryFile } = await import('./storage.js');
      const content = await readMemoryFile('./nonexistent.md');

      expect(content).toBeNull();
    });
  });

  describe('generateMemoryFilename', () => {
    it('should generate filename with timestamp and type for conversations', async () => {
      const { generateMemoryFilename } = await import('./storage.js');

      const filename = generateMemoryFilename('conversation', 'C123', 1702848000000);

      expect(filename).toBe('C123_1702848000000.md');
    });

    it('should generate filename with userId for preferences', async () => {
      const { generateMemoryFilename } = await import('./storage.js');

      const filename = generateMemoryFilename('preference', 'U456');

      expect(filename).toBe('U456.yaml');
    });

    it('should generate filename with key for knowledge', async () => {
      const { generateMemoryFilename } = await import('./storage.js');

      const filename = generateMemoryFilename('knowledge', 'audience-segments');

      expect(filename).toBe('audience-segments.md');
    });

    it('should use current timestamp when not provided for conversations', async () => {
      const { generateMemoryFilename } = await import('./storage.js');
      const before = Date.now();

      const filename = generateMemoryFilename('conversation', 'C123');

      const after = Date.now();
      const match = filename.match(/C123_(\d+)\.md/);
      expect(match).not.toBeNull();

      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});

