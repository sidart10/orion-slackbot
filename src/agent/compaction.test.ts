/**
 * Tests for Context Compaction Utilities
 *
 * @see Story 2.6 - Context Compaction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  shouldTriggerCompaction,
  compactThreadHistory,
  estimateTokens,
  estimateContextTokens,
  resolveMaxContextTokens,
  type HistoryMessage,
} from './compaction.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('compaction', () => {
  describe('estimateTokens', () => {
    it('should estimate ~4 chars per token', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('test')).toBe(1); // 4 chars = 1 token
      expect(estimateTokens('hello world')).toBe(3); // 11 chars = ~3 tokens
      expect(estimateTokens('a'.repeat(100))).toBe(25); // 100 chars = 25 tokens
    });
  });

  describe('estimateContextTokens', () => {
    it('should sum tokens from system, history, and user message', () => {
      const result = estimateContextTokens({
        systemPrompt: 'a'.repeat(100), // 25 tokens
        threadHistory: [
          { role: 'user', content: 'b'.repeat(40) }, // 10 tokens
          { role: 'assistant', content: 'c'.repeat(80) }, // 20 tokens
        ],
        userMessage: 'd'.repeat(20), // 5 tokens
      });
      expect(result).toBe(60); // 25 + 10 + 20 + 5
    });

    it('should handle empty history', () => {
      const result = estimateContextTokens({
        systemPrompt: 'test prompt',
        threadHistory: [],
        userMessage: 'hello',
      });
      expect(result).toBe(estimateTokens('test prompt') + estimateTokens('hello'));
    });
  });

  describe('resolveMaxContextTokens', () => {
    it('should use configured value when provided', () => {
      expect(resolveMaxContextTokens({ configuredMaxContextTokens: 123456 })).toBe(
        123456
      );
    });

    it('should fall back conservatively when not configured', () => {
      expect(resolveMaxContextTokens({ configuredMaxContextTokens: undefined })).toBe(
        100000
      );
    });

    it('should fall back conservatively on invalid values', () => {
      expect(resolveMaxContextTokens({ configuredMaxContextTokens: 0 })).toBe(100000);
      expect(resolveMaxContextTokens({ configuredMaxContextTokens: -10 })).toBe(
        100000
      );
      expect(
        resolveMaxContextTokens({ configuredMaxContextTokens: Number.NaN })
      ).toBe(100000);
    });
  });

  describe('shouldTriggerCompaction', () => {
    it('should return false when below threshold', () => {
      expect(
        shouldTriggerCompaction({
          estimatedTokens: 10000,
          maxContextTokens: 200000,
          threshold: 0.8,
        })
      ).toBe(false);
    });

    it('should return true when at threshold', () => {
      expect(
        shouldTriggerCompaction({
          estimatedTokens: 160000, // Exactly 80% of 200000
          maxContextTokens: 200000,
          threshold: 0.8,
        })
      ).toBe(true);
    });

    it('should return true when above threshold', () => {
      expect(
        shouldTriggerCompaction({
          estimatedTokens: 180000,
          maxContextTokens: 200000,
          threshold: 0.8,
        })
      ).toBe(true);
    });

    it('should handle different threshold values', () => {
      // 50% threshold
      expect(
        shouldTriggerCompaction({
          estimatedTokens: 50000,
          maxContextTokens: 100000,
          threshold: 0.5,
        })
      ).toBe(true);

      // 90% threshold
      expect(
        shouldTriggerCompaction({
          estimatedTokens: 85000,
          maxContextTokens: 100000,
          threshold: 0.9,
        })
      ).toBe(false);
    });
  });

  describe('compactThreadHistory', () => {
    let mockAnthropic: Anthropic;

    const createMockAnthropic = (
      summaryText = 'Test summary'
    ): Anthropic => {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: summaryText }],
          }),
        },
      } as unknown as Anthropic;
    };

    const baseArgs = {
      systemPrompt: 'You are a helpful assistant.',
      userMessage: 'Hello',
      model: 'claude-sonnet-4-20250514',
      maxSummaryTokens: 500,
      keepLastN: 3,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockAnthropic = createMockAnthropic();
    });

    it('should not compact when history is shorter than keepLastN', async () => {
      const threadHistory: HistoryMessage[] = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
      ];

      const result = await compactThreadHistory({
        ...baseArgs,
        threadHistory,
        anthropic: mockAnthropic,
      });

      expect(result.compactionApplied).toBe(false);
      expect(result.compactedHistory).toEqual(threadHistory);
      expect(result.summary).toBe('');
      expect(mockAnthropic.messages.create).not.toHaveBeenCalled();
    });

    it('should compact and keep last N messages verbatim', async () => {
      const threadHistory: HistoryMessage[] = [
        { role: 'user', content: 'Old message 1' },
        { role: 'assistant', content: 'Old response 1' },
        { role: 'user', content: 'Old message 2' },
        { role: 'assistant', content: 'Old response 2' },
        { role: 'user', content: 'Recent message 1' },
        { role: 'assistant', content: 'Recent response 1' },
        { role: 'user', content: 'Recent message 2' },
      ];

      const result = await compactThreadHistory({
        ...baseArgs,
        threadHistory,
        anthropic: mockAnthropic,
        keepLastN: 3,
      });

      expect(result.compactionApplied).toBe(true);
      expect(result.compactedHistory.length).toBe(4); // 1 summary + 3 kept
      expect(result.compactedHistory[0].role).toBe('assistant');
      expect(result.compactedHistory[0].content).toContain('[Previous conversation summary]');
      expect(result.compactedHistory[0].content).toContain('Test summary');

      // Verify last 3 messages are kept verbatim (indices 1, 2, 3 after summary at 0)
      expect(result.compactedHistory[1]).toEqual({
        role: 'user',
        content: 'Recent message 1',
      });
      expect(result.compactedHistory[2]).toEqual({
        role: 'assistant',
        content: 'Recent response 1',
      });
      expect(result.compactedHistory[3]).toEqual({
        role: 'user',
        content: 'Recent message 2',
      });
    });

    it('should call Anthropic with correct summarization prompt', async () => {
      const threadHistory: HistoryMessage[] = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Second response' },
        { role: 'user', content: 'Keep this 1' },
        { role: 'assistant', content: 'Keep this 2' },
        { role: 'user', content: 'Keep this 3' },
      ];

      await compactThreadHistory({
        ...baseArgs,
        threadHistory,
        anthropic: mockAnthropic,
        keepLastN: 3,
      });

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: expect.stringContaining('Preferences'),
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('First message'),
          },
        ],
      });

      // Verify kept messages are not in summarization request
      const createCall = (mockAnthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.messages[0].content).not.toContain('Keep this');
    });

    it('should return original history on API error', async () => {
      const errorAnthropic = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('API Error')),
        },
      } as unknown as Anthropic;

      const threadHistory: HistoryMessage[] = [
        { role: 'user', content: 'Old message' },
        { role: 'assistant', content: 'Old response' },
        { role: 'user', content: 'Recent 1' },
        { role: 'assistant', content: 'Recent 2' },
        { role: 'user', content: 'Recent 3' },
      ];

      const result = await compactThreadHistory({
        ...baseArgs,
        threadHistory,
        anthropic: errorAnthropic,
        keepLastN: 3,
      });

      expect(result.compactionApplied).toBe(false);
      expect(result.compactedHistory).toEqual(threadHistory);
      expect(result.summary).toBe('');
    });

    it('should return original history when response has no text content', async () => {
      const noTextAnthropic = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [], // No content blocks
          }),
        },
      } as unknown as Anthropic;

      const threadHistory: HistoryMessage[] = [
        { role: 'user', content: 'Old message' },
        { role: 'assistant', content: 'Old response' },
        { role: 'user', content: 'Recent 1' },
        { role: 'assistant', content: 'Recent 2' },
        { role: 'user', content: 'Recent 3' },
      ];

      const result = await compactThreadHistory({
        ...baseArgs,
        threadHistory,
        anthropic: noTextAnthropic,
        keepLastN: 3,
      });

      expect(result.compactionApplied).toBe(false);
      expect(result.compactedHistory).toEqual(threadHistory);
    });

    it('should track token reduction metrics', async () => {
      const threadHistory: HistoryMessage[] = [
        { role: 'user', content: 'a'.repeat(1000) }, // ~250 tokens
        { role: 'assistant', content: 'b'.repeat(1000) }, // ~250 tokens
        { role: 'user', content: 'c'.repeat(100) }, // ~25 tokens
        { role: 'assistant', content: 'd'.repeat(100) }, // ~25 tokens
        { role: 'user', content: 'e'.repeat(100) }, // ~25 tokens
      ];

      // Short summary
      mockAnthropic = createMockAnthropic('Short summary');

      const result = await compactThreadHistory({
        ...baseArgs,
        threadHistory,
        anthropic: mockAnthropic,
        keepLastN: 3,
      });

      expect(result.compactionApplied).toBe(true);
      expect(result.originalEstimatedTokens).toBeGreaterThan(result.compactedEstimatedTokens);
    });

    it('should include traceId in logging', async () => {
      const { logger } = await import('../utils/logger.js');
      const threadHistory: HistoryMessage[] = [
        { role: 'user', content: 'Old' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Keep 1' },
        { role: 'assistant', content: 'Keep 2' },
        { role: 'user', content: 'Keep 3' },
      ];

      await compactThreadHistory({
        ...baseArgs,
        threadHistory,
        anthropic: mockAnthropic,
        traceId: 'test-trace-123',
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'compaction.summarizing',
          traceId: 'test-trace-123',
        })
      );
    });
  });

  describe('large thread fixture', () => {
    it('should handle a thread with many messages', async () => {
      // Create a large thread with 50 messages
      const largeHistory: HistoryMessage[] = [];
      for (let i = 0; i < 50; i++) {
        largeHistory.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}: ${'Lorem ipsum dolor sit amet. '.repeat(10)}`,
        });
      }

      const mockAnthropic = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Comprehensive summary of 47 messages.' }],
          }),
        },
      } as unknown as Anthropic;

      const result = await compactThreadHistory({
        threadHistory: largeHistory,
        userMessage: 'New question',
        systemPrompt: 'You are helpful.',
        anthropic: mockAnthropic,
        model: 'claude-sonnet-4-20250514',
        maxSummaryTokens: 1000,
        keepLastN: 3,
        traceId: 'large-thread-test',
      });

      expect(result.compactionApplied).toBe(true);
      expect(result.compactedHistory.length).toBe(4); // 1 summary + 3 kept
      expect(result.summary).toBe('Comprehensive summary of 47 messages.');

      // Verify the API was called with 47 messages worth of content
      const createCall = (mockAnthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.messages[0].content).toContain('Message 0');
      expect(createCall.messages[0].content).toContain('Message 46');
      expect(createCall.messages[0].content).not.toContain('Message 47'); // Kept
      expect(createCall.messages[0].content).not.toContain('Message 48'); // Kept
      expect(createCall.messages[0].content).not.toContain('Message 49'); // Kept
    });

    it('should handle long messages in history', async () => {
      // Create history with very long messages
      const longMessageHistory: HistoryMessage[] = [
        { role: 'user', content: 'A'.repeat(10000) }, // Very long
        { role: 'assistant', content: 'B'.repeat(10000) }, // Very long
        { role: 'user', content: 'Short 1' },
        { role: 'assistant', content: 'Short 2' },
        { role: 'user', content: 'Short 3' },
      ];

      const mockAnthropic = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Summary of long content.' }],
          }),
        },
      } as unknown as Anthropic;

      const result = await compactThreadHistory({
        threadHistory: longMessageHistory,
        userMessage: 'Question',
        systemPrompt: 'Prompt',
        anthropic: mockAnthropic,
        model: 'claude-sonnet-4-20250514',
        maxSummaryTokens: 500,
        keepLastN: 3,
      });

      expect(result.compactionApplied).toBe(true);
      // Original had ~5000 tokens from long messages, compacted should be much smaller
      expect(result.compactedEstimatedTokens).toBeLessThan(result.originalEstimatedTokens);
    });
  });
});

