/**
 * Tests for Thread Context Utilities
 *
 * Verifies:
 * - AC#4 - Thread history fetched from Slack API
 * - AR29 - Slack API fetch for thread context (stateless Cloud Run)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebClient } from '@slack/web-api';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Thread Context Utilities', () => {
  let fetchThreadHistory: typeof import('./thread-context.js').fetchThreadHistory;
  let formatThreadHistoryForContext: typeof import('./thread-context.js').formatThreadHistoryForContext;
  let mockClient: { conversations: { replies: ReturnType<typeof vi.fn> } };
  let logger: { error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();

    const loggerModule = await import('../utils/logger.js');
    logger = loggerModule.logger as unknown as {
      error: ReturnType<typeof vi.fn>;
    };

    const module = await import('./thread-context.js');
    fetchThreadHistory = module.fetchThreadHistory;
    formatThreadHistoryForContext = module.formatThreadHistoryForContext;

    mockClient = {
      conversations: {
        replies: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchThreadHistory', () => {
    it('should fetch thread history from Slack API (AC#4)', async () => {
      mockClient.conversations.replies.mockResolvedValue({
        messages: [
          { user: 'U111', text: 'Hello', ts: '1.1', bot_id: undefined },
          { user: 'U222', text: 'World', ts: '1.2', bot_id: undefined },
          { user: 'U111', text: 'Current', ts: '1.3', bot_id: undefined },
        ],
      });

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
        limit: 20,
      });

      expect(mockClient.conversations.replies).toHaveBeenCalledWith({
        channel: 'C123',
        ts: '1.1',
        limit: 20,
        inclusive: true,
      });

      // Should exclude the last message (current message)
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hello');
      expect(result[1].text).toBe('World');
    });

    it('should handle empty thread', async () => {
      mockClient.conversations.replies.mockResolvedValue({
        messages: [],
      });

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
      });

      expect(result).toEqual([]);
    });

    it('should handle missing messages in response', async () => {
      mockClient.conversations.replies.mockResolvedValue({});

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
      });

      expect(result).toEqual([]);
    });

    it('should identify bot messages', async () => {
      mockClient.conversations.replies.mockResolvedValue({
        messages: [
          { user: 'U111', text: 'User msg', ts: '1.1' },
          { user: 'B222', text: 'Bot msg', ts: '1.2', bot_id: 'B222' },
          { user: 'U111', text: 'Current', ts: '1.3' },
        ],
      });

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
      });

      expect(result[0].isBot).toBe(false);
      expect(result[1].isBot).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      mockClient.conversations.replies.mockRejectedValue(
        new Error('API Error')
      );

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
      });

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'fetch_thread_history_failed',
          error: 'API Error',
        })
      );
    });

    it('should use default limit of 100', async () => {
      mockClient.conversations.replies.mockResolvedValue({ messages: [] });

      await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
      });

      expect(mockClient.conversations.replies).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        })
      );
    });

    it('should paginate through multiple pages', async () => {
      // First call returns messages with cursor
      mockClient.conversations.replies
        .mockResolvedValueOnce({
          messages: [
            { user: 'U1', text: 'Page 1 msg 1', ts: '1.1' },
            { user: 'U1', text: 'Page 1 msg 2', ts: '1.2' },
          ],
          response_metadata: { next_cursor: 'cursor123' },
        })
        // Second call returns more messages without cursor
        .mockResolvedValueOnce({
          messages: [
            { user: 'U1', text: 'Page 2 msg 1', ts: '1.3' },
            { user: 'U1', text: 'Current', ts: '1.4' },
          ],
        });

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
      });

      // Should have called API twice (pagination)
      expect(mockClient.conversations.replies).toHaveBeenCalledTimes(2);
      expect(mockClient.conversations.replies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cursor: 'cursor123',
        })
      );

      // Should have all messages except last (current message)
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Page 1 msg 1');
      expect(result[2].text).toBe('Page 2 msg 1');
    });

    it('should stop when token limit is reached', async () => {
      // Create a message that's very long (forces budget trimming)
      const longText = 'x'.repeat(20000); // 20k chars

      mockClient.conversations.replies.mockResolvedValue({
        messages: [
          { user: 'U1', text: 'Old msg', ts: '1.1' },
          { user: 'U1', text: longText, ts: '1.2' },
          { user: 'U1', text: 'Recent msg', ts: '1.3' },
          { user: 'U1', text: 'Current', ts: '1.4' },
        ],
      });

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
        maxTokens: 100, // ~400 chars
        keepLastN: 50,
      });

      // Should retain recent context within budget and exclude the current message.
      expect(result.map((m) => m.text)).toEqual(['Recent msg']);
    });

    it('should keep only the most recent N messages (excluding current)', async () => {
      mockClient.conversations.replies.mockResolvedValue({
        messages: [
          { user: 'U1', text: 'm1', ts: '1.1' },
          { user: 'U1', text: 'm2', ts: '1.2' },
          { user: 'U1', text: 'm3', ts: '1.3' },
          { user: 'U1', text: 'm4', ts: '1.4' },
          { user: 'U1', text: 'm5', ts: '1.5' },
          { user: 'U1', text: 'current', ts: '1.6' },
        ],
      });

      const result = await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
        keepLastN: 3,
      });

      // keepLastN=3 means [m4,m5,current] retained, then exclude current → [m4,m5]
      expect(result.map((m) => m.text)).toEqual(['m4', 'm5']);
    });

    it('should respect custom maxTokens parameter', async () => {
      mockClient.conversations.replies.mockResolvedValue({
        messages: [
          { user: 'U1', text: 'Hello', ts: '1.1' },
          { user: 'U1', text: 'Current', ts: '1.2' },
        ],
      });

      await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
        maxTokens: 8000,
      });

      // Should complete without hitting limit
      expect(mockClient.conversations.replies).toHaveBeenCalledTimes(1);
    });

    it('should include traceId in logs when provided', async () => {
      const loggerModule = await import('../utils/logger.js');
      const mockLogger = loggerModule.logger as unknown as {
        info: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
      };

      mockClient.conversations.replies.mockResolvedValue({
        messages: [
          { user: 'U1', text: 'Hello', ts: '1.1' },
          { user: 'U1', text: 'Current', ts: '1.2' },
        ],
      });

      await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
        traceId: 'trace-abc-123',
      });

      // Verify traceId is included in any info logs
      const infoCalls = mockLogger.info.mock.calls;
      if (infoCalls.length > 0) {
        expect(infoCalls.some((call: unknown[]) => 
          (call[0] as { traceId?: string }).traceId === 'trace-abc-123'
        )).toBe(true);
      }
    });

    it('should include traceId in error logs when API fails', async () => {
      mockClient.conversations.replies.mockRejectedValue(
        new Error('API Error')
      );

      await fetchThreadHistory({
        client: mockClient as unknown as WebClient,
        channel: 'C123',
        threadTs: '1.1',
        traceId: 'trace-error-456',
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'fetch_thread_history_failed',
          traceId: 'trace-error-456',
        })
      );
    });
  });

  describe('formatThreadHistoryForContext', () => {
    it('should format messages for LLM context', () => {
      const messages = [
        { user: 'U111', text: 'Hello', ts: '1.1', isBot: false },
        { user: 'B222', text: 'Hi there', ts: '1.2', isBot: true },
        { user: 'U111', text: 'How are you?', ts: '1.3', isBot: false },
      ];

      const result = formatThreadHistoryForContext(messages);

      expect(result).toContain('User: Hello');
      expect(result).toContain('Orion: Hi there');
      expect(result).toContain('User: How are you?');
    });

    it('should handle empty messages array', () => {
      const result = formatThreadHistoryForContext([]);

      expect(result).toBe('No previous messages in this thread.');
    });

    it('should separate messages with double newlines', () => {
      const messages = [
        { user: 'U111', text: 'First', ts: '1.1', isBot: false },
        { user: 'U222', text: 'Second', ts: '1.2', isBot: false },
      ];

      const result = formatThreadHistoryForContext(messages);

      expect(result).toBe('User: First\n\nUser: Second');
    });
  });
});

