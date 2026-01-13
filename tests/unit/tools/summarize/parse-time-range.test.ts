/**
 * Tests for parseTimeRange utility.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#1 - Parse Time Range from Natural Language
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseTimeRange, type TimeRange } from '@/tools/summarize/parse-time-range.js';

describe('parseTimeRange', () => {
  // Fix the current date for predictable tests
  const NOW = new Date('2026-01-02T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('AC1: Parse time range from natural language', () => {
    it('parses "past week" → 7 days', () => {
      const result = parseTimeRange('Summarize #general for the past week');
      expect(result.description).toBe('past 7 days');
      expect(result.oldest.getTime()).toBe(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
      expect(result.latest.getTime()).toBe(NOW.getTime());
    });

    it('parses "last 7 days" → 7 days', () => {
      const result = parseTimeRange('What happened in the last 7 days?');
      expect(result.description).toBe('past 7 days');
    });

    it('parses "this week" → 7 days', () => {
      const result = parseTimeRange('Summarize this week');
      expect(result.description).toBe('past 7 days');
    });

    it('parses "past month" → 30 days', () => {
      const result = parseTimeRange('Summarize #sales for the past month');
      expect(result.description).toBe('past 30 days');
      expect(result.oldest.getTime()).toBe(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    });

    it('parses "last 30 days" → 30 days', () => {
      const result = parseTimeRange('Activity in the last 30 days');
      expect(result.description).toBe('past 30 days');
    });

    it('parses "this month" → 30 days', () => {
      const result = parseTimeRange('Summarize this month');
      expect(result.description).toBe('past 30 days');
    });

    it('parses "today" → 1 day', () => {
      const result = parseTimeRange('What happened today?');
      expect(result.description).toBe('past 24 hours');
      expect(result.oldest.getTime()).toBe(NOW.getTime() - 24 * 60 * 60 * 1000);
    });

    it('parses "past 24 hours" → 1 day', () => {
      const result = parseTimeRange('Summarize the past 24 hours');
      expect(result.description).toBe('past 24 hours');
    });

    it('parses "yesterday" → previous 24-hour window', () => {
      const result = parseTimeRange('What happened yesterday?');
      expect(result.description).toBe('yesterday');
      // Yesterday should be the previous calendar day (00:00 to 23:59)
      const yesterday = new Date(NOW);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      expect(result.oldest.getHours()).toBe(0);
      expect(result.oldest.getMinutes()).toBe(0);
    });

    it('parses "past N days" dynamically', () => {
      const result = parseTimeRange('Summarize past 14 days');
      expect(result.description).toBe('past 14 days');
      expect(result.oldest.getTime()).toBe(NOW.getTime() - 14 * 24 * 60 * 60 * 1000);
    });

    it('defaults to 7 days if no time range specified', () => {
      const result = parseTimeRange('Summarize #general');
      expect(result.description).toBe('past 7 days');
      expect(result.oldest.getTime()).toBe(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    });

    it('is case-insensitive', () => {
      const result = parseTimeRange('PAST WEEK summary');
      expect(result.description).toBe('past 7 days');
    });
  });
});

