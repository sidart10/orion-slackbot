/**
 * App Mention Handler for Channel Conversations
 *
 * Handles @orion mentions in Slack channels. Uses the same agent infrastructure
 * as the Assistant handler (runOrionAgent, tool calling).
 *
 * @see Story 2.8 - App Mention Handler for Channel Conversations
 * @see AC#1 - Orion responds in a thread under the original message
 * @see AC#2 - Orion adds 👀 reaction to acknowledge receipt
 * @see AC#4 - Thread replies get full thread context
 * @see AC#5 - Uses runOrionAgent with full tool calling capability
 * @see AC#6 - 👀 reaction removed on completion
 * @see AC#7 - Feedback buttons posted with trace correlation
 * @see FR17 - App mention handler with full agent loop
 */

import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import type { Block } from '@slack/web-api';
import {
  startActiveObservation,
  setTraceIdForMessage,
  type TraceWrapper,
} from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { formatSlackMrkdwn } from '../../utils/formatting.js';
import { fetchThreadHistory } from '../thread-context.js';
import { feedbackBlock } from '../feedback-block.js';
import { createSourcesContextBlock, type SourceCitation } from '../sources-block.js';
import { runOrionAgent, type AgentResult } from '../../agent/orion.js';
import { loadAgentPrompt } from '../../agent/loader.js';
import { config } from '../../config/environment.js';
import { getChannelName, getUserDisplayName } from '../identity.js';

/**
 * Extract message text by stripping the leading bot mention.
 *
 * Slack sends mentions as `<@U0928FBEH9C> hello` where `U0928FBEH9C` is the bot's user ID.
 * This function strips ONLY the leading mention once, preserving other mentions in the message.
 *
 * @param text - Raw message text from Slack
 * @returns Message text with leading bot mention removed
 */
export function extractMessageText(text: string): string {
  // IMPORTANT: Only strip the leading bot mention ONCE (no /g), so other mentions remain intact.
  // app_mention events always start with the app mention: "<@BOTID> ..."
  return text.replace(/^<@[A-Z0-9]+>\s*/, '').trim();
}

/**
 * Handles @orion mentions in Slack channels.
 *
 * This handler runs parallel to the Assistant handlers — not replacing them:
 * - Assistant (`app.assistant()`): DMs and Slack AI Assistant threads
 * - App Mention (`app.event('app_mention')`): Channel @orion mentions
 *
 * Both use the same core: `runOrionAgent()` → full tool calling, observability.
 *
 * @see Story 2.8 - App Mention Handler
 */
export async function handleAppMention({
  event,
  client,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_mention'>): Promise<void> {
  const mentionEvent = event;

  // Extract message text (strip leading bot mention)
  const messageText = extractMessageText(mentionEvent.text);
  const userId = mentionEvent.user;
  const channelId = mentionEvent.channel;

  // For new mentions, thread_ts is the message ts (start new thread)
  // For replies in existing threads, use the thread_ts
  const threadTs = mentionEvent.thread_ts ?? mentionEvent.ts;
  const messageReceiptTime = Date.now();

  // Add 👀 reaction to acknowledge message receipt (AC#2)
  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: mentionEvent.ts,
      name: 'eyes',
    });
  } catch {
    // Ignore if already reacted or reaction fails
  }

  // Fetch human-readable names for clear trace identification
  const [channelName, userName] = await Promise.all([
    getChannelName(client, channelId),
    userId ? getUserDisplayName(client, userId) : Promise.resolve('unknown'),
  ]);

  await startActiveObservation(
    {
      name: `app-mention #${channelName} @${userName}`,
      userId,
      sessionId: threadTs,
      input: { text: messageText },
      metadata: {
        teamId: context.teamId,
        channelId,
        channelName,
        userName,
        eventType: 'app_mention',
      },
    },
    async (trace: TraceWrapper) => {
      logger.info({
        event: 'app_mention_received',
        userId,
        userName,
        channelId,
        channelName,
        messageLength: messageText.length,
        isThreadReply: !!mentionEvent.thread_ts,
        traceId: trace.id,
      });

      // Post a "thinking" message immediately (AC#1 - respond in thread)
      let thinkingMessageTs: string | undefined;
      try {
        const thinkingMsg = await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: '_Thinking..._',
        });
        thinkingMessageTs = thinkingMsg.ts;
      } catch (err) {
        logger.warn({
          event: 'thinking_message_failed',
          error: err instanceof Error ? err.message : String(err),
          traceId: trace.id,
        });
      }

      const timeToFirstResponse = Date.now() - messageReceiptTime;
      logger.info({
        event: 'thinking_message_posted',
        timeToFirstResponse,
        traceId: trace.id,
      });

      let agentSpan: ReturnType<typeof trace.startSpan> | null = null;

      try {
        // Fetch thread history from Slack API for context (AC#4)
        const threadHistory = await fetchThreadHistory({
          client,
          channel: channelId,
          threadTs,
          limit: 20,
          traceId: trace.id,
        });

        // Convert thread history to Anthropic message format
        const anthropicHistory = threadHistory
          .filter((msg) => typeof msg.text === 'string' && msg.text.length > 0)
          .map((msg) => ({
            role: (msg.isBot ? 'assistant' : 'user') as 'user' | 'assistant',
            content: msg.text,
          }));

        logger.info({
          event: 'context_gathered',
          threadHistoryCount: threadHistory.length,
          traceId: trace.id,
        });

        // Load system prompt from .orion/agents/orion.md
        let systemPrompt: string;
        try {
          systemPrompt = await loadAgentPrompt('orion');
        } catch (error) {
          logger.warn({
            event: 'agent_prompt_fallback',
            error: error instanceof Error ? error.message : String(error),
            traceId: trace.id,
          });
          systemPrompt =
            'You are Orion, a helpful AI assistant. Use Slack mrkdwn formatting: *bold* for emphasis, _italic_ for secondary emphasis. Never use blockquotes.';
        }

        // Update trace with context
        trace.update({
          input: {
            text: messageText,
            historyLength: anthropicHistory.length,
          },
        });

        // Run Orion agent with full tool calling capability (AC#5)
        agentSpan = trace.startSpan('agent.orion', {
          input: { messageText, historyLength: anthropicHistory.length },
        });

        const agentResponse = runOrionAgent(messageText, {
          context: {
            threadHistory: anthropicHistory,
            userId: userId ?? 'unknown',
            channelId,
            traceId: trace.id,
          },
          systemPrompt,
          trace: trace._span,
          setStatus: ({ toolName }) =>
            void logger.debug({
              event: 'agent_status_update',
              toolName,
              traceId: trace.id,
            }),
        });

        // Collect full response from agent
        let fullResponse = '';
        let agentResult: AgentResult | undefined;

        while (true) {
          const next = await agentResponse.next();
          if (next.done) {
            agentResult = next.value;
            break;
          }
          fullResponse += next.value;
        }

        // Format for Slack
        const formattedResponse = formatSlackMrkdwn(fullResponse);

        agentSpan.update({
          output: {
            responseLength: fullResponse.length,
            ...(agentResult && {
              inputTokens: agentResult.inputTokens,
              outputTokens: agentResult.outputTokens,
              durationMs: agentResult.durationMs,
              nfr1Met: agentResult.nfr1Met,
            }),
          },
        }).end();

        // Log generation for Langfuse
        const generation = trace.startGeneration('orion-response', {
          model: config.anthropicModel,
          input: { message: messageText, historyLength: anthropicHistory.length },
          output: { response: fullResponse.slice(0, 500) },
          ...(agentResult && {
            usageDetails: {
              input: agentResult.inputTokens,
              output: agentResult.outputTokens,
              total: agentResult.inputTokens + agentResult.outputTokens,
            },
          }),
        });
        generation.end();

        // Update the "thinking" message with the actual response
        if (thinkingMessageTs) {
          await client.chat.update({
            channel: channelId,
            ts: thinkingMessageTs,
            text: formattedResponse,
          });
        } else {
          // Fallback: post a new message if we couldn't update
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: formattedResponse,
          });
        }

        // Story 2.7: Post sources block if sources were gathered
        if (agentResult?.sources && agentResult.sources.length > 0) {
          const sourceCitations: SourceCitation[] = agentResult.sources.map((s, i) => ({
            id: i + 1,
            title: s.reference,
            url: undefined,
          }));

          const sourcesBlock = createSourcesContextBlock(sourceCitations);
          if (sourcesBlock) {
            try {
              await client.chat.postMessage({
                channel: channelId,
                thread_ts: threadTs,
                text: ' ',
                blocks: [sourcesBlock as unknown as Block],
                metadata: {
                  event_type: 'orion_sources',
                  event_payload: { traceId: trace.id ?? '' },
                },
              });
            } catch (sourcesError) {
              logger.warn({
                event: 'sources_block_failed',
                error:
                  sourcesError instanceof Error
                    ? sourcesError.message
                    : String(sourcesError),
                traceId: trace.id,
              });
            }
          }
        }

        // Post feedback buttons as follow-up message (AC#7)
        try {
          const feedbackMessage = await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: ' ',
            blocks: [feedbackBlock as unknown as Block],
            metadata: {
              event_type: 'orion_response',
              event_payload: { traceId: trace.id ?? '' },
            },
          });

          // Store trace ID for feedback correlation
          if (feedbackMessage.ts && trace.id) {
            setTraceIdForMessage(feedbackMessage.ts, trace.id);
          }
        } catch (feedbackError) {
          logger.warn({
            event: 'feedback_block_failed',
            error:
              feedbackError instanceof Error
                ? feedbackError.message
                : String(feedbackError),
            traceId: trace.id,
          });
        }

        const totalDuration = Date.now() - messageReceiptTime;

        trace.update({
          output: {
            response: fullResponse.slice(0, 500),
            totalDuration,
            timeToFirstResponse,
            contextMessages: threadHistory.length,
            nfr1Met: totalDuration < 3000,
            ...(agentResult && {
              inputTokens: agentResult.inputTokens,
              outputTokens: agentResult.outputTokens,
            }),
          },
        });

        logger.info({
          event: 'app_mention_handled',
          userId,
          totalDuration,
          responseLength: fullResponse.length,
          timeToFirstResponse,
          nfr1Met: totalDuration < 3000,
          traceId: trace.id,
        });

        // Remove 👀 reaction after successful response (AC#6)
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: mentionEvent.ts,
            name: 'eyes',
          });
        } catch {
          // Ignore if already removed
        }

        // Update trace metadata with token counts
        if (agentResult) {
          trace.update({
            metadata: {
              inputTokens: agentResult.inputTokens,
              outputTokens: agentResult.outputTokens,
              durationMs: agentResult.durationMs,
              nfr1Met: agentResult.nfr1Met,
            },
          });
        }

        return fullResponse;
      } catch (error) {
        // End agentSpan if it was created
        if (agentSpan) {
          agentSpan.update({
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          }).end();
        }

        logger.error({
          event: 'app_mention_error',
          error: error instanceof Error ? error.message : String(error),
          traceId: trace.id,
        });

        // Remove 👀 reaction on failure (AC#6)
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: mentionEvent.ts,
            name: 'eyes',
          });
        } catch {
          // Ignore
        }

        // Update error message or post new one
        const errorText = 'Sorry, I encountered an error processing your message.';
        if (thinkingMessageTs) {
          await client.chat.update({
            channel: channelId,
            ts: thinkingMessageTs,
            text: errorText,
          });
        } else {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: errorText,
          });
        }

        throw error;
      }
    }
  );
}
