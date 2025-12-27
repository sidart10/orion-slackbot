/**
 * User Message Handler for Assistant API
 *
 * Handles incoming user messages via Slack's Assistant class.
 * Uses Anthropic API via runOrionAgent for intelligent responses.
 * Wraps all processing in Langfuse traces for observability.
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Messages passed to Anthropic API via messages.create() with streaming
 * @see AC#2 - System prompt constructed from .orion/agents/orion.md
 * @see AC#3 - Response streamed back to Slack
 * @see AC#4 - Full interaction traced in Langfuse
 * @see AC#5 - Response time 1-3 seconds (NFR1)
 * @see AR11 - All handlers wrapped in Langfuse traces
 * @see AR21 - Slack mrkdwn formatting (*bold* not **bold**)
 */

import type { AssistantUserMessageMiddleware } from '@slack/bolt';
import type { Block } from '@slack/web-api';
import {
  startActiveObservation,
  setTraceIdForMessage,
  type TraceWrapper,
} from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { createStreamer } from '../../utils/streaming.js';
import { formatSlackMrkdwn } from '../../utils/formatting.js';
import { fetchThreadHistory } from '../thread-context.js';
import { feedbackBlock } from '../feedback-block.js';
import { createSourcesContextBlock, type SourceCitation } from '../sources-block.js';
import { runOrionAgent, type AgentResult } from '../../agent/orion.js';
import { detectUncitedClaims } from '../../agent/citations.js';
import { getLangfuse } from '../../observability/langfuse.js';
import { recordCitationOutcome } from '../../observability/citation-rate.js';
import { loadAgentPrompt } from '../../agent/loader.js';
import {
  shouldTriggerCompaction,
  compactThreadHistory,
  estimateContextTokens,
  resolveMaxContextTokens,
} from '../../agent/compaction.js';
import { config } from '../../config/environment.js';
import Anthropic from '@anthropic-ai/sdk';
import { buildLoadingMessages } from '../status-messages.js';
import {
  withTimeout,
  HARD_TIMEOUT_MS,
  isOrionError,
  getUserMessage,
} from '../../utils/errors.js';

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
    const isDm = channelId.startsWith('D');

    // Avoid duplicate responses when Slack routes the same channel @mention into BOTH:
    // - app.event('app_mention') handler
    // - Assistant userMessage handler
    //
    // We only skip channel messages that are clearly leading bot mentions.
    // Channel follow-up replies without a bot mention must be handled here to satisfy FR15/FR17.
    const botUserId = (context as unknown as { botUserId?: string }).botUserId;
    const leadingMentionMatch = messageText.match(/^<@([A-Z0-9]+)>\s*/);
    const leadingMentionUserId = leadingMentionMatch?.[1];
    const isLeadingBotMention =
      !!botUserId && !!leadingMentionUserId && leadingMentionUserId === botUserId;

    if (!isDm && isLeadingBotMention) {
      logger.debug({
        event: 'assistant_skipped_channel_bot_mention',
        channelId,
        threadTs,
        reason: 'Leading bot mention handled by app_mention to prevent duplicates',
      });
      return;
    }
    const messageReceiptTime = Date.now();

    // Add eyes emoji to acknowledge message receipt
    try {
      await client.reactions.add({
        channel: channelId,
        timestamp: message.ts,
        name: 'eyes',
      });
    } catch {
      // Ignore if already reacted or reaction fails
    }

    await startActiveObservation(
      {
        name: isDm
          ? `assistant dm @${userId ?? 'unknown'}`
          : `assistant channel ${channelId} @${userId ?? 'unknown'}`,
        userId,
        sessionId: threadTs,
        input: { messageLength: messageText.length },
        metadata: {
          teamId: context.teamId,
          channelId,
          isDm,
        },
      },
      async (trace: TraceWrapper) => {
        logger.info({
          event: 'user_message_received',
          userId,
          channelId,
          messageLength: messageText.length,
          traceId: trace.id,
        });

        const safeSetTitle = (title: string): void => {
          try {
            const result = (setTitle as unknown as (t: string) => unknown)(title);
            if (result && typeof (result as Promise<unknown>).catch === 'function') {
              (result as Promise<unknown>).catch(() => {});
            }
          } catch {
            // ignore
          }
        };

        const safeSetStatus = (payload: unknown): Promise<void> => {
          try {
            const result = (setStatus as unknown as (p: unknown) => unknown)(payload);
            if (result && typeof (result as Promise<unknown>).then === 'function') {
              return (result as Promise<unknown>).then(() => {}).catch(() => {});
            }
            return Promise.resolve();
          } catch {
            return Promise.resolve();
          }
        };

        // Set thread title from first message (truncated) without blocking stream start (NFR4)
        safeSetTitle(messageText.slice(0, 50));

        // FR47: dynamic status messages without blocking stream start
        const initialStatusPromise = safeSetStatus({
          status: 'working...',
          loading_messages: buildLoadingMessages(),
        });

        // CRITICAL: Initialize streamer within 500ms of message receipt (NFR4/AC#2)
        const streamer = createStreamer({
          client,
          channel: channelId,
          threadTs: threadTs ?? '',
          userId: context.userId ?? userId ?? '',
          teamId: context.teamId ?? '',
        });

        await streamer.start();
        // Ensure initial status call is awaited only after stream is started (NFR4)
        await initialStatusPromise;

        const timeToStreamStart = Date.now() - messageReceiptTime;

        logger.info({
          event: 'stream_initialized',
          timeToStreamStart,
          nfr4Met: timeToStreamStart < 500,
          traceId: trace.id,
        });

        // Create streaming span for Langfuse (AC#6) using new SDK
        const streamSpan = trace.startSpan('response-streaming', {
          input: { messageText },
          metadata: { timeToStreamStart },
        });

        // Declare agentSpan outside try block so it can be ended in catch
        let agentSpan: ReturnType<typeof trace.startSpan> | null = null;

        try {
          // AR20: 4-minute hard timeout for agent execution
          // CRITICAL: Placed AFTER streamer.start() to meet NFR4 (500ms first token)
          // but BEFORE agent processing to enforce timeout on the full request
          await withTimeout(
            (async () => {
          // Fetch thread history from Slack API for context
          const maxContextTokens = resolveMaxContextTokens({
            configuredMaxContextTokens: config.anthropicMaxContextTokens,
          });
          const compactionThreshold = config.compactionThreshold ?? 0.8;

          // Story 2.5: Keep thread history bounds explicit and safe.
          // NOTE: `limit` here is the Slack API page size (not the total messages in a thread).
          const DEFAULT_THREAD_HISTORY_PAGE_SIZE = 100;
          const DEFAULT_THREAD_HISTORY_KEEP_LAST_N = 50;
          const DEFAULT_THREAD_HISTORY_MAX_TOKENS = 4000;

          const threadHistoryPageSize =
            config.threadHistoryLimit ?? DEFAULT_THREAD_HISTORY_PAGE_SIZE;
          const threadHistoryMaxTokens =
            config.threadHistoryMaxTokens ?? DEFAULT_THREAD_HISTORY_MAX_TOKENS;

          const threadHistory = await fetchThreadHistory({
            client,
            channel: channelId,
            threadTs: threadTs ?? '',
            limit: threadHistoryPageSize,
            maxTokens: threadHistoryMaxTokens,
            keepLastN: DEFAULT_THREAD_HISTORY_KEEP_LAST_N,
            traceId: trace.id,
          });

          // Milestone: context gathered (FR47)
          void safeSetStatus({
            status: 'working...',
            loading_messages: buildLoadingMessages(),
          });

          // Convert thread history to Anthropic message format
          // Filter out messages with missing text (e.g., image-only messages)
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

          // Load system prompt from .orion/agents/orion.md (AC#2)
          let systemPrompt: string;
          try {
            systemPrompt = await loadAgentPrompt('orion');
          } catch (error) {
            logger.warn({
              event: 'agent_prompt_fallback',
              error: error instanceof Error ? error.message : String(error),
              traceId: trace.id,
            });
            // Fallback to minimal prompt
            systemPrompt = 'You are Orion, a helpful AI assistant. Use Slack mrkdwn formatting: *bold* for emphasis, _italic_ for secondary emphasis. Never use blockquotes.';
          }

          // Update trace with context for observability
          trace.update({
            input: {
              text: messageText,
              historyLength: anthropicHistory.length,
            },
          });

          // Story 2.6: Context compaction before Anthropic call
          // Check if history needs compaction based on token estimates
          const estimatedTokens = estimateContextTokens({
            systemPrompt,
            threadHistory: anthropicHistory,
            userMessage: messageText,
          });
          const needsCompaction = shouldTriggerCompaction({
            estimatedTokens,
            maxContextTokens,
            threshold: compactionThreshold,
          });

          // Use anthropicHistory directly or compact it
          let historyForAgent = anthropicHistory;

          if (needsCompaction) {
            const keepLastN = config.compactionKeepLastN ?? 6;
            const maxSummaryTokens = config.compactionMaxSummaryTokens ?? 1000;
            const compactionTimeoutMs = config.compactionTimeoutMs ?? 2000;

            const compactionSpan = trace.startSpan('agent.compaction', {
              input: {
                maxContextTokens,
                threshold: compactionThreshold,
              },
              metadata: {
                traceId: trace.id,
                historyMessages: anthropicHistory.length,
                keepLastN,
                originalEstimatedTokens: estimatedTokens,
              },
            });

            try {
              const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
              const compactionResult = await withTimeout(
                compactThreadHistory({
                  threadHistory: anthropicHistory,
                  userMessage: messageText,
                  systemPrompt,
                  anthropic,
                  model: config.anthropicModel,
                  maxSummaryTokens,
                  keepLastN,
                  traceId: trace.id,
                }),
                compactionTimeoutMs
              );

              compactionSpan.update({
                output: {
                  compactionApplied: compactionResult.compactionApplied,
                  originalEstimatedTokens: compactionResult.originalEstimatedTokens,
                  compactedEstimatedTokens: compactionResult.compactedEstimatedTokens,
                  tokenReduction: compactionResult.originalEstimatedTokens - compactionResult.compactedEstimatedTokens,
                },
                metadata: {
                  traceId: trace.id,
                  historyMessages: anthropicHistory.length,
                  keepLastN,
                  originalEstimatedTokens: compactionResult.originalEstimatedTokens,
                  compactedEstimatedTokens: compactionResult.compactedEstimatedTokens,
                  compactionApplied: compactionResult.compactionApplied,
                },
              }).end();

              if (compactionResult.compactionApplied) {
                historyForAgent = compactionResult.compactedHistory;
                logger.info({
                  event: 'context_compacted',
                  originalMessages: anthropicHistory.length,
                  compactedMessages: historyForAgent.length,
                  originalEstimatedTokens: compactionResult.originalEstimatedTokens,
                  compactedEstimatedTokens: compactionResult.compactedEstimatedTokens,
                  traceId: trace.id,
                });
              }
            } catch (compactionError) {
              // Best-effort: log and continue with original history
              compactionSpan.update({
                metadata: {
                  traceId: trace.id,
                  historyMessages: anthropicHistory.length,
                  error: compactionError instanceof Error ? compactionError.message : String(compactionError),
                },
              }).end();
              logger.warn({
                event: 'compaction_failed_fallback',
                error: compactionError instanceof Error ? compactionError.message : String(compactionError),
                traceId: trace.id,
              });
            }
          }

          // Milestone: before Anthropic call (FR47)
          void safeSetStatus({
            status: 'working...',
            loading_messages: buildLoadingMessages(),
          });

          // Run Orion agent with Anthropic API (AC#1)
          agentSpan = trace.startSpan('agent.orion', {
            input: { messageText, historyLength: historyForAgent.length },
          });

          const agentResponse = runOrionAgent(messageText, {
            context: {
              threadHistory: historyForAgent,
              userId: userId ?? 'unknown',
              channelId,
              traceId: trace.id,
            },
            systemPrompt,
            // Pass the underlying span for the agent loop to create nested observations
            trace: trace._span,
            setStatus: ({ toolName }) =>
              safeSetStatus({
                status: 'working...',
                loading_messages: buildLoadingMessages({ toolName: toolName ?? undefined }),
              }),
          });

          // Stream formatted response (AC#3)
          let fullResponse = '';
          let agentResult: AgentResult | undefined;
          let lastYieldToEventLoop = Date.now();

          // NOTE: for-await-of does NOT expose the generator's return value.
          // We must manually consume the generator to capture the final AgentResult
          // used for Langfuse usage/token logging.
          while (true) {
            const next = await agentResponse.next();
            if (next.done) {
              agentResult = next.value;
              break;
            }

            const chunk = next.value;
            // Format chunk for Slack mrkdwn
            const formattedChunk = formatSlackMrkdwn(chunk);
            // append() is sync with internal debounce; we must yield to the event loop occasionally
            // so the debounce timer can flush (otherwise Slack shows the full response at once).
            streamer.append(formattedChunk);
            fullResponse += chunk; // Store raw for logging

            const now = Date.now();
            if (now - lastYieldToEventLoop >= 50) {
              await new Promise<void>((resolve) => setImmediate(resolve));
              lastYieldToEventLoop = Date.now();
            }
          }

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

          // Log generation for Langfuse (AC#4) using new SDK
          const generation = trace.startGeneration('orion-response', {
            model: config.anthropicModel,
            input: { message: messageText, historyLength: anthropicHistory.length },
            output: agentResult
              ? { response: fullResponse.slice(0, 500) }
              : { response: fullResponse.slice(0, 500), incomplete: true },
            ...(agentResult && {
              usageDetails: {
                input: agentResult.inputTokens,
                output: agentResult.outputTokens,
                total: agentResult.inputTokens + agentResult.outputTokens,
              },
            }),
          });
          generation.end();

          // Milestone: before final response flush (FR47)
          void safeSetStatus({
            status: 'working...',
            loading_messages: buildLoadingMessages(),
          });

          // Stop streaming and get metrics
          const metrics = await streamer.stop();

          // Story 2.7: Post sources block if sources were gathered
          const sourcesGathered = agentResult?.sources ?? [];
          const sourcesGatheredCount = sourcesGathered.length;
          let sourcesBlockSent = false;

          if (sourcesGatheredCount > 0) {
            const sourceCitations: SourceCitation[] = sourcesGathered.map((s, i) => ({
              id: i + 1,
              title: s.title,
              url: s.url,
            }));

            const sourcesBlock = createSourcesContextBlock(sourceCitations);
            if (sourcesBlock) {
              try {
                await client.chat.postMessage({
                  channel: channelId,
                  thread_ts: threadTs ?? undefined,
                  text: ' ', // Fallback text
                  blocks: [sourcesBlock as unknown as Block],
                  metadata: {
                    event_type: 'orion_sources',
                    event_payload: { traceId: trace.id ?? '' },
                  },
                });
                sourcesBlockSent = true;
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

          // Story 2.7 AC#3: Track citation metrics in Langfuse
          // - eligible_response: sourcesGatheredCount > 0
          // - cited_response: eligible_response AND sourcesBlockSent === true
          const citationsForDetection = sourcesGathered.map((s, i) => ({
            id: i + 1,
            type: s.type,
            title: s.title,
            url: s.url,
            excerpt: s.excerpt,
          }));
          const uncitedResult = detectUncitedClaims(fullResponse, citationsForDetection);
          const langfuseClient = getLangfuse();
          if (langfuseClient?.event) {
            langfuseClient.event({
              name: 'citation_metrics',
              metadata: {
                traceId: trace.id,
                sourcesGatheredCount,
                sourcesCitedCount: sourcesBlockSent ? sourcesGatheredCount : 0,
                sourcesBlockSent,
                inlineCitationMarkerCount: uncitedResult.citationCount,
                isEligibleResponse: sourcesGatheredCount > 0,
                isCitedResponse: sourcesGatheredCount > 0 && sourcesBlockSent,
              },
            });

            // Story 2.7 AC#4: Emit warning if sources gathered but not cited
            if (sourcesGatheredCount > 0 && !sourcesBlockSent) {
              langfuseClient.event({
                name: 'citation_warning',
                metadata: {
                  traceId: trace.id,
                  reason: 'sources_gathered_but_not_cited',
                  sourcesGatheredCount,
                },
              });
            }

            // Story 2.7: Rolling citation rate warning (in-memory best-effort).
            const window = recordCitationOutcome({
              eligible: sourcesGatheredCount > 0,
              cited: sourcesGatheredCount > 0 && sourcesBlockSent,
            });
            if (window.belowTarget && window.rate !== null) {
              langfuseClient.event({
                name: 'citation_rate_warning',
                metadata: {
                  traceId: trace.id,
                  citationRate: window.rate,
                  eligibleWindowCount: window.eligibleWindowCount,
                  citedWindowCount: window.citedWindowCount,
                  targetRate: 0.9,
                },
              });
            }
          }

          // Send feedback buttons as follow-up message (Story 1.8)
          // Store trace ID keyed by the feedback message's timestamp for correlation
          try {
            const feedbackMessage = await client.chat.postMessage({
              channel: channelId,
              thread_ts: threadTs ?? undefined,
              text: ' ',
              blocks: [feedbackBlock as unknown as Block],
              metadata: {
                event_type: 'orion_response',
                event_payload: { traceId: trace.id ?? '' },
              },
            });

            // Store trace ID for feedback correlation (Story 1.8, AC#2)
            // Uses the feedback message's timestamp as the key
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

          // Record time to first token for NFR4 tracking
          const timeToFirstToken = timeToStreamStart;
          const totalDuration = Date.now() - messageReceiptTime;

          // End streaming span with output
          streamSpan.update({
            output: {
              response: fullResponse.slice(0, 200),
              metrics,
              contextMessages: threadHistory.length,
              timeToFirstToken,
            },
          }).end();

          trace.update({
            output: {
              response: fullResponse.slice(0, 500),
              streamDuration: metrics.totalDuration,
              totalDuration,
              timeToStreamStart,
              contextMessages: threadHistory.length,
              nfr1Met: totalDuration < 3000,
              ...(agentResult && {
                inputTokens: agentResult.inputTokens,
                outputTokens: agentResult.outputTokens,
              }),
            },
          });

          logger.info({
            event: 'user_message_handled',
            userId,
            streamDuration: metrics.totalDuration,
            totalDuration,
            responseLength: fullResponse.length,
            timeToFirstToken,
            nfr1Met: totalDuration < 3000,
            traceId: trace.id,
          });

          // Remove eyes emoji after responding
          try {
            await client.reactions.remove({
              channel: channelId,
              timestamp: message.ts,
              name: 'eyes',
            });
          } catch {
            // Ignore if already removed
          }

          // Update trace metadata with token counts (visible in Langfuse metadata tab)
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

          // Return the full response as trace output (visible in Langfuse output tab)
          return fullResponse;
            })(),
            HARD_TIMEOUT_MS
          );
        } catch (error) {
          // Ensure stream is stopped even on error
          await streamer.stop().catch(() => {});

          // End agentSpan if it was created
          if (agentSpan) {
            agentSpan.update({
              metadata: {
                error: error instanceof Error ? error.message : String(error),
              },
            }).end();
          }

          streamSpan.update({
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          }).end();

          // Story 2.4: Use structured error logging for OrionErrors
          if (isOrionError(error)) {
            logger.orionError(error, {
              event: 'agent_error',
              traceId: trace.id,
              userId,
              channelId,
            });

            // Story 2.4: Send user-friendly error message (AC#2)
            await say({
              text: error.userMessage,
              thread_ts: threadTs,
            });
          } else {
            logger.error({
              event: 'streaming_error',
              error: error instanceof Error ? error.message : String(error),
              traceId: trace.id,
            });

            // Fallback for non-OrionError: use generic user-friendly message
            await say({
              text: getUserMessage('UNKNOWN_ERROR'),
              thread_ts: threadTs,
            });
          }

          throw error;
        }
      }
    );
  };
