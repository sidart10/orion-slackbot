/**
 * ChannelStatusUpdater - Status updates via Slack WebClient
 *
 * Uses chat.postMessage/update/delete for channel contexts where
 * Assistant API setStatus is not available (e.g., @mentions in channels).
 *
 * Implements 300ms debounce to avoid Slack rate limits on rapid updates.
 *
 * @see Story 7.9 - Unified StatusUpdater
 * @see AC#3 - ChannelStatusUpdater with 300ms debounce
 * @see Story 3.4 - Channel Tool Feedback (original debounce pattern)
 */

import type { WebClient } from '@slack/web-api';
import type { StatusUpdater } from './types.js';
import { logger } from '../../utils/logger.js';

/** Debounce interval in milliseconds to avoid Slack rate limits */
const STATUS_DEBOUNCE_MS = 300;

/**
 * StatusUpdater implementation for channel contexts.
 *
 * Posts a status message on first update(), then updates existing message
 * on subsequent calls. Debounces rapid updates (300ms minimum interval).
 *
 * Error handling:
 * - Never throws - all errors are caught and logged
 * - Uses logger.debug for channel errors (less critical than Assistant)
 */
export class ChannelStatusUpdater implements StatusUpdater {
  private readonly client: WebClient;
  private readonly channel: string;
  private readonly threadTs: string;
  private readonly traceId?: string;

  /** Timestamp of the posted status message (undefined until first update) */
  private messageTs?: string;
  /** Timestamp of last update for debouncing */
  private lastUpdateTime = 0;

  constructor(
    client: WebClient,
    channel: string,
    threadTs: string,
    traceId?: string
  ) {
    this.client = client;
    this.channel = channel;
    this.threadTs = threadTs;
    this.traceId = traceId;
  }

  /**
   * Update status message in channel thread.
   *
   * First call: Posts new message via chat.postMessage
   * Subsequent calls: Updates existing message via chat.update (debounced)
   *
   * Debouncing: Skips updates within 300ms of last update (except first).
   */
  async update(status: string): Promise<void> {
    const now = Date.now();

    // First update: post new message (no debounce)
    if (!this.messageTs) {
      try {
        const response = await this.client.chat.postMessage({
          channel: this.channel,
          thread_ts: this.threadTs,
          text: status,
        });
        this.messageTs = response.ts;
        this.lastUpdateTime = now;
      } catch (error) {
        logger.debug({
          event: 'status_update_failed',
          updater: 'channel',
          operation: 'postMessage',
          error: error instanceof Error ? error.message : String(error),
          traceId: this.traceId,
        });
        // Graceful: don't throw
      }
      return;
    }

    // Subsequent updates: debounce to avoid rate limits
    if (now - this.lastUpdateTime < STATUS_DEBOUNCE_MS) {
      return; // Skip update within debounce window
    }

    try {
      await this.client.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: status,
      });
      this.lastUpdateTime = now;
    } catch (error) {
      logger.debug({
        event: 'status_update_failed',
        updater: 'channel',
        operation: 'update',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
      // Graceful: don't throw
    }
  }

  /**
   * Clean up by deleting the status message.
   *
   * Only deletes if a message was previously posted (messageTs exists).
   * This prevents errors on fresh instances or when postMessage failed.
   */
  async cleanup(): Promise<void> {
    // No-op if no message was posted
    if (!this.messageTs) {
      return;
    }

    try {
      await this.client.chat.delete({
        channel: this.channel,
        ts: this.messageTs,
      });
    } catch (error) {
      logger.debug({
        event: 'status_cleanup_failed',
        updater: 'channel',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
      // Graceful: don't throw
    }

    // Clear state regardless of delete success
    this.messageTs = undefined;
  }

  /**
   * Check if a status message is currently active.
   *
   * @returns true if a message was posted and not yet cleaned up
   */
  isActive(): boolean {
    return this.messageTs !== undefined;
  }
}
