/**
 * StatusUpdater Module
 *
 * Unified status message handling for both Assistant API and channel contexts.
 *
 * @see Story 7.9 - Unified StatusUpdater
 * @see AC#4 - Factory function createStatusUpdater()
 */

export type { StatusUpdater, StatusContext, SetStatusFn } from './types.js';
export { AssistantStatusUpdater } from './assistant-updater.js';
export { ChannelStatusUpdater } from './channel-updater.js';

import type { StatusUpdater, StatusContext } from './types.js';
import { AssistantStatusUpdater } from './assistant-updater.js';
import { ChannelStatusUpdater } from './channel-updater.js';

/**
 * Factory function to create the appropriate StatusUpdater implementation.
 *
 * Selection logic:
 * - If context.setStatus is defined: AssistantStatusUpdater (uses setStatus callback)
 * - If context.setStatus is undefined: ChannelStatusUpdater (uses chat.postMessage/update/delete)
 *
 * This is a synchronous factory - no async initialization required.
 *
 * @param context - Status context with required fields
 * @returns StatusUpdater implementation appropriate for the context
 *
 * @example
 * // Assistant context (DM or Assistant thread)
 * const statusUpdater = createStatusUpdater({
 *   setStatus,  // From Assistant middleware
 *   client,
 *   channel: channelId,
 *   thread_ts: threadTs,
 *   traceId: trace.id,
 * });
 *
 * @example
 * // Channel context (@mention in channel)
 * const statusUpdater = createStatusUpdater({
 *   // No setStatus for channel context
 *   client,
 *   channel: channelId,
 *   thread_ts: threadTs,
 *   traceId: trace.id,
 * });
 *
 * // Usage (same for both)
 * await statusUpdater.update('Searching...');
 * // ... processing ...
 * await statusUpdater.cleanup();
 */
export function createStatusUpdater(context: StatusContext): StatusUpdater {
  if (context.setStatus) {
    return new AssistantStatusUpdater(context.setStatus, context.traceId);
  }

  return new ChannelStatusUpdater(
    context.client,
    context.channel,
    context.thread_ts,
    context.traceId
  );
}
