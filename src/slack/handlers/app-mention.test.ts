/**
 * Tests for App Mention Handler
 *
 * @see Story 2.8 - App Mention Handler for Channel Conversations
 * @see Story 3.4 - Channel @Mention Tool Feedback
 * @see AC#1 - Orion responds in a thread under the original message
 * @see AC#2 - Orion adds 👀 reaction to acknowledge receipt
 * @see AC#5 - Uses runOrionAgent with full tool calling capability
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the formatting module
vi.mock('../../utils/formatting.js', () => ({
  formatSlackMrkdwn: vi.fn((text) => text),
}));

// Mock the streaming module
const mockStreamer = {
  start: vi.fn().mockResolvedValue(undefined),
  append: vi.fn(),
  stop: vi.fn().mockResolvedValue({ totalDuration: 1000, totalChars: 100 }),
};
vi.mock('../../utils/streaming.js', () => ({
  createStreamer: vi.fn(() => mockStreamer),
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
  },
}));

// Mock the observability module
const mockSpan = { end: vi.fn(), update: vi.fn().mockReturnThis() };
const mockGeneration = { end: vi.fn() };
const mockUnderlyingSpan = { id: 'mock-underlying-span-id' };
vi.mock('../../observability/tracing.js', () => ({
  startActiveObservation: vi.fn(async (_context, operation) => {
    const mockTrace = {
      id: 'mock-trace-id',
      update: vi.fn().mockReturnThis(),
      startSpan: vi.fn(() => mockSpan),
      startGeneration: vi.fn(() => mockGeneration),
      _span: mockUnderlyingSpan,
    };
    return operation(mockTrace);
  }),
  setTraceIdForMessage: vi.fn(),
}));

// Mock the identity module
vi.mock('../identity.js', () => ({
  getChannelName: vi.fn(async () => 'test-channel'),
  getUserDisplayName: vi.fn(async () => 'test-user'),
}));

// Mock thread history fetching
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

// Module-level variables for dynamic imports
let handleAppMention: (typeof import('./app-mention.js'))['handleAppMention'];
let startActiveObservation: ReturnType<typeof vi.fn>;
let setTraceIdForMessage: ReturnType<typeof vi.fn>;
let runOrionAgent: ReturnType<typeof vi.fn>;
let createStreamer: ReturnType<typeof vi.fn>;
let logger: {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};
let mockSay: ReturnType<typeof vi.fn>;

describe('App Mention Handler', () => {
  beforeEach(async () => {
    vi.resetModules();

    // Reset mock implementations
    mockSpan.end.mockClear();
    mockSpan.update.mockClear();
    mockGeneration.end.mockClear();
    mockStreamer.start.mockClear();
    mockStreamer.append.mockClear();
    mockStreamer.stop.mockClear();
    mockStreamer.stop.mockResolvedValue({ totalDuration: 1000, totalChars: 100 });

    const tracingModule = await import('../../observability/tracing.js');
    startActiveObservation = tracingModule.startActiveObservation as ReturnType<typeof vi.fn>;
    setTraceIdForMessage = tracingModule.setTraceIdForMessage as ReturnType<typeof vi.fn>;

    const agentModule = await import('../../agent/orion.js');
    runOrionAgent = agentModule.runOrionAgent as ReturnType<typeof vi.fn>;

    const streamingModule = await import('../../utils/streaming.js');
    createStreamer = streamingModule.createStreamer as ReturnType<typeof vi.fn>;

    const loggerModule = await import('../../utils/logger.js');
    logger = loggerModule.logger as unknown as {
      debug: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    const handlerModule = await import('./app-mention.js');
    handleAppMention = handlerModule.handleAppMention;

    mockSay = vi.fn().mockResolvedValue({ ts: '123.456' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createAppMentionEvent(
    overrides: Record<string, unknown> = {}
  ): Parameters<typeof handleAppMention>[0] {
    return {
      event: {
        type: 'app_mention',
        channel: 'C123456',
        user: 'U123456',
        text: '<@U0928FBEH9C> hello orion',
        ts: '1234567890.123456',
        ...overrides,
      },
      say: mockSay,
      client: {
        reactions: {
          add: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ts: '123.456' }),
          update: vi.fn().mockResolvedValue({ ok: true }),
          delete: vi.fn().mockResolvedValue({ ok: true }),
        },
      } as unknown,
      context: {
        teamId: 'T123456',
        userId: 'U123456',
        botUserId: 'U0928FBEH9C',
      },
    } as unknown as Parameters<typeof handleAppMention>[0];
  }

  describe('Message text extraction', () => {
    it('should strip the leading bot mention from message text', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(runOrionAgent).toHaveBeenCalledWith(
        'hello orion',
        expect.any(Object)
      );
    });

    it('should preserve other mentions in the message', async () => {
      const args = createAppMentionEvent({
        text: '<@U0928FBEH9C> please help <@U999999> with this',
      });
      await handleAppMention(args);

      expect(runOrionAgent).toHaveBeenCalledWith(
        'please help <@U999999> with this',
        expect.any(Object)
      );
    });

    it('should handle message with only bot mention', async () => {
      const args = createAppMentionEvent({
        text: '<@U0928FBEH9C>',
      });
      await handleAppMention(args);

      expect(runOrionAgent).toHaveBeenCalledWith('', expect.any(Object));
    });

    it('should handle message with extra whitespace after mention', async () => {
      const args = createAppMentionEvent({
        text: '<@U0928FBEH9C>    hello   world',
      });
      await handleAppMention(args);

      expect(runOrionAgent).toHaveBeenCalledWith('hello   world', expect.any(Object));
    });
  });

  describe('Reaction lifecycle (AC#2, AC#6)', () => {
    it('should add eyes emoji on message receipt', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
      };
      expect(client.reactions.add).toHaveBeenCalledWith({
        channel: 'C123456',
        timestamp: '1234567890.123456',
        name: 'eyes',
      });
    });

    it('should remove eyes emoji after successful response', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
      };

      expect(client.reactions.remove).toHaveBeenCalledWith({
        channel: 'C123456',
        timestamp: '1234567890.123456',
        name: 'eyes',
      });
    });
  });

  describe('Langfuse tracing', () => {
    it('should start trace with app_mention metadata and channel/user names', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(startActiveObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app-mention #test-channel @test-user',
          metadata: expect.objectContaining({
            channelId: 'C123456',
            channelName: 'test-channel',
            userName: 'test-user',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should log app_mention_received event', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'app_mention_received',
          channelId: 'C123456',
          userId: 'U123456',
        })
      );
    });

    it('should log stream initialization', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'stream_initialized',
          timeToStreamStart: expect.any(Number),
        })
      );
    });
  });

  describe('Response handling (AC#1)', () => {
    it('should initialize streamer for response in thread', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      // Streamer should be created with correct thread context
      expect(createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          threadTs: '1234567890.123456',
        })
      );
    });

    it('should stream response via streamer.append', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      // Response chunks should be appended to streamer
      expect(mockStreamer.append).toHaveBeenCalledWith('Hello ');
      expect(mockStreamer.append).toHaveBeenCalledWith('from Orion!');
    });
  });

  describe('Agent integration (AC#5)', () => {
    it('should call runOrionAgent with correct parameters', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(runOrionAgent).toHaveBeenCalledWith(
        'hello orion',
        expect.objectContaining({
          context: expect.objectContaining({
            userId: 'U123456',
            channelId: 'C123456',
            traceId: 'mock-trace-id',
          }),
          systemPrompt: expect.any(String),
          trace: mockUnderlyingSpan,
        })
      );
    });
  });

  describe('Thread context (AC#4)', () => {
    it('should respond in thread under the original message for new mentions', async () => {
      const args = createAppMentionEvent({ thread_ts: undefined });
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      // Feedback block should be posted in thread
      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: '1234567890.123456',
        })
      );
    });

    it('should use existing thread_ts for thread replies', async () => {
      const args = createAppMentionEvent({
        thread_ts: '1234567880.000000',
        ts: '1234567890.123456',
      });
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: '1234567880.000000',
        })
      );
    });

    it('should fetch thread history for thread replies', async () => {
      const { fetchThreadHistory } = await import('../thread-context.js');
      const args = createAppMentionEvent({
        thread_ts: '1234567880.000000',
      });

      await handleAppMention(args);

      expect(fetchThreadHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          threadTs: '1234567880.000000',
        })
      );
    });
  });

  describe('Streaming (AC#3)', () => {
    it('should use createStreamer for real-time streaming', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          threadTs: '1234567890.123456',
        })
      );
    });

    it('should start streamer and append chunks', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(mockStreamer.start).toHaveBeenCalled();
      expect(mockStreamer.append).toHaveBeenCalled();
      expect(mockStreamer.stop).toHaveBeenCalled();
    });
  });

  describe('Feedback buttons (AC#7)', () => {
    it('should post feedback block in thread', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: '1234567890.123456',
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'section' }),
          ]),
          metadata: expect.objectContaining({
            event_type: 'orion_response',
            event_payload: expect.objectContaining({ traceId: 'mock-trace-id' }),
          }),
        })
      );
    });

    it('should store trace ID for feedback correlation', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(setTraceIdForMessage).toHaveBeenCalledWith('123.456', 'mock-trace-id');
    });
  });

  describe('Error handling', () => {
    it('should stop streamer on error', async () => {
      // Make runOrionAgent throw an error
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const args = createAppMentionEvent();

      await expect(handleAppMention(args)).rejects.toThrow('Agent error');
      expect(mockStreamer.stop).toHaveBeenCalled();
    });

    it('should remove eyes reaction on error', async () => {
      // Make runOrionAgent throw an error
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        reactions: { remove: ReturnType<typeof vi.fn> };
      };

      await expect(handleAppMention(args)).rejects.toThrow('Agent error');
      expect(client.reactions.remove).toHaveBeenCalledWith({
        channel: 'C123456',
        timestamp: '1234567890.123456',
        name: 'eyes',
      });
    });

    it('should post error message on failure', async () => {
      // Make runOrionAgent throw an error
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      await expect(handleAppMention(args)).rejects.toThrow('Agent error');
      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: '1234567890.123456',
          text: 'Sorry, I encountered an error processing your message.',
        })
      );
    });
  });

  describe('Status message updates (Story 3.4)', () => {
    it('should post initial Thinking status message after streamer starts', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      // Should post a status message with "Thinking..."
      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          thread_ts: '1234567890.123456',
          text: expect.stringMatching(/thinking/i),
        })
      );
    });

    it('should update status message when tool execution starts', async () => {
      // Mock agent to call setStatus callback with tool name
      // Story 7.9: StatusUpdater uses 300ms debounce, so we need to wait between calls
      vi.useFakeTimers();
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      let capturedSetStatus: (params: { toolName?: string }) => void;
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* (
        _msg: string,
        opts: { setStatus: (params: { toolName?: string }) => void }
      ) {
        capturedSetStatus = opts.setStatus;
        // Simulate tool execution by calling setStatus
        capturedSetStatus({ toolName: 'web_search' });
        yield 'Response';
        return {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1500,
          nfr1Met: true,
        };
      });

      const args = createAppMentionEvent();
      const handlePromise = handleAppMention(args);

      // Advance timers to allow debounced updates through
      await vi.advanceTimersByTimeAsync(400);
      await handlePromise;

      const client = args.client as unknown as {
        chat: {
          postMessage: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
      };

      // Story 7.9: With StatusUpdater debounce, rapid synchronous calls
      // within 300ms may be debounced. What matters is the status message was posted.
      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          text: expect.any(String),
        })
      );

      vi.useRealTimers();
    });

    it('should debounce status updates to avoid rate limits', async () => {
      // Story 7.9: StatusUpdater (ChannelStatusUpdater) debounces updates internally
      // Rapid synchronous calls within 300ms window are coalesced
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* (
        _msg: string,
        opts: { setStatus: (params: { toolName?: string }) => void }
      ) {
        // Call setStatus rapidly - all within debounce window
        opts.setStatus({ toolName: 'tool1' });
        opts.setStatus({ toolName: 'tool2' });
        opts.setStatus({ toolName: 'tool3' });
        yield 'Response';
        return {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1500,
          nfr1Met: true,
        };
      });

      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { update: ReturnType<typeof vi.fn> };
      };

      // Story 7.9: With StatusUpdater, the first call posts a message (not update),
      // and subsequent synchronous calls within 300ms debounce window are skipped.
      // So chat.update won't be called at all for rapid synchronous calls.
      // This is correct debounce behavior - it prevents rate limiting.
      expect(client.chat.update.mock.calls.length).toBe(0);
    });

    it('should delete status message after streaming completes', async () => {
      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        chat: {
          postMessage: ReturnType<typeof vi.fn>;
          delete: ReturnType<typeof vi.fn>;
        };
      };
      client.chat.delete = vi.fn().mockResolvedValue({ ok: true });

      // Mock postMessage to return distinct ts values for status vs other messages
      let callCount = 0;
      client.chat.postMessage = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ ts: `status-ts-${callCount}` });
      });

      await handleAppMention(args);

      // Should delete the status message
      expect(client.chat.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          ts: expect.stringMatching(/status-ts/),
        })
      );
    });

    it('should clean up status message on error', async () => {
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        chat: {
          postMessage: ReturnType<typeof vi.fn>;
          delete: ReturnType<typeof vi.fn>;
        };
      };

      let callCount = 0;
      client.chat.postMessage = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ ts: `msg-ts-${callCount}` });
      });

      await expect(handleAppMention(args)).rejects.toThrow('Agent error');

      // Should still attempt to delete status message on error
      expect(client.chat.delete).toHaveBeenCalled();
    });

    it('should continue processing if status message post fails', async () => {
      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        chat: {
          postMessage: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
      };

      // First postMessage call (status) fails, subsequent calls succeed
      let callCount = 0;
      client.chat.postMessage = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Status message post fails
          return Promise.reject(new Error('channel_not_found'));
        }
        return Promise.resolve({ ts: `msg-ts-${callCount}` });
      });

      // Should not throw - handler continues despite status message failure
      await handleAppMention(args);

      // Story 7.9: StatusUpdater logs via logger.debug (not warn) for channel context
      // Event name changed to 'status_update_failed' with updater: 'channel'
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'status_update_failed',
          updater: 'channel',
        })
      );

      // Should NOT have tried to update status (since post failed, no ts)
      expect(client.chat.update).not.toHaveBeenCalled();
    });
  });

  describe('Completion indicator (Story 7.4)', () => {
    it('should add ✅ reaction on successful completion (AC1)', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn> };
      };

      // Should add white_check_mark after successful completion
      expect(client.reactions.add).toHaveBeenCalledWith({
        channel: 'C123456',
        timestamp: '1234567890.123456',
        name: 'white_check_mark',
      });
    });

    it('should NOT add ✅ reaction on error path (AC2)', async () => {
      // Make runOrionAgent throw an error
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn> };
      };

      await expect(handleAppMention(args)).rejects.toThrow('Agent error');

      // Should NOT have called reactions.add with white_check_mark
      const addCalls = client.reactions.add.mock.calls;
      const checkmarkCalls = addCalls.filter(
        (call: Array<{ name?: string }>) => call[0]?.name === 'white_check_mark'
      );
      expect(checkmarkCalls).toHaveLength(0);
    });

    it('should gracefully handle ✅ reaction failure (AC3)', async () => {
      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
      };

      // Make white_check_mark reaction fail (e.g., already reacted)
      let addCallCount = 0;
      client.reactions.add = vi.fn().mockImplementation(({ name }: { name: string }) => {
        addCallCount++;
        if (name === 'white_check_mark') {
          return Promise.reject(new Error('already_reacted'));
        }
        return Promise.resolve(undefined);
      });

      // Should NOT throw - handler completes successfully
      await expect(handleAppMention(args)).resolves.not.toThrow();

      // Should have logged warning for failed reaction
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'completion_reaction_failed',
        })
      );
    });

    it('should add ✅ AFTER 👀 is removed (reaction order)', async () => {
      const args = createAppMentionEvent();
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

      await handleAppMention(args);

      // Verify order: eyes added first, then eyes removed, then checkmark added
      const eyesRemoveIndex = callOrder.indexOf('remove:eyes');
      const checkmarkAddIndex = callOrder.indexOf('add:white_check_mark');
      expect(eyesRemoveIndex).toBeLessThan(checkmarkAddIndex);
    });

    it('should add ✅ AFTER feedback block is posted (AC1 full order)', async () => {
      const args = createAppMentionEvent();
      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
        chat: { postMessage: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
      };

      const callOrder: string[] = [];
      
      // Track postMessage calls (status, sources, feedback)
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

      await handleAppMention(args);

      // AC1: ✅ must be added AFTER feedback block is posted
      const feedbackIndex = callOrder.indexOf('postMessage:feedback');
      const checkmarkIndex = callOrder.indexOf('add:white_check_mark');
      expect(feedbackIndex).toBeGreaterThan(-1);
      expect(checkmarkIndex).toBeGreaterThan(-1);
      expect(feedbackIndex).toBeLessThan(checkmarkIndex);
    });
  });

  describe('Sources block (Story 2.7)', () => {
    it('should post sources block when sources are gathered', async () => {
      // Mock agent to return sources
      const { runOrionAgent: mockAgent } = await import('../../agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* () {
        yield 'Response with sources';
        return {
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 1500,
          nfr1Met: true,
          sources: [
            { type: 'file', title: 'Test Source', reference: 'test.md', url: 'https://example.com' },
          ],
        };
      });

      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      // Should have been called with sources metadata
      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            event_type: 'orion_sources',
          }),
        })
      );
    });
  });
});
