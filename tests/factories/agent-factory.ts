/**
 * Agent Test Data Factories
 *
 * Factories for creating realistic test data for agent-related tests.
 * Uses @faker-js/faker to generate varied, realistic data.
 *
 * @see docs/testing-standards.md - Data Factory pattern
 *
 * Usage:
 *   import { createAgentContext, createAgentLoopOptions } from '../../../tests/factories/agent-factory';
 *
 *   const context = createAgentContext({ userId: 'U_SPECIFIC' });
 *   const options = createAgentLoopOptions({ context });
 */

import { faker } from '@faker-js/faker';
import type { AgentContext } from '../../src/agent/orion.js';
import type { AgentLoopOptions } from '../../src/agent/loop.js';

// ============================================================================
// AgentContext Factory
// ============================================================================

/**
 * Creates a realistic AgentContext for testing.
 *
 * @param overrides - Partial context to override defaults
 * @returns Complete AgentContext with realistic data
 *
 * @example
 * // Default context with random IDs
 * const context = createAgentContext();
 *
 * @example
 * // Override specific fields
 * const context = createAgentContext({
 *   userId: 'U123456',
 *   threadHistory: [
 *     { role: 'user', content: 'Hello!' },
 *   ],
 * });
 */
export function createAgentContext(
  overrides: Partial<AgentContext> = {}
): AgentContext {
  return {
    threadHistory: overrides.threadHistory ?? [],
    userId: overrides.userId ?? createSlackUserId(),
    channelId: overrides.channelId ?? createSlackChannelId(),
    traceId: overrides.traceId ?? faker.string.uuid(),
    ...overrides,
  };
}

/**
 * Creates a thread history message.
 *
 * @param overrides - Partial message to override defaults
 * @returns Thread history message
 *
 * @example
 * const userMessage = createThreadMessage({ role: 'user', content: 'Hello!' });
 * const assistantMessage = createThreadMessage({ role: 'assistant', content: 'Hi there!' });
 */
export function createThreadMessage(
  overrides: Partial<{ role: 'user' | 'assistant'; content: string }> = {}
): { role: 'user' | 'assistant'; content: string } {
  return {
    role: overrides.role ?? 'user',
    content: overrides.content ?? faker.lorem.sentence(),
  };
}

/**
 * Creates a realistic thread history with multiple messages.
 *
 * @param count - Number of messages (alternates user/assistant)
 * @returns Array of thread messages
 *
 * @example
 * // Create 4 messages (2 user, 2 assistant)
 * const history = createThreadHistory(4);
 */
export function createThreadHistory(
  count: number
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    messages.push(createThreadMessage({ role }));
  }

  return messages;
}

// ============================================================================
// AgentLoopOptions Factory
// ============================================================================

/**
 * Creates realistic AgentLoopOptions for testing.
 *
 * @param overrides - Partial options to override defaults
 * @returns Complete AgentLoopOptions with realistic data
 *
 * @example
 * // Default options with random context
 * const options = createAgentLoopOptions();
 *
 * @example
 * // Override context and system prompt
 * const options = createAgentLoopOptions({
 *   context: createAgentContext({ userId: 'U_SPECIFIC' }),
 *   systemPrompt: 'You are a specialized assistant.',
 * });
 *
 * @example
 * // With status updater callback
 * const statusCalls: string[] = [];
 * const options = createAgentLoopOptions({
 *   setStatus: ({ phase, toolName }) => {
 *     statusCalls.push(`${phase}:${toolName ?? 'none'}`);
 *   },
 * });
 */
export function createAgentLoopOptions(
  overrides: Partial<AgentLoopOptions> = {}
): AgentLoopOptions {
  return {
    context: overrides.context ?? createAgentContext(),
    systemPrompt: overrides.systemPrompt ?? 'You are Orion, a helpful assistant.',
    trace: overrides.trace,
    setStatus: overrides.setStatus,
    ...overrides,
  };
}

// ============================================================================
// Mock Anthropic Stream Helpers
// ============================================================================

/**
 * Creates a mock async iterable stream (like Anthropic SDK returns).
 *
 * @param events - Array of stream events
 * @returns Async iterable that yields events
 *
 * @example
 * const stream = createMockMessageStream({
 *   events: [
 *     { type: 'message_start', message: { model: 'claude-sonnet-4' } },
 *     { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
 *     { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { ... } },
 *   ],
 * });
 *
 * for await (const event of stream) {
 *   console.log(event);
 * }
 */
export function createMockMessageStream(params: {
  events: Array<unknown>;
}): {
  [Symbol.asyncIterator]: () => {
    next: () => Promise<{ value: unknown; done: boolean }>;
  };
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

/**
 * Creates a simple mock stream with just text (no tools).
 *
 * @param text - Text content to stream
 * @param options - Optional model and usage overrides
 * @returns Mock stream ready for Anthropic messages.create mock
 *
 * @example
 * messagesCreateMock.mockImplementation(async () =>
 *   createMockStreamWithText('Hello, world!')
 * );
 */
export function createMockStreamWithText(
  text: string,
  options: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  } = {}
) {
  return createMockMessageStream({
    events: [
      {
        type: 'message_start',
        message: { model: options.model ?? 'claude-sonnet-4-20250514' },
      },
      {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          input_tokens: options.inputTokens ?? 100,
          output_tokens: options.outputTokens ?? 50,
        },
      },
    ],
  });
}

/**
 * Creates a mock stream with tool use.
 *
 * @param contentBlocks - Array of content blocks (text or tool_use)
 * @param options - Optional model and usage overrides
 * @returns Mock stream with tool use
 *
 * @example
 * messagesCreateMock.mockImplementation(async () =>
 *   createMockStreamWithToolUse([
 *     { type: 'text', text: 'Let me search for that.' },
 *     { type: 'tool_use', id: 'tool_1', name: 'web_search', input: { query: 'test' } },
 *   ])
 * );
 */
export function createMockStreamWithToolUse(
  contentBlocks: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>,
  options: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  } = {}
) {
  const events: Array<unknown> = [
    {
      type: 'message_start',
      message: { model: options.model ?? 'claude-sonnet-4-20250514' },
    },
  ];

  for (const block of contentBlocks) {
    if (block.type === 'text') {
      events.push({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: block.text },
      });
    } else if (block.type === 'tool_use') {
      events.push({
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          id: block.id ?? faker.string.alphanumeric(10),
          name: block.name ?? 'unknown_tool',
          input: block.input ?? {},
        },
      });
    }
  }

  events.push({
    type: 'message_delta',
    delta: { stop_reason: 'tool_use' },
    usage: {
      input_tokens: options.inputTokens ?? 100,
      output_tokens: options.outputTokens ?? 50,
    },
  });

  return createMockMessageStream({ events });
}

/**
 * Creates a mock stream with multiple text chunks (for testing streaming).
 *
 * @param chunks - Array of text chunks to stream
 * @param options - Optional model and usage overrides
 * @returns Mock stream that yields chunks sequentially
 *
 * @example
 * messagesCreateMock.mockImplementation(async () =>
 *   createMockStreamWithChunks(['Hello ', 'world', '!'])
 * );
 */
export function createMockStreamWithChunks(
  chunks: string[],
  options: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  } = {}
) {
  const events: Array<unknown> = [
    {
      type: 'message_start',
      message: { model: options.model ?? 'claude-sonnet-4-20250514' },
    },
  ];

  // Add each chunk as a separate delta event
  for (const chunk of chunks) {
    events.push({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: chunk },
    });
  }

  events.push({
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: {
      input_tokens: options.inputTokens ?? 100,
      output_tokens: options.outputTokens ?? chunks.join('').length,
    },
  });

  return createMockMessageStream({ events });
}

// ============================================================================
// Slack ID Generators
// ============================================================================

/**
 * Creates a realistic Slack user ID.
 *
 * Format: U followed by 9 uppercase alphanumeric characters
 * Example: U0928FBEH9C, U123456789
 *
 * @returns Slack user ID
 *
 * @example
 * const userId = createSlackUserId();  // 'U8H7K2P9Q1'
 */
export function createSlackUserId(): string {
  return `U${faker.string.alphanumeric({ length: 9, casing: 'upper' })}`;
}

/**
 * Creates a realistic Slack channel ID.
 *
 * Format: C followed by 6-9 uppercase alphanumeric characters
 * Example: C123456, C0928FBEH
 *
 * @returns Slack channel ID
 *
 * @example
 * const channelId = createSlackChannelId();  // 'C8H7K2P'
 */
export function createSlackChannelId(): string {
  const length = faker.number.int({ min: 6, max: 9 });
  return `C${faker.string.alphanumeric({ length, casing: 'upper' })}`;
}

/**
 * Creates a realistic Slack timestamp.
 *
 * Format: Unix timestamp with microsecond precision (e.g., "1234567890.123456")
 *
 * @param date - Optional date to convert (defaults to recent date)
 * @returns Slack timestamp string
 *
 * @example
 * const ts = createSlackTimestamp();  // '1234567890.123456'
 * const specific = createSlackTimestamp(new Date('2024-01-01'));
 */
export function createSlackTimestamp(date?: Date): string {
  const d = date ?? faker.date.recent();
  const seconds = Math.floor(d.getTime() / 1000);
  const microseconds = faker.string.numeric(6);
  return `${seconds}.${microseconds}`;
}

// ============================================================================
// PTC (Programmatic Tool Calling) Factory Helpers - Story 6.3
// ============================================================================

/**
 * Creates a mock stream with PTC (Programmatic Tool Calling) events.
 *
 * @param params - PTC stream configuration
 * @returns Mock stream with server_tool_use, tool_use with caller, and code_execution_tool_result
 *
 * @example
 * const stream = createMockStreamWithPtc({
 *   containerId: 'container-123',
 *   toolCalls: [{ name: 'search_api', input: { query: 'test' } }],
 *   codeResult: { return_code: 0, stdout: 'result', stderr: '' },
 * });
 */
export function createMockStreamWithPtc(params: {
  containerId?: string;
  serverToolUseId?: string;
  toolCalls?: Array<{ id?: string; name: string; input: unknown }>;
  codeResult?: { return_code: number; stdout: string; stderr: string };
  model?: string;
}) {
  const {
    containerId = 'ptc-container-' + faker.string.alphanumeric(8),
    serverToolUseId = 'stu_' + faker.string.alphanumeric(10),
    toolCalls = [],
    codeResult = { return_code: 0, stdout: 'Execution complete', stderr: '' },
    model = 'claude-sonnet-4-20250514',
  } = params;

  const events: Array<unknown> = [
    // message_start with container field
    {
      type: 'message_start',
      message: {
        model,
        container: containerId,
      },
    },
    // server_tool_use block (Claude starts code execution)
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'server_tool_use',
        id: serverToolUseId,
        name: 'code_execution',
        input: {},
      },
    },
  ];

  // Add tool_use blocks with caller (programmatic calls from code)
  let index = 1;
  for (const toolCall of toolCalls) {
    events.push({
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id: toolCall.id ?? 'toolu_' + faker.string.alphanumeric(10),
        name: toolCall.name,
        input: toolCall.input,
        caller: {
          type: 'code_execution_20250825',
          id: serverToolUseId,
        },
      },
    });
    events.push({ type: 'content_block_stop', index });
    index++;
  }

  // code_execution_tool_result
  events.push({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'code_execution_tool_result',
      content: codeResult,
    },
  });
  events.push({ type: 'content_block_stop', index });

  // message_delta with stop_reason
  events.push({
    type: 'message_delta',
    delta: { stop_reason: toolCalls.length > 0 ? 'tool_use' : 'end_turn' },
    usage: { input_tokens: 100, output_tokens: 50 },
  });
  events.push({ type: 'message_stop' });

  return createMockMessageStream({ events });
}

/**
 * Creates a mock stream with container expiration error.
 *
 * @example
 * const stream = createMockStreamWithPtcExpired();
 */
export function createMockStreamWithPtcExpired() {
  return createMockStreamWithPtc({
    codeResult: {
      return_code: 1,
      stdout: '',
      stderr: 'container_expired: Container no longer available',
    },
  });
}

/**
 * Creates a mock stream with PTC timeout error.
 *
 * @example
 * const stream = createMockStreamWithPtcTimeout();
 */
export function createMockStreamWithPtcTimeout() {
  return createMockStreamWithPtc({
    codeResult: {
      return_code: 1,
      stdout: '',
      stderr: 'TimeoutError: Code execution exceeded time limit',
    },
  });
}

// ============================================================================
// Convenience Builders
// ============================================================================

/**
 * Creates a complete test scenario with context, options, and mock stream.
 *
 * Useful for quickly setting up common test scenarios.
 *
 * @param scenario - Scenario configuration
 * @returns Complete test setup
 *
 * @example
 * const { options, mockStream, context } = createTestScenario({
 *   responseText: 'Hello!',
 *   userId: 'U_SPECIFIC',
 * });
 *
 * messagesCreateMock.mockImplementation(async () => mockStream);
 * const result = await executeAgentLoop('Hi', options);
 */
export function createTestScenario(scenario: {
  /** User ID for the context */
  userId?: string;
  /** Channel ID for the context */
  channelId?: string;
  /** Thread history messages */
  threadHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** System prompt */
  systemPrompt?: string;
  /** Response text to stream */
  responseText?: string;
  /** Tool use blocks (if any) */
  toolUse?: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  /** Status callback */
  setStatus?: AgentLoopOptions['setStatus'];
}) {
  const context = createAgentContext({
    userId: scenario.userId,
    channelId: scenario.channelId,
    threadHistory: scenario.threadHistory,
  });

  const options = createAgentLoopOptions({
    context,
    systemPrompt: scenario.systemPrompt,
    setStatus: scenario.setStatus,
  });

  const mockStream = scenario.toolUse
    ? createMockStreamWithToolUse(scenario.toolUse)
    : createMockStreamWithText(scenario.responseText ?? 'Test response');

  return {
    context,
    options,
    mockStream,
  };
}
