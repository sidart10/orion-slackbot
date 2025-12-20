/**
 * Memory Layer Tests
 *
 * Tests for file-based persistent memory functionality.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#1 - Information saved to orion-context/ as files
 * @see AC#2 - Gather phase searches orion-context/ for relevant memories
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';

// Mock fs/promises before importing the module
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  readdir: vi.fn().mockResolvedValue([]),
}));

describe('memory/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MemoryType', () => {
    it('should export conversation type', async () => {
      const { MemoryType } = await import('./index.js');
      expect(MemoryType.CONVERSATION).toBe('conversation');
    });

    it('should export preference type', async () => {
      const { MemoryType } = await import('./index.js');
      expect(MemoryType.PREFERENCE).toBe('preference');
    });

    it('should export knowledge type', async () => {
      const { MemoryType } = await import('./index.js');
      expect(MemoryType.KNOWLEDGE).toBe('knowledge');
    });
  });

  describe('Memory interface', () => {
    it('should create a valid Memory object', async () => {
      const { MemoryType } = await import('./index.js');
      type Memory = import('./index.js').Memory;

      const memory: Memory = {
        type: MemoryType.KNOWLEDGE,
        key: 'test-key',
        content: 'Test content',
        metadata: {
          createdAt: new Date().toISOString(),
        },
      };

      expect(memory.type).toBe('knowledge');
      expect(memory.key).toBe('test-key');
      expect(memory.content).toBe('Test content');
      expect(memory.metadata.createdAt).toBeDefined();
    });

    it('should support optional metadata fields', async () => {
      const { MemoryType } = await import('./index.js');
      type Memory = import('./index.js').Memory;

      const memory: Memory = {
        type: MemoryType.PREFERENCE,
        key: 'user-pref',
        content: 'User prefers dark mode',
        metadata: {
          createdAt: new Date().toISOString(),
          userId: 'U123456',
          channelId: 'C789',
          tags: ['preference', 'ui'],
        },
      };

      expect(memory.metadata.userId).toBe('U123456');
      expect(memory.metadata.channelId).toBe('C789');
      expect(memory.metadata.tags).toEqual(['preference', 'ui']);
    });
  });

  describe('saveMemory', () => {
    it('should save memory to the correct directory based on type (AC#1)', async () => {
      const { mkdir, writeFile } = await import('fs/promises');
      const { saveMemory, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.KNOWLEDGE,
        key: 'test-knowledge',
        content: 'Some knowledge content',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      };

      await saveMemory(memory);

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it('should create directory if it does not exist', async () => {
      const { mkdir } = await import('fs/promises');
      const { saveMemory, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.CONVERSATION,
        key: 'thread-summary',
        content: 'Thread summary',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          channelId: 'C123',
        },
      };

      await saveMemory(memory);

      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining('conversations'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should use YAML format for preference type', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveMemory, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.PREFERENCE,
        key: 'U123',
        content: JSON.stringify({ theme: 'dark', language: 'en' }),
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          userId: 'U123',
        },
      };

      await saveMemory(memory);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.yaml$/),
        expect.any(String)
      );
    });

    it('should use Markdown format for knowledge type', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveMemory, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.KNOWLEDGE,
        key: 'audience-segments',
        content: '# Audience Segments\n\nContent here...',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          tags: ['marketing', 'segments'],
        },
      };

      await saveMemory(memory);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.md$/),
        expect.any(String)
      );
    });

    it('should use Markdown format for conversation type', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveMemory, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.CONVERSATION,
        key: 'C123_1702848000',
        content: '# Thread Summary\n\nDiscussion about...',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          channelId: 'C123',
        },
      };

      await saveMemory(memory);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.md$/),
        expect.any(String)
      );
    });
  });

  describe('searchMemory', () => {
    it('should return empty array when no files exist', async () => {
      const { readdir } = await import('fs/promises');
      vi.mocked(readdir).mockResolvedValue([]);

      const { searchMemory } = await import('./index.js');

      const results = await searchMemory('test query');

      expect(results).toEqual([]);
    });

    it('should search by keywords and return matching memories (AC#2)', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchMemory, MemoryType } = await import('./index.js');

      // Mock directory listing
      vi.mocked(readdir).mockResolvedValue([
        { name: 'test.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      // Mock file content with frontmatter
      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
createdAt: 2025-01-01T00:00:00.000Z
tags:
  - test
---
# Test Knowledge

This is test content about audience segments.
`);

      const results = await searchMemory('audience segments');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('audience segments');
    });

    it('should filter by memory type when specified', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchMemory, MemoryType } = await import('./index.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'test.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
createdAt: 2025-01-01T00:00:00.000Z
---
Test content
`);

      const results = await searchMemory('test', MemoryType.KNOWLEDGE);

      // Should only search in knowledge directory
      expect(readdir).toHaveBeenCalledWith(
        expect.stringContaining('knowledge'),
        expect.any(Object)
      );
    });

    it('should rank results by relevance score', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchMemory } = await import('./index.js');

      // Mock multiple files
      vi.mocked(readdir).mockResolvedValue([
        { name: 'file1.md', isFile: () => true, parentPath: './orion-context/knowledge' },
        { name: 'file2.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      // First call returns high match, second returns low match
      vi.mocked(readFile)
        .mockResolvedValueOnce(`---
type: knowledge
createdAt: 2025-01-01T00:00:00.000Z
---
audience segments targeting marketing audience`)
        .mockResolvedValueOnce(`---
type: knowledge
createdAt: 2025-01-01T00:00:00.000Z
---
random content`);

      const results = await searchMemory('audience segments');

      // First result should have higher relevance (more keyword matches)
      expect(results[0].content).toContain('audience');
    });

    it('should limit results to 10 by default', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchMemory } = await import('./index.js');

      // Mock 15 files
      const files = Array.from({ length: 15 }, (_, i) => ({
        name: `file${i}.md`,
        isFile: () => true,
        parentPath: './orion-context/knowledge',
      }));
      vi.mocked(readdir).mockResolvedValue(files as unknown as import('fs').Dirent[]);

      // All files match the query
      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
createdAt: 2025-01-01T00:00:00.000Z
---
matching content for test query`);

      const results = await searchMemory('test query');

      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('ORION_CONTEXT_ROOT', () => {
    it('should export the root directory constant', async () => {
      const { ORION_CONTEXT_ROOT } = await import('./index.js');
      expect(ORION_CONTEXT_ROOT).toBe('./orion-context');
    });
  });

  describe('getMemoryPath', () => {
    it('should generate correct path for knowledge memory', async () => {
      const { getMemoryPath, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.KNOWLEDGE,
        key: 'test-doc',
        content: 'content',
        metadata: { createdAt: '2025-01-01T00:00:00.000Z' },
      };

      const path = getMemoryPath(memory);
      expect(path).toContain('knowledge');
      expect(path).toContain('test-doc');
      expect(path).toMatch(/\.md$/);
    });

    it('should generate correct path for preference memory', async () => {
      const { getMemoryPath, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.PREFERENCE,
        key: 'U123',
        content: '{}',
        metadata: { createdAt: '2025-01-01T00:00:00.000Z', userId: 'U123' },
      };

      const path = getMemoryPath(memory);
      expect(path).toContain('user-preferences');
      expect(path).toContain('U123');
      expect(path).toMatch(/\.yaml$/);
    });

    it('should generate correct path for conversation memory', async () => {
      const { getMemoryPath, MemoryType } = await import('./index.js');

      const memory = {
        type: MemoryType.CONVERSATION,
        key: 'C123_1702848000',
        content: 'summary',
        metadata: { createdAt: '2025-01-01T00:00:00.000Z', channelId: 'C123' },
      };

      const path = getMemoryPath(memory);
      expect(path).toContain('conversations');
      expect(path).toContain('C123_1702848000');
      expect(path).toMatch(/\.md$/);
    });
  });

  /**
   * Tests for searchMemoryWithScores
   * @see Story 2.8 Task 4 review follow-up - Pass actual relevance scores
   */
  describe('searchMemoryWithScores', () => {
    it('should return results with normalized relevance scores', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchMemoryWithScores } = await import('./index.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'test.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
createdAt: 2025-01-01T00:00:00.000Z
---
This content has keywords: test query terms
`);

      const results = await searchMemoryWithScores('test query');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('memory');
      expect(results[0]).toHaveProperty('relevance');
      expect(results[0]).toHaveProperty('rawScore');
      expect(results[0].relevance).toBeGreaterThan(0);
      expect(results[0].relevance).toBeLessThanOrEqual(1);
    });

    it('should return higher relevance for more keyword matches', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchMemoryWithScores } = await import('./index.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'high.md', isFile: () => true, parentPath: './orion-context/knowledge' },
        { name: 'low.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      vi.mocked(readFile)
        .mockResolvedValueOnce(`---
type: knowledge
---
audience segments targeting audience marketing`) // 2 matches: audience (x2), segments
        .mockResolvedValueOnce(`---
type: knowledge
---
basic information`); // 0 matches

      const results = await searchMemoryWithScores('audience segments');

      // First result should have higher relevance (more matches)
      expect(results.length).toBe(1); // Only one should match
      expect(results[0].relevance).toBe(1.0); // 2/2 keywords matched
      expect(results[0].rawScore).toBe(2);
    });

    it('should calculate relevance as ratio of matched keywords', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchMemoryWithScores } = await import('./index.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'partial.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      // Only matches "audience" but not "segments" or "targeting"
      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
---
content about audience only`);

      const results = await searchMemoryWithScores('audience segments targeting');

      expect(results.length).toBe(1);
      // 1 out of 3 keywords matched = 0.333...
      expect(results[0].rawScore).toBe(1);
      expect(results[0].relevance).toBeCloseTo(1/3, 2);
    });
  });
});

