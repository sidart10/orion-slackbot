/**
 * SlackStreamer - Wrapper for Slack's chatStream API
 *
 * Provides streaming responses to Slack for real-time AI output.
 * Implements start → append → stop pattern per Slack docs.
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack using chatStream API
 * @see AC#7 - Debounce 250ms minimum between Slack updates
 * @see AC#8 - Heartbeat on silence >10s
 * @see AC#9 - 429 retry with exponential backoff
 * @see NFR4 - Streaming starts within 500ms
 * @see https://docs.slack.dev/ai/developing-ai-apps#text-streaming
 */

import type { WebClient } from '@slack/web-api';
import { logger } from './logger.js';

export interface StreamerConfig {
  client: WebClient;
  channel: string;
  threadTs: string;
  userId: string;
  teamId: string;
}

export interface StreamMetrics {
  totalDuration: number;
  totalChars: number;
}

// Type for the chatStream return value
interface ChatStreamHandle {
  append: (params: { markdown_text: string }) => Promise<void>;
  stop: () => Promise<void>;
}

/** Minimum time between Slack updates (AC#7) */
const DEBOUNCE_MS = 250;

/** Heartbeat interval for silence detection (AC#8) */
const HEARTBEAT_MS = 10000;

/** Maximum retry attempts for 429 errors (AC#9) */
const MAX_RETRIES = 3;

/**
 * SlackStreamer - Wrapper for Slack's chatStream API
 *
 * Provides streaming responses to Slack for real-time AI output.
 * Implements start → append → stop pattern per Slack docs.
 *
 * Features:
 * - Debounced updates (250ms minimum between Slack API calls)
 * - Heartbeat for silence detection (>10s)
 * - 429 error retry with exponential backoff
 *
 * @example
 * const streamer = new SlackStreamer({ client, channel, threadTs, userId, teamId });
 * await streamer.start();
 * await streamer.append('Hello ');
 * await streamer.append('World!');
 * const metrics = await streamer.stop();
 */
export class SlackStreamer {
  private client: WebClient;
  private channel: string;
  private threadTs: string;
  private userId: string;
  private teamId: string;
  private streamer: ChatStreamHandle | null = null;
  private startTime: number = 0;
  private totalChars: number = 0;

  // Debounce state (AC#7)
  private pendingContent: string = '';
  private lastUpdateTime: number = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Heartbeat state (AC#8)
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: StreamerConfig) {
    this.client = config.client;
    this.channel = config.channel;
    this.threadTs = config.threadTs;
    this.userId = config.userId;
    this.teamId = config.teamId;
  }

  /**
   * Initialize the stream
   * CRITICAL: Call this within 500ms of message receipt (NFR4)
   */
  async start(): Promise<void> {
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;

    // Use type assertion since chatStream types may not be complete in @slack/web-api
    this.streamer = (
      this.client as unknown as {
        chatStream: (params: {
          channel: string;
          thread_ts: string;
          recipient_user_id: string;
          recipient_team_id: string;
        }) => ChatStreamHandle;
      }
    ).chatStream({
      channel: this.channel,
      thread_ts: this.threadTs,
      recipient_user_id: this.userId,
      recipient_team_id: this.teamId,
    });

    // Start heartbeat timer (AC#8)
    this.startHeartbeat();

    logger.info({
      event: 'stream_started',
      channel: this.channel,
      threadTs: this.threadTs,
      timeToStart: Date.now() - this.startTime,
    });
  }

  /**
   * Start heartbeat timer to detect silence (AC#8)
   * Logs warning if no content sent for >10s
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const silenceMs = Date.now() - this.lastUpdateTime;
      if (silenceMs >= HEARTBEAT_MS) {
        logger.debug({
          event: 'stream_heartbeat',
          channel: this.channel,
          threadTs: this.threadTs,
          silenceMs,
        });
      }
    }, HEARTBEAT_MS);
  }

  /**
   * Append content to the stream with debouncing (AC#7)
   * Content should already be formatted as Slack mrkdwn
   * Debounces updates to 250ms minimum between Slack API calls
   */
  append(text: string): void {
    if (!this.streamer) {
      throw new Error('Stream not started. Call start() first.');
    }

    this.totalChars += text.length;
    this.pendingContent += text;

    // Schedule flush with debounce
    if (!this.debounceTimer) {
      this.debounceTimer = setTimeout(() => {
        void this.flushPendingContent();
      }, DEBOUNCE_MS);
    }
  }

  /**
   * Flush pending content to Slack with 429 retry (AC#9)
   */
  private async flushPendingContent(): Promise<void> {
    if (!this.pendingContent || !this.streamer) return;

    const content = this.pendingContent;
    this.pendingContent = '';
    this.debounceTimer = null;

    await this.appendWithRetry(content);
    this.lastUpdateTime = Date.now();
  }

  /**
   * Append with exponential backoff retry for 429 errors (AC#9)
   */
  private async appendWithRetry(text: string, attempt = 1): Promise<void> {
    try {
      await this.streamer!.append({ markdown_text: text });
    } catch (error: unknown) {
      const is429 =
        error instanceof Error && (error.message.includes('429') || error.message.includes('ratelimited'));

      if (is429 && attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
        logger.warn({
          event: 'stream_rate_limited',
          channel: this.channel,
          threadTs: this.threadTs,
          attempt,
          backoffMs,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.appendWithRetry(text, attempt + 1);
      }

      // Log error but don't throw - debounced mode handles errors gracefully
      logger.error({
        event: 'stream_append_failed',
        channel: this.channel,
        threadTs: this.threadTs,
        error: error instanceof Error ? error.message : String(error),
        attempt,
      });
    }
  }

  /**
   * Finalize and close the stream
   * Flushes any pending content before stopping
   * @returns Metrics about the streaming session
   */
  async stop(): Promise<StreamMetrics> {
    if (!this.streamer) {
      throw new Error('Stream not started. Call start() first.');
    }

    // Clear timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Flush any pending content before stop
    if (this.pendingContent) {
      await this.flushPendingContent();
    }

    await this.streamer.stop();

    const metrics: StreamMetrics = {
      totalDuration: Date.now() - this.startTime,
      totalChars: this.totalChars,
    };

    logger.info({
      event: 'stream_stopped',
      channel: this.channel,
      threadTs: this.threadTs,
      ...metrics,
    });

    return metrics;
  }
}

/**
 * Factory function for creating a streamer
 */
export function createStreamer(config: StreamerConfig): SlackStreamer {
  return new SlackStreamer(config);
}

