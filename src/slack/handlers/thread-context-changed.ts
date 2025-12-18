/**
 * Thread Context Changed Handler
 *
 * Handles assistant_thread_context_changed events when a user
 * switches context (e.g., views assistant from a different channel).
 *
 * @see AC#2 - threadContextChanged events handled
 * @see AC#5 - Handler wrapped in Langfuse trace
 * @see AR11 - All handlers wrapped in Langfuse traces
 */

import type { AssistantThreadContextChangedMiddleware } from '@slack/bolt';
import { startActiveObservation } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';

/**
 * Handle assistant_thread_context_changed event.
 * Called when user switches context (e.g., views assistant from a different channel).
 *
 * - Saves updated context
 * - Logs context change event
 * - Wraps all processing in Langfuse trace
 */
export const handleThreadContextChanged: AssistantThreadContextChangedMiddleware =
  async ({ saveThreadContext, event, context }) => {
    const userId = event.assistant_thread?.user_id;
    const channelId = event.assistant_thread?.channel_id;
    const threadTs = event.assistant_thread?.thread_ts;

    await startActiveObservation(
      {
        name: 'thread-context-changed-handler',
        userId,
        sessionId: threadTs,
        metadata: {
          teamId: context.teamId,
          channelId,
        },
      },
      async (trace) => {
        logger.info({
          event: 'thread_context_changed',
          userId,
          channelId,
          traceId: trace.id,
        });

        // Persist the updated context
        await saveThreadContext();

        trace.update({
          output: { contextSaved: true },
        });

        return { success: true };
      }
    );
  };
