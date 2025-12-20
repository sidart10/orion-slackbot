/**
 * Tests for User Message Handler
 *
 * Verifies Story 2.1 Claude Agent SDK Integration:
 * - AC#1: Messages passed to Claude Agent SDK via query()
 * - AC#2: System prompt from .orion/agents/orion.md
 * - AC#3: Response streamed back to Slack
 * - AC#4: Full interaction traced in Langfuse
 * - AC#5: Response time 1-3 seconds (NFR1)
 * 
 * Plus Story 1.5 streaming requirements:
 * - Streaming starts within 500ms (NFR4)
 * - Thread history fetched from Slack API
 * - mrkdwn formatting applied
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the streaming module
const mockStreamerInstance = {
  start: vi.fn().mockResolvedValue(undefined),
  append: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue({ totalDuration: 100, totalChars: 50 }),
};

vi.mock('../../utils/streaming.js', () => ({
  createStreamer: vi.fn(() => mockStreamerInstance),
}));

// Mock the formatting module
vi.mock('../../utils/formatting.js', () => ({
  formatSlackMrkdwn: vi.fn((text) => text), // Pass through for testing
}));

// Mock the Orion agent
vi.mock('../../agent/orion.js', () => ({
  runOrionAgent: vi.fn(async function* () {
    yield 'Hello ';
    yield 'from ';
    yield 'Orion!';
  }),
}));

// Mock the observability module
const mockSpan = { end: vi.fn() };
vi.mock('../../observability/tracing.js', () => ({
  startActiveObservation: vi.fn(async (context, operation) => {
    const mockTrace = {
      id: 'mock-trace-id',
      update: vi.fn(),
      span: vi.fn(() => mockSpan),
      generation: vi.fn(),
    };
    return operation(mockTrace);
  }),
  createSpan: vi.fn(() => mockSpan),
}));

// Mock thread history fetching for Assistant handler
vi.mock('../thread-context.js', () => ({
  fetchThreadHistory: vi.fn(async () => [
    { user: 'U1', text: 'Previous message', ts: '1', isBot: false },
  ]),
  formatThreadHistoryForContext: vi.fn(() => 'User: Previous message'),
  formatThreadHistoryForAgent: vi.fn((messages) =>
    messages.map((m: { isBot: boolean; text: string }) => `${m.isBot ? 'Orion' : 'User'}: ${m.text}`)
  ),
  THREAD_HISTORY_LIMIT: 20,
}));

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the conversations module (Story 2.8)
const mockSaveConversationSummary = vi.fn().mockResolvedValue(undefined);
vi.mock('../../memory/conversations.js', () => ({
  saveConversationSummary: mockSaveConversationSummary,
}));

// Mock the sandbox module (Story 3.0)
const mockExecuteAgentInSandbox = vi.fn().mockResolvedValue({
  success: true,
  response: 'Hello from Orion!',
  tokenUsage: { input: 10, output: 20 },
  duration: 1000,
});
vi.mock('../../sandbox/index.js', () => ({
  executeAgentInSandbox: mockExecuteAgentInSandbox,
}));

describe('User Message Handler', () => {
  let handleUserMessage: typeof import('./user-message.js').handleUserMessage;
  let handleAssistantUserMessage: typeof import('./user-message.js').handleAssistantUserMessage;
  let mockSay: ReturnType<typeof vi.fn>;
  let startActiveObservation: ReturnType<typeof vi.fn>;
  let createSpan: ReturnType<typeof vi.fn>;
  let createStreamer: ReturnType<typeof vi.fn>;
  let formatSlackMrkdwn: ReturnType<typeof vi.fn>;
  let logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();

    // Reset mock implementations
    mockStreamerInstance.start.mockClear();
    mockStreamerInstance.append.mockClear();
    mockStreamerInstance.stop.mockClear();
    mockStreamerInstance.stop.mockResolvedValue({ totalDuration: 100, totalChars: 50 });
    
    // Reset sandbox mock
    mockExecuteAgentInSandbox.mockClear();
    mockExecuteAgentInSandbox.mockResolvedValue({
      success: true,
      response: 'Hello from Orion!',
      tokenUsage: { input: 10, output: 20 },
      duration: 1000,
    });

    const tracingModule = await import('../../observability/tracing.js');
    startActiveObservation = tracingModule.startActiveObservation as ReturnType<typeof vi.fn>;
    createSpan = tracingModule.createSpan as ReturnType<typeof vi.fn>;

    const streamingModule = await import('../../utils/streaming.js');
    createStreamer = streamingModule.createStreamer as ReturnType<typeof vi.fn>;

    const formattingModule = await import('../../utils/formatting.js');
    formatSlackMrkdwn = formattingModule.formatSlackMrkdwn as ReturnType<typeof vi.fn>;

    const loggerModule = await import('../../utils/logger.js');
    logger = loggerModule.logger as unknown as { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

    const handlerModule = await import('./user-message.js');
    handleUserMessage = handlerModule.handleUserMessage;
    handleAssistantUserMessage = handlerModule.handleAssistantUserMessage;

    mockSay = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMessageEvent(overrides: Record<string, unknown> = {}): Parameters<typeof handleUserMessage>[0] {
    return {
      message: {
        type: 'message',
        channel: 'D123456',
        user: 'U123456',
        text: 'Hello Orion',
        ts: '1234567890.123456',
        ...overrides,
      },
      say: mockSay,
      client: {},
      context: {
        teamId: 'T123456',
      },
    } as unknown as Parameters<typeof handleUserMessage>[0];
  }

  function createAssistantArgs(
    overrides: Record<string, unknown> = {}
  ): Parameters<typeof handleAssistantUserMessage>[0] {
    return {
      message: {
        type: 'message',
        channel: 'D123456',
        user: 'U123456',
        text: 'Hello Orion',
        ts: '1234567890.123456',
        ...overrides,
      },
      say: mockSay,
      setTitle: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
      getThreadContext: vi.fn().mockResolvedValue(undefined),
      client: {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.999999' }),
        },
        conversations: {
          replies: vi.fn().mockResolvedValue({ messages: [] }),
        },
      } as unknown,
      context: {
        teamId: 'T123456',
      },
    } as unknown as Parameters<typeof handleAssistantUserMessage>[0];
  }

  it('should skip bot messages to avoid loops (AC#1)', async () => {
    const event = createMessageEvent({ bot_id: 'B123' });
    await handleUserMessage(event);

    expect(startActiveObservation).not.toHaveBeenCalled();
    expect(mockSay).not.toHaveBeenCalled();
  });

  it('should skip messages without text', async () => {
    const event = createMessageEvent({ text: undefined });
    await handleUserMessage(event);

    expect(startActiveObservation).not.toHaveBeenCalled();
    expect(mockSay).not.toHaveBeenCalled();
  });

  it('should wrap handler in Langfuse trace (AC#3)', async () => {
    const event = createMessageEvent();
    await handleUserMessage(event);

    expect(startActiveObservation).toHaveBeenCalledTimes(1);
    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'user-message-handler',
        userId: 'U123456',
        sessionId: '1234567890.123456',
      }),
      expect.any(Function)
    );
  });

  it('should send agent response (AC#1 - Claude Agent SDK integration)', async () => {
    const event = createMessageEvent();
    await handleUserMessage(event);

    expect(mockSay).toHaveBeenCalledTimes(1);
    // Legacy handler now uses runOrionAgent which yields "Hello from Orion!"
    expect(mockSay).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello from Orion!',
        thread_ts: '1234567890.123456',
      })
    );
  });

  it('should reply in thread when in a thread', async () => {
    const event = createMessageEvent({
      thread_ts: '1234567890.000000',
      ts: '1234567890.123456',
    });
    await handleUserMessage(event);

    expect(mockSay).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_ts: '1234567890.000000', // Should use parent thread_ts
      })
    );
  });

  it('should log message received event', async () => {
    const event = createMessageEvent();
    await handleUserMessage(event);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message_received',
        userId: 'U123456',
        channelId: 'D123456',
        traceId: 'mock-trace-id',
      })
    );
  });

  it('should log message handled event', async () => {
    const event = createMessageEvent();
    await handleUserMessage(event);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message_handled',
        userId: 'U123456',
        channelId: 'D123456',
        traceId: 'mock-trace-id',
      })
    );
  });

  it('should include input in trace context', async () => {
    const event = createMessageEvent({ text: 'Test message' });
    await handleUserMessage(event);

    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          text: 'Test message',
          channel: 'D123456',
        }),
      }),
      expect.any(Function)
    );
  });

  it('should include metadata in trace', async () => {
    const event = createMessageEvent();
    await handleUserMessage(event);

    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          teamId: 'T123456',
          isThreadReply: false,
        }),
      }),
      expect.any(Function)
    );
  });

  it('should execute via sandbox for Assistant handler (Story 3.0)', async () => {
    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    // Story 3.0: Uses sandbox execution, not streaming
    // Streamer is created but stopped before sandbox call
    expect(createStreamer).toHaveBeenCalledTimes(1);
    expect(mockStreamerInstance.start).toHaveBeenCalledTimes(1);
    expect(mockStreamerInstance.stop).toHaveBeenCalled();

    // Sandbox is called for execution
    expect(mockExecuteAgentInSandbox).toHaveBeenCalled();

    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'assistant-user-message-handler',
      }),
      expect.any(Function)
    );
  });

  it('should set thread title from message (AC#3)', async () => {
    const mockSetTitle = vi.fn().mockResolvedValue(undefined);
    const args = createAssistantArgs();
    (args as unknown as { setTitle: typeof mockSetTitle }).setTitle = mockSetTitle;

    await handleAssistantUserMessage(args);

    expect(mockSetTitle).toHaveBeenCalledTimes(1);
    expect(mockSetTitle).toHaveBeenCalledWith('Hello Orion');
  });

  it('should show thinking status (AC#3)', async () => {
    const mockSetStatus = vi.fn().mockResolvedValue(undefined);
    const args = createAssistantArgs();
    (args as unknown as { setStatus: typeof mockSetStatus }).setStatus = mockSetStatus;

    await handleAssistantUserMessage(args);

    expect(mockSetStatus).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith('is thinking...');
  });

  it('should fetch thread history from Slack API (AC#4)', async () => {
    const { fetchThreadHistory } = await import('../thread-context.js');
    const args = createAssistantArgs();

    await handleAssistantUserMessage(args);

    expect(fetchThreadHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D123456',
        threadTs: '1234567890.123456',
        limit: 20,
      })
    );
  });

  it('should post response via sandbox (AC#1, AC#3)', async () => {
    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    // Story 3.0: Sandbox is called with the user message
    expect(mockExecuteAgentInSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: 'Hello Orion',
      })
    );
    // The sandbox updates the Slack message directly via callback
  });

  describe('Agent Integration (Story 2.1)', () => {
    it('should call sandbox with user message and context (AC#1)', async () => {
      const args = createAssistantArgs();

      await handleAssistantUserMessage(args);

      expect(mockExecuteAgentInSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: 'Hello Orion',
          slackChannel: 'D123456',
        })
      );
    });

    it('should include thread history in sandbox call (AC#2)', async () => {
      const args = createAssistantArgs();

      await handleAssistantUserMessage(args);

      expect(mockExecuteAgentInSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          threadHistory: expect.arrayContaining([expect.stringContaining('User:')]),
        })
      );
    });

    it('should include traceId in sandbox call (AC#4)', async () => {
      const args = createAssistantArgs();

      await handleAssistantUserMessage(args);

      expect(mockExecuteAgentInSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'mock-trace-id',
        })
      );
    });
  });

  describe('Streaming behavior (Story 1.5)', () => {
    it('should initialize streamer with correct config (AC#1)', async () => {
      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'D123456',
          threadTs: '1234567890.123456',
        })
      );
    });

    it('should create streaming span for Langfuse (AC#6)', async () => {
      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(createSpan).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'response-streaming',
        })
      );
    });

    it('should format chunks with Slack mrkdwn (AC#3, #4, #5)', async () => {
      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(formatSlackMrkdwn).toHaveBeenCalled();
    });

    it('should log stream initialization with NFR4 timing (AC#2)', async () => {
      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'stream_initialized',
          timeToStreamStart: expect.any(Number),
          nfr4Met: expect.any(Boolean),
        })
      );
    });

    it('should log final metrics after streaming complete', async () => {
      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user_message_handled',
          streamDuration: expect.any(Number),
          responseLength: expect.any(Number),
        })
      );
    });

    it('should fallback to say() on sandbox error', async () => {
      // Make sandbox return failure
      mockExecuteAgentInSandbox.mockResolvedValueOnce({
        success: false,
        error: 'Sandbox error',
        duration: 1000,
      });

      const args = createAssistantArgs();

      await expect(handleAssistantUserMessage(args)).rejects.toThrow('Sandbox error');

      // Should attempt error recovery via say (user-friendly message)
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.any(String),
          thread_ts: expect.any(String),
        })
      );
    });

    it('should stop streamer even on error', async () => {
      // Make sandbox return failure
      mockExecuteAgentInSandbox.mockResolvedValueOnce({
        success: false,
        error: 'Sandbox error',
        duration: 1000,
      });

      const args = createAssistantArgs();

      await expect(handleAssistantUserMessage(args)).rejects.toThrow();

      // Streamer was stopped before sandbox call
      expect(mockStreamerInstance.stop).toHaveBeenCalled();
    });

    it('should fallback to say() if required streaming fields are missing (H2 fix)', async () => {
      const args = createAssistantArgs();
      // Remove teamId to trigger validation failure
      (args as unknown as { context: { teamId?: string } }).context = {};

      await handleAssistantUserMessage(args);

      // Should use say() fallback instead of streaming
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('configuration issue'),
        })
      );
      // Should NOT attempt streaming
      expect(mockStreamerInstance.start).not.toHaveBeenCalled();
    });
  });
});

describe('User Message Handler - DM Handling (Story 2.5 Task 5)', () => {
  let handleUserMessage: typeof import('./user-message.js').handleUserMessage;
  let handleAssistantUserMessage: typeof import('./user-message.js').handleAssistantUserMessage;
  let mockSay: ReturnType<typeof vi.fn>;
  let mockClient: {
    conversations: { replies: ReturnType<typeof vi.fn> };
    chat: { postMessage: ReturnType<typeof vi.fn> };
  };
  let logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let fetchThreadHistory: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const module = await import('./user-message.js');
    handleUserMessage = module.handleUserMessage;
    handleAssistantUserMessage = module.handleAssistantUserMessage;

    mockSay = vi.fn().mockResolvedValue({ ok: true });
    mockClient = {
      conversations: {
        replies: vi.fn().mockResolvedValue({ messages: [] }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.999999' }),
      },
    };

    const loggerModule = await import('../../utils/logger.js');
    logger = loggerModule.logger as unknown as {
      info: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    const threadContextModule = await import('../thread-context.js');
    fetchThreadHistory = threadContextModule.fetchThreadHistory as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('AC#5: should handle DM messages (channel_type = im)', async () => {
    const message = {
      type: 'message',
      user: 'U123',
      text: 'Hello in DM',
      channel: 'D456',
      ts: '1234567890.123456',
      channel_type: 'im',
    };

    await handleUserMessage({
      message,
      say: mockSay,
      context: { teamId: 'T789' },
      client: mockClient as any,
    } as any);

    // Should respond to DM
    expect(mockSay).toHaveBeenCalled();

    // Should log with isDM: true
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message_received',
        isDM: true,
      })
    );
  });

  it('should fetch conversation history for DMs', async () => {
    const message = {
      type: 'message',
      user: 'U123',
      text: 'Follow up question',
      channel: 'D456',
      ts: '1234567890.123456',
      channel_type: 'im',
    };

    await handleUserMessage({
      message,
      say: mockSay,
      context: { teamId: 'T789' },
      client: mockClient as any,
    } as any);

    // Should fetch thread history
    expect(fetchThreadHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D456',
      })
    );
  });

  it('should log context gathered for DMs', async () => {
    const message = {
      type: 'message',
      user: 'U123',
      text: 'What did we discuss?',
      channel: 'D456',
      ts: '1234567890.123456',
      channel_type: 'im',
    };

    await handleUserMessage({
      message,
      say: mockSay,
      context: { teamId: 'T789' },
      client: mockClient as any,
    } as any);

    // Should log dm_context_gathered
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'dm_context_gathered',
        isDM: true,
      })
    );
  });

  it('should handle channel messages (non-DM)', async () => {
    const message = {
      type: 'message',
      user: 'U123',
      text: 'Channel message',
      channel: 'C456',
      ts: '1234567890.123456',
      // No channel_type or channel_type !== 'im'
    };

    await handleUserMessage({
      message,
      say: mockSay,
      context: { teamId: 'T789' },
      client: mockClient as any,
    } as any);

    // Should still work
    expect(mockSay).toHaveBeenCalled();

    // isDM should be false or undefined
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message_received',
        isDM: false,
      })
    );
  });

  it('should use message.ts as threadTs for DMs without thread_ts (M4 fix)', async () => {
    const message = {
      type: 'message',
      user: 'U123',
      text: 'DM without thread_ts',
      channel: 'D456',
      ts: '1234567890.123456',
      channel_type: 'im',
      // No thread_ts - this is a DM without explicit thread
    };

    await handleUserMessage({
      message,
      say: mockSay,
      context: { teamId: 'T789' },
      client: mockClient as any,
    } as any);

    // Should fetch thread history using message.ts as threadTs
    expect(fetchThreadHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D456',
        threadTs: '1234567890.123456', // Uses message.ts when no thread_ts
      })
    );
  });

  it('should use thread_ts for DMs with explicit thread', async () => {
    const message = {
      type: 'message',
      user: 'U123',
      text: 'DM in thread',
      channel: 'D456',
      ts: '1234567890.999999',
      thread_ts: '1234567890.123456', // Explicit thread
      channel_type: 'im',
    };

    await handleUserMessage({
      message,
      say: mockSay,
      context: { teamId: 'T789' },
      client: mockClient as any,
    } as any);

    // Should fetch thread history using thread_ts
    expect(fetchThreadHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D456',
        threadTs: '1234567890.123456', // Uses thread_ts when available
      })
    );
  });

  /**
   * Story 2.8 - File-Based Memory Integration Tests
   * @see AC#4 - Conversation summaries stored in orion-context/conversations/
   * @see Task 5.1 - Generate summaries at thread end
   */
  describe('Conversation Summary Generation (Story 2.8 Task 5.1)', () => {
    it('should call saveConversationSummary after successful response', async () => {
      // Mock thread history with multiple messages
      const { fetchThreadHistory } = await import('../thread-context.js');
      vi.mocked(fetchThreadHistory).mockResolvedValueOnce([
        { user: 'U1', text: 'First message', ts: '1', isBot: false },
        { user: 'U2', text: 'Second message', ts: '2', isBot: false },
        { user: 'U1', text: 'Third message', ts: '3', isBot: false },
      ]);

      await handleAssistantUserMessage({
        message: {
          type: 'message',
          user: 'U123',
          text: 'Tell me about AI',
          channel: 'C456',
          ts: '1234567890.123456',
          thread_ts: '1234567890.000000',
        },
        say: mockSay,
        setTitle: vi.fn(),
        setStatus: vi.fn(),
        getThreadContext: vi.fn().mockResolvedValue(null),
        setThreadContext: vi.fn(),
        context: { teamId: 'T789', userId: 'U123' },
        client: mockClient,
      } as any);

      // Allow background promise to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(mockSaveConversationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: 'C456',
          threadTs: expect.any(String),
          summary: expect.stringContaining('# Conversation Summary'),
          participants: expect.any(Array),
          topics: expect.any(Array),
          createdAt: expect.any(String),
        })
      );
    });

    it('should not call saveConversationSummary with insufficient context', async () => {
      mockSaveConversationSummary.mockClear();

      // Mock thread history with only 1 message (insufficient)
      const { fetchThreadHistory } = await import('../thread-context.js');
      vi.mocked(fetchThreadHistory).mockResolvedValueOnce([
        { user: 'U1', text: 'Single message', ts: '1', isBot: false },
      ]);

      await handleAssistantUserMessage({
        message: {
          type: 'message',
          user: 'U123',
          text: 'Short question',
          channel: 'C456',
          ts: '1234567890.123456',
          thread_ts: '1234567890.000000',
        },
        say: mockSay,
        setTitle: vi.fn(),
        setStatus: vi.fn(),
        getThreadContext: vi.fn().mockResolvedValue(null),
        setThreadContext: vi.fn(),
        context: { teamId: 'T789', userId: 'U123' },
        client: mockClient,
      } as any);

      // Allow background promise to settle
      await new Promise((r) => setTimeout(r, 50));

      // Should not be called due to insufficient context (< 2 messages)
      expect(mockSaveConversationSummary).not.toHaveBeenCalled();
    });

    it('should handle summary save errors gracefully', async () => {
      mockSaveConversationSummary.mockRejectedValueOnce(new Error('Disk full'));

      // Mock thread history with multiple messages
      const { fetchThreadHistory } = await import('../thread-context.js');
      vi.mocked(fetchThreadHistory).mockResolvedValueOnce([
        { user: 'U1', text: 'First message', ts: '1', isBot: false },
        { user: 'U2', text: 'Second message', ts: '2', isBot: false },
      ]);

      // Should not throw - error is handled gracefully
      await expect(
        handleAssistantUserMessage({
          message: {
            type: 'message',
            user: 'U123',
            text: 'Test message',
            channel: 'C456',
            ts: '1234567890.123456',
            thread_ts: '1234567890.000000',
          },
          say: mockSay,
          setTitle: vi.fn(),
          setStatus: vi.fn(),
          getThreadContext: vi.fn().mockResolvedValue(null),
          setThreadContext: vi.fn(),
          context: { teamId: 'T789', userId: 'U123' },
          client: mockClient,
        } as any)
      ).resolves.not.toThrow();
    });
  });
});

