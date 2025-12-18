/**
 * Tests for Thread Context Changed Handler
 *
 * Verifies:
 * - AC#2 - threadContextChanged events handled
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

describe('Thread Context Changed Handler', () => {
  let handleThreadContextChanged: typeof import('./thread-context-changed.js').handleThreadContextChanged;
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

    const handlerModule = await import('./thread-context-changed.js');
    handleThreadContextChanged = handlerModule.handleThreadContextChanged;

    mockSaveThreadContext = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createContextChangedEvent(): Parameters<
    typeof handleThreadContextChanged
  >[0] {
    return {
      event: {
        type: 'assistant_thread_context_changed',
        assistant_thread: {
          user_id: 'U123456',
          channel_id: 'C123456',
          thread_ts: '1234567890.123456',
        },
      },
      saveThreadContext: mockSaveThreadContext,
      getThreadContext: vi.fn().mockResolvedValue({}),
      say: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
      setSuggestedPrompts: vi.fn().mockResolvedValue(undefined),
      client: {},
      context: {
        teamId: 'T123456',
      },
    } as unknown as Parameters<typeof handleThreadContextChanged>[0];
  }

  it('should wrap handler in Langfuse trace (AC#5)', async () => {
    const event = createContextChangedEvent();
    await handleThreadContextChanged(event);

    expect(startActiveObservation).toHaveBeenCalledTimes(1);
    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'thread-context-changed-handler',
        userId: 'U123456',
        sessionId: '1234567890.123456',
      }),
      expect.any(Function)
    );
  });

  it('should save thread context (AC#2)', async () => {
    const event = createContextChangedEvent();
    await handleThreadContextChanged(event);

    expect(mockSaveThreadContext).toHaveBeenCalledTimes(1);
  });

  it('should log context changed event', async () => {
    const event = createContextChangedEvent();
    await handleThreadContextChanged(event);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'thread_context_changed',
        userId: 'U123456',
        channelId: 'C123456',
        traceId: 'mock-trace-id',
      })
    );
  });
});

