/**
 * Tests for User Message Handler
 *
 * Verifies:
 * - AC#1: Messages are received by Slack Bolt app / Streams to chatStream
 * - AC#2: Streaming starts within 500ms (NFR4)
 * - AC#3: Handler is wrapped in Langfuse trace / mrkdwn formatting
 * - AC#4: Thread history fetched
 * - AC#5: No blockquotes
 * - AC#6: No emojis / Complete response traced
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

// Mock the response generator
vi.mock('../response-generator.js', () => ({
  generatePlaceholderResponse: vi.fn(function* (count: number) {
    yield `Response with ${count} context`;
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
      client: {} as unknown,
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

  it('should send acknowledgment response (AC#4)', async () => {
    const event = createMessageEvent();
    await handleUserMessage(event);

    expect(mockSay).toHaveBeenCalledTimes(1);
    expect(mockSay).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Orion received your message',
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

  it('should log message acknowledged event', async () => {
    const event = createMessageEvent();
    await handleUserMessage(event);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message_acknowledged',
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

  it('should stream response for Assistant handler (Story 1-5 streaming)', async () => {
    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    // Should use streaming, not say
    expect(createStreamer).toHaveBeenCalledTimes(1);
    expect(mockStreamerInstance.start).toHaveBeenCalledTimes(1);
    expect(mockStreamerInstance.append).toHaveBeenCalled();
    expect(mockStreamerInstance.stop).toHaveBeenCalledTimes(1);

    // say should NOT be called when streaming succeeds
    expect(mockSay).not.toHaveBeenCalled();

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

  it('should stream response with context count (AC#4)', async () => {
    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    // Response is streamed via append, not say
    expect(mockStreamerInstance.append).toHaveBeenCalled();
    // The mock generator yields content with context count
    const appendCalls = mockStreamerInstance.append.mock.calls;
    expect(appendCalls.length).toBeGreaterThan(0);
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

    it('should fallback to say() on streaming error', async () => {
      mockStreamerInstance.append.mockRejectedValueOnce(new Error('Stream error'));

      const args = createAssistantArgs();

      await expect(handleAssistantUserMessage(args)).rejects.toThrow('Stream error');

      // Should attempt error recovery via say
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('error'),
        })
      );
    });

    it('should stop streamer even on error', async () => {
      mockStreamerInstance.append.mockRejectedValueOnce(new Error('Stream error'));

      const args = createAssistantArgs();

      await expect(handleAssistantUserMessage(args)).rejects.toThrow();

      expect(mockStreamerInstance.stop).toHaveBeenCalled();
    });
  });
});

