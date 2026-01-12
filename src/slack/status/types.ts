/**
 * StatusUpdater Abstraction Types
 *
 * Provides a unified interface for status message handling across both
 * Assistant API (setStatus) and Channel contexts (chat.postMessage/update/delete).
 *
 * @see Story 7.9 - Unified StatusUpdater
 * @see AC#1 - StatusUpdater interface with update(), cleanup(), isActive()
 */

import type { WebClient } from '@slack/web-api';

/**
 * Callback type for Slack Assistant API setStatus.
 *
 * May return void (sync) or Promise<void> (async) depending on Slack SDK version.
 * Both cases must be handled gracefully.
 */
export type SetStatusFn = (payload: {
  status: string;
  loading_messages?: string[];
}) => void | Promise<void>;

/**
 * Context required for creating a StatusUpdater.
 *
 * Factory function uses setStatus presence to determine implementation:
 * - setStatus defined: AssistantStatusUpdater (uses setStatus callback)
 * - setStatus undefined: ChannelStatusUpdater (uses chat.postMessage/update/delete)
 */
export interface StatusContext {
  /** Slack Assistant setStatus callback. If undefined, uses channel mode. */
  setStatus?: SetStatusFn;
  /** WebClient for channel status messages (postMessage/update/delete) */
  client: WebClient;
  /** Channel ID for status messages */
  channel: string;
  /** Thread timestamp for status messages */
  thread_ts: string;
  /** Trace ID for observability logging */
  traceId?: string;
}

/**
 * Unified interface for status message handling.
 *
 * Two implementations:
 * - AssistantStatusUpdater: Wraps setStatus() callback (no debounce, Slack handles rate limiting)
 * - ChannelStatusUpdater: Uses chat.postMessage/update/delete (300ms debounce)
 *
 * @see Story 7.9 - Unified StatusUpdater
 */
export interface StatusUpdater {
  /**
   * Update the status message with new text.
   *
   * - AssistantStatusUpdater: Calls setStatus with loading_messages
   * - ChannelStatusUpdater: Posts or updates message (debounced 300ms)
   *
   * Never throws - errors are logged and swallowed.
   */
  update(status: string): Promise<void>;

  /**
   * Clean up the status message.
   *
   * - AssistantStatusUpdater: Calls setStatus with empty string
   * - ChannelStatusUpdater: Deletes the status message
   *
   * Never throws - errors are logged and swallowed.
   */
  cleanup(): Promise<void>;

  /**
   * Check if a status message is currently active.
   *
   * @returns true if update() has been called and cleanup() has not
   */
  isActive(): boolean;
}
