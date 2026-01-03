/**
 * Tests for generateSummary.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#4 - Generate Structured Summary
 * @see AC#7 - Langfuse Observability
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSummary } from './generate-summary.js';

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
});

