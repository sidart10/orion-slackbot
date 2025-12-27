import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFeedback } from './feedback.js';

// Mock dependencies
const mockLogFeedbackScore = vi.fn();

vi.mock('../../observability/langfuse.js', () => ({
  logFeedbackScore: (...args: unknown[]) => mockLogFeedbackScore(...args),
}));

vi.mock('../../observability/tracing.js', () => ({
  getTraceIdFromMessageTs: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('handleFeedback', () => {
  const mockAck = vi.fn().mockResolvedValue(undefined);
  const mockPostEphemeral = vi.fn().mockResolvedValue({});
  const mockClient = {
    chat: { postEphemeral: mockPostEphemeral },
  };

  const createBody = (value: string, messageTs?: string) => ({
    type: 'block_actions' as const,
    user: { id: 'U123' },
    channel: { id: 'C456' },
    team: { id: 'T789' },
    message: messageTs ? { ts: messageTs } : undefined,
    actions: [{ action_id: 'orion_feedback', value }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogFeedbackScore.mockResolvedValue({ scored: true, orphan: false, metadata: {} });
  });

  it('should export handleFeedback function', () => {
    expect(handleFeedback).toBeDefined();
    expect(typeof handleFeedback).toBe('function');
  });

  it('should acknowledge the action immediately', async () => {
    await handleFeedback({
      ack: mockAck,
      body: createBody('positive', '1234.5678'),
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockAck).toHaveBeenCalled();
  });

  it('should call logFeedbackScore with positive feedback', async () => {
    const { getTraceIdFromMessageTs } = await import('../../observability/tracing.js');
    vi.mocked(getTraceIdFromMessageTs).mockReturnValue('trace-123');

    await handleFeedback({
      ack: mockAck,
      body: createBody('positive', '1234.5678'),
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockLogFeedbackScore).toHaveBeenCalledWith(
      expect.objectContaining({
        isPositive: true,
        traceId: 'trace-123',
        userId: 'U123',
        channelId: 'C456',
        messageTs: '1234.5678',
      })
    );
  });

  it('should call logFeedbackScore with negative feedback', async () => {
    const { getTraceIdFromMessageTs } = await import('../../observability/tracing.js');
    vi.mocked(getTraceIdFromMessageTs).mockReturnValue('trace-456');

    await handleFeedback({
      ack: mockAck,
      body: createBody('negative', '1234.5678'),
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockLogFeedbackScore).toHaveBeenCalledWith(
      expect.objectContaining({
        isPositive: false,
      })
    );
  });

  it('should send positive ephemeral acknowledgment', async () => {
    const { getTraceIdFromMessageTs } = await import('../../observability/tracing.js');
    vi.mocked(getTraceIdFromMessageTs).mockReturnValue('trace-123');

    await handleFeedback({
      ack: mockAck,
      body: createBody('positive', '1234.5678'),
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        user: 'U123',
        text: expect.stringContaining('Thanks'),
      })
    );
  });

  it('should send negative ephemeral acknowledgment with suggestion', async () => {
    const { getTraceIdFromMessageTs } = await import('../../observability/tracing.js');
    vi.mocked(getTraceIdFromMessageTs).mockReturnValue('trace-123');

    await handleFeedback({
      ack: mockAck,
      body: createBody('negative', '1234.5678'),
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('new thread'),
      })
    );
  });

  it('should pass null traceId to logFeedbackScore when trace not found', async () => {
    const { getTraceIdFromMessageTs } = await import('../../observability/tracing.js');
    vi.mocked(getTraceIdFromMessageTs).mockReturnValue(null);

    mockLogFeedbackScore.mockResolvedValue({ scored: false, orphan: true, metadata: {} });

    await handleFeedback({
      ack: mockAck,
      body: createBody('positive', '1234.5678'),
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockLogFeedbackScore).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: null,
      })
    );
  });

  it('should include all metadata fields in logFeedbackScore call', async () => {
    const { getTraceIdFromMessageTs } = await import('../../observability/tracing.js');
    vi.mocked(getTraceIdFromMessageTs).mockReturnValue('trace-123');

    await handleFeedback({
      ack: mockAck,
      body: createBody('positive', '1234.5678'),
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockLogFeedbackScore).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'U123',
        channelId: 'C456',
        messageTs: '1234.5678',
        teamId: 'T789',
      })
    );
  });

  it('should handle missing action value gracefully', async () => {
    await handleFeedback({
      ack: mockAck,
      body: {
        ...createBody('positive'),
        actions: [{}], // No value
      },
      client: mockClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockAck).toHaveBeenCalled();
    // Should not throw
  });

  it('should handle ephemeral message failure gracefully', async () => {
    const { getTraceIdFromMessageTs } = await import('../../observability/tracing.js');
    vi.mocked(getTraceIdFromMessageTs).mockReturnValue('trace-123');

    const failingClient = {
      chat: {
        postEphemeral: vi.fn().mockRejectedValue(new Error('Slack API error')),
      },
    };

    // Should not throw
    await handleFeedback({
      ack: mockAck,
      body: createBody('positive', '1234.5678'),
      client: failingClient,
    } as unknown as Parameters<typeof handleFeedback>[0]);

    expect(mockAck).toHaveBeenCalled();
  });
});

