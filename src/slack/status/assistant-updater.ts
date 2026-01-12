/**
 * AssistantStatusUpdater - Status updates via Slack Assistant API
 *
 * Wraps the setStatus() callback provided by Slack's Assistant class.
 * No debouncing needed - Slack handles rate limiting for Assistant API.
 *
 * @see Story 7.9 - Unified StatusUpdater
 * @see AC#2 - AssistantStatusUpdater wraps setStatus() callback
 */

import type { StatusUpdater, SetStatusFn } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * StatusUpdater implementation for Slack Assistant API context.
 *
 * Uses the setStatus() callback from Slack's Assistant middleware.
 * Gracefully handles both sync and async setStatus implementations.
 *
 * Error handling:
 * - Never throws - all errors are caught and logged
 * - Uses logger.warn for visibility (user-visible impact)
 */
export class AssistantStatusUpdater implements StatusUpdater {
  private readonly setStatus: SetStatusFn;
  private readonly traceId?: string;
  private active = false;

  constructor(setStatus: SetStatusFn, traceId?: string) {
    this.setStatus = setStatus;
    this.traceId = traceId;
  }

  /**
   * Update status via setStatus callback.
   *
   * Calls setStatus with loading_messages array containing the status.
   * Handles both sync (returns void) and async (returns Promise) callbacks.
   */
  async update(status: string): Promise<void> {
    try {
      const result = this.setStatus({
        status: 'working...',
        loading_messages: [status],
      });

      // Handle both sync and async setStatus implementations
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }

      this.active = true;
    } catch (error) {
      logger.warn({
        event: 'status_update_failed',
        updater: 'assistant',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
      // Graceful: don't throw, continue operation
    }
  }

  /**
   * Clean up by calling setStatus with empty string.
   *
   * Only calls setStatus if update() was previously called (active state).
   * This prevents unnecessary API calls on fresh instances.
   */
  async cleanup(): Promise<void> {
    // No-op if update() was never called
    if (!this.active) {
      return;
    }

    try {
      const result = this.setStatus({ status: '' });

      // Handle both sync and async setStatus implementations
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }

      this.active = false;
    } catch (error) {
      logger.warn({
        event: 'status_cleanup_failed',
        updater: 'assistant',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
      // Graceful: don't throw
      this.active = false;
    }
  }

  /**
   * Check if status is currently active.
   *
   * @returns true after update() called, false before or after cleanup()
   */
  isActive(): boolean {
    return this.active;
  }
}
