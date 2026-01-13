/**
 * Tests for Slack Message Permalink Utilities
 *
 * @see Tech-Spec: Source Citations Fix
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getMessagePermalink } from '@/slack/permalinks.js';
import type { WebClient } from '@slack/web-api';

describe('getMessagePermalink', () => {
  let mockClient: { chat: { getPermalink: Mock } };

  beforeEach(() => {
    mockClient = {
      chat: {
        getPermalink: vi.fn(),
      },
    };
  });

  it('returns permalink from Slack API on success', async () => {
    mockClient.chat.getPermalink.mockResolvedValue({
      permalink: 'https://workspace.slack.com/archives/C123/p1234567890',
    });

    const result = await getMessagePermalink(
      mockClient as unknown as WebClient,
      'C123',
      '1234567.890123'
    );

    expect(result).toBe('https://workspace.slack.com/archives/C123/p1234567890');
    expect(mockClient.chat.getPermalink).toHaveBeenCalledWith({
      channel: 'C123',
      message_ts: '1234567.890123',
    });
  });

  it('returns null when API returns no permalink', async () => {
    mockClient.chat.getPermalink.mockResolvedValue({});

    const result = await getMessagePermalink(
      mockClient as unknown as WebClient,
      'C123',
      '1234567.890123'
    );

    expect(result).toBeNull();
  });

  it('falls back to constructed URL on API error', async () => {
    mockClient.chat.getPermalink.mockRejectedValue(new Error('rate_limited'));

    const result = await getMessagePermalink(
      mockClient as unknown as WebClient,
      'C123',
      '1234567.890123'
    );

    // Constructed URL format: https://slack.com/archives/{channel}/p{ts_without_dot}
    expect(result).toBe('https://slack.com/archives/C123/p1234567890123');
  });

  it('handles different timestamp formats in fallback', async () => {
    mockClient.chat.getPermalink.mockRejectedValue(new Error('not_found'));

    const result = await getMessagePermalink(
      mockClient as unknown as WebClient,
      'C456ABC',
      '9999999.999999'
    );

    expect(result).toBe('https://slack.com/archives/C456ABC/p9999999999999');
  });
});

