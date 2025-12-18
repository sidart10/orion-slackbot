/**
 * User Message Handler
 *
 * Handles incoming user messages from Slack DMs and channels.
 * Provides both legacy Bolt middleware and new Assistant callback signatures.
 * Wraps all processing in Langfuse traces for observability.
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Messages received by Slack Bolt app / Streams to chatStream
 * @see AC#2 - Streaming starts within 500ms (NFR4)
 * @see AC#3 - userMessage events handled within threads / mrkdwn formatting
 * @see AC#4 - Thread history fetched from Slack API
 * @see AC#5 - Handler wrapped in Langfuse trace
 * @see AC#6 - Complete response traced in Langfuse
 * @see AR11 - All handlers wrapped in Langfuse traces
 * @see AR21 - Slack mrkdwn formatting (*bold* not **bold**)
 * @see AR22 - No blockquotes in Slack responses
 * @see AR23 - No emojis unless explicitly requested
 */

import type {
  AllMiddlewareArgs,
  SlackEventMiddlewareArgs,
  AssistantUserMessageMiddleware,
} from '@slack/bolt';
import { startActiveObservation, createSpan } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { createStreamer } from '../../utils/streaming.js';
import { formatSlackMrkdwn } from '../../utils/formatting.js';
import {
  fetchThreadHistory,
  formatThreadHistoryForContext,
} from '../thread-context.js';
import { generatePlaceholderResponse } from '../response-generator.js';

type MessageEvent = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

/**
 * Handles user messages from Slack (legacy Bolt middleware signature).
 *
 * - Skips bot messages to avoid loops
 * - Wraps processing in Langfuse trace
 * - Sends acknowledgment response
 * - Logs structured events
 *
 * @deprecated Use handleAssistantUserMessage for Assistant class integration
 * @param event - Slack message event with middleware args
 */
export async function handleUserMessage({
  message,
  say,
  context,
}: MessageEvent): Promise<void> {
  // Skip bot messages to avoid loops
  if ('bot_id' in message) {
    return;
  }

  // Skip messages without text
  if (!('text' in message) || !message.text) {
    return;
  }

  const userId = 'user' in message ? message.user : undefined;
  const channelId = message.channel;
  const threadTs = 'thread_ts' in message ? message.thread_ts : message.ts;
  const isThreadReply = 'thread_ts' in message;

  await startActiveObservation(
    {
      name: 'user-message-handler',
      userId,
      sessionId: threadTs,
      input: { text: message.text, channel: channelId },
      metadata: {
        teamId: context.teamId,
        isThreadReply,
      },
    },
    async (trace) => {
      logger.info({
        event: 'message_received',
        userId,
        channelId,
        traceId: trace.id,
      });

      // Simple acknowledgment for now
      // Will be replaced with Claude Agent SDK in Story 2.1
      const response = 'Orion received your message';

      await say({
        text: response,
        thread_ts: threadTs,
      });

      trace.update({ output: { response } });

      logger.info({
        event: 'message_acknowledged',
        userId,
        channelId,
        traceId: trace.id,
      });

      return { success: true };
    }
  );
}

/**
 * Handles user messages in assistant threads (Assistant callback signature).
 *
 * This is the main message handler for Orion when using the Assistant class.
 * It provides access to thread utilities like setTitle, setStatus, and context storage.
 *
 * - Sets thread title from message
 * - Shows thinking indicator
 * - Initializes streaming within 500ms (NFR4)
 * - Streams response with Slack mrkdwn formatting
 * - Fetches thread history from Slack API (AC#4)
 * - Wraps all processing in Langfuse trace (AC#5)
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack using chatStream API
 * @see AC#2 - Streaming starts within 500ms (NFR4)
 * @see AC#3 - userMessage events handled / mrkdwn formatting
 * @see AC#4 - Thread history fetched from Slack API
 * @see AC#5 - Handler wrapped in Langfuse trace
 * @see AC#6 - Complete response traced in Langfuse
 */
export const handleAssistantUserMessage: AssistantUserMessageMiddleware =
  async ({
    message,
    say,
    setTitle,
    setStatus,
    getThreadContext,
    client,
    context,
  }) => {
    // Skip if no text content
    if (!('text' in message) || !message.text) {
      return;
    }

    const messageText = message.text;
    const userId = 'user' in message ? message.user : undefined;
    const channelId = message.channel;
    const threadTs = 'thread_ts' in message ? message.thread_ts : message.ts;
    const messageReceiptTime = Date.now();

    await startActiveObservation(
      {
        name: 'assistant-user-message-handler',
        userId,
        sessionId: threadTs,
        input: { text: messageText },
        metadata: {
          teamId: context.teamId,
          channelId,
        },
      },
      async (trace) => {
        logger.info({
          event: 'user_message_received',
          userId,
          channelId,
          messageLength: messageText.length,
          traceId: trace.id,
        });

        // Set thread title from first message (truncated)
        await setTitle(messageText.slice(0, 50));

        // Show thinking indicator
        await setStatus('is thinking...');

        // CRITICAL: Initialize streamer within 500ms of message receipt (NFR4/AC#2)
        const streamer = createStreamer({
          client,
          channel: channelId,
          threadTs: threadTs ?? '',
          userId: context.userId ?? userId ?? '',
          teamId: context.teamId ?? '',
        });

        await streamer.start();

        const timeToStreamStart = Date.now() - messageReceiptTime;

        logger.info({
          event: 'stream_initialized',
          timeToStreamStart,
          nfr4Met: timeToStreamStart < 500,
          traceId: trace.id,
        });

        // Create streaming span for Langfuse (AC#6)
        const streamSpan = createSpan(trace, {
          name: 'response-streaming',
          input: { messageText },
          metadata: { timeToStreamStart },
        });

        try {
          // Get saved thread context
          const savedContext = await getThreadContext();

          // Fetch thread history from Slack API for context
          const threadHistory = await fetchThreadHistory({
            client,
            channel: channelId,
            threadTs: threadTs ?? '',
            limit: 20, // Last 20 messages
          });

          // Format thread history for LLM context (used in Story 2.1)
          const formattedHistory = formatThreadHistoryForContext(threadHistory);

          logger.info({
            event: 'context_gathered',
            savedContextExists: !!savedContext,
            threadHistoryCount: threadHistory.length,
            traceId: trace.id,
          });

          // Update trace with formatted context for observability
          trace.update({
            input: {
              text: messageText,
              threadHistory: formattedHistory,
            },
          });

          // Generate and stream response (AC#1)
          // Placeholder generator - Claude Agent SDK integration comes in Story 2.1
          const responseChunks = generatePlaceholderResponse(threadHistory.length);

          let fullResponse = '';
          for await (const chunk of responseChunks) {
            // Format chunk for Slack mrkdwn (AC#3, #4, #5)
            const formattedChunk = formatSlackMrkdwn(chunk);
            await streamer.append(formattedChunk);
            fullResponse += formattedChunk;
          }

          // Stop streaming and get metrics
          const metrics = await streamer.stop();

          // Record time to first token for NFR4 tracking
          const timeToFirstToken = timeToStreamStart;

          // End streaming span with output (AC#6)
          streamSpan.end({
            output: {
              response: fullResponse,
              metrics,
              contextMessages: threadHistory.length,
              timeToFirstToken,
            },
          });

          trace.update({
            output: {
              response: fullResponse,
              streamDuration: metrics.totalDuration,
              timeToStreamStart,
              contextMessages: threadHistory.length,
            },
          });

          logger.info({
            event: 'user_message_handled',
            userId,
            streamDuration: metrics.totalDuration,
            responseLength: fullResponse.length,
            timeToFirstToken,
            traceId: trace.id,
          });

          return { success: true };
        } catch (error) {
          // Ensure stream is stopped even on error
          await streamer.stop().catch(() => {});

          streamSpan.end({
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });

          logger.error({
            event: 'streaming_error',
            error: error instanceof Error ? error.message : String(error),
            traceId: trace.id,
          });

          // Fallback: use say() if streaming fails
          await say({
            text: 'Sorry, I encountered an error processing your message.',
            thread_ts: threadTs,
          });

          throw error;
        }
      }
    );
  };
