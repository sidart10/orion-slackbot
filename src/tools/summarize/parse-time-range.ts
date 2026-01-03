/**
 * Time Range Parsing for Conversation Summarization
 *
 * Parses natural language time expressions into Date ranges.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#1 - Parse Time Range from Natural Language
 */

export interface TimeRange {
  oldest: Date;
  latest: Date;
  description: string;
}

interface TimePattern {
  pattern: RegExp;
  days: number;
  desc: string;
}

const TIME_PATTERNS: TimePattern[] = [
  // Week patterns
  { pattern: /past\s*(?:7|seven)\s*days?|last\s*(?:7|seven)\s*days?|last\s*week|this\s*week|past\s*week/i, days: 7, desc: 'past 7 days' },
  // Month patterns
  { pattern: /past\s*(?:30|thirty)\s*days?|last\s*(?:30|thirty)\s*days?|last\s*month|this\s*month|past\s*month/i, days: 30, desc: 'past 30 days' },
  // Today/24 hours patterns
  { pattern: /past\s*(?:24|twenty.?four)\s*hours?|today/i, days: 1, desc: 'past 24 hours' },
  // Yesterday (special case)
  { pattern: /yesterday/i, days: -1, desc: 'yesterday' },
  // Dynamic "past N days" pattern - must come after specific patterns
  { pattern: /past\s*(\d+)\s*days?/i, days: 0, desc: '' },
];

/**
 * Parse a natural language time range from user message.
 *
 * Supports:
 * - "past week", "last 7 days", "this week" → 7 days
 * - "past month", "last 30 days", "this month" → 30 days
 * - "today", "past 24 hours" → 1 day
 * - "yesterday" → previous 24-hour window
 * - "past N days" → N days dynamically
 *
 * Defaults to 7 days if no time range specified.
 *
 * @param message - User message to parse
 * @returns TimeRange with oldest, latest, and description
 */
export function parseTimeRange(message: string): TimeRange {
  const now = new Date();

  for (const { pattern, days, desc } of TIME_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      // Handle "yesterday" special case
      if (days === -1) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const endOfYesterday = new Date(yesterday);
        endOfYesterday.setHours(23, 59, 59, 999);
        return { oldest: yesterday, latest: endOfYesterday, description: 'yesterday' };
      }

      // Handle dynamic "past N days"
      if (days === 0 && match[1]) {
        const n = parseInt(match[1], 10);
        const oldest = new Date(now);
        oldest.setDate(oldest.getDate() - n);
        return { oldest, latest: now, description: `past ${n} days` };
      }

      // Standard case: fixed number of days
      const oldest = new Date(now);
      oldest.setDate(oldest.getDate() - days);
      return { oldest, latest: now, description: desc };
    }
  }

  // Default: past 7 days
  const oldest = new Date(now);
  oldest.setDate(oldest.getDate() - 7);
  return { oldest, latest: now, description: 'past 7 days' };
}

