/**
 * Knowledge Storage Tests
 *
 * Tests for domain knowledge storage and retrieval.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#5 - Knowledge stored in orion-context/knowledge/
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  readdir: vi.fn().mockResolvedValue([]),
}));

describe('memory/knowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Knowledge interface', () => {
    it('should support named knowledge items', async () => {
      type K = import('./knowledge.js').Knowledge;

      const knowledge: K = {
        name: 'audience-segments',
        content: '# Audience Segments\n\nInformation about segments...',
        category: 'marketing',
        tags: ['audience', 'targeting', 'segments'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(knowledge.name).toBe('audience-segments');
      expect(knowledge.category).toBe('marketing');
    });

    it('should support tags for categorization', async () => {
      type K = import('./knowledge.js').Knowledge;

      const knowledge: K = {
        name: 'product-features',
        content: 'Features of our product',
        category: 'product',
        tags: ['features', 'capabilities', 'product'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(knowledge.tags).toContain('features');
      expect(knowledge.tags).toHaveLength(3);
    });
  });

  describe('saveKnowledge', () => {
    it('should save knowledge to knowledge directory (AC#5)', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveKnowledge } = await import('./knowledge.js');

      await saveKnowledge({
        name: 'test-knowledge',
        content: '# Test\n\nContent here',
        category: 'general',
        tags: ['test'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('knowledge'),
        expect.any(String)
      );
    });

    it('should use name as filename', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveKnowledge } = await import('./knowledge.js');

      await saveKnowledge({
        name: 'audience-segments',
        content: 'Content',
        category: 'marketing',
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('audience-segments.md'),
        expect.any(String)
      );
    });

    it('should include frontmatter with metadata', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveKnowledge } = await import('./knowledge.js');

      await saveKnowledge({
        name: 'test',
        content: 'Content',
        category: 'general',
        tags: ['a', 'b'],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });

      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain('type: knowledge');
      expect(writtenContent).toContain('category: general');
      expect(writtenContent).toContain('tags:');
    });
  });

  describe('loadKnowledge', () => {
    it('should load knowledge by name', async () => {
      const { readFile } = await import('fs/promises');
      const { loadKnowledge } = await import('./knowledge.js');

      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
name: audience-segments
category: marketing
tags:
  - audience
  - segments
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
---
# Audience Segments

Information about targeting segments.
`);

      const knowledge = await loadKnowledge('audience-segments');

      expect(knowledge).not.toBeNull();
      expect(knowledge?.name).toBe('audience-segments');
      expect(knowledge?.category).toBe('marketing');
      expect(knowledge?.tags).toContain('audience');
    });

    it('should return null when knowledge does not exist', async () => {
      const { readFile } = await import('fs/promises');
      const { loadKnowledge } = await import('./knowledge.js');

      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const knowledge = await loadKnowledge('nonexistent');

      expect(knowledge).toBeNull();
    });
  });

  describe('getKnowledgePath', () => {
    it('should return path in knowledge directory', async () => {
      const { getKnowledgePath } = await import('./knowledge.js');

      const path = getKnowledgePath('test-doc');

      expect(path).toContain('knowledge');
      expect(path).toContain('test-doc');
      expect(path).toMatch(/\.md$/);
    });
  });

  describe('listKnowledge', () => {
    it('should list all knowledge items', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { listKnowledge } = await import('./knowledge.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'item1.md', isFile: () => true, parentPath: './orion-context/knowledge' },
        { name: 'item2.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
name: item
category: general
tags: []
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
---
Content
`);

      const items = await listKnowledge();

      expect(items.length).toBe(2);
    });

    it('should filter by category when specified', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { listKnowledge } = await import('./knowledge.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'item1.md', isFile: () => true, parentPath: './orion-context/knowledge' },
        { name: 'item2.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      vi.mocked(readFile)
        .mockResolvedValueOnce(`---
type: knowledge
name: item1
category: marketing
tags: []
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
---
Marketing content
`)
        .mockResolvedValueOnce(`---
type: knowledge
name: item2
category: product
tags: []
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
---
Product content
`);

      const items = await listKnowledge('marketing');

      expect(items.length).toBe(1);
      expect(items[0].category).toBe('marketing');
    });

    it('should return empty array when no knowledge exists', async () => {
      const { readdir } = await import('fs/promises');
      const { listKnowledge } = await import('./knowledge.js');

      vi.mocked(readdir).mockRejectedValue(new Error('ENOENT'));

      const items = await listKnowledge();

      expect(items).toEqual([]);
    });
  });

  describe('searchKnowledge', () => {
    it('should search knowledge by query', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { searchKnowledge } = await import('./knowledge.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'segments.md', isFile: () => true, parentPath: './orion-context/knowledge' },
      ] as unknown as import('fs').Dirent[]);

      vi.mocked(readFile).mockResolvedValue(`---
type: knowledge
name: segments
category: marketing
tags:
  - audience
  - targeting
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
---
# Audience Segments

Information about targeting audience segments for marketing campaigns.
`);

      const results = await searchKnowledge('audience targeting');

      expect(results.length).toBe(1);
      expect(results[0].content).toContain('audience');
    });
  });
});

