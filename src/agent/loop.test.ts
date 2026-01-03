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
import { executeAgentLoop, type AgentLoopOptions, extractMarkdownLinks, formatToolDisplayName, summarizeToolInput } from './loop.js';

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

  // Story 2.9: Streaming Tool Input Accumulation
  describe('streaming tool input accumulation (Story 2.9)', () => {
    it('small_input_immediate — input fits in start event (AC#1)', async () => {
      // Tool input is complete in content_block_start, no deltas needed
      const executeTool = vi.fn(async () => ({ ok: true }));

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
                  id: 'toolu_small',
                  name: 'get_weather',
                  input: { city: 'Seattle' }, // Complete input in start event
                },
              },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 5 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Weather is sunny' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 10 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Hi', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Tool should be called with complete input from start event
      expect(executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'get_weather',
          input: { city: 'Seattle' },
        })
      );
    });

    it('large_input_accumulated — 5 delta chunks joined correctly (AC#2)', async () => {
      // Tool input streamed via input_json_delta events
      const executeTool = vi.fn(async () => ({ analyzed: true }));

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
                  id: 'toolu_large',
                  name: 'analyze_code',
                  input: {}, // Empty - input will come via deltas
                },
              },
              // 5 delta chunks forming valid JSON
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"code": "' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'function foo() {' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ' return 42;' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ' }' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"}' } },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 20 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Code analyzed' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 30, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Analyze this code', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Tool should be called with accumulated input from all 5 chunks
      expect(executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'analyze_code',
          input: { code: 'function foo() { return 42; }' },
        })
      );
    });

    it('accumulation_success_logged — success log includes tool name, bytes, traceId (AC#5)', async () => {
      // M2 fix: Verify success-path accumulation logging
      const executeTool = vi.fn(async () => ({ ok: true }));
      const loggerModule = await import('../utils/logger.js');
      const infoMock = loggerModule.logger.info as unknown as ReturnType<typeof vi.fn>;

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_log', name: 'logged_tool', input: {} },
              },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"data":"test"}' } },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 5 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 3 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Test logging', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Verify success accumulation log includes all required fields per AC#5
      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.input.accumulated',
          toolName: 'logged_tool',
          bytes: 15, // '{"data":"test"}'.length
          success: true,
          traceId: 'trace-abc',
        })
      );
    });

    it('concurrent_tools_isolated — 3 tools streaming simultaneously (AC#3)', async () => {
      // 3 tools with interleaved delta events
      const executeTool = vi.fn(async ({ name }: { name: string }) => ({ tool: name }));

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              // Tool 0
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'tool_0', name: 'tool_a', input: {} },
              },
              // Tool 1
              {
                type: 'content_block_start',
                index: 1,
                content_block: { type: 'tool_use', id: 'tool_1', name: 'tool_b', input: {} },
              },
              // Tool 2
              {
                type: 'content_block_start',
                index: 2,
                content_block: { type: 'tool_use', id: 'tool_2', name: 'tool_c', input: {} },
              },
              // Interleaved deltas
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"val":' } },
              { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"val":' } },
              { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"val":' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"A"}' } },
              { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"B"}' } },
              { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"C"}' } },
              // Stop in different order
              { type: 'content_block_stop', index: 1 },
              { type: 'content_block_stop', index: 0 },
              { type: 'content_block_stop', index: 2 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 30 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'All done' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 50, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Run all tools', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Each tool should have received its isolated input
      expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'tool_a', input: { val: 'A' } }));
      expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'tool_b', input: { val: 'B' } }));
      expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'tool_c', input: { val: 'C' } }));
    });

    it('malformed_json_handled — parse error logged, tool skipped (AC#4)', async () => {
      const executeTool = vi.fn(async () => ({ ok: true }));
      const loggerModule = await import('../utils/logger.js');
      const errorMock = loggerModule.logger.error as unknown as ReturnType<typeof vi.fn>;
      const warnMock = loggerModule.logger.warn as unknown as ReturnType<typeof vi.fn>;

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_bad', name: 'bad_tool', input: {} },
              },
              // Invalid JSON (missing closing brace)
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"invalid": true' } },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 5 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Handled gracefully' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Call bad tool', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Tool should NOT be called due to parse failure
      expect(executeTool).not.toHaveBeenCalled();

      // Error should be logged with parse failure event AND traceId (AC#4, AC#5)
      expect(errorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.input.parse_failed',
          toolName: 'bad_tool',
          traceId: 'trace-abc',
        })
      );

      // Tool execution skipped should be logged (L3 fix)
      expect(warnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.execution.skipped',
          toolName: 'bad_tool',
          reason: 'input_parse_failed',
          traceId: 'trace-abc',
        })
      );
    });

    it('empty_delta_ignored — no crash on empty partial_json (AC#2)', async () => {
      const executeTool = vi.fn(async () => ({ ok: true }));

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_empty', name: 'empty_delta_tool', input: {} },
              },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"key":' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '' } }, // Empty delta
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"value"}' } },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 5 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 3 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Test empty delta', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Tool should be called with correctly accumulated input (empty delta ignored)
      expect(executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'empty_delta_tool',
          input: { key: 'value' },
        })
      );
    });

    it('mixed_text_and_tool — text + tool in same response (AC#1, AC#2)', async () => {
      const executeTool = vi.fn(async () => ({ result: 'success' }));

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              // Text block first
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me search for that. ' } },
              { type: 'content_block_stop', index: 0 },
              // Tool block second
              {
                type: 'content_block_start',
                index: 1,
                content_block: { type: 'tool_use', id: 'toolu_mixed', name: 'search', input: {} },
              },
              { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"test"}' } },
              { type: 'content_block_stop', index: 1 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 15 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Found it' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 30, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Search for something', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Tool should be called with accumulated input
      expect(executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'search',
          input: { query: 'test' },
        })
      );
    });

    it('text_block_stop_handled — content_block_stop for non-tool blocks is graceful (L1 fix)', async () => {
      // L1 fix: Verify content_block_stop for text blocks doesn't cause issues
      messagesCreateMock.mockImplementationOnce(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            // Text block only - no tool
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Just plain text' } },
            { type: 'content_block_stop', index: 0 }, // Stop for text block - should be handled gracefully
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
            { type: 'message_stop' },
          ],
        })
      );

      const chunks: string[] = [];
      const gen = executeAgentLoop('Say something', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
        chunks.push(next.value);
      }

      // Should complete without error and yield the text
      expect(chunks.join('')).toContain('Just plain text');
    });

    it('buffer_exceeds_limit — buffer cleared, error logged (AC#6)', async () => {
      const executeTool = vi.fn(async () => ({ ok: true }));
      const loggerModule = await import('../utils/logger.js');
      const errorMock = loggerModule.logger.error as unknown as ReturnType<typeof vi.fn>;

      // Create a string that will exceed 1MB when accumulated
      const hugeChunk = 'x'.repeat(600 * 1024); // 600KB per chunk

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_huge', name: 'huge_tool', input: { fallback: true } },
              },
              // Two chunks that together exceed 1MB
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: hugeChunk } },
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: hugeChunk } },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 5 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Handled with fallback' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Test huge input', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Tool should be called with initial input (fallback) since buffer was cleared
      expect(executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'huge_tool',
          input: { fallback: true },
        })
      );

      // Error should be logged with buffer overflow details AND traceId + index (AC#6)
      expect(errorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.input.too_large',
          index: 0,
          traceId: 'trace-abc',
        })
      );
    });

    it('initial_input_overridden — accumulated JSON takes precedence (AC#2)', async () => {
      const executeTool = vi.fn(async () => ({ ok: true }));

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
                  id: 'toolu_override',
                  name: 'override_tool',
                  input: { initial: 'value' }, // Initial input that should be overridden
                },
              },
              // Delta provides different input
              { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"final":"winner"}' } },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'tool_use' },
                usage: { input_tokens: 10, output_tokens: 10 },
              },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 3 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Override test', { ...baseOptions, executeTool });
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // Accumulated JSON should override initial input
      expect(executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'override_tool',
          input: { final: 'winner' }, // NOT { initial: 'value' }
        })
      );
    });
  });

  // Story: Source Citations v2 - Markdown link extraction and tool source deduplication
  describe('source citations v2', () => {
    it('extracts markdown links from tool results and adds to sources', async () => {
      // Tool returns markdown-formatted content with links
      const executeTool = vi.fn(async () => ({
        success: true,
        data: {
          content: [
            {
              type: 'text',
              text: 'Check out [Chatbot Arena](https://lmarena.ai) and [Polymarket](https://polymarket.com/markets) for more info.',
            },
          ],
        },
      }));

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_exa', name: 'exa__web_search', input: { query: 'AI benchmarks' } },
              },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { input_tokens: 10, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Here are the results.' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 10 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Search for AI benchmarks', { ...baseOptions, executeTool });
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
      }

      // Should have extracted markdown URLs as sources
      const urlSources = result.sources.filter((s: { url?: string }) => s.url);
      expect(urlSources.length).toBeGreaterThanOrEqual(2);
      expect(urlSources.some((s: { url: string }) => s.url.includes('lmarena.ai'))).toBe(true);
      expect(urlSources.some((s: { url: string }) => s.url.includes('polymarket.com'))).toBe(true);
    });

    it('deduplicates same tool with different queries as separate sources', async () => {
      // Two tool calls with different queries should both appear
      const executeTool = vi.fn(async () => ({ success: true, data: { results: [] } }));

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              // First tool call
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_1', name: 'audience-manager__search', input: { query: 'NFL fans' } },
              },
              { type: 'content_block_stop', index: 0 },
              // Second tool call with different query
              {
                type: 'content_block_start',
                index: 1,
                content_block: { type: 'tool_use', id: 'toolu_2', name: 'audience-manager__search', input: { query: 'NBA fans' } },
              },
              { type: 'content_block_stop', index: 1 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { input_tokens: 10, output_tokens: 10 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Found both audiences.' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 30, output_tokens: 10 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Find NFL and NBA fans', { ...baseOptions, executeTool });
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
      }

      // Both tool calls should appear as separate sources (different queries)
      const toolSources = result.sources.filter((s: { type: string }) => s.type === 'tool');
      expect(toolSources.length).toBe(2);
      expect(toolSources.some((s: { toolContext?: string }) => s.toolContext?.includes('NFL'))).toBe(true);
      expect(toolSources.some((s: { toolContext?: string }) => s.toolContext?.includes('NBA'))).toBe(true);
    });

    it('deduplicates same tool with same query as single source', async () => {
      // Two identical tool calls should dedupe to one
      const executeTool = vi.fn(async () => ({ success: true, data: { results: [] } }));

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_1', name: 'search_tool', input: { query: 'same query' } },
              },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'content_block_start',
                index: 1,
                content_block: { type: 'tool_use', id: 'toolu_2', name: 'search_tool', input: { query: 'same query' } },
              },
              { type: 'content_block_stop', index: 1 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { input_tokens: 10, output_tokens: 10 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 30, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Search twice', { ...baseOptions, executeTool });
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
      }

      // Same query twice should dedupe to one source
      const toolSources = result.sources.filter((s: { type: string }) => s.type === 'tool');
      expect(toolSources.length).toBe(1);
    });

    it('shows "data lookup" fallback when tool has no extractable context', async () => {
      // Tool with empty input object
      const executeTool = vi.fn(async () => ({ success: true, data: { id: 123 } }));

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'toolu_empty', name: 'get_user_data', input: {} },
              },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { input_tokens: 10, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Got the data.' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 20, output_tokens: 5 } },
              { type: 'message_stop' },
            ],
          })
        );

      const gen = executeAgentLoop('Get my data', { ...baseOptions, executeTool });
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
      }

      // Tool source should show "data lookup" fallback
      const toolSource = result.sources.find((s: { type: string }) => s.type === 'tool');
      expect(toolSource).toBeDefined();
      expect(toolSource.toolContext).toBe('data lookup');
    });
  });
});

// Unit tests for exported helper functions (Source Citations v2)
describe('extractMarkdownLinks', () => {
  it('extracts single markdown link', () => {
    const text = 'Check out [Example](https://example.com) for more.';
    const links = extractMarkdownLinks(text);
    expect(links).toEqual([{ title: 'Example', url: 'https://example.com' }]);
  });

  it('extracts multiple markdown links', () => {
    const text = 'Visit [Site A](https://a.com) and [Site B](http://b.com/path).';
    const links = extractMarkdownLinks(text);
    expect(links).toEqual([
      { title: 'Site A', url: 'https://a.com' },
      { title: 'Site B', url: 'http://b.com/path' },
    ]);
  });

  it('returns empty array for text without links', () => {
    const text = 'No links here, just plain text.';
    const links = extractMarkdownLinks(text);
    expect(links).toEqual([]);
  });

  it('handles malformed markdown (missing closing paren)', () => {
    const text = 'Broken [link](https://example.com and more text.';
    const links = extractMarkdownLinks(text);
    expect(links).toEqual([]); // Should not match incomplete pattern
  });

  it('handles malformed markdown (missing title)', () => {
    const text = 'Broken [](https://example.com) link.';
    const links = extractMarkdownLinks(text);
    expect(links).toEqual([]); // Empty title should not produce result
  });

  it('extracts links with complex URLs', () => {
    const text = 'See [Docs](https://docs.example.com/api/v2?query=test&page=1#section).';
    const links = extractMarkdownLinks(text);
    expect(links).toEqual([
      { title: 'Docs', url: 'https://docs.example.com/api/v2?query=test&page=1#section' },
    ]);
  });

  it('handles multiple calls without state leakage (no regex lastIndex issues)', () => {
    // Call twice to ensure stateless behavior
    const text1 = '[A](https://a.com)';
    const text2 = '[B](https://b.com)';

    const links1 = extractMarkdownLinks(text1);
    const links2 = extractMarkdownLinks(text2);

    expect(links1).toEqual([{ title: 'A', url: 'https://a.com' }]);
    expect(links2).toEqual([{ title: 'B', url: 'https://b.com' }]);
  });
});

describe('formatToolDisplayName', () => {
  it('formats MCP tool names (server__tool pattern)', () => {
    expect(formatToolDisplayName('msci-reports__search_reports')).toBe('Msci Reports: Search Reports');
  });

  it('formats static tool names', () => {
    expect(formatToolDisplayName('get_weather')).toBe('Get Weather');
  });
});

describe('summarizeToolInput', () => {
  it('extracts query parameter', () => {
    expect(summarizeToolInput({ query: 'NFL fans' })).toBe('NFL fans');
  });

  it('extracts search_query parameter', () => {
    expect(summarizeToolInput({ search_query: 'basketball' })).toBe('basketball');
  });

  it('returns empty string for empty object', () => {
    expect(summarizeToolInput({})).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(summarizeToolInput(null)).toBe('');
    expect(summarizeToolInput(undefined)).toBe('');
  });

  it('truncates long queries with ellipsis', () => {
    const longQuery = 'A'.repeat(100);
    const result = summarizeToolInput({ query: longQuery });
    expect(result.length).toBeLessThanOrEqual(61); // 60 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
  });
});

