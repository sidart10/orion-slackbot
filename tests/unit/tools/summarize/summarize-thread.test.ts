/**
 * Tests for summarizeThread function.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#5 - Handle All Conversation Types (threads)
 * @see AC#8 - Error Handling (MANDATORY)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebClient } from '@slack/web-api';
import { summarizeThread } from '@/tools/summarize/summarize-thread.js';

// Mock dependencies
vi.mock('@/slack/thread-context.js', () => ({
  fetchThreadHistory: vi.fn(),
}));

vi.mock('@/tools/summarize/generate-summary.js', () => ({
  generateSummary: vi.fn().mockResolvedValue('*Summary*\nMocked summary content.'),
}));

vi.mock('@/observability/langfuse.js', () => ({
  getLangfuse: vi.fn().mockReturnValue({
    trace: vi.fn().mockReturnValue({
      span: vi.fn().mockReturnValue({
        end: vi.fn(),
      }),
    }),
  }),
}));

vi.mock('@/slack/permalinks.js', () => ({
  getMessagePermalink: vi.fn().mockResolvedValue('https://slack.com/archives/C123/p123456'),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('summarizeThread', () => {
  let mockClient: WebClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {} as WebClient;
  });

  describe('AC5: Handle thread summarization', () => {
    it('returns summary for thread with messages', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockResolvedValue([
        { user: 'U123', text: 'Hello', ts: '1735689600.000001', isBot: false },
        { user: 'U456', text: 'Hi there', ts: '1735689600.000002', isBot: false },
      ]);

      const result = await summarizeThread({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('thread');
        expect(result.data.messageCount).toBe(2);
        expect(result.data.summary).toContain('Summary');
      }
    });

    it('returns empty summary for thread with no messages', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockResolvedValue([]);

      const result = await summarizeThread({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messageCount).toBe(0);
        expect(result.data.summary).toContain('no messages');
      }
    });

    it('includes participants in result', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockResolvedValue([
        { user: 'U123', text: 'Hello', ts: '1735689600.000001', isBot: false },
        { user: 'U456', text: 'Hi there', ts: '1735689600.000002', isBot: false },
        { user: 'U123', text: 'Thanks', ts: '1735689600.000003', isBot: false },
      ]);

      const result = await summarizeThread({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.participants).toEqual(['U123', 'U456']);
      }
    });

    it('identifies bot messages correctly', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      const { generateSummary } = await import('@/tools/summarize/generate-summary.js');

      vi.mocked(fetchThreadHistory).mockResolvedValue([
        { user: 'U123', text: 'Hello', ts: '1735689600.000001', isBot: false },
        { user: 'BBOT', text: 'Bot response', ts: '1735689600.000002', isBot: true },
      ]);

      await summarizeThread({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      // Verify generateSummary was called with formatted messages
      expect(generateSummary).toHaveBeenCalled();
      const formattedMessages = vi.mocked(generateSummary).mock.calls[0][0];
      expect(formattedMessages).toContain('[U123]');
      expect(formattedMessages).toContain('[Orion]'); // Bot should be labeled as Orion
    });
  });

  describe('AC8: Error handling', () => {
    it('returns error for channel_not_found', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockRejectedValue(new Error('channel_not_found'));

      const result = await summarizeThread({
        client: mockClient,
        channel: 'CINVALID',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("couldn't find that thread");
        expect(result.error.retryable).toBe(false);
      }
    });

    it('returns error for not_in_channel', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockRejectedValue(new Error('not_in_channel'));

      const result = await summarizeThread({
        client: mockClient,
        channel: 'CPRIVATE',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("don't have access");
        expect(result.error.message).toContain('/invite @Orion');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('returns error for missing_scope', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockRejectedValue(new Error('missing_scope'));

      const result = await summarizeThread({
        client: mockClient,
        channel: 'CNOSCOPE',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("don't have permission");
        expect(result.error.message).toContain('admin');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('returns generic error for unknown failures', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockRejectedValue(new Error('something_unexpected'));

      const result = await summarizeThread({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Failed to summarize thread');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('never throws - always returns ToolResult', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      vi.mocked(fetchThreadHistory).mockRejectedValue(new Error('Unexpected error'));

      // Should not throw
      const result = await summarizeThread({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });

  describe('Permalink limiting', () => {
    it('limits permalink fetching to 25 messages for large threads', async () => {
      const { fetchThreadHistory } = await import('@/slack/thread-context.js');
      const { getMessagePermalink } = await import('@/slack/permalinks.js');

      // Create 50 messages
      const messages = Array.from({ length: 50 }, (_, i) => ({
        user: `U${i}`,
        text: `Message ${i}`,
        ts: `1735689600.${String(i).padStart(6, '0')}`,
        isBot: false,
      }));
      vi.mocked(fetchThreadHistory).mockResolvedValue(messages);

      await summarizeThread({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });

      // Should only call getMessagePermalink 25 times (limit)
      expect(getMessagePermalink).toHaveBeenCalledTimes(25);
    });
  });
});

