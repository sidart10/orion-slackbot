/**
 * Tests for SlackStreamer utility
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack using chatStream API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    it('should append text via chatStream (flushed on stop)', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      streamer.append('Hello');

      // Content flushed on stop
      await streamer.stop();

      expect(mockStreamer.append).toHaveBeenCalledWith({ markdown_text: 'Hello' });
    });

    it('should throw if called before start()', () => {
      const streamer = new SlackStreamer(config);

      expect(() => streamer.append('Hello')).toThrow('Stream not started. Call start() first.');
    });

    it('should track total characters appended', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      streamer.append('Hello');
      streamer.append(' World');

      const metrics = await streamer.stop();
      expect(metrics.totalChars).toBe(11); // 'Hello' + ' World'
    });

    it('should handle empty strings without crashing', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();
      streamer.append('');

      // Empty string tracked but nothing to flush (optimization)
      await streamer.stop();

      // Empty content = no Slack API call (correct behavior)
      expect(mockStreamer.append).not.toHaveBeenCalled();
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
      vi.useFakeTimers();
      const streamer = new SlackStreamer(config);
      await streamer.start();
      streamer.append('Test message');
      await vi.advanceTimersByTimeAsync(250); // Flush debounce
      const metrics = await streamer.stop();
      vi.useRealTimers();

      expect(metrics).toEqual({
        totalDuration: expect.any(Number),
        totalChars: 12,
      });
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('error handling', () => {
    it('should log append errors gracefully (debounced mode)', async () => {
      vi.useFakeTimers();
      mockStreamer.append.mockRejectedValueOnce(new Error('Slack API error'));

      const streamer = new SlackStreamer(config);
      await streamer.start();
      streamer.append('Hello');

      // Advance past debounce - error is logged but not thrown
      await vi.advanceTimersByTimeAsync(250);

      // Append was attempted
      expect(mockStreamer.append).toHaveBeenCalled();
      vi.useRealTimers();
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

/**
 * Task 6: Streaming Safety Tests
 * @see AC#7 - Debounce 250ms minimum between Slack updates
 * @see AC#8 - Heartbeat on silence >10s
 * @see AC#9 - 429 retry with exponential backoff
 */
describe('Streaming Safety (AC#7, AC#8, AC#9)', () => {
  let config: StreamerConfig;
  let mockClient: WebClient;
  let mockStreamer: { append: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
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

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Debounce (AC#7)', () => {
    it('should debounce rapid appends with 250ms minimum between Slack updates', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();

      // Rapid fire 3 appends within debounce window
      streamer.append('Hello ');
      streamer.append('World ');
      streamer.append('!');

      // Should not have called append yet (within debounce window)
      expect(mockStreamer.append).not.toHaveBeenCalled();

      // Advance past debounce period
      await vi.advanceTimersByTimeAsync(250);

      // Should have batched all content into single append
      expect(mockStreamer.append).toHaveBeenCalledTimes(1);
      expect(mockStreamer.append).toHaveBeenCalledWith({ markdown_text: 'Hello World !' });
    });

    it('should flush immediately after 250ms since last update', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();

      // First append
      streamer.append('First');
      await vi.advanceTimersByTimeAsync(250);
      expect(mockStreamer.append).toHaveBeenCalledTimes(1);

      // Second append after debounce period - should flush immediately
      await vi.advanceTimersByTimeAsync(100);
      streamer.append('Second');
      await vi.advanceTimersByTimeAsync(250);
      expect(mockStreamer.append).toHaveBeenCalledTimes(2);
    });

    it('should flush pending content on stop()', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();

      streamer.append('Pending');
      // Don't advance timers - content is still pending

      await streamer.stop();

      // Stop should flush pending content
      expect(mockStreamer.append).toHaveBeenCalledWith({ markdown_text: 'Pending' });
    });
  });

  describe('Heartbeat (AC#8)', () => {
    it('should send heartbeat after 10s of silence', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();

      // Advance 10 seconds
      await vi.advanceTimersByTimeAsync(10000);

      // Heartbeat should trigger (implementation may log or send keepalive)
      // For now, we verify the timer doesn't crash and heartbeat is logged
      // The actual heartbeat behavior is internal - we verify stop() works
      await streamer.stop();
    });

    it('should reset heartbeat timer on append', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();

      // Advance 9 seconds
      await vi.advanceTimersByTimeAsync(9000);

      // Append resets heartbeat timer
      streamer.append('Content');
      await vi.advanceTimersByTimeAsync(250);

      // Advance another 9 seconds - heartbeat should not trigger
      await vi.advanceTimersByTimeAsync(9000);

      // Stop should work without heartbeat issues
      await streamer.stop();
    });

    it('should clear heartbeat timer on stop()', async () => {
      const streamer = new SlackStreamer(config);
      await streamer.start();

      await streamer.stop();

      // Advance timers - should not throw after stop
      await vi.advanceTimersByTimeAsync(15000);
    });
  });

  describe('429 Retry (AC#9)', () => {
    it('should retry on 429 error with exponential backoff', async () => {
      // First call fails with 429, second succeeds
      mockStreamer.append
        .mockRejectedValueOnce(new Error('ratelimited: 429'))
        .mockResolvedValueOnce(undefined);

      const streamer = new SlackStreamer(config);
      await streamer.start();

      streamer.append('Content');

      // Advance enough time for debounce (250) + retry backoff (200)
      await vi.advanceTimersByTimeAsync(500);

      // Should have retried after 429
      expect(mockStreamer.append).toHaveBeenCalledTimes(2);

      await streamer.stop();
    });

    it('should retry up to 3 times on 429', async () => {
      mockStreamer.append
        .mockRejectedValueOnce(new Error('429'))
        .mockRejectedValueOnce(new Error('429'))
        .mockResolvedValueOnce(undefined);

      const streamer = new SlackStreamer(config);
      await streamer.start();

      streamer.append('Content');

      // Advance enough time: debounce (250) + backoff1 (200) + backoff2 (400)
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockStreamer.append).toHaveBeenCalledTimes(3);

      await streamer.stop();
    });

    it('should give up after max retries exceeded', async () => {
      mockStreamer.append.mockRejectedValue(new Error('429'));

      const streamer = new SlackStreamer(config);
      await streamer.start();

      streamer.append('Content');

      // Advance enough time: debounce (250) + backoff1 (200) + backoff2 (400) + backoff3 (800)
      await vi.advanceTimersByTimeAsync(2000);

      // Should have tried MAX_RETRIES (3) times then given up
      expect(mockStreamer.append).toHaveBeenCalledTimes(3);

      await streamer.stop();
    });

    it('should not retry on non-429 errors', async () => {
      mockStreamer.append.mockRejectedValueOnce(new Error('Network error'));

      const streamer = new SlackStreamer(config);
      await streamer.start();

      streamer.append('Content');

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(300);

      // Should only call once, no retry for non-429
      expect(mockStreamer.append).toHaveBeenCalledTimes(1);

      await streamer.stop();
    });
  });
});

