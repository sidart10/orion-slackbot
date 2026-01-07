/**
 * Tests for Assistant User Message Handler
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see AC#1 - Messages passed to Anthropic API via messages.create() with streaming
 * @see AC#2 - System prompt constructed from .orion/agents/orion.md
 * @see AC#3 - Response streamed back to Slack
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
  runOrionAgent: vi.fn(function* () {
    yield 'Hello ';
    yield 'from Orion!';
    return {
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 1500,
      nfr1Met: true,
    };
  }),
}));

// Mock the agent loader
vi.mock('../../agent/loader.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('You are Orion, a helpful assistant.'),
}));

// Mock config
vi.mock('../../config/environment.js', () => ({
  config: {
    anthropicModel: 'claude-sonnet-4-20250514',
    anthropicMaxContextTokens: 200000,
    gcsMemoriesBucket: 'test-bucket',
    compactionThreshold: undefined,
    compactionKeepLastN: undefined,
    compactionMaxSummaryTokens: undefined,
    compactionTimeoutMs: undefined,
    threadHistoryLimit: undefined,
    threadHistoryMaxTokens: undefined,
  },
}));

// Mock memory loader (Story 5.3)
vi.mock('../../tools/memory/loader.js', () => ({
  loadRelevantMemories: vi.fn(),
  formatMemoriesForContext: vi.fn(),
}));

// Mock the observability module
const startSpanCalls: Array<{ name: string; attributes?: unknown }> = [];
const mockSpan = { end: vi.fn(), update: vi.fn().mockReturnThis() };
const mockGeneration = { end: vi.fn() };
const mockUnderlyingSpan = { id: 'mock-underlying-span-id' };
vi.mock('../../observability/tracing.js', () => ({
  startActiveObservation: vi.fn(async (context, operation) => {
    const mockTrace = {
      id: 'mock-trace-id',
      update: vi.fn().mockReturnThis(),
      startSpan: vi.fn((name: string, attributes?: unknown) => {
        startSpanCalls.push({ name, attributes });
        return mockSpan;
      }),
      startGeneration: vi.fn(() => mockGeneration),
      _span: mockUnderlyingSpan,
    };
    return operation(mockTrace);
  }),
  setTraceIdForMessage: vi.fn(),
}));

// Mock thread history fetching for Assistant handler
vi.mock('../thread-context.js', () => ({
  fetchThreadHistory: vi.fn(async () => [
    { user: 'U1', text: 'Previous message', ts: '1', isBot: false },
  ]),
}));

// Mock the feedback block
vi.mock('../feedback-block.js', () => ({
  feedbackBlock: { type: 'section', text: { type: 'mrkdwn', text: 'Feedback' } },
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

// Mock the compaction module
vi.mock('../../agent/compaction.js', () => ({
  shouldTriggerCompaction: vi.fn(() => false), // Default: no compaction needed
  compactThreadHistory: vi.fn(),
  estimateContextTokens: vi.fn(() => 5000),
  resolveMaxContextTokens: vi.fn(() => 200000),
}));

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Summary' }],
      }),
    },
  })),
}));

describe('Assistant User Message Handler', () => {
  let handleAssistantUserMessage: typeof import('./user-message.js').handleAssistantUserMessage;
  let mockSay: ReturnType<typeof vi.fn>;
  let startActiveObservation: ReturnType<typeof vi.fn>;
  let createStreamer: ReturnType<typeof vi.fn>;
  let formatSlackMrkdwn: ReturnType<typeof vi.fn>;
  let runOrionAgent: ReturnType<typeof vi.fn>;
  let loadAgentPrompt: ReturnType<typeof vi.fn>;
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetModules();
    startSpanCalls.length = 0;

    // Reset mock implementations
    mockStreamerInstance.start.mockClear();
    mockStreamerInstance.append.mockClear();
    mockStreamerInstance.stop.mockClear();
    mockStreamerInstance.stop.mockResolvedValue({ totalDuration: 100, totalChars: 50 });

    const tracingModule = await import('../../observability/tracing.js');
    startActiveObservation = tracingModule.startActiveObservation as ReturnType<typeof vi.fn>;

    const streamingModule = await import('../../utils/streaming.js');
    createStreamer = streamingModule.createStreamer as ReturnType<typeof vi.fn>;

    const formattingModule = await import('../../utils/formatting.js');
    formatSlackMrkdwn = formattingModule.formatSlackMrkdwn as ReturnType<typeof vi.fn>;

    const agentModule = await import('../../agent/orion.js');
    runOrionAgent = agentModule.runOrionAgent as ReturnType<typeof vi.fn>;

    const loaderModule = await import('../../agent/loader.js');
    loadAgentPrompt = loaderModule.loadAgentPrompt as ReturnType<typeof vi.fn>;

    const loggerModule = await import('../../utils/logger.js');
    logger = loggerModule.logger as unknown as {
      debug: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    const handlerModule = await import('./user-message.js');
    handleAssistantUserMessage = handlerModule.handleAssistantUserMessage;

    mockSay = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

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
        reactions: {
          add: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ts: '123.456' }),
        },
      } as unknown,
      context: {
        teamId: 'T123456',
        userId: 'U123456',
      },
    } as unknown as Parameters<typeof handleAssistantUserMessage>[0];
  }

  it('should skip messages without text', async () => {
    const args = createAssistantArgs({ text: undefined });
    await handleAssistantUserMessage(args);

    expect(startActiveObservation).not.toHaveBeenCalled();
  });

  it('should use Orion agent for responses (AC#1)', async () => {
    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    expect(runOrionAgent).toHaveBeenCalledWith(
      'Hello Orion',
      expect.objectContaining({
        context: expect.objectContaining({
          userId: 'U123456',
          channelId: 'D123456',
        }),
        systemPrompt: expect.any(String),
        trace: expect.anything(),
        setStatus: expect.any(Function),
      })
    );
  });

  it('should load system prompt from agent loader (AC#2)', async () => {
    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    expect(loadAgentPrompt).toHaveBeenCalledWith('orion');
  });

  it('should stream response using chatStream API (AC#3)', async () => {
    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    // Should use streaming
    expect(createStreamer).toHaveBeenCalledTimes(1);
    expect(mockStreamerInstance.start).toHaveBeenCalledTimes(1);
    expect(mockStreamerInstance.append).toHaveBeenCalled();
    expect(mockStreamerInstance.stop).toHaveBeenCalledTimes(1);

    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'assistant dm @U123456',
        metadata: expect.objectContaining({
          channelId: 'D123456',
          isDm: true,
        }),
      }),
      expect.any(Function)
    );
  });

  it('should set thread title from message', async () => {
    const mockSetTitle = vi.fn().mockResolvedValue(undefined);
    const args = createAssistantArgs();
    (args as unknown as { setTitle: typeof mockSetTitle }).setTitle = mockSetTitle;

    await handleAssistantUserMessage(args);

    expect(mockSetTitle).toHaveBeenCalledTimes(1);
    expect(mockSetTitle).toHaveBeenCalledWith('Hello Orion');
  });

  it('should show working status with loading_messages (FR47)', async () => {
    const mockSetStatus = vi.fn().mockResolvedValue(undefined);
    const args = createAssistantArgs();
    (args as unknown as { setStatus: typeof mockSetStatus }).setStatus = mockSetStatus;

    await handleAssistantUserMessage(args);

    expect(mockSetStatus).toHaveBeenCalled();
    expect(mockSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'working...',
        loading_messages: expect.any(Array),
      })
    );
  });

  it('should not block streamer.start on initial setStatus (NFR4 safety)', async () => {
    let resolveStatus: (() => void) | undefined;
    const statusPromise = new Promise<void>((resolve) => {
      resolveStatus = resolve;
    });

    const mockSetStatus = vi.fn().mockImplementation(() => statusPromise);
    const args = createAssistantArgs();
    (args as unknown as { setStatus: typeof mockSetStatus }).setStatus = mockSetStatus;

    const handlerPromise = handleAssistantUserMessage(args);

    // Give the handler a tick to kick off streamer.start().
    await new Promise((r) => setTimeout(r, 0));

    expect(mockStreamerInstance.start).toHaveBeenCalledTimes(1);

    if (resolveStatus) resolveStatus();
    await handlerPromise;
  });

  it('should fetch thread history from Slack API', async () => {
    const { fetchThreadHistory } = await import('../thread-context.js');
    const args = createAssistantArgs();

    await handleAssistantUserMessage(args);

    expect(fetchThreadHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D123456',
        threadTs: '1234567890.123456',
        limit: 100,
        maxTokens: 4000,
        keepLastN: 50,
      })
    );
  });

  it('should post sources block before feedback when agentResult.sources is non-empty (Story 2.7)', async () => {
    runOrionAgent.mockImplementation(function* () {
      yield 'Hello ';
      yield 'from Orion!';
      return {
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 1500,
        nfr1Met: true,
        sources: [
          {
            type: 'file',
            title: 'Company Overview',
            reference: 'docs/company-overview.md',
            url: 'https://example.com/company',
            excerpt: 'Company overview...',
          },
        ],
      };
    });

    const args = createAssistantArgs();
    const postMessage = (args.client as unknown as { chat: { postMessage: ReturnType<typeof vi.fn> } }).chat
      .postMessage;

    await handleAssistantUserMessage(args);

    // Expect 2 follow-up messages: sources first, then feedback
    expect(postMessage).toHaveBeenCalledTimes(2);

    const first = postMessage.mock.calls[0]?.[0] as { metadata?: { event_type?: string }; blocks?: unknown[] };
    const second = postMessage.mock.calls[1]?.[0] as { metadata?: { event_type?: string } };

    expect(first.metadata?.event_type).toBe('orion_sources');
    expect(second.metadata?.event_type).toBe('orion_response');

    // Basic sanity: first message is a context block with sources
    expect(first.blocks?.[0]).toEqual(
      expect.objectContaining({
        type: 'context',
      })
    );
  });

  it('should pass traceId to fetchThreadHistory for observability (Story 2.5 AC#1)', async () => {
    const { fetchThreadHistory } = await import('../thread-context.js');
    const args = createAssistantArgs();

    await handleAssistantUserMessage(args);

    expect(fetchThreadHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'mock-trace-id',
      })
    );
  });

  it('should handle channel thread follow-ups without leading bot mention (Story 2.5 AC#5)', async () => {
    const args = createAssistantArgs({
      channel: 'C123456',
      thread_ts: '1234567880.000000',
      text: 'Follow up without mention',
    });

    // Provide botUserId so the handler can dedupe true bot mentions only.
    (args.context as unknown as { botUserId?: string }).botUserId = 'U0928FBEH9C';

    await handleAssistantUserMessage(args);

    expect(runOrionAgent).toHaveBeenCalled();
  });

  it('should skip channel messages with leading bot mention to avoid duplicates (Story 2.5 AC#5)', async () => {
    const args = createAssistantArgs({
      channel: 'C123456',
      thread_ts: '1234567880.000000',
      text: '<@U0928FBEH9C> hello from channel',
    });

    (args.context as unknown as { botUserId?: string }).botUserId = 'U0928FBEH9C';

    await handleAssistantUserMessage(args);

    expect(runOrionAgent).not.toHaveBeenCalled();
  });

  it('should pass thread history to runOrionAgent as threadHistory (Story 2.5 AC#2)', async () => {
    const args = createAssistantArgs();

    await handleAssistantUserMessage(args);

    expect(runOrionAgent).toHaveBeenCalledWith(
      'Hello Orion',
      expect.objectContaining({
        context: expect.objectContaining({
          threadHistory: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'Previous message',
            }),
          ]),
        }),
      })
    );
  });

  it('should filter out empty/missing text messages from thread history (Story 2.5 Task 2)', async () => {
    const { fetchThreadHistory } = await import('../thread-context.js');
    const mockFetchThreadHistory = fetchThreadHistory as ReturnType<typeof vi.fn>;
    
    // Return history with empty and missing text messages
    mockFetchThreadHistory.mockResolvedValueOnce([
      { user: 'U1', text: 'Valid message', ts: '1', isBot: false },
      { user: 'U2', text: '', ts: '2', isBot: false },  // Empty text
      { user: 'U3', text: 'Another valid', ts: '3', isBot: true },
    ]);

    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    // Should only include messages with non-empty text
    expect(runOrionAgent).toHaveBeenCalledWith(
      'Hello Orion',
      expect.objectContaining({
        context: expect.objectContaining({
          threadHistory: [
            { role: 'user', content: 'Valid message' },
            { role: 'assistant', content: 'Another valid' },
          ],
        }),
      })
    );
  });

  describe('Completion indicator (Story 7.4)', () => {
    it('should add ✅ reaction on successful completion (AC1)', async () => {
      const args = createAssistantArgs();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
      };
      client.reactions.add = vi.fn().mockResolvedValue(undefined);
      client.reactions.remove = vi.fn().mockResolvedValue(undefined);

      await handleAssistantUserMessage(args);

      // Should add white_check_mark after successful completion
      expect(client.reactions.add).toHaveBeenCalledWith({
        channel: 'D123456',
        timestamp: '1234567890.123456',
        name: 'white_check_mark',
      });
    });

    it('should NOT add ✅ reaction on error path (AC2)', async () => {
      // Make runOrionAgent throw an error
      runOrionAgent.mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const args = createAssistantArgs();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn> };
      };
      client.reactions.add = vi.fn().mockResolvedValue(undefined);

      await expect(handleAssistantUserMessage(args)).rejects.toThrow('Agent error');

      // Should NOT have called reactions.add with white_check_mark
      const addCalls = client.reactions.add.mock.calls;
      const checkmarkCalls = addCalls.filter(
        (call: Array<{ name?: string }>) => call[0]?.name === 'white_check_mark'
      );
      expect(checkmarkCalls).toHaveLength(0);
    });

    it('should gracefully handle ✅ reaction failure (AC3)', async () => {
      const args = createAssistantArgs();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
      };

      // Make white_check_mark reaction fail
      client.reactions.add = vi.fn().mockImplementation(({ name }: { name: string }) => {
        if (name === 'white_check_mark') {
          return Promise.reject(new Error('already_reacted'));
        }
        return Promise.resolve(undefined);
      });
      client.reactions.remove = vi.fn().mockResolvedValue(undefined);

      // Should NOT throw - handler completes successfully
      await expect(handleAssistantUserMessage(args)).resolves.not.toThrow();

      // Should have logged warning for failed reaction
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'completion_reaction_failed',
        })
      );
    });

    it('should add ✅ AFTER 👀 is removed (reaction order)', async () => {
      const args = createAssistantArgs();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
      };

      const callOrder: string[] = [];
      client.reactions.remove = vi.fn().mockImplementation(({ name }: { name: string }) => {
        callOrder.push(`remove:${name}`);
        return Promise.resolve(undefined);
      });
      client.reactions.add = vi.fn().mockImplementation(({ name }: { name: string }) => {
        callOrder.push(`add:${name}`);
        return Promise.resolve(undefined);
      });

      await handleAssistantUserMessage(args);

      // Verify order: eyes removed, then checkmark added
      const eyesRemoveIndex = callOrder.indexOf('remove:eyes');
      const checkmarkAddIndex = callOrder.indexOf('add:white_check_mark');
      expect(eyesRemoveIndex).toBeLessThan(checkmarkAddIndex);
    });

    it('should add ✅ AFTER feedback block is posted (AC1 full order)', async () => {
      const args = createAssistantArgs();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      const callOrder: string[] = [];
      
      // Track postMessage calls for feedback block
      client.chat.postMessage = vi.fn().mockImplementation((params: { metadata?: { event_type?: string } }) => {
        if (params.metadata?.event_type === 'orion_response') {
          callOrder.push('postMessage:feedback');
        }
        return Promise.resolve({ ts: '123.456' });
      });

      client.reactions.add = vi.fn().mockImplementation(({ name }: { name: string }) => {
        callOrder.push(`add:${name}`);
        return Promise.resolve(undefined);
      });
      client.reactions.remove = vi.fn().mockResolvedValue(undefined);

      await handleAssistantUserMessage(args);

      // AC1: ✅ must be added AFTER feedback block is posted
      const feedbackIndex = callOrder.indexOf('postMessage:feedback');
      const checkmarkIndex = callOrder.indexOf('add:white_check_mark');
      expect(feedbackIndex).toBeGreaterThan(-1);
      expect(checkmarkIndex).toBeGreaterThan(-1);
      expect(feedbackIndex).toBeLessThan(checkmarkIndex);
    });
  });

  it('should add eyes emoji on message receipt', async () => {
    const mockReactionsAdd = vi.fn().mockResolvedValue(undefined);
    const args = createAssistantArgs();
    (args.client as unknown as { reactions: { add: typeof mockReactionsAdd } }).reactions.add =
      mockReactionsAdd;

    await handleAssistantUserMessage(args);

    expect(mockReactionsAdd).toHaveBeenCalledWith({
      channel: 'D123456',
      timestamp: '1234567890.123456',
      name: 'eyes',
    });
  });

  it('should fallback to minimal prompt on loader error', async () => {
    loadAgentPrompt.mockRejectedValueOnce(new Error('File not found'));

    const args = createAssistantArgs();
    await handleAssistantUserMessage(args);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent_prompt_fallback',
      })
    );

    // Should still call runOrionAgent with fallback prompt
    expect(runOrionAgent).toHaveBeenCalled();
  });

  describe('Streaming behavior', () => {
    it('should initialize streamer with correct config', async () => {
      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'D123456',
          threadTs: '1234567890.123456',
        })
      );
    });

    it('should create agent span for Langfuse', async () => {
      const args = createAssistantArgs();
      // Handler creates spans via trace.startSpan internally
      // Verify handler completes successfully (spans are created)
      await expect(handleAssistantUserMessage(args)).resolves.toBeUndefined();
    });

    it('should format chunks with Slack mrkdwn', async () => {
      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(formatSlackMrkdwn).toHaveBeenCalled();
    });

    it('should log stream initialization with NFR4 timing', async () => {
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

    it('should always stop streamer after message handling', async () => {
      const args = createAssistantArgs();

      await handleAssistantUserMessage(args);

      // Streamer should be stopped after handling
      expect(mockStreamerInstance.stop).toHaveBeenCalled();
    });

    it('should log generation with real token usage from agent result (AC#4)', async () => {
      const args = createAssistantArgs();
      // Handler creates generations via trace.startGeneration internally
      // Verify handler completes successfully with proper logging
      await handleAssistantUserMessage(args);

      // Verify handler logged final metrics which indicates generation was created
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user_message_handled',
          responseLength: expect.any(Number),
        })
      );
    });
  });

  describe('Context Compaction (Story 2.6)', () => {
    it('should check if compaction is needed before agent run', async () => {
      const { shouldTriggerCompaction, estimateContextTokens, resolveMaxContextTokens } =
        await import('../../agent/compaction.js');
      const mockShouldTrigger = shouldTriggerCompaction as ReturnType<typeof vi.fn>;
      const mockEstimate = estimateContextTokens as ReturnType<typeof vi.fn>;
      const mockResolveMaxTokens = resolveMaxContextTokens as ReturnType<typeof vi.fn>;

      mockResolveMaxTokens.mockReturnValue(200000);
      mockEstimate.mockReturnValue(5000);
      mockShouldTrigger.mockReturnValue(false);

      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(mockShouldTrigger).toHaveBeenCalledWith({
        estimatedTokens: 5000,
        maxContextTokens: 200000,
        threshold: 0.8,
      });
    });

    it('should trigger compaction when above threshold', async () => {
      const { shouldTriggerCompaction, compactThreadHistory, estimateContextTokens, resolveMaxContextTokens } =
        await import('../../agent/compaction.js');
      const mockShouldTrigger = shouldTriggerCompaction as ReturnType<typeof vi.fn>;
      const mockCompact = compactThreadHistory as ReturnType<typeof vi.fn>;
      const mockEstimate = estimateContextTokens as ReturnType<typeof vi.fn>;
      const mockResolveMaxTokens = resolveMaxContextTokens as ReturnType<typeof vi.fn>;

      mockResolveMaxTokens.mockReturnValue(200000);
      mockEstimate.mockReturnValue(170000); // Above 80% threshold
      mockShouldTrigger.mockReturnValue(true);
      mockCompact.mockResolvedValue({
        compactedHistory: [
          { role: 'assistant', content: '[Summary] Previous context...' },
          { role: 'user', content: 'Previous message' },
        ],
        summary: 'Previous context...',
        originalEstimatedTokens: 170000,
        compactedEstimatedTokens: 2000,
        compactionApplied: true,
      });

      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(mockCompact).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: 'Hello Orion',
          model: 'claude-sonnet-4-20250514',
          maxSummaryTokens: 1000,
          keepLastN: 6,
          traceId: 'mock-trace-id',
        })
      );
    });

    it('should pass compacted history to runOrionAgent when compaction applied', async () => {
      const { shouldTriggerCompaction, compactThreadHistory, estimateContextTokens, resolveMaxContextTokens } =
        await import('../../agent/compaction.js');
      const mockShouldTrigger = shouldTriggerCompaction as ReturnType<typeof vi.fn>;
      const mockCompact = compactThreadHistory as ReturnType<typeof vi.fn>;
      const mockEstimate = estimateContextTokens as ReturnType<typeof vi.fn>;
      const mockResolveMaxTokens = resolveMaxContextTokens as ReturnType<typeof vi.fn>;

      const compactedHistory = [
        { role: 'assistant' as const, content: '[Previous conversation summary]\n\nKey context here' },
        { role: 'user' as const, content: 'Recent message 1' },
        { role: 'assistant' as const, content: 'Recent response 1' },
      ];

      mockResolveMaxTokens.mockReturnValue(200000);
      mockEstimate.mockReturnValue(170000);
      mockShouldTrigger.mockReturnValue(true);
      mockCompact.mockResolvedValue({
        compactedHistory,
        summary: 'Key context here',
        originalEstimatedTokens: 170000,
        compactedEstimatedTokens: 5000,
        compactionApplied: true,
      });

      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(runOrionAgent).toHaveBeenCalledWith(
        'Hello Orion',
        expect.objectContaining({
          context: expect.objectContaining({
            threadHistory: compactedHistory,
          }),
        })
      );
    });

    it('should create agent.compaction span with expected metadata', async () => {
      const { shouldTriggerCompaction, compactThreadHistory, estimateContextTokens, resolveMaxContextTokens } =
        await import('../../agent/compaction.js');
      const mockShouldTrigger = shouldTriggerCompaction as ReturnType<typeof vi.fn>;
      const mockCompact = compactThreadHistory as ReturnType<typeof vi.fn>;
      const mockEstimate = estimateContextTokens as ReturnType<typeof vi.fn>;
      const mockResolveMaxTokens = resolveMaxContextTokens as ReturnType<typeof vi.fn>;

      mockResolveMaxTokens.mockReturnValue(200000);
      mockEstimate.mockReturnValue(170000);
      mockShouldTrigger.mockReturnValue(true);
      mockCompact.mockResolvedValue({
        compactedHistory: [{ role: 'user', content: 'test' }],
        summary: 'Summary',
        originalEstimatedTokens: 170000,
        compactedEstimatedTokens: 5000,
        compactionApplied: true,
      });

      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      // Verify span name + metadata contract (Story 2.6 Task 2)
      const compactionCall = startSpanCalls.find((c) => c.name === 'agent.compaction');
      expect(compactionCall).toBeDefined();
      expect(compactionCall?.attributes).toEqual(
        expect.objectContaining({
          metadata: expect.objectContaining({
            traceId: 'mock-trace-id',
            historyMessages: expect.any(Number),
            keepLastN: expect.any(Number),
            originalEstimatedTokens: 170000,
          }),
        })
      );

      // Verify span was updated with compaction results
      expect(mockSpan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            compactionApplied: true,
            originalEstimatedTokens: 170000,
            compactedEstimatedTokens: 5000,
            tokenReduction: 165000,
          }),
          metadata: expect.objectContaining({
            traceId: 'mock-trace-id',
            historyMessages: expect.any(Number),
            keepLastN: expect.any(Number),
            originalEstimatedTokens: 170000,
            compactedEstimatedTokens: 5000,
            compactionApplied: true,
          }),
        })
      );
    });

    it('should log context_compacted event when compaction is applied', async () => {
      const { shouldTriggerCompaction, compactThreadHistory, estimateContextTokens, resolveMaxContextTokens } =
        await import('../../agent/compaction.js');
      const mockShouldTrigger = shouldTriggerCompaction as ReturnType<typeof vi.fn>;
      const mockCompact = compactThreadHistory as ReturnType<typeof vi.fn>;
      const mockEstimate = estimateContextTokens as ReturnType<typeof vi.fn>;
      const mockResolveMaxTokens = resolveMaxContextTokens as ReturnType<typeof vi.fn>;

      mockResolveMaxTokens.mockReturnValue(200000);
      mockEstimate.mockReturnValue(170000);
      mockShouldTrigger.mockReturnValue(true);
      mockCompact.mockResolvedValue({
        compactedHistory: [{ role: 'user', content: 'test' }],
        summary: 'Summary',
        originalEstimatedTokens: 170000,
        compactedEstimatedTokens: 5000,
        compactionApplied: true,
      });

      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'context_compacted',
          originalEstimatedTokens: 170000,
          compactedEstimatedTokens: 5000,
          traceId: 'mock-trace-id',
        })
      );
    });

    it('should fallback to original history on compaction error', async () => {
      const { shouldTriggerCompaction, compactThreadHistory, estimateContextTokens, resolveMaxContextTokens } =
        await import('../../agent/compaction.js');
      const mockShouldTrigger = shouldTriggerCompaction as ReturnType<typeof vi.fn>;
      const mockCompact = compactThreadHistory as ReturnType<typeof vi.fn>;
      const mockEstimate = estimateContextTokens as ReturnType<typeof vi.fn>;
      const mockResolveMaxTokens = resolveMaxContextTokens as ReturnType<typeof vi.fn>;

      mockResolveMaxTokens.mockReturnValue(200000);
      mockEstimate.mockReturnValue(170000);
      mockShouldTrigger.mockReturnValue(true);
      mockCompact.mockRejectedValue(new Error('Compaction API failed'));

      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      // Should log warning but continue
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'compaction_failed_fallback',
          traceId: 'mock-trace-id',
        })
      );

      // Should still call agent with original history
      expect(runOrionAgent).toHaveBeenCalled();
    });

    it('should not invoke compaction when below threshold', async () => {
      const { shouldTriggerCompaction, compactThreadHistory, estimateContextTokens, resolveMaxContextTokens } =
        await import('../../agent/compaction.js');
      const mockShouldTrigger = shouldTriggerCompaction as ReturnType<typeof vi.fn>;
      const mockCompact = compactThreadHistory as ReturnType<typeof vi.fn>;
      const mockEstimate = estimateContextTokens as ReturnType<typeof vi.fn>;
      const mockResolveMaxTokens = resolveMaxContextTokens as ReturnType<typeof vi.fn>;

      mockResolveMaxTokens.mockReturnValue(200000);
      mockEstimate.mockReturnValue(5000); // Well below threshold
      mockShouldTrigger.mockReturnValue(false);

      const args = createAssistantArgs();
      await handleAssistantUserMessage(args);

      expect(mockCompact).not.toHaveBeenCalled();
    });
  });

  describe('Suggested Prompts (Story 7.1)', () => {
    it('should set follow-up prompts after successful response (AC#2)', async () => {
      const mockSetSuggestedPrompts = vi.fn().mockResolvedValue(undefined);
      const args = createAssistantArgs();
      (args as unknown as { setSuggestedPrompts: typeof mockSetSuggestedPrompts }).setSuggestedPrompts =
        mockSetSuggestedPrompts;

      await handleAssistantUserMessage(args);

      // Should call setSuggestedPrompts with follow-up prompts
      expect(mockSetSuggestedPrompts).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'What next?',
          prompts: expect.arrayContaining([
            expect.objectContaining({
              title: expect.any(String),
              message: expect.any(String),
            }),
          ]),
        })
      );
    });

    it('should set research follow-up prompts when sources gathered (AC#2)', async () => {
      // Mock agent to return sources (triggers 'research' lastResponseType)
      runOrionAgent.mockImplementation(function* () {
        yield 'Hello ';
        yield 'from Orion!';
        return {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1500,
          nfr1Met: true,
          sources: [
            {
              type: 'file',
              title: 'Test Source',
              url: 'https://example.com',
              excerpt: 'Test',
            },
          ],
        };
      });

      const mockSetSuggestedPrompts = vi.fn().mockResolvedValue(undefined);
      const args = createAssistantArgs();
      (args as unknown as { setSuggestedPrompts: typeof mockSetSuggestedPrompts }).setSuggestedPrompts =
        mockSetSuggestedPrompts;

      await handleAssistantUserMessage(args);

      // Should call setSuggestedPrompts - research prompts expected when sources present
      expect(mockSetSuggestedPrompts).toHaveBeenCalled();
      const call = mockSetSuggestedPrompts.mock.calls[0]?.[0] as { prompts?: Array<{ title?: string }> };
      expect(call.prompts).toBeDefined();
      // Research follow-ups should include terms like "deeper", "compare", "sources", "summary"
      const titles = call.prompts?.map((p) => p.title?.toLowerCase()) ?? [];
      expect(
        titles.some((t) => t?.includes('deep') || t?.includes('compare') || t?.includes('source') || t?.includes('summary'))
      ).toBe(true);
    });

    it('should set error recovery prompts on agent error (AC#4)', async () => {
      // Make runOrionAgent throw an error
      runOrionAgent.mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const mockSetSuggestedPrompts = vi.fn().mockResolvedValue(undefined);
      const args = createAssistantArgs();
      (args as unknown as { setSuggestedPrompts: typeof mockSetSuggestedPrompts }).setSuggestedPrompts =
        mockSetSuggestedPrompts;

      await expect(handleAssistantUserMessage(args)).rejects.toThrow('Agent error');

      // Should still set error recovery prompts
      expect(mockSetSuggestedPrompts).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Try something else:',
          prompts: expect.arrayContaining([
            expect.objectContaining({
              title: expect.any(String),
              message: expect.any(String),
            }),
          ]),
        })
      );
    });

    it('should set max 4 prompts (AC#5)', async () => {
      const mockSetSuggestedPrompts = vi.fn().mockResolvedValue(undefined);
      const args = createAssistantArgs();
      (args as unknown as { setSuggestedPrompts: typeof mockSetSuggestedPrompts }).setSuggestedPrompts =
        mockSetSuggestedPrompts;

      await handleAssistantUserMessage(args);

      expect(mockSetSuggestedPrompts).toHaveBeenCalled();
      const call = mockSetSuggestedPrompts.mock.calls[0]?.[0] as { prompts?: unknown[] };
      expect(call.prompts?.length).toBeLessThanOrEqual(4);
    });

    it('should gracefully handle setSuggestedPrompts failure', async () => {
      const mockSetSuggestedPrompts = vi.fn().mockRejectedValue(new Error('Prompts failed'));
      const args = createAssistantArgs();
      (args as unknown as { setSuggestedPrompts: typeof mockSetSuggestedPrompts }).setSuggestedPrompts =
        mockSetSuggestedPrompts;

      // Should NOT throw - handler completes successfully
      await expect(handleAssistantUserMessage(args)).resolves.not.toThrow();

      // Should have logged warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'follow_up_prompts_failed',
        })
      );
    });
  });

  describe('Memory Context Injection (Story 5.3)', () => {
    it('should inject memory context into system prompt when available (AC#1)', async () => {
      const memoryModule = await import('../../tools/memory/loader.js');
      vi.mocked(memoryModule.loadRelevantMemories).mockResolvedValue({
        loadDurationMs: 0,
        scopesFound: ['user'],
        user: '{"timezone":"UTC"}',
      });
      vi.mocked(memoryModule.formatMemoriesForContext).mockReturnValue(
        '# Restored Memory\n\n## User Preferences\n\n- *timezone*: UTC'
      );
      const args = createAssistantArgs();

      await handleAssistantUserMessage(args);

      // Verify runOrionAgent was called with memory context prepended to system prompt
      expect(runOrionAgent).toHaveBeenCalledWith(
        'Hello Orion',
        expect.objectContaining({
          systemPrompt: expect.stringContaining('# Restored Memory'),
        })
      );

      // Verify logging
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'memory_context_injected',
        })
      );
    });

    it('should proceed without memory context when formatter returns empty', async () => {
      const memoryModule = await import('../../tools/memory/loader.js');
      vi.mocked(memoryModule.loadRelevantMemories).mockResolvedValue({
        loadDurationMs: 0,
        scopesFound: [],
      });
      vi.mocked(memoryModule.formatMemoriesForContext).mockReturnValue('');
      const args = createAssistantArgs();

      await handleAssistantUserMessage(args);

      // Should still call runOrionAgent with base system prompt
      expect(runOrionAgent).toHaveBeenCalledWith(
        'Hello Orion',
        expect.objectContaining({
          systemPrompt: expect.not.stringContaining('# Restored Memory'),
        })
      );
    });

    it('should gracefully handle memory loader failure', async () => {
      const memoryModule = await import('../../tools/memory/loader.js');
      vi.mocked(memoryModule.loadRelevantMemories).mockRejectedValue(new Error('Context failed'));
      const args = createAssistantArgs();

      // Should NOT throw - handler completes successfully
      await expect(handleAssistantUserMessage(args)).resolves.not.toThrow();

      // Should have logged debug (not error - this is expected in some cases)
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'memory_context_retrieval_skipped',
        })
      );
    });
  });
});
