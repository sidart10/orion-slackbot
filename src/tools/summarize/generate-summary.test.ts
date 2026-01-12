/**
 * Tests for generateSummary.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see Story 7.8 - Enhanced Slack UI Polish
 * @see AC#4 - Generate Structured Summary
 * @see AC#7 - Langfuse Observability
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSummary, SUMMARIZATION_PROMPT } from './generate-summary.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '*Summary*\nThis is a test summary.' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}));

// Mock Langfuse
vi.mock('../../observability/langfuse.js', () => ({
  getLangfuse: vi.fn().mockReturnValue({
    trace: vi.fn().mockReturnValue({
      id: 'test-trace-id',
      span: vi.fn().mockReturnValue({
        end: vi.fn(),
      }),
    }),
  }),
}));

// Mock config
vi.mock('../../config/environment.js', () => ({
  config: {
    anthropicModel: 'claude-sonnet-4-20250514',
  },
}));

describe('generateSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC4: Generate structured summary', () => {
    it('generates summary using Claude', async () => {
      const messages = `[U1]: Hello team
[U2]: Hi there, ready for the standup?
[U1]: Yes, let's go`;

      const result = await generateSummary(messages, 'channel', 'test-trace');

      expect(result).toContain('Summary');
    });

    it('handles thread type', async () => {
      const messages = '[U1]: Thread message';
      const result = await generateSummary(messages, 'thread', 'test-trace');
      expect(typeof result).toBe('string');
    });

    it('handles mpim type', async () => {
      const messages = '[U1]: Group DM message';
      const result = await generateSummary(messages, 'mpim', 'test-trace');
      expect(typeof result).toBe('string');
    });

    it('handles im type', async () => {
      const messages = '[U1]: Direct message';
      const result = await generateSummary(messages, 'im', 'test-trace');
      expect(typeof result).toBe('string');
    });
  });

  describe('AC7: Langfuse observability', () => {
    it('creates span for summarization', async () => {
      const { getLangfuse } = await import('../../observability/langfuse.js');
      const messages = '[U1]: Test message';

      await generateSummary(messages, 'channel', 'test-trace');

      expect(getLangfuse).toHaveBeenCalled();
    });
  });

  // Story 7.8: Enhanced Slack UI Polish
  describe('Story 7.8: Prompt formatting rules', () => {
    it('prompt explicitly specifies Slack mrkdwn bold format', () => {
      // AC6: Prompt explicitly instructs Slack mrkdwn format
      expect(SUMMARIZATION_PROMPT).toContain('*text*');
      expect(SUMMARIZATION_PROMPT).toContain('NOT **text**');
    });

    it('prompt instructs to omit empty sections', () => {
      // AC6: Empty sections should be omitted
      expect(SUMMARIZATION_PROMPT).toContain('omit');
    });

    it('prompt sets max items per section', () => {
      // AC6: Maximum 5 items per section for readability
      expect(SUMMARIZATION_PROMPT).toContain('max');
      expect(SUMMARIZATION_PROMPT).toMatch(/\b5\b/);
    });

    it('prompt uses Slack mrkdwn headers not markdown', () => {
      // AC1/AC6: Headers use *bold* format
      expect(SUMMARIZATION_PROMPT).toContain('*Summary*');
      expect(SUMMARIZATION_PROMPT).toContain('*Key Decisions*');
      expect(SUMMARIZATION_PROMPT).toContain('*Action Items*');
      expect(SUMMARIZATION_PROMPT).not.toContain('## Summary');
      expect(SUMMARIZATION_PROMPT).not.toContain('### Summary');
    });

    it('prompt section headers have no emoji prefixes', () => {
      // AC2/AC6: Remove emoji prefixes from summary sections
      // Check that the section headers in prompt template don't have emoji prefixes
      const sectionHeaders = [
        '*Summary*',
        '*Key Decisions*',
        '*Action Items*',
        '*Topics Discussed*',
        '*Unresolved Questions*',
        '*Active Participants*',
      ];

      // Each section header should appear without emoji before it
      sectionHeaders.forEach((header) => {
        // The header should appear in the prompt
        expect(SUMMARIZATION_PROMPT).toContain(header);

        // Check that it's not preceded by an emoji (on the same line)
        // Emoji patterns: common section emojis like magnifying glass, lightbulb, etc.
        const emojiHeaderPattern = new RegExp(
          `[\\u{1F300}-\\u{1F9FF}]\\s*${header.replace('*', '\\*')}`,
          'u'
        );
        expect(SUMMARIZATION_PROMPT).not.toMatch(emojiHeaderPattern);
      });
    });

    it('prompt specifies Slack link format', () => {
      // AC6: Use <url|text> format for links
      expect(SUMMARIZATION_PROMPT).toContain('<https://url|');
    });
  });
});

