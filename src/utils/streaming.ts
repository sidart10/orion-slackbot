/**
 * SlackStreamer - Wrapper for Slack's chatStream API
 *
 * Provides streaming responses to Slack for real-time AI output.
 * Implements start → append → stop pattern per Slack docs.
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack using chatStream API
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

/**
 * SlackStreamer - Wrapper for Slack's chatStream API
 *
 * Provides streaming responses to Slack for real-time AI output.
 * Implements start → append → stop pattern per Slack docs.
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

    // Use type assertion since chatStream types may not be complete in @slack/web-api
    this.streamer = (this.client as unknown as {
      chatStream: (params: {
        channel: string;
        thread_ts: string;
        recipient_user_id: string;
        recipient_team_id: string;
      }) => ChatStreamHandle;
    }).chatStream({
      channel: this.channel,
      thread_ts: this.threadTs,
      recipient_user_id: this.userId,
      recipient_team_id: this.teamId,
    });

    logger.info({
      event: 'stream_started',
      channel: this.channel,
      threadTs: this.threadTs,
      timeToStart: Date.now() - this.startTime,
    });
  }

  /**
   * Append content to the stream
   * Content should already be formatted as Slack mrkdwn
   */
  async append(text: string): Promise<void> {
    if (!this.streamer) {
      throw new Error('Stream not started. Call start() first.');
    }

    this.totalChars += text.length;
    await this.streamer.append({ markdown_text: text });
  }

  /**
   * Finalize and close the stream
   * @returns Metrics about the streaming session
   */
  async stop(): Promise<StreamMetrics> {
    if (!this.streamer) {
      throw new Error('Stream not started. Call start() first.');
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

