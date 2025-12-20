/**
 * App Mention Handler
 *
 * Handles @mention events when users mention Orion in channels.
 * Distinct from direct messages and Assistant thread events.
 *
 * @see Story 2.5 - Thread Context & History
 * @see AC#5 - System responds to @mentions and direct messages
 * @see FR17 - System responds to @mentions and direct messages
 */

import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { startActiveObservation, createSpan } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { formatSlackMrkdwn } from '../../utils/formatting.js';
import {
  fetchThreadHistory,
  formatThreadHistoryForAgent,
  THREAD_HISTORY_LIMIT,
} from '../thread-context.js';
import { executeAgentInSandbox } from '../../sandbox/index.js';
import { config } from '../../config/environment.js';

type AppMentionEvent = SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs;

/**
 * Regex to match Slack user mention format: <@U123ABC>
 */
const MENTION_REGEX = /<@[A-Z0-9]+>/gi;

/**
 * Handles @mention events in channels.
 *
 * - Immediately reacts with 👀 to acknowledge receipt
 * - Extracts query text by removing @mention prefix
 * - Fetches thread context if in a thread
 * - Runs Orion agent with context
 * - Responds in the same thread
 * - Removes 👀 and adds ✅ when done
 *
 * @param event - Slack app_mention event with middleware args
 */
export async function handleAppMention({
  event,
  say,
  client,
  context,
}: AppMentionEvent): Promise<void> {
  const userId = event.user ?? 'unknown';
  const channelId = event.channel;
  // If in a thread, use thread_ts; otherwise start new thread from this message
  const threadTs = event.thread_ts ?? event.ts;

  // Immediately acknowledge receipt with eyes emoji
  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: event.ts,
      name: 'eyes',
    });
  } catch {
    // Non-critical - continue even if reaction fails
  }

  // Extract query by removing the @mention
  const query = event.text.replace(MENTION_REGEX, '').trim();

  // Skip if empty query after removing mention
  if (!query) {
    await say({
      text: "Hi! I'm Orion. How can I help you?",
      thread_ts: threadTs,
    });
    return;
  }

  await startActiveObservation(
    {
      name: 'app-mention-handler',
      userId,
      sessionId: threadTs,
      input: { text: query, channel: channelId },
      metadata: {
        teamId: context.teamId,
        isInThread: !!event.thread_ts,
      },
    },
    async (trace) => {
      logger.info({
        event: 'app_mention_received',
        userId,
        channelId,
        queryLength: query.length,
        isInThread: !!event.thread_ts,
        traceId: trace.id,
      });

      try {
        // Fetch thread history for context (if in existing thread)
        const threadHistory = event.thread_ts
          ? await fetchThreadHistory({
              client,
              channel: channelId,
              threadTs: event.thread_ts,
              limit: THREAD_HISTORY_LIMIT,
            })
          : [];

        logger.info({
          event: 'mention_context_gathered',
          threadHistoryCount: threadHistory.length,
          traceId: trace.id,
        });

        // Create span for agent execution
        const agentSpan = createSpan(trace, {
          name: 'orion-agent-execution',
          input: { query, contextMessages: threadHistory.length },
        });

        let fullResponse = '';

        // Story 3.0: Use Vercel Sandbox for agent execution
        // Post initial "processing" message that sandbox will update
        const processingMessage = await say({
          text: '_Processing your request..._',
          thread_ts: threadTs,
        });

        const messageTs = processingMessage.ts;
        if (!messageTs) {
          throw new Error('Failed to get message timestamp for sandbox callback');
        }

        logger.info({
          event: 'using_vercel_sandbox',
          traceId: trace.id,
        });

        const sandboxResult = await executeAgentInSandbox({
          userMessage: query,
          threadHistory: formatThreadHistoryForAgent(threadHistory),
          slackChannel: channelId,
          slackMessageTs: messageTs,
          slackToken: config.slackBotToken,
          traceId: trace.id,
        });

        if (sandboxResult.success && sandboxResult.response) {
          // Sandbox already updated the message, but we format for consistency
          fullResponse = formatSlackMrkdwn(sandboxResult.response);
        } else {
          fullResponse = 'Sorry, I encountered an error processing your message.';
          // Sandbox already updated with error message, but ensure fallback
          try {
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              text: fullResponse,
            });
          } catch {
            // Sandbox may have already updated, ignore
          }
        }

        agentSpan.end({
          output: {
            responseLength: fullResponse.length,
            contextMessages: threadHistory.length,
          },
        });

        // Fallback if agent returns empty - update the processing message
        if (!fullResponse.trim()) {
          fullResponse =
            'I received your message but had trouble generating a response.';
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: fullResponse,
          });
        }

        // Sandbox has already updated the message - just update reactions
        // Update reaction: remove eyes, add checkmark
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: event.ts,
            name: 'eyes',
          });
          await client.reactions.add({
            channel: channelId,
            timestamp: event.ts,
            name: 'white_check_mark',
          });
        } catch {
          // Non-critical - continue even if reaction update fails
        }

        trace.update({
          output: {
            response: fullResponse,
            estimatedTokens: Math.ceil(fullResponse.length / 4),
          },
        });

        logger.info({
          event: 'app_mention_handled',
          userId,
          channelId,
          responseLength: fullResponse.length,
          traceId: trace.id,
        });
      } catch (error) {
        logger.error({
          event: 'app_mention_error',
          userId,
          channelId,
          error: error instanceof Error ? error.message : String(error),
          traceId: trace.id,
        });

        // Update reaction to show error
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: event.ts,
            name: 'eyes',
          });
          await client.reactions.add({
            channel: channelId,
            timestamp: event.ts,
            name: 'x',
          });
        } catch {
          // Non-critical
        }

        await say({
          text: 'Sorry, I encountered an error processing your message.',
          thread_ts: threadTs,
        });
      }

      return { success: true };
    }
  );
}

