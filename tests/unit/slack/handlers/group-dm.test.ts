/**
 * Tests for Group DM Handler
 *
 * @see PLAN-dm-group-dm-support.md - Task 3: Create Group DM Handler
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
  getChannelName: vi.fn(async () => 'group-dm'),
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
      channelInfo: { name: 'group-dm', type: 'mpim' },
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
let handleGroupDm: (typeof import('@/slack/handlers/group-dm.js'))['handleGroupDm'];
let isDuplicateEvent: ReturnType<typeof vi.fn>;
let logger: {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

describe('Group DM Handler', () => {
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

    const handlerModule = await import('@/slack/handlers/group-dm.js');
    handleGroupDm = handlerModule.handleGroupDm;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createGroupDmEvent(
    overrides: Record<string, unknown> = {}
  ) {
    return {
      message: {
        type: 'message',
        channel: 'G123456',
        channel_type: 'mpim',
        user: 'U123456',
        text: 'Hello everyone',
        ts: '1234567890.123456',
        ...overrides,
      },
      event: {
        type: 'message',
        channel: 'G123456',
        channel_type: 'mpim',
        user: 'U123456',
        text: 'Hello everyone',
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
    it('should only process mpim channel type', async () => {
      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'group_dm_received',
          channelId: 'G123456',
        })
      );
    });

    it('should skip non-mpim channel types', async () => {
      const args = createGroupDmEvent({ channel_type: 'channel' });
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      // Should return early without processing
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'group_dm_received',
        })
      );
    });

    it('should skip bot messages to prevent loops', async () => {
      const args = createGroupDmEvent({ bot_id: 'B123456' });
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'group_dm_skipped',
          reason: 'bot_message',
        })
      );
    });

    it('should skip message subtypes (edits, deletions)', async () => {
      const args = createGroupDmEvent({ subtype: 'message_changed' });
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'group_dm_skipped',
          reason: 'subtype',
        })
      );
    });
  });

  describe('Event deduplication', () => {
    it('should use isDuplicateEvent with handler ID "group_dm"', async () => {
      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      expect(isDuplicateEvent).toHaveBeenCalledWith(
        'G123456',
        '1234567890.123456',
        'group_dm'
      );
    });

    it('should skip duplicate events', async () => {
      isDuplicateEvent.mockReturnValue(true);

      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'event_dedup.skipped',
          handler: 'group_dm',
        })
      );
    });
  });

  describe('Message processing', () => {
    it('should process group DM text without @mention stripping', async () => {
      const { runOrionAgent } = await import('@/agent/orion.js');
      const args = createGroupDmEvent({ text: 'Hey team, any updates?' });
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      // Group DMs don't strip @mentions - the full text is processed
      expect(runOrionAgent).toHaveBeenCalledWith(
        'Hey team, any updates?',
        expect.any(Object)
      );
    });

    it('should add eyes emoji on message receipt', async () => {
      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn> };
      };
      expect(client.reactions.add).toHaveBeenCalledWith({
        channel: 'G123456',
        timestamp: '1234567890.123456',
        name: 'eyes',
      });
    });

    it('should stream response to group DM', async () => {
      const { createStreamer } = await import('@/utils/streaming.js');
      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      expect(createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'G123456',
        })
      );
      expect(mockStreamer.start).toHaveBeenCalled();
      expect(mockStreamer.append).toHaveBeenCalled();
      expect(mockStreamer.stop).toHaveBeenCalled();
    });
  });

  describe('Conversation history', () => {
    it('should use flat conversation history for group DMs (not threads)', async () => {
      // Group DMs use conversations.history, not conversations.replies
      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      const { runOrionAgent } = await import('@/agent/orion.js');
      expect(runOrionAgent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          context: expect.objectContaining({
            channelId: 'G123456',
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

      const args = createGroupDmEvent();
      const client = args.client as unknown as {
        chat: { postMessage: ReturnType<typeof vi.fn> };
      };

      await expect(
        handleGroupDm(args as Parameters<typeof handleGroupDm>[0])
      ).rejects.toThrow('Agent error');

      expect(client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'G123456',
          text: expect.stringContaining('error'),
        })
      );
    });
  });

  describe('Completion indicators', () => {
    it('should add checkmark on successful completion', async () => {
      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      const client = args.client as unknown as {
        reactions: { add: ReturnType<typeof vi.fn> };
      };
      expect(client.reactions.add).toHaveBeenCalledWith({
        channel: 'G123456',
        timestamp: '1234567890.123456',
        name: 'white_check_mark',
      });
    });

    it('should remove eyes reaction after response', async () => {
      const args = createGroupDmEvent();
      await handleGroupDm(args as Parameters<typeof handleGroupDm>[0]);

      const client = args.client as unknown as {
        reactions: { remove: ReturnType<typeof vi.fn> };
      };
      expect(client.reactions.remove).toHaveBeenCalledWith({
        channel: 'G123456',
        timestamp: '1234567890.123456',
        name: 'eyes',
      });
    });
  });
});
