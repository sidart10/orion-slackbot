/**
 * Tests for summarize entry point.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#5 - Handle All Conversation Types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebClient } from '@slack/web-api';
import { summarize } from './summarize.js';

// Mock the sub-modules
vi.mock('./summarize-thread.js', () => ({
  summarizeThread: vi.fn().mockResolvedValue({
    success: true,
    data: { summary: 'Thread summary', messageCount: 5, type: 'thread' },
  }),
}));

vi.mock('./summarize-conversation.js', () => ({
  summarizeConversation: vi.fn().mockResolvedValue({
    success: true,
    data: { summary: 'Channel summary', messageCount: 10, type: 'public_channel' },
  }),
}));

describe('summarize', () => {
  let mockClient: WebClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {} as WebClient;
  });

  describe('AC5: Handle all conversation types - Routing', () => {
    it('routes to thread summarization when thread URL provided', async () => {
      const { summarizeThread } = await import('./summarize-thread.js');

      const result = await summarize({
        userMessage: 'Summarize https://workspace.slack.com/archives/C123ABC/p1735689600123456',
        currentChannelId: 'C999',
        messageTs: '1735689700.000100',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      expect(summarizeThread).toHaveBeenCalledWith({
        client: mockClient,
        channel: 'C123ABC',
        threadTs: '1735689600.123456',
        traceId: 'test-trace',
      });
    });

    it('routes to thread summarization when in thread and asking "summarize this"', async () => {
      const { summarizeThread } = await import('./summarize-thread.js');

      const result = await summarize({
        userMessage: 'summarize this',
        currentChannelId: 'C123',
        currentThreadTs: '1735689500.000001',
        messageTs: '1735689600.000100',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      expect(summarizeThread).toHaveBeenCalledWith({
        client: mockClient,
        channel: 'C123',
        threadTs: '1735689500.000001',
        traceId: 'test-trace',
      });
    });

    it('routes to thread summarization for "tldr"', async () => {
      const { summarizeThread } = await import('./summarize-thread.js');

      await summarize({
        userMessage: 'tldr',
        currentChannelId: 'C123',
        currentThreadTs: '1735689500.000001',
        messageTs: '1735689600.000100',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(summarizeThread).toHaveBeenCalled();
    });

    it('routes to conversation summarization for channel requests', async () => {
      const { summarizeConversation } = await import('./summarize-conversation.js');

      const result = await summarize({
        userMessage: 'Summarize <#C456|sales> for the past week',
        currentChannelId: 'C123',
        messageTs: '1735689600.000100',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(result.success).toBe(true);
      expect(summarizeConversation).toHaveBeenCalledWith({
        userMessage: 'Summarize <#C456|sales> for the past week',
        currentChannelId: 'C123',
        client: mockClient,
        traceId: 'test-trace',
      });
    });

    it('routes to conversation summarization for "summarize this channel"', async () => {
      const { summarizeConversation } = await import('./summarize-conversation.js');

      await summarize({
        userMessage: 'summarize this channel',
        currentChannelId: 'C123',
        messageTs: '1735689600.000100',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(summarizeConversation).toHaveBeenCalled();
    });

    it('does NOT route to thread when user is parent message (not in thread)', async () => {
      const { summarizeConversation } = await import('./summarize-conversation.js');

      await summarize({
        userMessage: 'summarize this',
        currentChannelId: 'C123',
        // currentThreadTs is undefined - not in a thread
        messageTs: '1735689600.000100',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(summarizeConversation).toHaveBeenCalled();
    });
  });

  describe('Thread URL parsing', () => {
    it('parses standard Slack thread URL', async () => {
      const { summarizeThread } = await import('./summarize-thread.js');

      await summarize({
        userMessage: 'Can you summarize https://myworkspace.slack.com/archives/C0123456789/p1234567890123456?',
        currentChannelId: 'C999',
        messageTs: '1735689600.000100',
        client: mockClient,
        traceId: 'test-trace',
      });

      expect(summarizeThread).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C0123456789',
          threadTs: '1234567890.123456',
        })
      );
    });
  });
});

