/**
 * Thread Started Handler
 *
 * Handles assistant_thread_started events when a user opens
 * a new thread with Orion.
 *
 * @see Story 1.4 - Assistant Class Thread Handling
 * @see Story 5.3 - Memory Auto-Check at Conversation Start
 * @see Story 7.1 - Dynamic Suggested Prompts
 * @see AC#1 - threadStarted events handled
 * @see AC#5 - Handler wrapped in Langfuse trace
 * @see AR11 - All handlers wrapped in Langfuse traces
 */

import type { AssistantThreadStartedMiddleware } from '@slack/bolt';
import { startActiveObservation } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { generateSuggestedPrompts } from '../prompts/prompt-factory.js';
import {
  loadRelevantMemories,
  formatMemoriesForContext,
} from '../../tools/memory/loader.js';
import { config } from '../../config/environment.js';

/**
 * Handle assistant_thread_started event.
 * Called when a user opens a new thread with Orion.
 *
 * - Loads relevant memories from GCS (global, user, session)
 * - Sends personalized greeting based on memory context
 * - Sets suggested prompts for user guidance
 * - Saves thread context including memory state
 * - Wraps all processing in Langfuse trace
 *
 * @see Story 5.3 - AC#1, AC#2 - Memory loading at thread start
 */
export const handleThreadStarted: AssistantThreadStartedMiddleware = async ({
  say,
  setStatus,
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

      // Story 5.3: Load memories from GCS (AC#1, #2, #3, #4)
      let memories = null;
      let memoryContext = '';

      if (config.gcsMemoriesBucket) {
        // Show loading status while fetching memories
        await setStatus('Restoring your preferences...');

        memories = await loadRelevantMemories({
          userId,
          threadTs,
          traceId: trace.id ?? 'unknown',
          bucket: config.gcsMemoriesBucket,
        });

        memoryContext = formatMemoriesForContext(memories);

        logger.info({
          event: 'thread_started.memories_loaded',
          userId,
          traceId: trace.id,
          scopesFound: memories.scopesFound,
          durationMs: memories.loadDurationMs,
        });
      }

      // Personalized greeting based on memory context (AC#2)
      const hasUserMemory = memories?.user !== undefined;
      const greeting = hasUserMemory
        ? "Welcome back! I remember your preferences. How can I help?"
        : "Hello! I'm Orion, your AI assistant. How can I help you today?";

      await say(greeting);

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

      // Save thread context including memory state (AC#1, #3)
      await saveThreadContext({
        memoryContext,
        memoryLoadedAt: new Date().toISOString(),
        scopesLoaded: memories?.scopesFound ?? [],
      });

      trace.update({
        output: {
          greeting: 'sent',
          suggestedPrompts: 'set',
          memoriesLoaded: memories?.scopesFound ?? [],
        },
      });

      logger.info({
        event: 'thread_started_complete',
        userId,
        traceId: trace.id,
        memoriesLoaded: memories?.scopesFound?.length ?? 0,
      });

      return { success: true };
    }
  );
};
