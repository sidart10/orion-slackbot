/**
 * Tests for fetchConversationHistory.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#3 - Fetch Conversation History
 * @see AC#8 - Error Handling (MANDATORY)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebClient } from '@slack/web-api';
import { fetchConversationHistory } from '@/slack/conversation-history.js';

describe('fetchConversationHistory', () => {
  let mockClient: WebClient;

  beforeEach(() => {
    mockClient = {
      conversations: {
        info: vi.fn(),
        history: vi.fn(),
      },
    } as unknown as WebClient;
  });

  describe('AC3: Fetch conversation history with pagination', () => {
    it('fetches messages within time range', async () => {
      const oldest = new Date('2026-01-01T00:00:00.000Z');
      const latest = new Date('2026-01-02T00:00:00.000Z');

      vi.mocked(mockClient.conversations.info).mockResolvedValue({
        ok: true,
        channel: {
          id: 'C123',
          name: 'general',
          is_private: false,
          is_mpim: false,
          is_im: false,
        },
      });

      vi.mocked(mockClient.conversations.history).mockResolvedValue({
        ok: true,
        messages: [
          { user: 'U1', text: 'Hello', ts: '1735689600.000100' },
          { user: 'U2', text: 'Hi there', ts: '1735689700.000200' },
        ],
        response_metadata: { next_cursor: '' },
      });

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'C123',
        oldest,
        latest,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messages.length).toBe(2);
        expect(result.data.channelInfo.name).toBe('general');
        expect(result.data.channelInfo.type).toBe('public_channel');
      }
    });

    it('handles pagination for large conversations', async () => {
      const oldest = new Date('2026-01-01T00:00:00.000Z');
      const latest = new Date('2026-01-02T00:00:00.000Z');

      vi.mocked(mockClient.conversations.info).mockResolvedValue({
        ok: true,
        channel: { id: 'C123', name: 'busy-channel' },
      });

      // First page
      vi.mocked(mockClient.conversations.history)
        .mockResolvedValueOnce({
          ok: true,
          messages: [
            { user: 'U1', text: 'Message 1', ts: '1735689600.000100' },
            { user: 'U2', text: 'Message 2', ts: '1735689600.000200' },
          ],
          response_metadata: { next_cursor: 'cursor_page_2' },
        })
        // Second page
        .mockResolvedValueOnce({
          ok: true,
          messages: [
            { user: 'U3', text: 'Message 3', ts: '1735689600.000300' },
          ],
          response_metadata: { next_cursor: '' },
        });

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'C123',
        oldest,
        latest,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messages.length).toBe(3);
        expect(result.data.truncated).toBe(false);
      }
      expect(mockClient.conversations.history).toHaveBeenCalledTimes(2);
    });

    it('caps at maxMessages and marks truncated', async () => {
      const oldest = new Date('2026-01-01T00:00:00.000Z');
      const latest = new Date('2026-01-02T00:00:00.000Z');

      vi.mocked(mockClient.conversations.info).mockResolvedValue({
        ok: true,
        channel: { id: 'C123', name: 'general' },
      });

      // Return more messages than maxMessages
      const manyMessages = Array.from({ length: 10 }, (_, i) => ({
        user: `U${i}`,
        text: `Message ${i}`,
        ts: `1735689600.00${String(i).padStart(4, '0')}`,
      }));

      vi.mocked(mockClient.conversations.history).mockResolvedValue({
        ok: true,
        messages: manyMessages,
        response_metadata: { next_cursor: 'more' },
      });

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'C123',
        oldest,
        latest,
        maxMessages: 5,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messages.length).toBe(5);
        expect(result.data.truncated).toBe(true);
      }
    });

    it('detects channel type correctly', async () => {
      const oldest = new Date('2026-01-01T00:00:00.000Z');
      const latest = new Date('2026-01-02T00:00:00.000Z');

      // Test MPIM detection
      vi.mocked(mockClient.conversations.info).mockResolvedValue({
        ok: true,
        channel: { id: 'G123', name: 'group-dm', is_mpim: true },
      });

      vi.mocked(mockClient.conversations.history).mockResolvedValue({
        ok: true,
        messages: [{ user: 'U1', text: 'Hi', ts: '1735689600.000100' }],
      });

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'G123',
        oldest,
        latest,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.channelInfo.type).toBe('mpim');
      }
    });

    it('sorts messages by timestamp (oldest first)', async () => {
      const oldest = new Date('2026-01-01T00:00:00.000Z');
      const latest = new Date('2026-01-02T00:00:00.000Z');

      vi.mocked(mockClient.conversations.info).mockResolvedValue({
        ok: true,
        channel: { id: 'C123', name: 'general' },
      });

      // Messages returned in reverse order (Slack default)
      vi.mocked(mockClient.conversations.history).mockResolvedValue({
        ok: true,
        messages: [
          { user: 'U1', text: 'Later', ts: '1735689700.000200' },
          { user: 'U2', text: 'Earlier', ts: '1735689600.000100' },
        ],
      });

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'C123',
        oldest,
        latest,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messages[0].text).toBe('Earlier');
        expect(result.data.messages[1].text).toBe('Later');
      }
    });
  });

  describe('AC8: Error handling', () => {
    it('returns error for channel_not_found', async () => {
      vi.mocked(mockClient.conversations.info).mockRejectedValue(
        new Error('channel_not_found')
      );

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'CINVALID',
        oldest: new Date(),
        latest: new Date(),
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain("couldn't find");
        expect(result.error.retryable).toBe(false);
      }
    });

    it('returns error for not_in_channel', async () => {
      vi.mocked(mockClient.conversations.info).mockRejectedValue(
        new Error('not_in_channel')
      );

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'CPRIVATE',
        oldest: new Date(),
        latest: new Date(),
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('/invite');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('returns error for missing_scope', async () => {
      vi.mocked(mockClient.conversations.info).mockRejectedValue(
        new Error('missing_scope')
      );

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'CNOSCOPE',
        oldest: new Date(),
        latest: new Date(),
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('permission');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('returns generic error for unknown failures', async () => {
      vi.mocked(mockClient.conversations.info).mockRejectedValue(
        new Error('something_went_wrong')
      );

      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'C123',
        oldest: new Date(),
        latest: new Date(),
        traceId: 'test-trace',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(true);
      }
    });

    it('never throws - always returns ToolResult', async () => {
      vi.mocked(mockClient.conversations.info).mockRejectedValue(
        new Error('Unexpected error')
      );

      // Should not throw
      const result = await fetchConversationHistory({
        client: mockClient,
        channel: 'C123',
        oldest: new Date(),
        latest: new Date(),
        traceId: 'test-trace',
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
    });
  });
});

