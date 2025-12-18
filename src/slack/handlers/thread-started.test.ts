/**
 * Tests for Thread Started Handler
 *
 * Verifies:
 * - AC#1 - threadStarted events handled
 * - AC#5 - Handler wrapped in Langfuse trace
 * - AR11 - All handlers wrapped in Langfuse traces
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the observability module
vi.mock('../../observability/tracing.js', () => ({
  startActiveObservation: vi.fn(async (context, operation) => {
    const mockTrace = {
      id: 'mock-trace-id',
      update: vi.fn(),
      span: vi.fn(() => ({ end: vi.fn() })),
      generation: vi.fn(),
    };
    return operation(mockTrace);
  }),
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

describe('Thread Started Handler', () => {
  let handleThreadStarted: typeof import('./thread-started.js').handleThreadStarted;
  let mockSay: ReturnType<typeof vi.fn>;
  let mockSetSuggestedPrompts: ReturnType<typeof vi.fn>;
  let mockSaveThreadContext: ReturnType<typeof vi.fn>;
  let startActiveObservation: ReturnType<typeof vi.fn>;
  let logger: { info: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();

    const tracingModule = await import('../../observability/tracing.js');
    startActiveObservation =
      tracingModule.startActiveObservation as ReturnType<typeof vi.fn>;

    const loggerModule = await import('../../utils/logger.js');
    logger = loggerModule.logger as unknown as {
      info: ReturnType<typeof vi.fn>;
    };

    const handlerModule = await import('./thread-started.js');
    handleThreadStarted = handlerModule.handleThreadStarted;

    mockSay = vi.fn().mockResolvedValue(undefined);
    mockSetSuggestedPrompts = vi.fn().mockResolvedValue(undefined);
    mockSaveThreadContext = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createThreadStartedEvent(): Parameters<
    typeof handleThreadStarted
  >[0] {
    return {
      event: {
        type: 'assistant_thread_started',
        assistant_thread: {
          user_id: 'U123456',
          channel_id: 'C123456',
          thread_ts: '1234567890.123456',
        },
      },
      say: mockSay,
      setSuggestedPrompts: mockSetSuggestedPrompts,
      saveThreadContext: mockSaveThreadContext,
      getThreadContext: vi.fn().mockResolvedValue({}),
      setTitle: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
      client: {},
      context: {
        teamId: 'T123456',
      },
    } as unknown as Parameters<typeof handleThreadStarted>[0];
  }

  it('should wrap handler in Langfuse trace (AC#5)', async () => {
    const event = createThreadStartedEvent();
    await handleThreadStarted(event);

    expect(startActiveObservation).toHaveBeenCalledTimes(1);
    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'thread-started-handler',
        userId: 'U123456',
        sessionId: '1234567890.123456',
      }),
      expect.any(Function)
    );
  });

  it('should send greeting message (AC#1)', async () => {
    const event = createThreadStartedEvent();
    await handleThreadStarted(event);

    expect(mockSay).toHaveBeenCalledTimes(1);
    expect(mockSay).toHaveBeenCalledWith(
      expect.stringContaining("I'm Orion")
    );
  });

  it('should set suggested prompts', async () => {
    const event = createThreadStartedEvent();
    await handleThreadStarted(event);

    expect(mockSetSuggestedPrompts).toHaveBeenCalledTimes(1);
    expect(mockSetSuggestedPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.any(String),
        prompts: expect.arrayContaining([
          expect.objectContaining({
            title: expect.any(String),
            message: expect.any(String),
          }),
        ]),
      })
    );
  });

  it('should save thread context', async () => {
    const event = createThreadStartedEvent();
    await handleThreadStarted(event);

    expect(mockSaveThreadContext).toHaveBeenCalledTimes(1);
  });

  it('should log thread started event', async () => {
    const event = createThreadStartedEvent();
    await handleThreadStarted(event);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'thread_started',
        userId: 'U123456',
        channelId: 'C123456',
        traceId: 'mock-trace-id',
      })
    );
  });
});

