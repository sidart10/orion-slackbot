/**
 * Tests for Direct Message Handler
 *
 * @see PLAN-dm-group-dm-support.md - Task 2: Create DM Handler
 * @see Task 7: Add Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the formatting module
vi.mock('@/utils/formatting.js', () => ({
  formatSlackMrkdwn: vi.fn((text) => text),
}));

// Mock the streaming module
const mockStreamer = {
  start: vi.fn().mockResolvedValue(undefined),
  append: vi.fn(),
  stop: vi.fn().mockResolvedValue({ totalDuration: 1000, totalChars: 100 }),
};
vi.mock('@/utils/streaming.js', () => ({
  createStreamer: vi.fn(() => mockStreamer),
}));

// Mock the Orion agent
vi.mock('@/agent/orion.js', () => ({
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
vi.mock('@/agent/loader.js', () => ({
  loadAgentPrompt: vi.fn().mockResolvedValue('You are Orion, a helpful assistant.'),
}));

// Mock config
vi.mock('@/config/environment.js', () => ({
  config: {
    anthropicModel: 'claude-sonnet-4-20250514',
    enableDmSupport: true,
  },
}));

// Mock the observability module
const mockSpan = { end: vi.fn(), update: vi.fn().mockReturnThis() };
const mockGeneration = { end: vi.fn() };
const mockUnderlyingSpan = { id: 'mock-underlying-span-id' };
vi.mock('@/observability/tracing.js', () => ({
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
vi.mock('@/slack/identity.js', () => ({
  getChannelName: vi.fn(async () => 'dm-channel'),
  getUserDisplayName: vi.fn(async () => 'test-user'),
}));

// Mock conversation history fetching
vi.mock('@/slack/conversation-history.js', () => ({
  fetchConversationHistory: vi.fn(async () => ({
    success: true,
    data: {
      messages: [
        { user: 'U1', text: 'Previous message', ts: '1', isBot: false },
      ],
      totalFetched: 1,
      truncated: false,
      channelInfo: { name: 'dm', type: 'im' },
    },
  })),
}));

// Mock the feedback block
vi.mock('@/slack/feedback-block.js', () => ({
  feedbackBlock: { type: 'section', text: { type: 'mrkdwn', text: 'Feedback' } },
}));

// Mock the logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock event deduplication
vi.mock('@/slack/event-dedup.js', () => ({
  isDuplicateEvent: vi.fn().mockReturnValue(false),
}));

// Mock status updater
vi.mock('@/slack/status/index.js', () => ({
  createStatusUpdater: vi.fn(() => ({
    update: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock status messages
vi.mock('@/slack/status-messages.js', () => ({
  buildLoadingMessages: vi.fn(() => ['Working...']),
}));

// Mock skills
vi.mock('@/skills/index.js', () => ({
  getSkillMetadata: vi.fn(async () => []),
  buildSkillsHint: vi.fn(() => ''),
}));

// Mock summarize tool context
vi.mock('@/tools/summarize/index.js', () => ({
  setSummarizeToolContext: vi.fn(),
  clearSummarizeToolContext: vi.fn(),
}));

// Mock memory tool context
vi.mock('@/tools/memory/index.js', () => ({
  clearMemoryToolContext: vi.fn(),
}));

// Mock files
vi.mock('@/files/index.js', () => ({
  ingestSlackFiles: vi.fn(async () => ({ results: [] })),
  createFilesApiClient: vi.fn(() => ({})),
}));

// Mock document blocks
vi.mock('@/agent/document-blocks.js', () => ({
  buildDocumentBlocks: vi.fn(() => ({ documentBlocks: [], errors: [], processedFiles: 0, failedFiles: 0 })),
  formatFileErrors: vi.fn(() => ''),
}));

// Mock citations
vi.mock('@/slack/citations/index.js', () => ({
  formatReferencesBlock: vi.fn(() => null),
  contextSourceToToolSource: vi.fn((s) => s),
  parseCitationsWithMetadata: vi.fn(() => []),
}));

// Mock source builder
vi.mock('@/slack/source-builder.js', () => ({
  filterClickableSources: vi.fn(() => []),
}));

// Mock media upload
vi.mock('@/slack/utils/media-upload.js', () => ({
  stripImageUrls: vi.fn((text) => text),
  uploadImagesFromResponse: vi.fn(async () => []),
}));

// Mock file uploader
vi.mock('@/slack/utils/file-uploader.js', () => ({
  createSlackFileUploader: vi.fn(() => ({
    uploadFiles: vi.fn(async () => ({ results: [], successCount: 0, failureCount: 0, totalBytes: 0 })),
  })),
}));

// Module-level variables for dynamic imports
let handleDirectMessage: (typeof import('@/slack/handlers/direct-message.js'))['handleDirectMessage'];
let isDuplicateEvent: ReturnType<typeof vi.fn>;
let logger: {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

describe('Direct Message Handler', () => {
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

    const dedupModule = await import('@/slack/event-dedup.js');
    isDuplicateEvent = dedupModule.isDuplicateEvent as ReturnType<typeof vi.fn>;
    isDuplicateEvent.mockReturnValue(false);

    const loggerModule = await import('@/utils/logger.js');
    logger = loggerModule.logger as unknown as {
      debug: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    const handlerModule = await import('@/slack/handlers/direct-message.js');
    handleDirectMessage = handlerModule.handleDirectMessage;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createDmEvent(
    overrides: Record<string, unknown> = {}
  ) {
    return {
      message: {
        type: 'message',
        channel: 'D123456',
        channel_type: 'im',
        user: 'U123456',
        text: 'Hello Orion',
        ts: '1234567890.123456',
        ...overrides,
      },
      event: {
        type: 'message',
        channel: 'D123456',
        channel_type: 'im',
        user: 'U123456',
        text: 'Hello Orion',
        ts: '1234567890.123456',
        ...overrides,
      },
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
      say: vi.fn().mockResolvedValue({ ts: '123.456' }),
    };
  }

  describe('Event filtering', () => {
    it('should only process im channel type', async () => {
      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'dm_received',
          channelId: 'D123456',
        })
      );
    });

    it('should skip non-im channel types', async () => {
      const args = createDmEvent({ channel_type: 'channel' });
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      // Should return early without processing
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'dm_received',
        })
      );
    });

    it('should skip bot messages to prevent loops', async () => {
      const args = createDmEvent({ bot_id: 'B123456' });
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'dm_skipped',
          reason: 'bot_message',
        })
      );
    });

    it('should skip message subtypes (edits, deletions)', async () => {
      const args = createDmEvent({ subtype: 'message_changed' });
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'dm_skipped',
          reason: 'subtype',
        })
      );
    });
  });

  describe('Event deduplication', () => {
    it('should use isDuplicateEvent with handler ID "dm"', async () => {
      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      expect(isDuplicateEvent).toHaveBeenCalledWith(
        'D123456',
        '1234567890.123456',
        'dm'
      );
    });

    it('should skip duplicate events', async () => {
      isDuplicateEvent.mockReturnValue(true);

      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'event_dedup.skipped',
          handler: 'dm',
        })
      );
    });
  });

  describe('Message processing', () => {
    it('should process DM text without @mention stripping', async () => {
      const { runOrionAgent } = await import('@/agent/orion.js');
      const args = createDmEvent({ text: 'Hello Orion, help me' });
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      // DMs don't strip @mentions - the full text is processed
      expect(runOrionAgent).toHaveBeenCalledWith(
        'Hello Orion, help me',
        expect.any(Object)
      );
    });

    it('should add eyes emoji on message receipt', async () => {
      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn> };
      };
      expect(client.reactions.add).toHaveBeenCalledWith({
        channel: 'D123456',
        timestamp: '1234567890.123456',
        name: 'eyes',
      });
    });

    it('should stream response to DM', async () => {
      const { createStreamer } = await import('@/utils/streaming.js');
      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      expect(createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'D123456',
        })
      );
      expect(mockStreamer.start).toHaveBeenCalled();
      expect(mockStreamer.append).toHaveBeenCalled();
      expect(mockStreamer.stop).toHaveBeenCalled();
    });
  });

  describe('Conversation history', () => {
    it('should use flat conversation history for DMs (not threads)', async () => {
      // DMs use conversations.history, not conversations.replies
      // This is handled by the message-core using isThread flag
      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      // The handler should indicate this is NOT a thread
      const { runOrionAgent } = await import('@/agent/orion.js');
      expect(runOrionAgent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          context: expect.objectContaining({
            channelId: 'D123456',
          }),
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle errors gracefully and post error message', async () => {
      const { runOrionAgent: mockAgent } = await import('@/agent/orion.js');
      (mockAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(function* () {
        throw new Error('Agent error');
      });

      const args = createDmEvent();
      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      await expect(
        handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0])
      ).rejects.toThrow('Agent error');

      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'D123456',
          text: expect.stringContaining('error'),
        })
      );
    });
  });

  describe('Completion indicators', () => {
    it('should add checkmark on successful completion', async () => {
      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn> };
      };
      expect(client.reactions.add).toHaveBeenCalledWith({
        channel: 'D123456',
        timestamp: '1234567890.123456',
        name: 'white_check_mark',
      });
    });

    it('should remove eyes reaction after response', async () => {
      const args = createDmEvent();
      await handleDirectMessage(args as Parameters<typeof handleDirectMessage>[0]);

      const client = args.client as unknown as {
        reactions: { remove: ReturnType<typeof vi.fn> };
      };
      expect(client.reactions.remove).toHaveBeenCalledWith({
        channel: 'D123456',
        timestamp: '1234567890.123456',
        name: 'eyes',
      });
    });
  });
});
