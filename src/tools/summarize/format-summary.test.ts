/**
 * Tests for formatSummaryResponse.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see Story 7.8 - Enhanced Slack UI Polish (AC5 - uses formatting constants)
 * @see AC#6 - Format Response per UX Spec
 *
 * Note: Per Story 7.8, status emojis are intentionally empty for professional appearance.
 * Tests validate content structure, not emoji presence.
 */

import { describe, it, expect } from 'vitest';
import { formatSummaryResponse } from './format-summary.js';
import type { SummaryResult } from './summarize-types.js';

describe('formatSummaryResponse', () => {
  describe('AC6: Format response per UX spec', () => {
    it('formats channel summary with message count and time range', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nThis is the summary content.',
        messageCount: 42,
        type: 'public_channel',
        timeRange: {
          oldest: new Date('2026-01-01'),
          latest: new Date('2026-01-07'),
          description: 'past 7 days',
        },
      };

      const formatted = formatSummaryResponse(result);

      // Per Story 7.8: No emoji prefix - professional appearance
      expect(formatted).toContain('Summarized *42* messages');
      expect(formatted).toContain('#conversation');
      expect(formatted).toContain('past 7 days');
      expect(formatted).toContain('*Summary*');
      expect(formatted).toContain('Need more detail on a specific topic?');
    });

    it('formats thread summary with correct emoji', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nThread discussion.',
        messageCount: 15,
        type: 'thread',
        timeRange: {
          oldest: new Date(),
          latest: new Date(),
          description: 'all replies',
        },
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).toContain('🧵');
      expect(formatted).toContain('thread');
    });

    it('formats MPIM summary with correct emoji', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nGroup chat.',
        messageCount: 8,
        type: 'mpim',
        timeRange: {
          oldest: new Date(),
          latest: new Date(),
          description: 'today',
        },
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).toContain('👥');
    });

    it('formats IM summary with correct emoji', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nDirect message.',
        messageCount: 5,
        type: 'im',
        timeRange: {
          oldest: new Date(),
          latest: new Date(),
          description: 'past 24 hours',
        },
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).toContain('💬');
    });

    it('shows truncation warning when messages capped', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nLarge conversation.',
        messageCount: 500,
        type: 'public_channel',
        truncated: true,
        timeRange: {
          oldest: new Date(),
          latest: new Date(),
          description: 'past month',
        },
      };

      const formatted = formatSummaryResponse(result);

      // Per Story 7.8: No emoji for warning - text conveys message
      expect(formatted).toContain('500 messages');
      expect(formatted).toContain('Showing summary of first 500 messages');
    });

    it('does not show truncation warning when not truncated', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nNormal conversation.',
        messageCount: 50,
        type: 'public_channel',
        truncated: false,
      };

      const formatted = formatSummaryResponse(result);

      // Per Story 7.8: No truncation message when not truncated
      expect(formatted).not.toContain('Showing summary of first');
    });

    it('includes drill-down prompt', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nContent.',
        messageCount: 10,
        type: 'channel',
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).toContain('Need more detail on a specific topic?');
    });

    it('includes source link when sourceUrl is provided', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nContent.',
        messageCount: 10,
        type: 'channel',
        sourceUrl: 'https://example.slack.com/archives/C123/p1234',
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).toContain('View conversation');
      expect(formatted).toContain('https://example.slack.com');
    });

    it('uses thread link label for thread type', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nContent.',
        messageCount: 10,
        type: 'thread',
        sourceUrl: 'https://example.slack.com/archives/C123/p1234',
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).toContain('View thread');
    });
  });

  // Story 7.8: Enhanced Slack UI Polish
  describe('Story 7.8: Enhanced formatting', () => {
    it('header uses Slack mrkdwn bold format not markdown', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nContent.',
        messageCount: 10,
        type: 'channel',
      };

      const formatted = formatSummaryResponse(result);

      // Should use *bold* (Slack mrkdwn), NOT **bold** (markdown)
      expect(formatted).toContain('*10*'); // Message count uses mrkdwn bold
      expect(formatted).not.toMatch(/\*\*\d+\*\*/); // NOT markdown bold
    });

    it('does not use markdown ## headers', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nContent.',
        messageCount: 10,
        type: 'channel',
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).not.toContain('## ');
      expect(formatted).not.toContain('### ');
    });

    it('status indicators use empty strings for professional appearance', () => {
      // Per Story 7.8 AC2: STATUS_EMOJI values are empty for professional UI
      // This test verifies the header is clean without emoji prefixes
      const result: SummaryResult = {
        summary: '*Summary*\nContent.',
        messageCount: 10,
        type: 'channel',
      };

      const formatted = formatSummaryResponse(result);

      // Header should NOT start with emoji - clean professional format
      // STATUS_EMOJI.searching is empty string by design
      expect(formatted).toMatch(/^Summarized \*\d+\* messages/);
      // Verify no emoji at start of response
      const firstChar = formatted.charAt(0);
      expect(firstChar).toBe('S'); // Starts with "Summarized", not an emoji
    });
  });
});

