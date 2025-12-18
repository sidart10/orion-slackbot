/**
 * Tests for SlackStreamer utility
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack using chatStream API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackStreamer, createStreamer, type StreamerConfig } from './streaming.js';
import type { WebClient } from '@slack/web-api';

// Mock Slack Web Client with chatStream
function createMockClient(): {
  mockClient: WebClient;
  mockStreamer: { append: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
} {
  const mockStreamer = {
    append: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };

  const mockClient = {
    chatStream: vi.fn().mockReturnValue(mockStreamer),
  } as unknown as WebClient;

  return { mockClient, mockStreamer };
}

describe('SlackStreamer', () => {
  let config: StreamerConfig;
  let mockClient: WebClient;
  let mockStreamer: { append: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const mocks = createMockClient();
    mockClient = mocks.mockClient;
    mockStreamer = mocks.mockStreamer;

    config = {
      client: mockClient,
      channel: 'C123456',
      threadTs: '1234567890.123456',
      userId: 'U123456',
      teamId: 'T123456',
    };
  });

  describe('start()', () => {
    it('should initialize chatStream with correct parameters', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();

      expect(mockClient.chatStream).toHaveBeenCalledWith({
        channel: 'C123456',
        thread_ts: '1234567890.123456',
        recipient_user_id: 'U123456',
        recipient_team_id: 'T123456',
      });
    });

    it('should track start time for metrics', async () => {
      const streamer = new SlackStreamer(config);
      const beforeStart = Date.now();
      await streamer.start();
      const afterStart = Date.now();

      // Start time should be recorded (we'll verify via stop() metrics)
      const metrics = await streamer.stop();
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.totalDuration).toBeLessThan(afterStart - beforeStart + 100);
    });
  });

  describe('append()', () => {
    it('should append text via chatStream', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      await streamer.append('Hello');

      expect(mockStreamer.append).toHaveBeenCalledWith({ markdown_text: 'Hello' });
    });

    it('should throw if called before start()', async () => {
      const streamer = new SlackStreamer(config);

      await expect(streamer.append('Hello')).rejects.toThrow(
        'Stream not started. Call start() first.'
      );
    });

    it('should track total characters appended', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      await streamer.append('Hello');
      await streamer.append(' World');

      const metrics = await streamer.stop();
      expect(metrics.totalChars).toBe(11); // 'Hello' + ' World'
    });

    it('should handle empty strings', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      await streamer.append('');

      expect(mockStreamer.append).toHaveBeenCalledWith({ markdown_text: '' });
    });
  });

  describe('stop()', () => {
    it('should call chatStream stop()', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      await streamer.stop();

      expect(mockStreamer.stop).toHaveBeenCalled();
    });

    it('should throw if called before start()', async () => {
      const streamer = new SlackStreamer(config);

      await expect(streamer.stop()).rejects.toThrow(
        'Stream not started. Call start() first.'
      );
    });

    it('should return metrics with duration and char count', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      await streamer.append('Test message');
      await new Promise((r) => setTimeout(r, 10)); // Small delay
      const metrics = await streamer.stop();

      expect(metrics).toEqual({
        totalDuration: expect.any(Number),
        totalChars: 12,
      });
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('error handling', () => {
    it('should propagate append errors', async () => {
      mockStreamer.append.mockRejectedValueOnce(new Error('Slack API error'));

      const streamer = new SlackStreamer(config);
      await streamer.start();

      await expect(streamer.append('Hello')).rejects.toThrow('Slack API error');
    });

    it('should propagate stop errors', async () => {
      mockStreamer.stop.mockRejectedValueOnce(new Error('Stream close error'));

      const streamer = new SlackStreamer(config);
      await streamer.start();

      await expect(streamer.stop()).rejects.toThrow('Stream close error');
    });
  });
});

describe('createStreamer factory', () => {
  it('should create a SlackStreamer instance', () => {
    const { mockClient } = createMockClient();
    const config: StreamerConfig = {
      client: mockClient,
      channel: 'C123',
      threadTs: '123.456',
      userId: 'U123',
      teamId: 'T123',
    };

    const streamer = createStreamer(config);
    expect(streamer).toBeInstanceOf(SlackStreamer);
  });
});

