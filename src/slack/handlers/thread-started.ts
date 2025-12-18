/**
 * Thread Started Handler
 *
 * Handles assistant_thread_started events when a user opens
 * a new thread with Orion.
 *
 * @see AC#1 - threadStarted events handled
 * @see AC#5 - Handler wrapped in Langfuse trace
 * @see AR11 - All handlers wrapped in Langfuse traces
 */

import type { AssistantThreadStartedMiddleware } from '@slack/bolt';
import { startActiveObservation } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';

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

      // Set suggested prompts to help users discover capabilities
      await setSuggestedPrompts({
        title: 'Try asking me to:',
        prompts: [
          {
            title: 'Research a topic',
            message: 'Research the latest developments in...',
          },
          {
            title: 'Summarize a thread',
            message: 'Summarize the conversation in #channel',
          },
          {
            title: 'Answer a question',
            message: 'What is our policy on...',
          },
        ],
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
