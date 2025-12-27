/**
 * Tests for App Mention Handler
 *
 * @see Story 2.8 - App Mention Handler for Channel Conversations
 * @see AC#1 - Orion responds in a thread under the original message
 * @see AC#2 - Orion adds 👀 reaction to acknowledge receipt
 * @see AC#5 - Uses runOrionAgent with full tool calling capability
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the formatting module
vi.mock('../../utils/formatting.js', () => ({
  formatSlackMrkdwn: vi.fn((text) => text),
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
let runOrionAgent: ReturnType<typeof vi.fn>;
let logger: {
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

    const tracingModule = await import('../../observability/tracing.js');
    startActiveObservation = tracingModule.startActiveObservation as ReturnType<typeof vi.fn>;

    const agentModule = await import('../../agent/orion.js');
    runOrionAgent = agentModule.runOrionAgent as ReturnType<typeof vi.fn>;

    const loggerModule = await import('../../utils/logger.js');
    logger = loggerModule.logger as unknown as {
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

    it('should log thinking message posted', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'thinking_message_posted',
          timeToFirstResponse: expect.any(Number),
        })
      );
    });
  });

  describe('Response handling (AC#1)', () => {
    it('should post thinking message in thread', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      };

      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          thread_ts: '1234567890.123456',
          text: '_Thinking..._',
        })
      );
    });

    it('should update thinking message with response', async () => {
      const args = createAppMentionEvent();
      await handleAppMention(args);

      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      };

      expect(client.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          ts: '123.456',
          text: 'Hello from Orion!',
        })
      );
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

      // First call is thinking message, second is feedback block
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
});
