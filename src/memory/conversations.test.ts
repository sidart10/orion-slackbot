/**
 * Conversation Summaries Tests
 *
 * Tests for conversation summary storage and retrieval.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#4 - Conversation summaries stored in orion-context/conversations/
 * @see Task 11: Migrate Conversations to Vercel KV
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  readdir: vi.fn().mockResolvedValue([]),
}));

// Mock Vercel KV storage
const mockSaveToKV = vi.fn().mockResolvedValue(undefined);
const mockLoadFromKV = vi.fn().mockResolvedValue(null);
const mockListKVKeys = vi.fn().mockResolvedValue([]);

vi.mock('./vercel-kv-storage.js', () => ({
  saveToKV: mockSaveToKV,
  loadFromKV: mockLoadFromKV,
  listKVKeys: mockListKVKeys,
}));

describe('memory/conversations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear KV env vars so file-based tests run correctly
    process.env = { ...originalEnv };
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('ConversationSummary interface', () => {
    it('should support thread reference', async () => {
      type CS = import('./conversations.js').ConversationSummary;

      const summary: CS = {
        channelId: 'C123',
        threadTs: '1702848000.123456',
        summary: 'Discussion about project setup',
        participants: ['U123', 'U456'],
        topics: ['setup', 'configuration'],
        createdAt: new Date().toISOString(),
      };

      expect(summary.channelId).toBe('C123');
      expect(summary.threadTs).toBe('1702848000.123456');
    });

    it('should support participants list', async () => {
      type CS = import('./conversations.js').ConversationSummary;

      const summary: CS = {
        channelId: 'C123',
        threadTs: '1702848000.123456',
        summary: 'Team discussion',
        participants: ['U123', 'U456', 'U789'],
        topics: [],
        createdAt: new Date().toISOString(),
      };

      expect(summary.participants).toHaveLength(3);
      expect(summary.participants).toContain('U456');
    });

    it('should support topics extraction', async () => {
      type CS = import('./conversations.js').ConversationSummary;

      const summary: CS = {
        channelId: 'C123',
        threadTs: '1702848000.123456',
        summary: 'Discussed audience targeting and data segments',
        participants: ['U123'],
        topics: ['audience', 'targeting', 'data', 'segments'],
        createdAt: new Date().toISOString(),
      };

      expect(summary.topics).toContain('audience');
      expect(summary.topics).toContain('segments');
    });
  });

  describe('saveConversationSummary', () => {
    it('should save summary to conversations directory (AC#4)', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveConversationSummary } = await import('./conversations.js');

      await saveConversationSummary({
        channelId: 'C123',
        threadTs: '1702848000.123456',
        summary: 'Test summary',
        participants: ['U123'],
        topics: ['test'],
        createdAt: new Date().toISOString(),
      });

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('conversations'),
        expect.any(String)
      );
    });

    it('should use channel_timestamp as filename', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveConversationSummary } = await import('./conversations.js');

      await saveConversationSummary({
        channelId: 'C456',
        threadTs: '1702848000.999999',
        summary: 'Test',
        participants: [],
        topics: [],
        createdAt: new Date().toISOString(),
      });

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('C456_1702848000.999999'),
        expect.any(String)
      );
    });

    it('should store as markdown with frontmatter', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveConversationSummary } = await import('./conversations.js');

      await saveConversationSummary({
        channelId: 'C123',
        threadTs: '1702848000.123456',
        summary: '# Thread Summary\n\nKey points discussed.',
        participants: ['U123'],
        topics: ['key', 'points'],
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      // Check file path ends in .md
      const writtenPath = vi.mocked(writeFile).mock.calls[0][0] as string;
      expect(writtenPath).toMatch(/\.md$/);
      // Check content has frontmatter
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain('type: conversation');
      expect(writtenContent).toContain('channelId: C123');
    });
  });

  describe('loadConversationSummary', () => {
    it('should load summary by channel and thread', async () => {
      const { readFile } = await import('fs/promises');
      const { loadConversationSummary } = await import('./conversations.js');

      vi.mocked(readFile).mockResolvedValue(`---
type: conversation
channelId: C123
threadTs: "1702848000.123456"
participants:
  - U123
  - U456
topics:
  - project
  - setup
createdAt: 2025-01-01T00:00:00.000Z
---
# Thread Summary

The team discussed project setup and configuration.
`);

      const summary = await loadConversationSummary('C123', '1702848000.123456');

      expect(summary).not.toBeNull();
      expect(summary?.channelId).toBe('C123');
      expect(summary?.threadTs).toBe('1702848000.123456');
      expect(summary?.participants).toContain('U123');
      expect(summary?.topics).toContain('project');
    });

    it('should return null when summary does not exist', async () => {
      const { readFile } = await import('fs/promises');
      const { loadConversationSummary } = await import('./conversations.js');

      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const summary = await loadConversationSummary('C999', '9999999999.999999');

      expect(summary).toBeNull();
    });
  });

  describe('getConversationPath', () => {
    it('should return path with channel and thread', async () => {
      const { getConversationPath } = await import('./conversations.js');

      const path = getConversationPath('C123', '1702848000.123456');

      expect(path).toContain('conversations');
      expect(path).toContain('C123');
      expect(path).toContain('1702848000.123456');
      expect(path).toMatch(/\.md$/);
    });
  });

  describe('listConversationsByChannel', () => {
    it('should list all summaries for a channel', async () => {
      const { readdir, readFile } = await import('fs/promises');
      const { listConversationsByChannel } = await import('./conversations.js');

      vi.mocked(readdir).mockResolvedValue([
        { name: 'C123_1702848000.123456.md', isFile: () => true, parentPath: './orion-context/conversations' },
        { name: 'C123_1702848001.000000.md', isFile: () => true, parentPath: './orion-context/conversations' },
        { name: 'C456_1702848002.000000.md', isFile: () => true, parentPath: './orion-context/conversations' },
      ] as unknown as import('fs').Dirent[]);

      vi.mocked(readFile).mockResolvedValue(`---
type: conversation
channelId: C123
threadTs: "1702848000.123456"
participants: []
topics: []
createdAt: 2025-01-01T00:00:00.000Z
---
Summary content
`);

      const summaries = await listConversationsByChannel('C123');

      // Should only return C123 summaries
      expect(summaries.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array when no summaries exist', async () => {
      const { readdir } = await import('fs/promises');
      const { listConversationsByChannel } = await import('./conversations.js');

      vi.mocked(readdir).mockResolvedValue([]);

      const summaries = await listConversationsByChannel('C999');

      expect(summaries).toEqual([]);
    });
  });

  describe('Vercel KV Backend (Task 11)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv, KV_REST_API_URL: 'https://kv.vercel.com' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should save to Vercel KV when KV_REST_API_URL is set', async () => {
      vi.resetModules();
      const { saveConversationSummary } = await import('./conversations.js');

      await saveConversationSummary({
        channelId: 'C123',
        threadTs: '1702848000.123456',
        summary: 'Test summary',
        participants: ['U123'],
        topics: ['test'],
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      expect(mockSaveToKV).toHaveBeenCalledWith(
        'conversation',
        'C123_1702848000.123456',
        expect.objectContaining({
          channelId: 'C123',
          threadTs: '1702848000.123456',
          summary: 'Test summary',
        })
      );
    });

    it('should load from Vercel KV when KV_REST_API_URL is set', async () => {
      vi.resetModules();

      mockLoadFromKV.mockResolvedValueOnce({
        data: {
          channelId: 'C123',
          threadTs: '1702848000.123456',
          summary: 'KV summary',
          participants: ['U123'],
          topics: ['kv'],
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });

      const { loadConversationSummary } = await import('./conversations.js');
      const summary = await loadConversationSummary('C123', '1702848000.123456');

      expect(mockLoadFromKV).toHaveBeenCalledWith('conversation', 'C123_1702848000.123456');
      expect(summary?.summary).toBe('KV summary');
    });

    it('should list conversations from KV', async () => {
      vi.resetModules();

      mockListKVKeys.mockResolvedValueOnce(['C123_1702848000.123456', 'C123_1702848001.000000']);
      mockLoadFromKV
        .mockResolvedValueOnce({
          data: { channelId: 'C123', threadTs: '1702848000.123456', summary: 'S1', participants: [], topics: [] },
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          data: { channelId: 'C123', threadTs: '1702848001.000000', summary: 'S2', participants: [], topics: [] },
          createdAt: '2025-01-02T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        });

      const { listConversationsByChannel } = await import('./conversations.js');
      const summaries = await listConversationsByChannel('C123');

      expect(mockListKVKeys).toHaveBeenCalledWith('conversation', 'C123_');
      expect(summaries.length).toBe(2);
    });
  });

  describe('File Backend (Local Development)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
      delete process.env.KV_REST_API_URL;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use file backend when KV_REST_API_URL is not set', async () => {
      vi.resetModules();
      const { writeFile } = await import('fs/promises');
      const { saveConversationSummary } = await import('./conversations.js');

      await saveConversationSummary({
        channelId: 'C123',
        threadTs: '1702848000.123456',
        summary: 'Test',
        participants: [],
        topics: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      expect(writeFile).toHaveBeenCalled();
      expect(mockSaveToKV).not.toHaveBeenCalled();
    });
  });
});

