/**
 * Tests for summarizeConversation function.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#3 - Fetch Conversation History
 * @see AC#5 - Handle All Conversation Types
 * @see AC#8 - Error Handling (MANDATORY)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebClient } from '@slack/web-api';
import { summarizeConversation } from './summarize-conversation.js';

// Mock dependencies
vi.mock('../../slack/conversation-history.js', () => ({
  fetchConversationHistory: vi.fn(),
}));

vi.mock('./generate-summary.js', () => ({
  generateSummary: vi.fn().mockResolvedValue('*Summary*\nMocked summary content.'),
}));

vi.mock('./parse-time-range.js', () => ({
  parseTimeRange: vi.fn().mockReturnValue({
    oldest: new Date('2026-01-01'),
    latest: new Date('2026-01-07'),
    description: 'past 7 days',
  }),
}));

vi.mock('./parse-conversation-target.js', () => ({
  parseConversationTarget: vi.fn().mockReturnValue({
    channelId: 'C123',
    type: 'current',
  }),
}));

vi.mock('../../observability/langfuse.js', () => ({
  getLangfuse: vi.fn().mockReturnValue({
    trace: vi.fn().mockReturnValue({
      span: vi.fn().mockReturnValue({
        end: vi.fn(),
      }),
    }),
  }),
}));

vi.mock('../../slack/permalinks.js', () => ({
  getMessagePermalink: vi.fn().mockResolvedValue('https://slack.com/archives/C123/p123456'),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('summarizeConversation', () => {
  let mockClient: WebClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {} as WebClient;
  });

  describe('AC5: Handle conversation types', () => {
    it('returns summary for public channel', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: [
            { user: 'U123', text: 'Hello', ts: '1735689600.000001', isBot: false },
            { user: 'U456', text: 'Hi there', ts: '1735689600.000002', isBot: false },
          ],
          totalFetched: 2,
          truncated: false,
          channelInfo: {
            name: 'general',
            type: 'public_channel',
            memberCount: 50,
          },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize this channel',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('public_channel');
        expect(result.data.messageCount).toBe(2);
      }
    });

    it('returns summary for private channel', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: [
            { user: 'U123', text: 'Secret', ts: '1735689600.000001', isBot: false },
          ],
          totalFetched: 1,
          truncated: false,
          channelInfo: {
            name: 'secret-team',
            type: 'private_channel',
          },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize this channel',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('private_channel');
      }
    });

    it('returns summary for MPIM (group DM)', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: [
            { user: 'U123', text: 'Group chat', ts: '1735689600.000001', isBot: false },
          ],
          totalFetched: 1,
          truncated: false,
          channelInfo: {
            name: 'mpdm-user1--user2--user3',
            type: 'mpim',
          },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize this chat',
        currentChannelId: 'G123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('mpim');
      }
    });

    it('returns summary for DM (1:1)', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: [
            { user: 'U123', text: 'DM message', ts: '1735689600.000001', isBot: false },
          ],
          totalFetched: 1,
          truncated: false,
          channelInfo: {
            name: 'dm',
            type: 'im',
          },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize our conversation',
        currentChannelId: 'D123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('im');
      }
    });
  });

  describe('AC3: Fetch conversation history', () => {
    it('includes time range in result', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: [{ user: 'U123', text: 'Hello', ts: '1735689600.000001', isBot: false }],
          totalFetched: 1,
          truncated: false,
          channelInfo: { name: 'general', type: 'public_channel' },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize past week',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeRange?.description).toBe('past 7 days');
      }
    });

    it('sets truncated flag when messages capped', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: Array(500).fill({ user: 'U123', text: 'Msg', ts: '123.456', isBot: false }),
          totalFetched: 500,
          truncated: true,
          channelInfo: { name: 'busy', type: 'public_channel' },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize this channel',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.truncated).toBe(true);
      }
    });

    it('returns helpful message for empty conversation', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: [],
          totalFetched: 0,
          truncated: false,
          channelInfo: { name: 'quiet', type: 'public_channel' },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize this channel',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messageCount).toBe(0);
        expect(result.data.summary).toContain('No messages found');
      }
    });
  });

  describe('AC8: Error handling', () => {
    it('propagates error from fetchConversationHistory', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: "I couldn't find that channel. It may have been deleted.",
          retryable: false,
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize #deleted-channel',
        currentChannelId: 'CINVALID',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("couldn't find that channel");
      }
    });

    it('returns error for unresolved target', async () => {
      const { parseConversationTarget } = await import('./parse-conversation-target.js');
      vi.mocked(parseConversationTarget).mockReturnValue({
        channelId: '', // Empty - unresolved
        channelName: 'John Doe',
        type: 'im',
      });

      const result = await summarizeConversation({
        userMessage: 'summarize my DM with John',
        currentChannelId: '',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("couldn't determine which conversation");
      }
    });
  });

  describe('Participant tracking', () => {
    it('extracts unique participants from messages', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages: [
            { user: 'U123', text: 'Hello', ts: '1735689600.000001', isBot: false },
            { user: 'U456', text: 'Hi', ts: '1735689600.000002', isBot: false },
            { user: 'U123', text: 'Thanks', ts: '1735689600.000003', isBot: false },
            { user: 'U789', text: 'Bye', ts: '1735689600.000004', isBot: false },
          ],
          totalFetched: 4,
          truncated: false,
          channelInfo: { name: 'general', type: 'public_channel' },
        },
      });

      const result = await summarizeConversation({
        userMessage: 'summarize this channel',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.participants).toEqual(['U123', 'U456', 'U789']);
      }
    });
  });

  describe('Permalink limiting', () => {
    it('limits permalink fetching to 15 messages', async () => {
      const { fetchConversationHistory } = await import('../../slack/conversation-history.js');
      const { getMessagePermalink } = await import('../../slack/permalinks.js');

      // Create 50 messages
      const messages = Array.from({ length: 50 }, (_, i) => ({
        user: `U${i}`,
        text: `Message ${i}`,
        ts: `1735689600.${String(i).padStart(6, '0')}`,
        isBot: false,
      }));

      vi.mocked(fetchConversationHistory).mockResolvedValue({
        success: true,
        data: {
          messages,
          totalFetched: 50,
          truncated: false,
          channelInfo: { name: 'busy', type: 'public_channel' },
        },
      });

      await summarizeConversation({
        userMessage: 'summarize this channel',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });

      // Should only call getMessagePermalink 15 times (limit)
      expect(getMessagePermalink).toHaveBeenCalledTimes(15);
    });
  });
});

