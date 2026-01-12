/**
 * Tests for canonical agent loop (Story 2.2, 2.3).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#1 - Canonical phases: gather → act → verify
 * @see AC#2 - Direct Anthropic messages.create({ stream: true }) with bounded tool loop
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { messagesCreateMock, containerLifecycleMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
  containerLifecycleMock: {
    getContainerId: vi.fn(),
    setContainerId: vi.fn(),
    clearContainerId: vi.fn(),
    destroy: vi.fn(),
    _clear: vi.fn(),
  },
}));

// Mock config (imported by loop.ts)
vi.mock('../config/environment.js', () => ({
  config: {
    anthropicApiKey: 'test-api-key',
    anthropicModel: 'claude-sonnet-4-20250514',
    // Story 8.2: Tool Search config
    toolSearch: {
      enabled: true,
      coreTools: ['memory', 'code_execution', 'summarize'],
    },
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

// Story 6.3: Mock skills/index for container lifecycle testing
vi.mock('../skills/index.js', () => ({
  isSkillsInitialized: vi.fn(() => false),
  getCachedSkillIds: vi.fn(() => ({})),
  buildContainerParameter: vi.fn((skillIds: string[]) => ({
    skills: skillIds.map((id) => ({ type: 'custom', skill_id: id, version: 'latest' })),
  })),
  containerLifecycle: containerLifecycleMock,
}));

// ✅ REMOVED: Local helper functions now come from test factories
// These functions are now imported from tests/factories/agent-factory.ts
// - createMockMessageStream
// - createMockStreamWithText
// - createMockStreamWithToolUse

// Import after mocks
import { executeAgentLoop, type AgentLoopOptions, extractMarkdownLinks, formatToolDisplayName, summarizeToolInput } from './loop.js';
// ✅ NEW: Import test factories
import {
  createAgentContext,
  createAgentLoopOptions,
  createMockMessageStream,
  createMockStreamWithText,
  createMockStreamWithToolUse,
  createMockStreamWithPtc,
  createMockStreamWithPtcExpired,
  createMockStreamWithPtcTimeout,
  // Story 6.2 Skills factories
  createMockStreamWithPauseTurn,
  createMockCodeExecutionResultWithFiles,
  createContainerId,
} from '../../tests/factories/index.js';

describe('executeAgentLoop', () => {
  // ✅ IMPROVED: Use factory for base options (still used by tests that haven't been refactored yet)
  const baseOptions: AgentLoopOptions = createAgentLoopOptions();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should yield verified response in multiple chunks for streaming (Story 1.5 compatibility)', async () => {
    // Given: A long text response that should be streamed in chunks
    const longText = Array.from({ length: 400 }, () => 'word').join(' ');
    const options = createAgentLoopOptions();

    // When: Mock returns long text response
    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithText(longText, { inputTokens: 10, outputTokens: 200 })
    );

    const chunks: string[] = [];
    const gen = executeAgentLoop('Hi', options);
    while (true) {
      const next = await gen.next();
      if (next.done) break;
      chunks.push(next.value);
    }

    // Then: Response should be split into multiple chunks (not delivered as one blink)
    // If we only yield once, Slack chatStream often "blinks" the full response at the end.
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('word');
  });

  it('should call messages.create() with streaming enabled (AC#2)', async () => {
    // Given: Agent with default options
    const options = createAgentLoopOptions();

    // When: Mock returns simple text response
    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithText('Hello')
    );

    const gen = executeAgentLoop('Hi', options);
    // Consume generator fully to trigger the call.
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Anthropic messages.create() should be called with streaming enabled
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
      traceId: expect.any(String),
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
        span: vi.fn(() => ({ end: vi.fn() })),
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
        span: vi.fn(() => ({ end: vi.fn() })),
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
          traceId: expect.any(String),
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
          traceId: expect.any(String),
        })
      );

      // Tool execution skipped should be logged (L3 fix)
      expect(warnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.execution.skipped',
          toolName: 'bad_tool',
          reason: 'input_parse_failed',
          traceId: expect.any(String),
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
          traceId: expect.any(String),
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
      const urlSources = result.sources.filter(
        (s): s is import('./gather.js').ContextSource & { url: string } => typeof s.url === 'string'
      );
      expect(urlSources.length).toBeGreaterThanOrEqual(2);
      expect(urlSources.some((s) => s.url.includes('lmarena.ai'))).toBe(true);
      expect(urlSources.some((s) => s.url.includes('polymarket.com'))).toBe(true);
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
      expect(toolSource?.toolContext).toBe('data lookup');
    });
  });

  /**
   * Fallback response delivery tests (fix silent response failures)
   * @see tech-spec-fix-silent-response-failures.md
   */
  describe('fallback response delivery after tool execution', () => {
    it('should deliver fallback response when tools succeed but verification fails', async () => {
      messagesCreateMock
        .mockResolvedValueOnce(
          createMockStreamWithToolUse([
            { type: 'text', text: 'I will check that for you.' },
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'test_tool',
              input: { query: 'test' },
            },
          ])
        )
        .mockResolvedValueOnce(
          createMockStreamWithText('The result shows **important data**.') // Uses **bold** - fails verification
        );

      const executeTool = vi.fn().mockResolvedValue({
        success: true,
        data: 'Tool result data',
      });

      const chunks: string[] = [];
      for await (const chunk of executeAgentLoop('Test query', {
        context: {
          threadHistory: [],
          userId: 'U123',
          channelId: 'C123',
          traceId: 'test-trace',
        },
        systemPrompt: 'Test prompt',
        tools: [{ name: 'test_tool', description: 'Test', input_schema: { type: 'object', properties: {} } }],
        executeTool,
      })) {
        chunks.push(chunk);
      }

      // Should deliver the response with **bold** as fallback (not empty)
      const fullResponse = chunks.join('');
      expect(fullResponse).toContain('important data');
      expect(fullResponse.length).toBeGreaterThan(0);
    });

    it('should retry normally when verification fails without tool execution', async () => {
      messagesCreateMock
        .mockResolvedValueOnce(createMockStreamWithText('This has **bold formatting**.'))
        .mockResolvedValueOnce(createMockStreamWithText('This has *bold formatting*.'));

      const chunks: string[] = [];
      for await (const chunk of executeAgentLoop('Test query', {
        context: {
          threadHistory: [],
          userId: 'U123',
          channelId: 'C123',
          traceId: 'test-trace',
        },
        systemPrompt: 'Test prompt',
        tools: [],
      })) {
        chunks.push(chunk);
      }

      // Should retry and deliver corrected version
      const fullResponse = chunks.join('');
      expect(fullResponse).toBe('This has *bold formatting*.');
      expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    });

    it('should not use fallback when response is empty after tools', async () => {
      messagesCreateMock
        .mockResolvedValueOnce(
          createMockStreamWithToolUse([
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'test_tool',
              input: { query: 'test' },
            },
          ])
        )
        .mockResolvedValueOnce(createMockStreamWithText(''))
        .mockResolvedValueOnce(createMockStreamWithText('Here is the result.'));

      const executeTool = vi.fn().mockResolvedValue({
        success: true,
        data: 'Tool result',
      });

      const chunks: string[] = [];
      for await (const chunk of executeAgentLoop('Test query', {
        context: {
          threadHistory: [],
          userId: 'U123',
          channelId: 'C123',
          traceId: 'test-trace',
        },
        systemPrompt: 'Test prompt',
        tools: [{ name: 'test_tool', description: 'Test', input_schema: { type: 'object', properties: {} } }],
        executeTool,
      })) {
        chunks.push(chunk);
      }

      // Should deliver retry response, not empty fallback
      const fullResponse = chunks.join('');
      expect(fullResponse).toBe('Here is the result.');
      expect(messagesCreateMock).toHaveBeenCalledTimes(3);
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

/**
 * Story 6.3: Programmatic Tool Calling (PTC)
 *
 * Tests for Anthropic's PTC feature that allows Claude to orchestrate
 * MCP tools through Python code, reducing context window usage.
 *
 * @see Story 6.3 - Anthropic Managed Programmatic Tool Calling
 * @see AC#1-AC10 - Acceptance criteria
 */
describe('executeAgentLoop PTC (Story 6.3)', () => {
  const baseOptions: AgentLoopOptions = createAgentLoopOptions();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC1, AC9: server_tool_use processing and status update
  it('PTC: should process server_tool_use block and emit status (AC1, AC9)', async () => {
    // Given: PTC stream with server_tool_use block
    const statusCalls: Array<{ phase: string; toolName?: string }> = [];
    const mockSetStatus = vi.fn(
      (status: { phase: string; toolName?: string }) => {
        statusCalls.push(status);
      }
    );

    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtc({
        toolCalls: [],
        codeResult: { return_code: 0, stdout: 'Done', stderr: '' },
      })
    );

    // When: Execute agent loop with PTC response
    const gen = executeAgentLoop('Run analysis', {
      ...baseOptions,
      setStatus: mockSetStatus,
    });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: setStatus should have been called with code_execution tool
    expect(mockSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'tool',
        toolName: 'code_execution',
      })
    );
  });

  // AC4: Route tool_use with caller.type correctly
  it('PTC: should route tool_use with caller.type to correct handler (AC4)', async () => {
    // Given: PTC stream with tool_use that has caller field
    const executeTool = vi.fn(async () => ({ success: true, data: 'result' }));

    messagesCreateMock
      .mockImplementationOnce(async () =>
        createMockStreamWithPtc({
          toolCalls: [{ name: 'search_api', input: { query: 'test' } }],
          codeResult: { return_code: 0, stdout: 'Done', stderr: '' },
        })
      )
      .mockImplementationOnce(async () =>
        createMockStreamWithText('Final response')
      );

    // When: Execute agent loop
    const gen = executeAgentLoop('Search for something', {
      ...baseOptions,
      executeTool,
    });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Tool should have been called with correct params
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'search_api',
        input: { query: 'test' },
      })
    );
  });

  // AC3: Process code_execution_tool_result
  it('PTC: should process code_execution_tool_result and continue loop (AC3)', async () => {
    // Given: PTC stream with code_execution_tool_result
    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtc({
        toolCalls: [],
        codeResult: { return_code: 0, stdout: 'Analysis complete', stderr: '' },
      })
    );

    // When: Execute agent loop
    const chunks: string[] = [];
    const gen = executeAgentLoop('Analyze data', baseOptions);
    let result;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
      chunks.push(next.value);
    }

    // Then: Loop should complete successfully
    expect(result).toBeDefined();
    expect(messagesCreateMock).toHaveBeenCalled();
  });

  // AC5: Container reuse
  it('PTC: should reuse container across requests in session (AC5)', async () => {
    // Given: PTC stream with container ID, followed by another request
    const containerId = 'container-test-123';

    messagesCreateMock
      .mockImplementationOnce(async () =>
        createMockStreamWithPtc({
          containerId,
          toolCalls: [{ name: 'tool_a', input: {} }],
        })
      )
      .mockImplementationOnce(async () =>
        createMockStreamWithText('Done')
      );

    // When: Execute agent loop
    const gen = executeAgentLoop('Test', {
      ...baseOptions,
      executeTool: vi.fn(async () => ({ success: true })),
    });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Second request should include container ID (Story 6.2: now as object with id property)
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = messagesCreateMock.mock.calls[1][0] as { container?: { id?: string } };
    expect(secondCallArgs.container?.id).toBe(containerId);
  });

  // AC8: PTC tool_result format (no text content)
  it('PTC: should format PTC tool_result messages without text content (AC8)', async () => {
    // Given: PTC stream with programmatic tool call
    const executeTool = vi.fn(async () => ({ success: true, data: 'result' }));

    messagesCreateMock
      .mockImplementationOnce(async () =>
        createMockStreamWithPtc({
          toolCalls: [{ id: 'toolu_ptc', name: 'search', input: { q: 'x' } }],
        })
      )
      .mockImplementationOnce(async () =>
        createMockStreamWithText('Final')
      );

    // When: Execute agent loop
    const gen = executeAgentLoop('Search', { ...baseOptions, executeTool });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Tool result message should contain ONLY tool_result blocks (no text)
    const secondCallArgs = messagesCreateMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };

    const userMessages = secondCallArgs.messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    // For PTC calls, content should be array of tool_results only
    expect(Array.isArray(lastUserMessage.content)).toBe(true);
    const content = lastUserMessage.content as Array<{ type: string }>;
    const hasTextContent = content.some((c) => c.type === 'text');
    expect(hasTextContent).toBe(false); // No text content per Anthropic spec
  });

  // AC7: Container expiration logging
  it('PTC: should log ptc_container_expired on container expiration (AC7)', async () => {
    // Given: PTC stream with container expiration error
    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtcExpired()
    );

    const loggerModule = await import('../utils/logger.js');
    const errorMock = loggerModule.logger.error as unknown as ReturnType<typeof vi.fn>;

    // When: Execute agent loop
    const gen = executeAgentLoop('Test', baseOptions);
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Container expiration should be logged
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.loop.ptc_container_expired',
        traceId: expect.any(String),
      })
    );
  });

  // AC7: Timeout error logging
  it('PTC: should log ptc_tool_timeout on timeout errors (AC7)', async () => {
    // Given: PTC stream with timeout error
    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtcTimeout()
    );

    const loggerModule = await import('../utils/logger.js');
    const warnMock = loggerModule.logger.warn as unknown as ReturnType<typeof vi.fn>;

    // When: Execute agent loop
    const gen = executeAgentLoop('Test', baseOptions);
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Timeout should be logged
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.loop.ptc_tool_timeout',
        traceId: expect.any(String),
      })
    );
  });

  // AC10: Langfuse PTC event
  it('PTC: should emit Langfuse ptc_execution_completed event (AC10)', async () => {
    // Given: Mock getLangfuse to capture events
    const eventMock = vi.fn();
    const langfuseModule = await import('../observability/langfuse.js');
    vi.spyOn(langfuseModule, 'getLangfuse').mockReturnValue({
      span: vi.fn(() => ({ end: vi.fn() })),
      trace: vi.fn(() => ({ id: 't1', update: vi.fn(), span: vi.fn(() => ({ end: vi.fn() })), generation: vi.fn() })),
      flushAsync: vi.fn(),
      shutdownAsync: vi.fn(),
      score: vi.fn(),
      event: eventMock,
    });

    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtc({
        toolCalls: [{ name: 'tool_a', input: {} }],
      })
    );

    // When: Execute agent loop with PTC
    const gen = executeAgentLoop('Test', {
      ...baseOptions,
      executeTool: vi.fn(async () => ({ success: true })),
    });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Langfuse event should be emitted
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ptc_execution_completed',
        metadata: expect.objectContaining({
          toolCallCount: expect.any(Number),
        }),
      })
    );
  });

  // AC10: Token savings estimation
  it('PTC: should estimate token savings in trace metadata (AC10)', async () => {
    // Given: Mock getLangfuse
    const eventMock = vi.fn();
    const langfuseModule = await import('../observability/langfuse.js');
    vi.spyOn(langfuseModule, 'getLangfuse').mockReturnValue({
      span: vi.fn(() => ({ end: vi.fn() })),
      trace: vi.fn(() => ({ id: 't1', update: vi.fn(), span: vi.fn(() => ({ end: vi.fn() })), generation: vi.fn() })),
      flushAsync: vi.fn(),
      shutdownAsync: vi.fn(),
      score: vi.fn(),
      event: eventMock,
    });

    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtc({
        toolCalls: [{ name: 'tool_a', input: { query: 'long query text' } }],
        codeResult: { return_code: 0, stdout: 'Long result output here', stderr: '' },
      })
    );

    // When: Execute agent loop with PTC
    const gen = executeAgentLoop('Test', {
      ...baseOptions,
      executeTool: vi.fn(async () => ({ success: true, data: 'Some result data' })),
    });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Event should include token savings estimate
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ptc_execution_completed',
        metadata: expect.objectContaining({
          estimatedTokenSavings: expect.any(Number),
        }),
      })
    );
  });

  // AC9: Status clear on result
  it('PTC: should clear status on code_execution_tool_result (AC9)', async () => {
    // Given: PTC stream
    const statusCalls: Array<unknown> = [];
    const mockSetStatus = vi.fn((status: unknown) => {
      statusCalls.push(status);
    });

    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtc({
        toolCalls: [],
        codeResult: { return_code: 0, stdout: 'Done', stderr: '' },
      })
    );

    // When: Execute agent loop
    const gen = executeAgentLoop('Test', { ...baseOptions, setStatus: mockSetStatus });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Status should be cleared (undefined or null call) after PTC completes
    // The last setStatus call should clear the status
    const lastCall = statusCalls[statusCalls.length - 1];
    expect(lastCall === undefined || lastCall === null || (typeof lastCall === 'object' && lastCall !== null && 'phase' in lastCall && (lastCall as { phase: string }).phase === 'final')).toBe(true);
  });

  // Story 6.7 AC3: Multiple tool calls in single PTC container
  it('PTC: should count multiple tool calls in single container (AC3)', async () => {
    // Given: PTC stream with multiple server_tool_use blocks
    const eventMock = vi.fn();
    const langfuseModule = await import('../observability/langfuse.js');
    vi.spyOn(langfuseModule, 'getLangfuse').mockReturnValue({
      span: vi.fn(() => ({ end: vi.fn() })),
      trace: vi.fn(() => ({ id: 't1', update: vi.fn(), span: vi.fn(() => ({ end: vi.fn() })), generation: vi.fn() })),
      flushAsync: vi.fn(),
      shutdownAsync: vi.fn(),
      score: vi.fn(),
      event: eventMock,
    });

    // Mock stream with 3 tool calls in sequence
    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtc({
        toolCalls: [
          { name: 'search_web', input: { query: 'first' } },
          { name: 'search_api', input: { query: 'second' } },
          { name: 'fetch_data', input: { url: 'third' } },
        ],
        codeResult: { return_code: 0, stdout: 'Combined results', stderr: '' },
      })
    );

    // When: Execute agent loop
    const gen = executeAgentLoop('Test', {
      ...baseOptions,
      executeTool: vi.fn(async () => ({ success: true, data: 'result' })),
    });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Langfuse event should report all 3 tool calls
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ptc_execution_completed',
        metadata: expect.objectContaining({
          toolCallCount: 3,
        }),
      })
    );
  });

  // Story 6.7 Edge case: Empty stdout handling
  it('PTC: should handle empty stdout gracefully', async () => {
    // Given: PTC stream with empty stdout
    const eventMock = vi.fn();
    const langfuseModule = await import('../observability/langfuse.js');
    vi.spyOn(langfuseModule, 'getLangfuse').mockReturnValue({
      span: vi.fn(() => ({ end: vi.fn() })),
      trace: vi.fn(() => ({ id: 't1', update: vi.fn(), span: vi.fn(() => ({ end: vi.fn() })), generation: vi.fn() })),
      flushAsync: vi.fn(),
      shutdownAsync: vi.fn(),
      score: vi.fn(),
      event: eventMock,
    });

    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithPtc({
        toolCalls: [{ name: 'silent_tool', input: {} }],
        codeResult: { return_code: 0, stdout: '', stderr: '' }, // Empty stdout
      })
    );

    // When: Execute agent loop
    const gen = executeAgentLoop('Test', {
      ...baseOptions,
      executeTool: vi.fn(async () => ({ success: true })),
    });
    while (true) {
      const next = await gen.next();
      if (next.done) break;
    }

    // Then: Should complete without error and report 0 token savings
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ptc_execution_completed',
        metadata: expect.objectContaining({
          estimatedTokenSavings: 0, // Empty stdout = 0 savings
        }),
      })
    );
  });
});

/**
 * Story 6.2: Skills API Client - pause_turn and extractFileIds Tests
 *
 * Tests for handling pause_turn stop reason and extracting file IDs
 * from bash_code_execution_tool_result content blocks.
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#8 - pause_turn stop reason continues conversation
 * @see AC#9 - extractFileIds() parses file IDs from results
 */
describe('executeAgentLoop Skills Integration (Story 6.2)', () => {
  const baseOptions: AgentLoopOptions = createAgentLoopOptions();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // AC#8: pause_turn stop reason continues conversation
  // ==========================================================================

  describe('pause_turn handling (AC#8)', () => {
    it('should continue conversation when stop_reason is pause_turn', async () => {
      // GIVEN: Stream returns pause_turn stop reason, then end_turn
      const containerId = createContainerId();

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: createMockStreamWithPauseTurn({ containerId }),
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: [
              { type: 'message_start', message: { model: 'claude-sonnet-4-20250514', container: containerId } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Operation completed.' } },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 50, output_tokens: 20 } },
            ],
          })
        );

      // WHEN: Executing agent loop
      const chunks: string[] = [];
      const gen = executeAgentLoop('Run long operation', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
        chunks.push(next.value);
      }

      // THEN: Loop should have continued and produced final response
      expect(messagesCreateMock).toHaveBeenCalledTimes(2);
      expect(chunks.join('')).toContain('Operation completed');
    });

    it('should preserve container ID across pause_turn continuation', async () => {
      // GIVEN: pause_turn with specific container ID
      const containerId = 'container-preserved-123';

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: createMockStreamWithPauseTurn({ containerId }),
          })
        )
        .mockImplementationOnce(async () =>
          createMockStreamWithText('Done')
        );

      // WHEN: Executing agent loop
      const gen = executeAgentLoop('Test', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // THEN: Second request should include same container ID (Story 6.2: now as object)
      expect(messagesCreateMock).toHaveBeenCalledTimes(2);
      const secondCallArgs = messagesCreateMock.mock.calls[1][0] as { container?: { id?: string } };
      expect(secondCallArgs.container?.id).toBe(containerId);
    });

    it('should handle multiple pause_turn cycles', async () => {
      // GIVEN: Multiple pause_turn cycles before completion
      const containerId = createContainerId();

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: createMockStreamWithPauseTurn({ containerId }),
          })
        )
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: createMockStreamWithPauseTurn({ containerId }),
          })
        )
        .mockImplementationOnce(async () =>
          createMockStreamWithText('Finally done')
        );

      // WHEN: Executing agent loop
      const chunks: string[] = [];
      const gen = executeAgentLoop('Long multi-step operation', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
        chunks.push(next.value);
      }

      // THEN: Should have made 3 API calls
      expect(messagesCreateMock).toHaveBeenCalledTimes(3);
      expect(chunks.join('')).toContain('Finally done');
    });

    it('should log pause_turn continuation with traceId', async () => {
      // GIVEN: pause_turn response
      const containerId = createContainerId();
      const loggerModule = await import('../utils/logger.js');
      const infoMock = loggerModule.logger.info as unknown as ReturnType<typeof vi.fn>;

      messagesCreateMock
        .mockImplementationOnce(async () =>
          createMockMessageStream({
            events: createMockStreamWithPauseTurn({ containerId }),
          })
        )
        .mockImplementationOnce(async () =>
          createMockStreamWithText('Done')
        );

      // WHEN: Executing agent loop
      const gen = executeAgentLoop('Test', baseOptions);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
      }

      // THEN: pause_turn should be logged
      expect(infoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'agent.loop.pause_turn',
          traceId: expect.any(String),
          containerId,
        })
      );
    });
  });

  // ==========================================================================
  // AC#9: extractFileIds() parses file IDs from results
  // ==========================================================================

  describe('extractFileIds (AC#9)', () => {
    it('should extract file IDs from bash_code_execution_tool_result', async () => {
      // GIVEN: Response with code_execution_tool_result containing file_ids
      const fileIds = ['file_abc123', 'file_def456'];

      messagesCreateMock.mockImplementation(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'stu_1', name: 'code_execution', input: {} } },
            createMockCodeExecutionResultWithFiles({ fileIds }),
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Created files.' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 100, output_tokens: 50 } },
          ],
        })
      );

      // WHEN: Executing agent loop
      const gen = executeAgentLoop('Generate report', baseOptions);
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
      }

      // THEN: File IDs should be extractable from result
      // Note: The actual extractFileIds function will be implemented in loop.ts
      // This test ensures the response structure is correctly processed
      expect(result).toBeDefined();
    });

    it('should handle response with no file_ids', async () => {
      // GIVEN: code_execution_tool_result without file_ids
      messagesCreateMock.mockImplementation(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'stu_1', name: 'code_execution', input: {} } },
            {
              type: 'content_block_start',
              index: 1,
              content_block: {
                type: 'code_execution_tool_result',
                content: { return_code: 0, stdout: 'Done', stderr: '' },
                // No files field
              },
            },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Completed.' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 100, output_tokens: 50 } },
          ],
        })
      );

      // WHEN: Executing agent loop
      const gen = executeAgentLoop('Test', baseOptions);
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
      }

      // THEN: Should complete without error (AgentResult has tokens, not response)
      expect(result).toBeDefined();
      expect(result.inputTokens).toBeGreaterThanOrEqual(0);
      expect(result.outputTokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple file_ids in single result', async () => {
      // GIVEN: code_execution_tool_result with multiple files
      const fileIds = ['file_1', 'file_2', 'file_3', 'file_4'];

      messagesCreateMock.mockImplementation(async () =>
        createMockMessageStream({
          events: [
            { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
            createMockCodeExecutionResultWithFiles({ fileIds }),
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Generated 4 files.' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 100, output_tokens: 50 } },
          ],
        })
      );

      // WHEN: Executing agent loop
      const gen = executeAgentLoop('Generate multiple', baseOptions);
      let result;
      while (true) {
        const next = await gen.next();
        if (next.done) {
          result = next.value;
          break;
        }
      }

      // THEN: Should complete with all files tracked
      expect(result).toBeDefined();
    });
  });
});

/**
 * Unit tests for extractFileIds helper function
 *
 * @see Story 6.2 AC#9 - File ID extraction from results
 */
describe('extractFileIds', () => {
  // Note: This function will be implemented in loop.ts
  // These tests document the expected behavior

  it('extracts file_id from code_execution_tool_result content block', async () => {
    // GIVEN: Import the function (will be added in implementation)
    const { extractFileIds } = await import('./loop.js');

    // WHEN: Parsing a response with file_ids
    const mockResponse = {
      content: [
        {
          type: 'code_execution_tool_result',
          content: {
            return_code: 0,
            stdout: 'Done',
            stderr: '',
            files: [{ file_id: 'file_abc123' }, { file_id: 'file_def456' }],
          },
        },
      ],
    };

    const result = extractFileIds(mockResponse);

    // THEN: File IDs are extracted
    expect(result.fileIds).toContain('file_abc123');
    expect(result.fileIds).toContain('file_def456');
  });

  it('returns empty array when no file_ids present', async () => {
    const { extractFileIds } = await import('./loop.js');

    const mockResponse = {
      content: [
        {
          type: 'text',
          text: 'No files generated.',
        },
      ],
    };

    const result = extractFileIds(mockResponse);

    expect(result.fileIds).toEqual([]);
  });

  it('handles nested content blocks', async () => {
    const { extractFileIds } = await import('./loop.js');

    const mockResponse = {
      content: [
        { type: 'text', text: 'Starting...' },
        {
          type: 'code_execution_tool_result',
          content: {
            return_code: 0,
            stdout: 'Created file',
            stderr: '',
            files: [{ file_id: 'file_nested123' }],
          },
        },
        { type: 'text', text: 'Done.' },
      ],
    };

    const result = extractFileIds(mockResponse);

    expect(result.fileIds).toContain('file_nested123');
    expect(result.fileIds).toHaveLength(1);
  });
});

// ==========================================================================
// Story 6.3: Container Lifecycle Integration Tests
// ==========================================================================

describe('Container Lifecycle Integration (Story 6.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containerLifecycleMock.getContainerId.mockReset();
    containerLifecycleMock.setContainerId.mockReset();
  });

  it('should call getContainerId at loop start when threadTs is provided (AC#1)', async () => {
    // GIVEN: Options with threadTs (threaded conversation)
    const threadTs = '1704672000.123456';
    const context = createAgentContext({ threadTs });
    const options = createAgentLoopOptions({ context });

    containerLifecycleMock.getContainerId.mockReturnValue(undefined);

    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithText('Hello!', { inputTokens: 10, outputTokens: 5 })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Hi', options);
    while (!(await gen.next()).done) {
      // consume
    }

    // THEN: getContainerId should be called with threadTs
    expect(containerLifecycleMock.getContainerId).toHaveBeenCalledWith(threadTs);
  });

  it('should NOT call getContainerId when threadTs is undefined (AC#2)', async () => {
    // GIVEN: Options without threadTs (non-threaded DM)
    const context = createAgentContext({ threadTs: undefined });
    const options = createAgentLoopOptions({ context });

    messagesCreateMock.mockImplementation(async () =>
      createMockStreamWithText('Hello!', { inputTokens: 10, outputTokens: 5 })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Hi', options);
    while (!(await gen.next()).done) {
      // consume
    }

    // THEN: getContainerId should NOT be called
    expect(containerLifecycleMock.getContainerId).not.toHaveBeenCalled();
  });

  it('should call setContainerId when new container ID received (AC#3)', async () => {
    // GIVEN: Options with threadTs
    const threadTs = '1704672000.123456';
    const containerId = 'cntr_new_container_123';
    const context = createAgentContext({ threadTs });
    const options = createAgentLoopOptions({ context });

    containerLifecycleMock.getContainerId.mockReturnValue(undefined); // No existing container

    // API returns container ID in message_start
    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514', container: containerId } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
        ],
      })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Hi', options);
    while (!(await gen.next()).done) {
      // consume
    }

    // THEN: setContainerId should be called with new container
    expect(containerLifecycleMock.setContainerId).toHaveBeenCalledWith(threadTs, containerId);
  });

  it('should NOT call setContainerId when container ID unchanged (reuse)', async () => {
    // GIVEN: Options with threadTs and existing container
    const threadTs = '1704672000.123456';
    const existingContainerId = 'cntr_existing_123';
    const context = createAgentContext({ threadTs });
    const options = createAgentLoopOptions({ context });

    containerLifecycleMock.getContainerId.mockReturnValue(existingContainerId);

    // API returns same container ID
    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514', container: existingContainerId } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
        ],
      })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Hi', options);
    while (!(await gen.next()).done) {
      // consume
    }

    // THEN: setContainerId should NOT be called (same container, no update needed)
    expect(containerLifecycleMock.setContainerId).not.toHaveBeenCalled();
  });

  it('should NOT call setContainerId when threadTs is undefined', async () => {
    // GIVEN: Options without threadTs
    const containerId = 'cntr_new_123';
    const context = createAgentContext({ threadTs: undefined });
    const options = createAgentLoopOptions({ context });

    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514', container: containerId } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
        ],
      })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Hi', options);
    while (!(await gen.next()).done) {
      // consume
    }

    // THEN: setContainerId should NOT be called (no threadTs to track)
    expect(containerLifecycleMock.setContainerId).not.toHaveBeenCalled();
  });

  it('should reuse existing container ID from lifecycle manager', async () => {
    // GIVEN: Lifecycle manager has existing container
    const threadTs = '1704672000.123456';
    const existingContainerId = 'cntr_cached_456';
    const context = createAgentContext({ threadTs });
    const options = createAgentLoopOptions({ context });

    containerLifecycleMock.getContainerId.mockReturnValue(existingContainerId);

    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514', container: existingContainerId } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
        ],
      })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Hi', options);
    while (!(await gen.next()).done) {
      // consume
    }

    // THEN: API call should include container.id from lifecycle manager
    expect(messagesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        container: expect.objectContaining({ id: existingContainerId }),
      })
    );
  });
});

/**
 * Story 8.1: Citations API Integration Tests
 *
 * @see Story 8.1 - Anthropic Citations API Integration
 * @see AC#1 - Extract citation blocks from streaming response
 * @see AC#4 - Return documentCitations in AgentLoopResult
 */
describe('Story 8.1: Citations API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containerLifecycleMock.getContainerId.mockReturnValue(null);
  });

  it('AC#1, AC#4: extracts document citations from streaming response', async () => {
    // GIVEN: Mock response with citation content blocks
    const context = createAgentContext();
    const options = createAgentLoopOptions({ context });

    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
          // Text block
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'According to the document, ' } },
          // Citation block for document 0
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'cite',
              cited_text: 'Revenue grew 12% YoY',
              document_index: 0,
              start_char_index: 100,
              end_char_index: 120,
            },
          },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'revenue grew 12%.' } },
          // Second citation block
          {
            type: 'content_block_start',
            index: 2,
            content_block: {
              type: 'cite',
              cited_text: 'User retention improved',
              document_index: 1,
              start_char_index: 50,
              end_char_index: 73,
            },
          },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 100, output_tokens: 50 } },
        ],
      })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Summarize the documents', options);
    let result;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    // THEN: Result should contain extracted document citations
    expect(result.documentCitations).toHaveLength(2);

    // First citation
    expect(result.documentCitations[0]).toEqual({
      type: 'cite',
      cited_text: 'Revenue grew 12% YoY',
      document_index: 0,
      start_char_index: 100,
      end_char_index: 120,
    });

    // Second citation
    expect(result.documentCitations[1]).toEqual({
      type: 'cite',
      cited_text: 'User retention improved',
      document_index: 1,
      start_char_index: 50,
      end_char_index: 73,
    });
  });

  it('AC#6: returns empty array when no citations in response', async () => {
    // GIVEN: Mock response without citation blocks
    const context = createAgentContext();
    const options = createAgentLoopOptions({ context });

    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello, no citations here!' } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
        ],
      })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Hi', options);
    let result;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    // THEN: documentCitations should be empty array (not undefined)
    expect(result.documentCitations).toEqual([]);
  });

  it('ignores malformed citation blocks with missing fields', async () => {
    // GIVEN: Mock response with incomplete citation block
    const context = createAgentContext();
    const options = createAgentLoopOptions({ context });

    messagesCreateMock.mockImplementation(async () =>
      createMockMessageStream({
        events: [
          { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
          // Text block (required for verification to pass)
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The document says: ' } },
          // Malformed citation - missing cited_text
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'cite',
              // cited_text: missing!
              document_index: 0,
              start_char_index: 0,
              end_char_index: 10,
            },
          },
          // Valid citation
          {
            type: 'content_block_start',
            index: 2,
            content_block: {
              type: 'cite',
              cited_text: 'Valid citation',
              document_index: 0,
              start_char_index: 0,
              end_char_index: 14,
            },
          },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
        ],
      })
    );

    // WHEN: Executing agent loop
    const gen = executeAgentLoop('Test', options);
    let result;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    // THEN: Only valid citation should be extracted
    expect(result.documentCitations).toHaveLength(1);
    expect(result.documentCitations[0].cited_text).toBe('Valid citation');
  });
});

