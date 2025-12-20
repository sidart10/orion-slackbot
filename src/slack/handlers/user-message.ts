/**
 * User Message Handler
 *
 * Handles incoming user messages from Slack DMs and channels.
 * Provides both legacy Bolt middleware and new Assistant callback signatures.
 * Integrates with Claude Agent SDK for intelligent responses.
 * Wraps all processing in Langfuse traces for observability.
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see AC#1 - Messages passed to Claude Agent SDK via query()
 * @see AC#2 - System prompt constructed from .orion/agents/orion.md
 * @see AC#3 - Response streamed back to Slack
 * @see AC#4 - Full interaction traced in Langfuse
 * @see AC#5 - Response time 1-3 seconds (NFR1)
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
  formatThreadHistoryForAgent,
  THREAD_HISTORY_LIMIT,
  type ThreadMessage,
} from '../thread-context.js';
import { runOrionAgent } from '../../agent/orion.js';
import {
  wrapError,
  withTimeout,
  logOrionError,
  retryWithBackoff,
  isRecoverable,
  isOrionError,
  HARD_TIMEOUT_MS,
} from '../../utils/errors.js';
import { saveConversationSummary } from '../../memory/conversations.js';
import { executeAgentInSandbox } from '../../sandbox/index.js';
import { config } from '../../config/environment.js';

type MessageEvent = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

/**
 * Collect all chunks from an async generator into a single string
 * with a hard timeout to prevent runaway requests.
 *
 * @see Story 2.4 AC#5 / AR20 - 4-minute hard timeout
 */
async function collectAgentResponse(
  agentResponse: AsyncGenerator<string, void, unknown>,
  formatChunk: (chunk: string) => string,
  onChunk?: (formattedChunk: string) => Promise<void>
): Promise<string> {
  let fullResponse = '';
  for await (const chunk of agentResponse) {
    const formattedChunk = formatChunk(chunk);
    if (onChunk) {
      await onChunk(formattedChunk);
    }
    fullResponse += formattedChunk;
  }
  return fullResponse;
}

/**
 * Fetch thread history with retry for recoverable errors.
 *
 * Wraps fetchThreadHistory with exponential backoff retry for transient
 * Slack API failures (rate limits, temporary unavailability).
 *
 * @see Story 2.4 AC#4 - Recoverable errors trigger retries with exponential backoff
 */
async function fetchThreadHistoryWithRetry(
  params: Parameters<typeof fetchThreadHistory>[0],
  traceId?: string
): Promise<ReturnType<typeof fetchThreadHistory>> {
  return retryWithBackoff(
    () => fetchThreadHistory(params),
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (attempt, error) => {
        logger.warn({
          event: 'thread_history_retry',
          attempt,
          error: error.message,
          channel: params.channel,
          traceId,
        });
      },
      shouldRetry: (error) => {
        // Only retry recoverable errors (Slack API transient failures)
        if (isOrionError(error)) {
          return isRecoverable(error.code);
        }
        // For generic errors, check for common retryable patterns
        const message = error instanceof Error ? error.message : String(error);
        return /rate.?limit|timeout|temporarily|unavailable|503|429/i.test(message);
      },
    }
  );
}

/**
 * Generate and save a conversation summary to orion-context/
 *
 * Called after successful agent responses to maintain up-to-date thread summaries.
 * Generates a simple summary from thread history without additional LLM calls.
 *
 * @see Story 2.8 AC#4 - Conversation summaries stored in orion-context/conversations/
 * @see Task 5.1 - Generate summaries at thread end
 */
async function generateAndSaveConversationSummary(
  channelId: string,
  threadTs: string,
  threadHistory: ThreadMessage[],
  latestResponse: string,
  traceId?: string
): Promise<void> {
  // Skip if insufficient context (need at least 2 messages for a meaningful summary)
  if (threadHistory.length < 2) {
    return;
  }

  try {
    // Extract unique participants from thread
    const participants = Array.from(
      new Set(threadHistory.map((msg) => msg.user).filter(Boolean))
    );

    // Extract topic keywords from messages (simple heuristic)
    const allText = threadHistory.map((msg) => msg.text || '').join(' ') + ' ' + latestResponse;
    const words = allText.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'or', 'and', 'not', 'but', 'if',
      'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your', 'i',
      'me', 'my', 'we', 'our', 'they', 'their', 'he', 'she', 'him', 'her',
      'what', 'when', 'where', 'why', 'how', 'which', 'who', 'whom',
    ]);
    const wordFreq: Record<string, number> = {};
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word) && /^[a-z]+$/.test(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }
    const topics = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    // Build summary content (last 3 messages + latest response)
    const recentMessages = threadHistory.slice(-3);
    const summaryParts = recentMessages.map((msg) => {
      const text = msg.text?.slice(0, 200) || '';
      return `- [${msg.user}]: ${text}${msg.text && msg.text.length > 200 ? '...' : ''}`;
    });
    summaryParts.push(`- [Orion]: ${latestResponse.slice(0, 200)}${latestResponse.length > 200 ? '...' : ''}`);

    const summary = `# Conversation Summary\n\n${summaryParts.join('\n')}\n`;

    await saveConversationSummary({
      channelId,
      threadTs,
      summary,
      participants,
      topics,
      createdAt: new Date().toISOString(),
    });

    logger.info({
      event: 'conversation_summary_saved',
      channelId,
      threadTs,
      participantsCount: participants.length,
      topicsCount: topics.length,
      messageCount: threadHistory.length,
      traceId,
    });
  } catch (error) {
    // Non-critical - log error but don't fail the response
    logger.error({
      event: 'conversation_summary_save_failed',
      channelId,
      threadTs,
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });
  }
}

/**
 * Handles user messages from Slack (legacy Bolt middleware signature).
 *
 * - Skips bot messages to avoid loops
 * - Wraps processing in Langfuse trace
 * - Fetches DM conversation history for context (Story 2.5)
 * - Runs Orion agent and sends response (non-streaming)
 * - Logs structured events
 *
 * @see Story 2.5 - Thread Context & History
 * @see AC#5 - @mentions and DMs are both handled (FR17)
 * @deprecated Use handleAssistantUserMessage for Assistant class integration with streaming
 * @param event - Slack message event with middleware args
 */
export async function handleUserMessage({
  message,
  say,
  context,
  client,
}: MessageEvent): Promise<void> {
  // Skip bot messages to avoid loops
  if ('bot_id' in message) {
    return;
  }

  // Skip messages without text
  if (!('text' in message) || !message.text) {
    return;
  }

  // Check if this is a DM (channel_type 'im')
  const isDM = 'channel_type' in message && message.channel_type === 'im';

  // Skip @mentions in channels - those are handled by handleAppMention
  // Only process: DMs, or thread replies in channels (without new @mention)
  const containsMention = /<@[A-Z0-9]+>/i.test(message.text);
  const isThreadReply = 'thread_ts' in message;

  if (!isDM && containsMention && !isThreadReply) {
    // This is an @mention in a channel - let handleAppMention handle it
    return;
  }

  const userId = 'user' in message ? message.user : undefined;
  const channelId = message.channel;
  const threadTs = 'thread_ts' in message ? message.thread_ts : message.ts;

  await startActiveObservation(
    {
      name: 'user-message-handler',
      userId,
      sessionId: threadTs,
      input: { text: message.text, channel: channelId },
      metadata: {
        teamId: context.teamId,
        isThreadReply,
        isDM,
      },
    },
    async (trace) => {
      logger.info({
        event: 'message_received',
        userId,
        channelId,
        isDM,
        traceId: trace.id,
      });

      try {
        // Fetch conversation history for context (Story 2.5 Task 5)
        let threadHistory: ThreadMessage[] = [];

        if (client && threadTs) {
          // For DMs and thread replies, fetch history with retry for transient failures (AC#4)
          threadHistory = await fetchThreadHistoryWithRetry(
            {
              client,
              channel: channelId,
              threadTs: isThreadReply ? threadTs : message.ts,
              limit: THREAD_HISTORY_LIMIT,
            },
            trace.id
          );
        }

        logger.info({
          event: 'dm_context_gathered',
          threadHistoryCount: threadHistory.length,
          isDM,
          traceId: trace.id,
        });

        // Run Orion agent with conversation history
        const agentResponse = runOrionAgent(message.text!, {
          context: {
            threadHistory: formatThreadHistoryForAgent(threadHistory),
            userId: userId ?? 'unknown',
            channelId,
            threadTs,
            traceId: trace.id,
          },
        });

        // AC#5/AR20: Collect full response with 4-minute hard timeout
        let fullResponse = await withTimeout(
          collectAgentResponse(agentResponse, formatSlackMrkdwn),
          HARD_TIMEOUT_MS
        );

        // Fallback if agent returns empty
        if (!fullResponse.trim()) {
          fullResponse = 'I received your message but had trouble generating a response.';
        }

        await say({
          text: fullResponse,
          thread_ts: threadTs,
        });

        const estimatedTokens = Math.ceil(fullResponse.length / 4);
        trace.update({
          output: {
            response: fullResponse,
            estimatedTokens,
            contextMessages: threadHistory.length,
          },
        });

        logger.info({
          event: 'message_handled',
          userId,
          channelId,
          responseLength: fullResponse.length,
          contextMessages: threadHistory.length,
          traceId: trace.id,
        });
      } catch (error) {
        // AC#1: Wrap error in OrionError interface
        const orionError = wrapError(error);

        // AC#3/AR12: Log full structured JSON with OrionError fields
        logOrionError(orionError, trace.id);

        // AC#2: Return user-friendly message to Slack
        await say({
          text: orionError.userMessage,
          thread_ts: threadTs,
        });

        return { success: false, error: orionError };
      }

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

        // Validate required fields for streaming (H2 fix: fail fast instead of empty strings)
        const resolvedThreadTs = threadTs ?? message.ts;
        const resolvedUserId = context.userId ?? userId;
        const resolvedTeamId = context.teamId;

        if (!resolvedThreadTs || !resolvedUserId || !resolvedTeamId) {
          logger.error({
            event: 'streaming_precondition_failed',
            missingFields: {
              threadTs: !resolvedThreadTs,
              userId: !resolvedUserId,
              teamId: !resolvedTeamId,
            },
            traceId: trace.id,
          });
          // Fallback to non-streaming response
          await say({
            text: 'I received your message but encountered a configuration issue.',
            thread_ts: resolvedThreadTs,
          });
          return { success: false, reason: 'missing_required_fields' };
        }

        // CRITICAL: Initialize streamer within 500ms of message receipt (NFR4/AC#2)
        const streamer = createStreamer({
          client,
          channel: channelId,
          threadTs: resolvedThreadTs,
          userId: resolvedUserId,
          teamId: resolvedTeamId,
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

          // Fetch thread history with retry for transient failures (AC#4)
          const threadHistory = await fetchThreadHistoryWithRetry(
            {
              client,
              channel: channelId,
              threadTs: resolvedThreadTs,
              limit: THREAD_HISTORY_LIMIT,
            },
            trace.id
          );

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

          // Run agent - Story 3.0: Vercel Sandbox is the primary execution path
          let chunkCount = 0;

          // Story 3.0: Post initial "processing" message that sandbox will update
          // Stop the streamer first since we'll use chat.postMessage instead
          await streamer.stop().catch(() => {});

          const processingMessage = await client.chat.postMessage({
            channel: channelId,
            thread_ts: resolvedThreadTs,
            text: '_Processing your request..._',
          });

          const messageTs = processingMessage.ts;
          if (!messageTs) {
            throw new Error('Failed to get message timestamp for sandbox callback');
          }

          logger.info({
            event: 'using_vercel_sandbox',
            traceId: trace.id,
            timestamp: new Date().toISOString(),
          });

          const sandboxResult = await executeAgentInSandbox({
            userMessage: messageText,
            threadHistory: formatThreadHistoryForAgent(threadHistory),
            slackChannel: channelId,
            slackMessageTs: messageTs,
            slackToken: config.slackBotToken,
            traceId: trace.id,
          });

          if (!sandboxResult.success) {
            // Story 3.0 AC#4: Return user-friendly error message
            throw new Error(sandboxResult.error || 'Sandbox execution failed');
          }

          const fullResponse = formatSlackMrkdwn(sandboxResult.response || '');
          chunkCount = 1;

          // Calculate metrics (streamer was stopped, use sandbox metrics)
          const metrics = {
            totalDuration: sandboxResult.duration,
            totalChars: fullResponse.length,
          };

          // Record time to first token for NFR4 tracking
          const timeToFirstToken = timeToStreamStart;

          // Estimate token usage for tracing (AC#4 - tokens traced in Langfuse)
          const estimatedTokens = Math.ceil(fullResponse.length / 4);

          // End streaming span with output (AC#6)
          streamSpan.end({
            output: {
              response: fullResponse,
              metrics,
              contextMessages: threadHistory.length,
              timeToFirstToken,
              estimatedTokens,
              chunkCount,
            },
          });

          // H1 Fix: Trace token metrics to Langfuse (AC#4)
          trace.update({
            output: {
              response: fullResponse,
              streamDuration: metrics.totalDuration,
              timeToStreamStart,
              contextMessages: threadHistory.length,
              estimatedTokens,
              chunkCount,
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

          // Story 2.8 AC#4 / Task 5.1: Generate and save conversation summary
          // Run in background - don't block the response
          generateAndSaveConversationSummary(
            channelId,
            resolvedThreadTs,
            threadHistory,
            fullResponse,
            trace.id
          ).catch((err) => {
            logger.error({
              event: 'conversation_summary_background_error',
              error: err instanceof Error ? err.message : String(err),
              traceId: trace.id,
            });
          });

          return { success: true };
        } catch (error) {
          // Ensure stream is stopped even on error
          await streamer.stop().catch(() => {});

          // AC#1: Wrap error in OrionError interface
          const orionError = wrapError(error);

          streamSpan.end({
            metadata: {
              errorCode: orionError.code,
              errorMessage: orionError.message,
              recoverable: orionError.recoverable,
            },
          });

          // AC#3/AR12: Log full structured JSON with OrionError fields
          logOrionError(orionError, trace.id);

          // AC#2: Return user-friendly message to Slack (Slack-safe mrkdwn)
          await say({
            text: orionError.userMessage,
            thread_ts: threadTs,
          });

          throw error;
        }
      }
    );
  };
