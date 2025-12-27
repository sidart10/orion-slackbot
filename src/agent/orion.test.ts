/**
 * Tests for Orion Agent Core Module
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see AC#1 - Message passed to Anthropic API via messages.create() with streaming
 * @see AC#3 - Response streamed back to Slack
 * @see AC#5 - Response time 1-3 seconds (NFR1)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeAgentLoopMock } = vi.hoisted(() => ({
  executeAgentLoopMock: vi.fn(),
}));

vi.mock('./loop.js', () => ({
  executeAgentLoop: executeAgentLoopMock,
}));

import { runOrionAgent, type AgentContext, estimateTokens } from './orion.js';

function createMockLoop(): AsyncGenerator<string, any, undefined> {
  async function* gen() {
    yield 'Hello ';
    yield 'world!';
    return { inputTokens: 100, outputTokens: 50, durationMs: 10, nfr1Met: true };
  }
  return gen();
}

describe('runOrionAgent', () => {
  const mockContext: AgentContext = {
    threadHistory: [],
    userId: 'U123',
    channelId: 'C456',
    traceId: 'trace-abc',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executeAgentLoopMock.mockImplementation(() => createMockLoop());
  });

  it('should yield streaming text chunks', async () => {
    const chunks: string[] = [];

    for await (const chunk of runOrionAgent('Hello', {
      context: mockContext,
      systemPrompt: 'You are a helpful assistant.',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello ', 'world!']);
  });

  it('should delegate to executeAgentLoop() (Story 2.2)', async () => {
    const generator = runOrionAgent('Hello', {
      context: mockContext,
      systemPrompt: 'You are a helpful assistant.',
    });

    // Consume generator
    for await (const _chunk of generator) {
      // no-op
    }

    expect(executeAgentLoopMock).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({
        context: mockContext,
        systemPrompt: 'You are a helpful assistant.',
      })
    );
  });

  it('should forward trace + status hook to executeAgentLoop() when provided', async () => {
    const trace = { id: 't1' } as unknown;
    const setStatus = vi.fn();

    const generator = runOrionAgent('Hello', {
      context: mockContext,
      systemPrompt: 'You are a helpful assistant.',
      trace: trace as never,
      setStatus,
    });

    for await (const _chunk of generator) {
      // consume
    }

    expect(executeAgentLoopMock).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({
        trace,
        setStatus,
      })
    );
  });

  it('should accept a user message and context', async () => {
    const generator = runOrionAgent('Test message', {
      context: mockContext,
      systemPrompt: 'Test prompt',
    });

    // Consume generator
    const chunks: string[] = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should include thread history in messages', async () => {
    const contextWithHistory: AgentContext = {
      ...mockContext,
      threadHistory: [
        { role: 'user' as const, content: 'Previous message' },
        { role: 'assistant' as const, content: 'Previous response' },
      ],
    };

    const generator = runOrionAgent('New message', {
      context: contextWithHistory,
      systemPrompt: 'System prompt',
    });

    // Consume generator
    const chunks: string[] = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should handle empty thread history', async () => {
    const generator = runOrionAgent('First message', {
      context: { ...mockContext, threadHistory: [] },
      systemPrompt: 'System prompt',
    });

    const chunks: string[] = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should return AgentResult with token counts when generator completes (M3 fix)', async () => {
    const generator = runOrionAgent('Hello', {
      context: mockContext,
      systemPrompt: 'You are a helpful assistant.',
    });

    // Consume all chunks manually to capture return value
    let result;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    // Verify AgentResult shape
    expect(result).toBeDefined();
    expect(result).toHaveProperty('inputTokens');
    expect(result).toHaveProperty('outputTokens');
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('nfr1Met');
    expect(typeof result.inputTokens).toBe('number');
    expect(typeof result.outputTokens).toBe('number');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it('should preserve AgentResult.sources metadata when present (Story 2.7)', async () => {
    async function* gen() {
      yield 'Hello';
      return {
        inputTokens: 1,
        outputTokens: 2,
        durationMs: 3,
        nfr1Met: true,
        sources: [
          {
            type: 'file',
            title: 'Company Overview',
            reference: 'docs/company.md',
            url: 'https://example.com/company',
            excerpt: 'Overview...',
          },
        ],
      };
    }

    executeAgentLoopMock.mockImplementationOnce(() => gen());

    const generator = runOrionAgent('Hello', {
      context: mockContext,
      systemPrompt: 'You are a helpful assistant.',
    });

    let result;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    expect(result.sources).toBeDefined();
    expect(result.sources).toEqual([
      expect.objectContaining({
        type: 'file',
        title: 'Company Overview',
        reference: 'docs/company.md',
        url: 'https://example.com/company',
      }),
    ]);
  });
});

describe('AgentContext type', () => {
  it('should require userId, channelId, threadHistory', () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadHistory: [],
    };

    expect(context.userId).toBe('U123');
    expect(context.channelId).toBe('C456');
    expect(context.threadHistory).toEqual([]);
    expect(context.traceId).toBeUndefined();
  });

  it('should allow optional traceId', () => {
    const context: AgentContext = {
      userId: 'U123',
      channelId: 'C456',
      threadHistory: [],
      traceId: 'trace-123',
    };

    expect(context.traceId).toBe('trace-123');
  });
});

describe('estimateTokens', () => {
  it('should estimate ~4 chars per token', () => {
    expect(estimateTokens('test')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('hello world!')).toBe(3);
  });

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});
