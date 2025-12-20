/**
 * Tests for App Mention Handler
 *
 * @see Story 2.5 - Thread Context & History
 * @see AC#5 - System responds to @mentions and direct messages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before imports
vi.mock('../../observability/tracing.js', () => ({
  startActiveObservation: vi.fn(async (_opts, fn) => {
    const mockTrace = {
      id: 'test-trace-id',
      update: vi.fn(),
    };
    return fn(mockTrace);
  }),
  createSpan: vi.fn(() => ({ end: vi.fn() })),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../utils/formatting.js', () => ({
  formatSlackMrkdwn: vi.fn((text) => text),
}));

vi.mock('../thread-context.js', () => ({
  fetchThreadHistory: vi.fn(() => Promise.resolve([])),
  formatThreadHistoryForContext: vi.fn(() => 'No previous messages'),
  formatThreadHistoryForAgent: vi.fn(() => []),
  THREAD_HISTORY_LIMIT: 20,
}));

vi.mock('../../agent/orion.js', () => ({
  runOrionAgent: vi.fn(function* () {
    yield 'This is a test response from Orion.';
  }),
}));

// Mock the sandbox module (Story 3.0)
const mockExecuteAgentInSandbox = vi.fn().mockResolvedValue({
  success: true,
  response: 'This is a test response from Orion.',
  tokenUsage: { input: 10, output: 20 },
  duration: 1000,
});
vi.mock('../../sandbox/index.js', () => ({
  executeAgentInSandbox: mockExecuteAgentInSandbox,
}));

describe('App Mention Handler', () => {
  let handleAppMention: typeof import('./app-mention.js').handleAppMention;
  let mockSay: ReturnType<typeof vi.fn>;
  let mockClient: {
    conversations: { replies: ReturnType<typeof vi.fn> };
    chat: { postMessage: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const module = await import('./app-mention.js');
    handleAppMention = module.handleAppMention;

    mockSay = vi.fn().mockResolvedValue({ ok: true, ts: 'mock-ts' });
    mockClient = {
      conversations: {
        replies: vi.fn().mockResolvedValue({ messages: [] }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'mock-processing-ts' }),
        update: vi.fn().mockResolvedValue({ ok: true }),
      },
      reactions: {
        add: vi.fn().mockResolvedValue({ ok: true }),
        remove: vi.fn().mockResolvedValue({ ok: true }),
      },
    };

    // Reset sandbox mock before each test
    mockExecuteAgentInSandbox.mockResolvedValue({
      success: true,
      response: 'This is a test response from Orion.',
      tokenUsage: { input: 10, output: 20 },
      duration: 1000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('AC#5: Handle @mentions', () => {
    it('should handle @mention and respond in thread', async () => {
      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> What is the project status?',
        channel: 'C456',
        ts: '1234567890.123456',
        thread_ts: undefined,
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Should respond in thread (using event.ts as thread parent)
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: '1234567890.123456',
        })
      );
    });

    it('should extract query by removing @mention prefix', async () => {
      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> What is the deadline?',
        channel: 'C456',
        ts: '1234567890.123456',
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Sandbox should receive cleaned query (no mention)
      expect(mockExecuteAgentInSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: 'What is the deadline?',
        })
      );
    });

    it('should respond with greeting if only mentioned without query', async () => {
      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123>',
        channel: 'C456',
        ts: '1234567890.123456',
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Should respond with greeting
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Orion'),
        })
      );
    });

    it('should handle multiple @mentions in message', async () => {
      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> hey <@UOTHER456> what do you think?',
        channel: 'C456',
        ts: '1234567890.123456',
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Sandbox should receive query with all mentions removed
      expect(mockExecuteAgentInSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: 'hey  what do you think?',
        })
      );
    });
  });

  describe('Thread context handling', () => {
    it('should fetch thread history when in existing thread', async () => {
      const { fetchThreadHistory } = await import('../thread-context.js');

      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> Follow up question',
        channel: 'C456',
        ts: '1234567890.999999',
        thread_ts: '1234567890.123456', // Existing thread
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Should fetch thread history
      expect(fetchThreadHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C456',
          threadTs: '1234567890.123456',
        })
      );
    });

    it('should not fetch thread history for new thread', async () => {
      const { fetchThreadHistory } = await import('../thread-context.js');

      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> New question',
        channel: 'C456',
        ts: '1234567890.123456',
        thread_ts: undefined, // Not in a thread
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Should not fetch thread history (new thread)
      expect(fetchThreadHistory).not.toHaveBeenCalled();
    });

    it('should respond in thread using thread_ts when available', async () => {
      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> Reply in thread',
        channel: 'C456',
        ts: '1234567890.999999',
        thread_ts: '1234567890.123456',
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Should respond in the existing thread
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: '1234567890.123456',
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle sandbox errors gracefully', async () => {
      // Mock sandbox to return failure
      mockExecuteAgentInSandbox.mockResolvedValue({
        success: false,
        error: 'Sandbox execution failed',
      });

      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> Test query',
        channel: 'C456',
        ts: '1234567890.123456',
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      // Should try to update the processing message with error
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('error'),
        })
      );
    });
  });

  describe('Logging and tracing', () => {
    it('should log app_mention_received event', async () => {
      const { logger } = await import('../../utils/logger.js');

      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> Test',
        channel: 'C456',
        ts: '1234567890.123456',
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'app_mention_received',
          userId: 'U123',
          channelId: 'C456',
        })
      );
    });

    it('should wrap execution in Langfuse trace', async () => {
      const { startActiveObservation } = await import(
        '../../observability/tracing.js'
      );

      const event = {
        type: 'app_mention',
        user: 'U123',
        text: '<@UORION123> Test',
        channel: 'C456',
        ts: '1234567890.123456',
      };

      await handleAppMention({
        event,
        say: mockSay,
        client: mockClient as any,
        context: { teamId: 'T789' },
      } as any);

      expect(startActiveObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app-mention-handler',
        }),
        expect.any(Function)
      );
    });
  });
});

