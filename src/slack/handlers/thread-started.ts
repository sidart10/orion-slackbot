/**
 * Thread Started Handler
 *
 * Handles assistant_thread_started events when a user opens
 * a new thread with Orion.
 *
 * @see Story 1.4 - Assistant Class Thread Handling
 * @see Story 7.1 - Dynamic Suggested Prompts
 * @see AC#1 - threadStarted events handled
 * @see AC#5 - Handler wrapped in Langfuse trace
 * @see AR11 - All handlers wrapped in Langfuse traces
 */

import type { AssistantThreadStartedMiddleware } from '@slack/bolt';
import { startActiveObservation } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { generateSuggestedPrompts } from '../prompts/prompt-factory.js';

/**
 * Handle assistant_thread_started event.
 * Called when a user opens a new thread with Orion.
 *
 * - Sends greeting message
 * - Sets suggested prompts for user guidance
 * - Saves initial thread context
 * - Wraps all processing in Langfuse trace
 */
export const handleThreadStarted: AssistantThreadStartedMiddleware = async ({
  say,
  setSuggestedPrompts,
  saveThreadContext,
  event,
  context,
}) => {
  const userId = event.assistant_thread?.user_id;
  const channelId = event.assistant_thread?.channel_id;
  const threadTs = event.assistant_thread?.thread_ts;

  await startActiveObservation(
    {
      name: 'thread-started-handler',
      userId,
      sessionId: threadTs,
      metadata: {
        teamId: context.teamId,
        channelId,
      },
    },
    async (trace) => {
      logger.info({
        event: 'thread_started',
        userId,
        channelId,
        traceId: trace.id,
      });

      // Send greeting
      await say(
        "Hello! I'm Orion, your AI assistant. How can I help you today?"
      );

      // Story 7.1: Set context-aware suggested prompts (AC#1)
      // Determine channel type from channel ID prefix
      const channelType = channelId?.startsWith('D')
        ? 'im'
        : channelId?.startsWith('G')
          ? 'group'
          : 'channel';

      const prompts = generateSuggestedPrompts({
        channelType,
        userId: userId ?? 'unknown',
      });

      await setSuggestedPrompts({
        title: 'Try asking me to:',
        prompts,
      });

      // Save initial thread context
      await saveThreadContext();

      trace.update({
        output: { greeting: 'sent', suggestedPrompts: 'set' },
      });

      logger.info({
        event: 'thread_started_complete',
        userId,
        traceId: trace.id,
      });

      return { success: true };
    }
  );
};
