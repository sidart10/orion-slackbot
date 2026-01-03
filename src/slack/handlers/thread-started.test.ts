/**
 * Tests for Thread Started Handler
 *
 * Verifies:
 * - AC#1 - threadStarted events handled
 * - AC#5 - Handler wrapped in Langfuse trace
 * - AR11 - All handlers wrapped in Langfuse traces
 * - Story 5.3 - Memory auto-check at conversation start
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

// Mock the memory loader (Story 5.3)
vi.mock('../../tools/memory/loader.js', () => ({
  loadRelevantMemories: vi.fn().mockResolvedValue({
    global: undefined,
    user: undefined,
    session: undefined,
    loadDurationMs: 50,
    scopesFound: [],
  }),
  formatMemoriesForContext: vi.fn().mockReturnValue(''),
}));

// Mock config
vi.mock('../../config/environment.js', () => ({
  config: {
    gcsMemoriesBucket: 'test-bucket',
  },
}));

describe('Thread Started Handler', () => {
  let handleThreadStarted: typeof import('./thread-started.js').handleThreadStarted;
  let mockSay: ReturnType<typeof vi.fn>;
  let mockSetSuggestedPrompts: ReturnType<typeof vi.fn>;
  let mockSaveThreadContext: ReturnType<typeof vi.fn>;
  let mockSetStatus: ReturnType<typeof vi.fn>;
  let startActiveObservation: ReturnType<typeof vi.fn>;
  let logger: { info: ReturnType<typeof vi.fn> };
  let loadRelevantMemories: ReturnType<typeof vi.fn>;
  let formatMemoriesForContext: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    const tracingModule = await import('../../observability/tracing.js');
    startActiveObservation =
      tracingModule.startActiveObservation as ReturnType<typeof vi.fn>;

    const loggerModule = await import('../../utils/logger.js');
    logger = loggerModule.logger as unknown as {
      info: ReturnType<typeof vi.fn>;
    };

    const memoryLoaderModule = await import('../../tools/memory/loader.js');
    loadRelevantMemories = memoryLoaderModule.loadRelevantMemories as ReturnType<typeof vi.fn>;
    formatMemoriesForContext = memoryLoaderModule.formatMemoriesForContext as ReturnType<typeof vi.fn>;

    const handlerModule = await import('./thread-started.js');
    handleThreadStarted = handlerModule.handleThreadStarted;

    mockSay = vi.fn().mockResolvedValue(undefined);
    mockSetSuggestedPrompts = vi.fn().mockResolvedValue(undefined);
    mockSaveThreadContext = vi.fn().mockResolvedValue(undefined);
    mockSetStatus = vi.fn().mockResolvedValue(undefined);
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
      setStatus: mockSetStatus,
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

  it('should save thread context with memory state (Story 5.3 AC#1, AC#3)', async () => {
    const event = createThreadStartedEvent();
    await handleThreadStarted(event);

    expect(mockSaveThreadContext).toHaveBeenCalledTimes(1);
    expect(mockSaveThreadContext).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryContext: expect.any(String),
        memoryLoadedAt: expect.any(String),
        scopesLoaded: expect.any(Array),
      })
    );
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

  describe('Memory Auto-Check (Story 5.3)', () => {
    it('should load memories at thread start (AC#1)', async () => {
      const event = createThreadStartedEvent();
      await handleThreadStarted(event);

      expect(loadRelevantMemories).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'U123456',
          threadTs: '1234567890.123456',
          bucket: 'test-bucket',
        })
      );
    });

    it('should show loading status while fetching memories (AC#1)', async () => {
      const event = createThreadStartedEvent();
      await handleThreadStarted(event);

      expect(mockSetStatus).toHaveBeenCalledWith('Restoring your preferences...');
    });

    it('should send personalized greeting when user preferences exist (AC#2)', async () => {
      loadRelevantMemories.mockResolvedValueOnce({
        user: '{"timezone": "UTC"}',
        loadDurationMs: 50,
        scopesFound: ['user'],
      });

      const event = createThreadStartedEvent();
      await handleThreadStarted(event);

      expect(mockSay).toHaveBeenCalledWith(
        expect.stringContaining('Welcome back')
      );
    });

    it('should send default greeting when no user preferences (AC#6)', async () => {
      loadRelevantMemories.mockResolvedValueOnce({
        loadDurationMs: 50,
        scopesFound: [],
      });

      const event = createThreadStartedEvent();
      await handleThreadStarted(event);

      expect(mockSay).toHaveBeenCalledWith(
        expect.stringContaining("I'm Orion")
      );
    });

    it('should format memories for context injection (AC#1, AC#4)', async () => {
      loadRelevantMemories.mockResolvedValueOnce({
        global: 'Global context',
        user: '{"pref": "value"}',
        loadDurationMs: 50,
        scopesFound: ['global', 'user'],
      });

      const event = createThreadStartedEvent();
      await handleThreadStarted(event);

      expect(formatMemoriesForContext).toHaveBeenCalled();
    });

    it('should log memory loading result (AC#7)', async () => {
      loadRelevantMemories.mockResolvedValueOnce({
        global: 'Global context',
        loadDurationMs: 100,
        scopesFound: ['global'],
      });

      const event = createThreadStartedEvent();
      await handleThreadStarted(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'thread_started.memories_loaded',
          scopesFound: ['global'],
          durationMs: 100,
        })
      );
    });
  });
});

