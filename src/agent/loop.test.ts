/**
 * Tests for canonical agent loop (Story 2.2, 2.3).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#1 - Canonical phases: gather → act → verify
 * @see AC#2 - Direct Anthropic messages.create({ stream: true }) with bounded tool loop
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { messagesCreateMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
}));

// Mock config (imported by loop.ts)
vi.mock('../config/environment.js', () => ({
  config: {
    anthropicApiKey: 'test-api-key',
    anthropicModel: 'claude-sonnet-4-20250514',
  },
}));

// Mock logger (imported by loop.ts)
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock tool definitions (imported by loop.ts)
vi.mock('./tools.js', () => ({
  getToolDefinitions: vi.fn(() => [] as unknown[]),
  refreshMcpTools: vi.fn(async () => ({ success: true, data: { registered: 0 } })),
}));

// Mock Anthropic SDK (imported by loop.ts)
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: messagesCreateMock,
    },
  }));

  return { default: MockAnthropic };
});

function createMockMessageStream(params: {
  events: Array<unknown>;
}): {
  [Symbol.asyncIterator]: () => { next: () => Promise<{ value: unknown; done: boolean }> };
} {
  const { events } = params;
  return {
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        async next() {
          if (index < events.length) {
            return { value: events[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

// Import after mocks
import { executeAgentLoop, type AgentLoopOptions } from './loop.js';

describe('executeAgentLoop', () => {
  const baseOptions: AgentLoopOptions = {
    context: {
      threadHistory: [],
      userId: 'U123',
      channelId: 'C456',
      traceId: 'trace-abc',
    },
    systemPrompt: 'You are Orion, a helpful assistant.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should yield verified response in multiple chunks for streaming (Story 1.5 compatibility)', async () => {
    const longText = Array.from({ length: 400 }, () => 'word').join(' ');

    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: longText } },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { input_tokens: 10, output_tokens: 200 },
          },
          { type: 'message_stop' },
        ],
      })
    );

    const chunks: string[] = [];
    const gen = executeAgentLoop('Hi', baseOptions);
    while (true) {
      const next = await gen.next();
      if (next.done) break;
      chunks.push(next.value);
    }

    // If we only yield once, Slack chatStream often "blinks" the full response at the end.
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('word');
  });

  it('should call messages.create() with streaming enabled (AC#2)', async () => {
    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
          {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' },
          },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { input_tokens: 10, output_tokens: 5 },
          },
          { type: 'message_stop' },
        ],
      })
    );

    const gen = executeAgentLoop('Hi', baseOptions);
    // Consume generator fully to trigger the call.
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    expect(messagesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true })
    );
  });

  it('should execute tool_use via callback and send tool_result content into the next turn', async () => {
    const executeTool = vi.fn(async () => ({ ok: true }));

    // First call requests a tool.
    messagesCreateMock
      .mockImplementationOnce(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'search_api',
                input: { query: 'x' },
              },
            },
            {
              type: 'message_delta',
              delta: { stop_reason: 'tool_use', stop_sequence: null },
              usage: { input_tokens: 10, output_tokens: 0 },
            },
            { type: 'message_stop' },
          ],
        })
      )
      // Second call returns final text.
      .mockImplementationOnce(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } },
            {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { input_tokens: 20, output_tokens: 5 },
            },
            { type: 'message_stop' },
          ],
        })
      );

    const gen = executeAgentLoop('Hi', {
      ...baseOptions,
      executeTool,
      maxToolLoops: 3,
    });

    // Consume generator
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    expect(executeTool).toHaveBeenCalledWith({
      name: 'search_api',
      toolUseId: 'toolu_1',
      input: { query: 'x' },
      traceId: 'trace-abc',
    });

    expect(messagesCreateMock).toHaveBeenCalledTimes(2);

    const secondCallArgs = messagesCreateMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };

    const userMessages = secondCallArgs.messages.filter((m) => m.role === 'user');
    expect(userMessages.length).toBeGreaterThan(0);

    // We don't over-spec the exact shape; ensure some user message contains a tool_result
    // with our callback output (not the original user message "Hi").
    const anyToolResultContainsCallbackOutput = userMessages.some((m) =>
      JSON.stringify(m.content).includes('"type":"tool_result"') &&
      // tool_result.content is a JSON string, so it is escaped inside JSON.stringify(...)
      JSON.stringify(m.content).includes('\\"ok\\":true')
    );
    expect(anyToolResultContainsCallbackOutput).toBe(true);
  });

  it('should warn when max tool loop count is reached (safety)', async () => {
    // Always requests a tool; never returns a final answer.
    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
          {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'search_api',
              input: { query: 'x' },
            },
          },
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use', stop_sequence: null },
            usage: { input_tokens: 10, output_tokens: 0 },
          },
          { type: 'message_stop' },
        ],
      })
    );

    const loggerModule = await import('../utils/logger.js');
    const warn = loggerModule.logger.warn as unknown as ReturnType<typeof vi.fn>;

    const gen = executeAgentLoop('Hi', {
      ...baseOptions,
      maxToolLoops: 2,
    });

    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Expect a safety warning when we hit the loop bound.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.stringContaining('max_tool_loops'),
      })
    );
  });

  it('should emit agent.gather/agent.act/agent.verify spans when trace is provided (AC#7)', async () => {
    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { input_tokens: 10, output_tokens: 5 },
          },
          { type: 'message_stop' },
        ],
      })
    );

    // Create a mock trace object that tracks span() calls
    const spanCalls: string[] = [];
    const mockTrace = {
      id: 't1',
      span: vi.fn(({ name }: { name: string }) => {
        spanCalls.push(name);
        return { end: vi.fn() };
      }),
    };

    const gen = executeAgentLoop('Hi', {
      ...baseOptions,
      trace: mockTrace as never,
    });

    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    expect(spanCalls).toContain('agent.gather');
    expect(spanCalls).toContain('agent.act');
    expect(spanCalls).toContain('agent.verify');
  });

  // Story 2.3: Response Verification & Retry
  describe('verification retry (Story 2.3)', () => {
    it('should retry when verification fails and pass on second attempt (AC#1)', async () => {
      // First response fails verification (uses markdown bold)
      // Second response passes verification
      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'This is **bold** which fails verification' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 10 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'This is *bold* which passes verification' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 10 } },
              { type: 'message_stop' },
            ],
          })
        );

      const chunks: string[] = [];
      const gen = executeAgentLoop('Hi', baseOptions);
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
        chunks.push(next.value);
      }

      // Should have called API twice (retry)
      expect(messagesCreateMock).toHaveBeenCalledTimes(2);

      // Only verified content should be yielded (second response)
      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('*bold*');
      expect(fullOutput).not.toContain('**bold**');

      // Result should indicate verification passed
      expect(result.verification.passed).toBe(true);
      expect(result.verificationAttempts).toBe(2);
    });

    it('should not yield unverified content to caller (AC#2)', async () => {
      // Response fails verification
      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: '**bad markdown**' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: '*good mrkdwn*' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 15, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const chunks: string[] = [];
      const gen = executeAgentLoop('Hi', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
        chunks.push(next.value);
      }

      // Unverified content must NEVER appear in yielded output
      const fullOutput = chunks.join('');
      expect(fullOutput).not.toContain('**bad markdown**');
      expect(fullOutput).toContain('*good mrkdwn*');
    });

    it('should limit to 3 verification attempts and return graceful failure (AC#3, AC#4)', async () => {
      // All attempts fail verification
      messagesCreateMock.mockImplementation(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: '**always fails**' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
            { type: 'message_stop' },
          ],
        })
      );

      const chunks: string[] = [];
      const gen = executeAgentLoop('Hi', baseOptions);
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
        chunks.push(next.value);
      }

      // Should have tried exactly 3 times
      expect(messagesCreateMock).toHaveBeenCalledTimes(3);

      // Result should indicate failure
      expect(result.verification.passed).toBe(false);
      expect(result.verificationAttempts).toBe(3);
      expect(result.gracefulFailure).toBe(true);

      // Graceful failure message should be yielded
      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('Couldn\'t verify my response');
      expect(fullOutput).toContain('What I can do instead');
    });

    it('should include retry feedback in subsequent attempts', async () => {
      // First attempt fails, second passes
      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: '**markdown bold**' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: '*mrkdwn bold*' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Hi', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Second call should include retry feedback in messages
      const secondCallArgs = messagesCreateMock.mock.calls[1][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      const hasRetryFeedback = secondCallArgs.messages.some(
        (m) =>
          typeof m.content === 'string' &&
          (m.content.includes('Verification Failed') || m.content.includes('MARKDOWN_BOLD'))
      );
      expect(hasRetryFeedback).toBe(true);
    });

    it('should emit Langfuse verification_result event for each attempt (AC#5)', async () => {
      // Mock getLangfuse to capture events
      const eventMock = vi.fn();
      const langfuseModule = await import('../observability/langfuse.js');
      vi.spyOn(langfuseModule, 'getLangfuse').mockReturnValue({
        trace: vi.fn(() => ({ id: 't1', update: vi.fn(), span: vi.fn(() => ({ end: vi.fn() })), generation: vi.fn() })),
        flushAsync: vi.fn(),
        shutdownAsync: vi.fn(),
        score: vi.fn(),
        event: eventMock,
      });

      // First fails, second passes
      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: '**markdown bold**' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: '*slack bold*' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Hi', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Should have emitted verification_result events
      expect(eventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'verification_result',
          metadata: expect.objectContaining({
            attempt: expect.any(Number),
            passed: expect.any(Boolean),
          }),
        })
      );
    });

    it('should emit Langfuse verification_exhausted event after all attempts fail (AC#5)', async () => {
      // Mock getLangfuse
      const eventMock = vi.fn();
      const langfuseModule = await import('../observability/langfuse.js');
      vi.spyOn(langfuseModule, 'getLangfuse').mockReturnValue({
        trace: vi.fn(() => ({ id: 't1', update: vi.fn(), span: vi.fn(() => ({ end: vi.fn() })), generation: vi.fn() })),
        flushAsync: vi.fn(),
        shutdownAsync: vi.fn(),
        score: vi.fn(),
        event: eventMock,
      });

      // All attempts fail
      messagesCreateMock.mockImplementation(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: '**always fails**' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
            { type: 'message_stop' },
          ],
        })
      );

      const gen = executeAgentLoop('Hi', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Should have emitted verification_exhausted event
      expect(eventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'verification_exhausted',
          metadata: expect.objectContaining({
            maxAttempts: 3,
            finalIssueCodes: expect.any(Array),
          }),
        })
      );
    });
  });
});

