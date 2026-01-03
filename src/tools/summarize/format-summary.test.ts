/**
 * Tests for formatSummaryResponse.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#6 - Format Response per UX Spec
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

      expect(formatted).toContain('🔍 Summarized *42* messages');
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

      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('500 messages');
    });

    it('does not show truncation warning when not truncated', () => {
      const result: SummaryResult = {
        summary: '*Summary*\nNormal conversation.',
        messageCount: 50,
        type: 'public_channel',
        truncated: false,
      };

      const formatted = formatSummaryResponse(result);

      expect(formatted).not.toContain('⚠️');
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
  });
});

