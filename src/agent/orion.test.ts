/**
 * Tests for Orion Agent Core Module
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#1 - Message passed to Claude Agent SDK via query()
 * @see AC#3 - Response streamed back
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mocks
const {
  mockExecuteAgentLoop,
  mockQuery,
  mockLoadAgentPrompt,
  mockGetPrompt,
  mockLogger,
} = vi.hoisted(() => ({
  mockExecuteAgentLoop: vi.fn(),
  mockQuery: vi.fn(),
  mockLoadAgentPrompt: vi.fn(),
  mockGetPrompt: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock dependencies
vi.mock('./loop.js', () => ({
  executeAgentLoop: mockExecuteAgentLoop,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

vi.mock('./loader.js', () => ({
  loadAgentPrompt: mockLoadAgentPrompt,
}));

vi.mock('./tools.js', () => ({
  toolConfig: {
    mcpServers: {},
    allowedTools: ['Read', 'Write', 'Bash'],
  },
}));

vi.mock('../observability/langfuse.js', () => ({
  getPrompt: mockGetPrompt,
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
}));

import {
  runOrionAgent,
  runOrionAgentDirect,
  type AgentOptions,
  type AgentContext,
} from './orion.js';

describe('runOrionAgent (with Agent Loop)', () => {
  const mockContext: AgentContext = {
    threadHistory: ['User: Hello', 'Orion: Hi there!'],
    userId: 'U123',
    channelId: 'C456',
    threadTs: '1234567890.123456',
    traceId: 'trace-789',
  };

  const mockOptions: AgentOptions = {
    context: mockContext,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for executeAgentLoop
    mockExecuteAgentLoop.mockResolvedValue({
      content: 'Test response from loop',
      sources: [],
      verified: true,
      attemptCount: 1,
    });

    // Default mock for loadAgentPrompt
    mockLoadAgentPrompt.mockResolvedValue('You are Orion, an AI assistant.');

    // Default mock for getPrompt (fails, triggers fallback)
    mockGetPrompt.mockRejectedValue(new Error('Not configured'));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return an async generator', async () => {
    const generator = runOrionAgent('Test message', mockOptions);

    expect(generator).toBeDefined();
    expect(typeof generator[Symbol.asyncIterator]).toBe('function');
  });

  it('should yield response content from agent loop', async () => {
    mockExecuteAgentLoop.mockResolvedValue({
      content: 'Hello World!',
      sources: [],
      verified: true,
      attemptCount: 1,
    });

    const chunks: string[] = [];
    for await (const chunk of runOrionAgent('Test message', mockOptions)) {
      chunks.push(chunk);
    }

    expect(chunks).toContain('Hello World!');
  });

  it('should call executeAgentLoop with correct parameters', async () => {
    const generator = runOrionAgent('What is TypeScript?', mockOptions);
    for await (const _ of generator) {
      // consume
    }

    expect(mockExecuteAgentLoop).toHaveBeenCalledWith(
      'What is TypeScript?',
      expect.objectContaining({
        userId: 'U123',
        channelId: 'C456',
        threadTs: '1234567890.123456',
        threadHistory: ['User: Hello', 'Orion: Hi there!'],
      }),
      expect.anything() // parent trace
    );
  });

  it('should include source citations when sources are present', async () => {
    mockExecuteAgentLoop.mockResolvedValue({
      content: 'Based on my research...',
      sources: [
        { type: 'thread', reference: 'Thread 123' },
        { type: 'file', reference: 'knowledge/test.md' },
      ],
      verified: true,
      attemptCount: 1,
    });

    const chunks: string[] = [];
    for await (const chunk of runOrionAgent('Test', mockOptions)) {
      chunks.push(chunk);
    }

    const fullResponse = chunks.join('');
    expect(fullResponse).toContain('Sources:');
    expect(fullResponse).toContain('Thread 123');
    expect(fullResponse).toContain('knowledge/test.md');
  });

  it('should log completion with verified status', async () => {
    mockExecuteAgentLoop.mockResolvedValue({
      content: 'Response',
      sources: [],
      verified: true,
      attemptCount: 2,
    });

    const generator = runOrionAgent('Test', mockOptions);
    for await (const _ of generator) {
      // consume
    }

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'orion_agent_complete',
        verified: true,
        attemptCount: 2,
      })
    );
  });

  it('should handle unverified responses', async () => {
    mockExecuteAgentLoop.mockResolvedValue({
      content: 'I apologize...',
      sources: [],
      verified: false,
      attemptCount: 3,
    });

    const chunks: string[] = [];
    for await (const chunk of runOrionAgent('Test', mockOptions)) {
      chunks.push(chunk);
    }

    expect(chunks).toContain('I apologize...');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'orion_agent_complete',
        verified: false,
        attemptCount: 3,
      })
    );
  });
});

describe('runOrionAgentDirect (Legacy Direct SDK Access)', () => {
  const mockContext: AgentContext = {
    threadHistory: ['User: Hello', 'Orion: Hi there!'],
    userId: 'U123',
    channelId: 'C456',
    traceId: 'trace-789',
  };

  const mockOptions: AgentOptions = {
    context: mockContext,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAgentPrompt.mockResolvedValue('You are Orion, an AI assistant.');
    mockGetPrompt.mockRejectedValue(new Error('Not configured'));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return an async generator', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Hello' };
      })()
    );

    const generator = runOrionAgentDirect('Test message', mockOptions);

    expect(generator).toBeDefined();
    expect(typeof generator[Symbol.asyncIterator]).toBe('function');
  });

  it('should yield text chunks from agent response', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Hello ' };
        yield { type: 'text', content: 'World!' };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of runOrionAgentDirect('Test message', mockOptions)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello ', 'World!']);
  });

  it('should call query with system prompt and user message', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Response' };
      })()
    );

    const generator = runOrionAgentDirect('What is TypeScript?', mockOptions);
    for await (const _ of generator) {
      // consume
    }

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'What is TypeScript?',
      })
    );
  });

  it('should use system prompt override when provided', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Custom response' };
      })()
    );

    const optionsWithOverride: AgentOptions = {
      ...mockOptions,
      systemPromptOverride: 'Custom system prompt',
    };

    const generator = runOrionAgentDirect('Test', optionsWithOverride);
    for await (const _ of generator) {
      // consume
    }

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          systemPrompt: 'Custom system prompt',
        }),
      })
    );
  });

  it('should filter non-text message types', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Hello' };
        yield { type: 'tool_use', content: { tool: 'test' } };
        yield { type: 'text', content: ' World' };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of runOrionAgentDirect('Test', mockOptions)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello', ' World']);
  });

  it('should include tool configuration in query options', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Done' };
      })()
    );

    const generator = runOrionAgentDirect('Test', mockOptions);
    for await (const _ of generator) {
      // consume
    }

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          allowedTools: ['Read', 'Write', 'Bash'],
        }),
      })
    );
  });

  it('should fall back to local agent prompt when Langfuse fails', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Done' };
      })()
    );

    const generator = runOrionAgentDirect('Test', mockOptions);
    for await (const _ of generator) {
      // consume
    }

    expect(mockLoadAgentPrompt).toHaveBeenCalledWith('orion');
  });
});

describe('AgentContext interface', () => {
  it('should accept valid context structure', () => {
    const context: AgentContext = {
      threadHistory: [],
      userId: 'U123',
      channelId: 'C456',
    };

    expect(context.threadHistory).toEqual([]);
    expect(context.userId).toBe('U123');
    expect(context.channelId).toBe('C456');
    expect(context.traceId).toBeUndefined();
  });

  it('should accept optional traceId', () => {
    const context: AgentContext = {
      threadHistory: ['msg1'],
      userId: 'U123',
      channelId: 'C456',
      traceId: 'trace-abc',
    };

    expect(context.traceId).toBe('trace-abc');
  });

  it('should accept optional threadTs', () => {
    const context: AgentContext = {
      threadHistory: [],
      userId: 'U123',
      channelId: 'C456',
      threadTs: '1234567890.123456',
    };

    expect(context.threadTs).toBe('1234567890.123456');
  });
});

describe('AgentOptions interface', () => {
  it('should accept valid options structure', () => {
    const options: AgentOptions = {
      context: {
        threadHistory: [],
        userId: 'U123',
        channelId: 'C456',
      },
    };

    expect(options.context).toBeDefined();
    expect(options.systemPromptOverride).toBeUndefined();
  });

  it('should accept optional systemPromptOverride', () => {
    const options: AgentOptions = {
      context: {
        threadHistory: [],
        userId: 'U123',
        channelId: 'C456',
      },
      systemPromptOverride: 'Custom prompt',
    };

    expect(options.systemPromptOverride).toBe('Custom prompt');
  });

  it('should accept optional parentTrace', () => {
    const options: AgentOptions = {
      context: {
        threadHistory: [],
        userId: 'U123',
        channelId: 'C456',
      },
      parentTrace: {
        id: 'trace-123',
        update: () => {},
        span: () => ({ end: () => {} }),
        generation: () => {},
      },
    };

    expect(options.parentTrace).toBeDefined();
  });
});
