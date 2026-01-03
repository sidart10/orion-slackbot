/**
 * Tests for Source Builder
 *
 * @see Tech-Spec: Source Citations Fix
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { buildThreadSources, filterClickableSources } from './source-builder.js';
import type { WebClient } from '@slack/web-api';
import type { ThreadMessage } from './thread-context.js';
import type { ContextSource } from '../agent/gather.js';

// Mock the permalinks and identity modules
vi.mock('./permalinks.js', () => ({
  getMessagePermalink: vi.fn(),
}));

vi.mock('./identity.js', () => ({
  getUserDisplayName: vi.fn(),
}));

import { getMessagePermalink } from './permalinks.js';
import { getUserDisplayName } from './identity.js';

describe('buildThreadSources', () => {
  let mockClient: { chat: { getPermalink: Mock } };
  const mockGetPermalink = getMessagePermalink as Mock;
  const mockGetUserDisplayName = getUserDisplayName as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      chat: {
        getPermalink: vi.fn(),
      },
    };
    // Default: return a display name based on userId (e.g., U001 -> "Sid")
    mockGetUserDisplayName.mockImplementation(async (_client, userId) => {
      if (userId === 'U001') return 'Sid';
      return userId; // Fallback to userId for others
    });
  });

  it('returns empty array for empty messages', async () => {
    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages: [],
    });

    expect(result).toEqual([]);
  });

  it('returns empty for single user message (current question only)', async () => {
    mockGetPermalink.mockResolvedValue('https://slack.com/archives/C123/p1234');

    const messages: ThreadMessage[] = [
      {
        user: 'U001',
        text: 'Hello, can you help me?',
        ts: '1234.5678',
        isBot: false,
        channelId: 'C123',
        userName: 'Sid',
      },
    ];

    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages,
    });

    // Single message is the "current question" - excluded from sources
    expect(result).toHaveLength(0);
  });

  it('builds sources for history messages (excludes current question)', async () => {
    mockGetPermalink.mockResolvedValue('https://slack.com/archives/C123/p1234');

    const messages: ThreadMessage[] = [
      {
        user: 'U001',
        text: 'Previous context message',
        ts: '1234.5677',
        isBot: false,
        channelId: 'C123',
        userName: 'Sid',
      },
      {
        user: 'U001',
        text: 'Hello, can you help me?', // Current question - will be excluded
        ts: '1234.5678',
        isBot: false,
        channelId: 'C123',
        userName: 'Sid',
      },
    ];

    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages,
    });

    // Only the history message should be included
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'thread',
      title: 'Sid: "Previous context message"',
      reference: 'C123/1234.5677',
      url: 'https://slack.com/archives/C123/p1234',
      excerpt: 'Previous context message',
    });
  });

  it('skips bot messages and current question', async () => {
    mockGetPermalink.mockResolvedValue('https://slack.com/archives/C123/p1234');

    const messages: ThreadMessage[] = [
      {
        user: 'U001',
        text: 'Earlier user message',
        ts: '1234.5677',
        isBot: false,
        channelId: 'C123',
        userName: 'Sid',
      },
      {
        user: 'B001',
        text: 'Bot response',
        ts: '1234.5678',
        isBot: true,
        channelId: 'C123',
      },
      {
        user: 'U001',
        text: 'Current question',
        ts: '1234.5679',
        isBot: false,
        channelId: 'C123',
        userName: 'Sid',
      },
    ];

    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages,
    });

    // Only earlier user message should be included (bot skipped, current question excluded)
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toContain('Earlier user message');
  });

  it('falls back to "User" when user name lookup fails', async () => {
    mockGetPermalink.mockResolvedValue('https://slack.com/archives/C123/p1234');
    // Mock getUserDisplayName to throw for this test
    mockGetUserDisplayName.mockRejectedValue(new Error('user_not_found'));

    const messages: ThreadMessage[] = [
      {
        user: 'U998',
        text: 'Earlier message',
        ts: '1234.5677',
        isBot: false,
        channelId: 'C123',
      },
      {
        user: 'U999',
        text: 'Current question',
        ts: '1234.5678',
        isBot: false,
        channelId: 'C123',
      },
    ];

    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages,
    });

    // When getUserDisplayName throws, should fallback to 'User'
    expect(result[0]?.title).toBe('User: "Earlier message"');
  });

  it('truncates long message text in title', async () => {
    mockGetPermalink.mockResolvedValue('https://slack.com/archives/C123/p1234');

    const longText = 'A'.repeat(100);
    const messages: ThreadMessage[] = [
      {
        user: 'U001',
        text: longText,
        ts: '1234.5677',
        isBot: false,
        channelId: 'C123',
        userName: 'Sid',
      },
      {
        user: 'U001',
        text: 'Current question',
        ts: '1234.5678',
        isBot: false,
        channelId: 'C123',
        userName: 'Sid',
      },
    ];

    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages,
    });

    // Title should be truncated to 50 chars + ellipsis
    expect(result[0]?.title).toBe(`Sid: "${'A'.repeat(50)}…"`);
    // Excerpt should include more (up to 200 chars)
    expect(result[0]?.excerpt).toBe('A'.repeat(100));
  });

  it('skips messages where permalink fails (returns null)', async () => {
    mockGetPermalink
      .mockResolvedValueOnce('https://slack.com/archives/C123/p1')
      .mockResolvedValueOnce(null) // This one fails
      .mockResolvedValueOnce('https://slack.com/archives/C123/p3');

    // 4 messages: first 3 are history, 4th is current question
    const messages: ThreadMessage[] = [
      { user: 'U1', text: 'First', ts: '1.0', isBot: false },
      { user: 'U2', text: 'Second', ts: '2.0', isBot: false },
      { user: 'U3', text: 'Third', ts: '3.0', isBot: false },
      { user: 'U4', text: 'Current question', ts: '4.0', isBot: false },
    ];

    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages,
    });

    // Only 2 sources from history (First and Third) - Second had null permalink
    expect(result).toHaveLength(2);
    expect(result[0]?.title).toContain('First');
    expect(result[1]?.title).toContain('Third');
  });

  it('respects maxSources limit (excluding current question)', async () => {
    mockGetPermalink.mockResolvedValue('https://slack.com/archives/C123/p');

    // 10 messages: 0-8 are history, 9 is "current question"
    const messages: ThreadMessage[] = Array.from({ length: 10 }, (_, i) => ({
      user: `U${i}`,
      text: `Message ${i}`,
      ts: `${i}.0`,
      isBot: false,
    }));

    const result = await buildThreadSources({
      client: mockClient as unknown as WebClient,
      channel: 'C123',
      threadTs: '123.456',
      messages,
      maxSources: 3,
    });

    // Should only take most recent 3 from history (0-8), so 6, 7, 8
    // Message 9 is excluded as "current question"
    expect(result).toHaveLength(3);
    expect(result[0]?.title).toContain('Message 6');
    expect(result[1]?.title).toContain('Message 7');
    expect(result[2]?.title).toContain('Message 8');
  });
});

describe('filterClickableSources', () => {
  it('returns empty array for empty input', () => {
    const result = filterClickableSources([]);
    expect(result).toEqual([]);
  });

  it('filters out thread/file sources without URLs', () => {
    const sources: ContextSource[] = [
      { type: 'thread', title: 'With URL', reference: 'ref1', url: 'https://example.com' },
      { type: 'thread', title: 'No URL', reference: 'ref2' },
      { type: 'file', title: 'File source', reference: 'ref3' },
    ];

    const result = filterClickableSources(sources);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('With URL');
  });

  it('allows memory sources without URLs', () => {
    const sources: ContextSource[] = [
      { type: 'memory', title: 'Your preferences', reference: 'prefs.yaml' },
      { type: 'thread', title: 'No URL thread', reference: 'ref1' },
    ];

    const result = filterClickableSources(sources);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('memory');
  });

  it('allows tool sources without URLs (user wants to see what was called)', () => {
    const sources: ContextSource[] = [
      { type: 'tool', title: 'Tool: MSCI Reports: Search Reports', reference: 'msci-reports__search_reports' },
      { type: 'tool', title: 'Tool: Rube: Execute Recipe', reference: 'rube__execute_recipe' },
      { type: 'thread', title: 'No URL thread', reference: 'ref1' },
    ];

    const result = filterClickableSources(sources);

    // Both tool sources should be included (no URL required)
    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe('tool');
    expect(result[1]?.type).toBe('tool');
  });

  // Source Citations v2: Tool sources WITH URLs should be filtered out
  // (Claude cites URLs inline in response)
  it('filters out tool sources WITH URLs (v2 fix)', () => {
    const sources: ContextSource[] = [
      { type: 'tool', title: 'Exa Result', reference: 'exa', url: 'https://example.com' }, // Should be filtered
      { type: 'tool', title: 'Audience Manager', reference: 'audience-manager' }, // Should pass (no URL)
    ];

    const result = filterClickableSources(sources);

    // Only tool source WITHOUT URL should pass
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Audience Manager');
  });

  it('keeps thread/file sources with URLs but not tool sources with URLs', () => {
    const sources: ContextSource[] = [
      { type: 'thread', title: 'Thread', reference: 'r1', url: 'https://slack.com/1' },
      { type: 'tool', title: 'Tool with URL', reference: 'r2', url: 'https://docs.com/page' }, // Filtered out (v2)
      { type: 'file', title: 'File', reference: 'r3', url: 'https://confluence.com/doc' },
      { type: 'memory', title: 'Memory', reference: 'r4' }, // No URL but memory type
    ];

    const result = filterClickableSources(sources);

    // Tool with URL should be filtered out
    expect(result).toHaveLength(3);
    expect(result.map(s => s.type)).toEqual(['thread', 'file', 'memory']);
  });
});

