/**
 * App Mention Handler for Channel Conversations
 *
 * Handles @orion mentions in Slack channels. Uses the same agent infrastructure
 * as the Assistant handler (runOrionAgent, tool calling).
 *
 * @see Story 2.8 - App Mention Handler for Channel Conversations
 * @see Story 3.4 - Channel @Mention Tool Feedback
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
import { createStreamer } from '../../utils/streaming.js';
import { isDuplicateEvent } from '../event-dedup.js';
import { formatSlackMrkdwn } from '../../utils/formatting.js';
import { fetchThreadHistory } from '../thread-context.js';
import { feedbackBlock } from '../feedback-block.js';
import { createSourcesContextBlock, type SourceCitation } from '../sources-block.js';
import { filterClickableSources } from '../source-builder.js';
import { buildLoadingMessages } from '../status-messages.js';
import { runOrionAgent, type AgentResult } from '../../agent/orion.js';
import { loadAgentPrompt } from '../../agent/loader.js';
import { config } from '../../config/environment.js';
import { getChannelName, getUserDisplayName } from '../identity.js';
import { uploadImagesFromResponse } from '../utils/image-upload.js';
import { createSlackFileUploader } from '../utils/file-uploader.js';
import { createFilesApiClient } from '../../files/index.js';
import {
  setSummarizeToolContext,
  clearSummarizeToolContext,
} from '../../tools/summarize/index.js';
import { clearMemoryToolContext } from '../../tools/memory/index.js';
import { getSkillMetadata, buildSkillsHint } from '../../skills/index.js';

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

  // Story 7.5: Event deduplication to prevent duplicate responses
  // Check if this message was already processed by another handler
  // Note: traceId not available yet at this point; dedup happens before trace starts
  if (isDuplicateEvent(channelId, mentionEvent.ts, 'app_mention')) {
    logger.debug({
      event: 'event_dedup.skipped',
      handler: 'app_mention',
      channelId,
      messageTs: mentionEvent.ts,
    });
    return;
  }

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

      // CRITICAL: Initialize streamer within 500ms of message receipt (NFR4/AC#3)
      // Uses same streaming infrastructure as Assistant handler
      const streamer = createStreamer({
        client,
        channel: channelId,
        threadTs,
        userId: userId ?? '',
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

      // Story 3.4: Post initial status message for tool feedback
      let statusMessageTs: string | undefined;
      let lastStatusUpdate = 0;
      const STATUS_DEBOUNCE_MS = 300;

      try {
        const statusMsg = await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: 'Thinking…',
        });
        statusMessageTs = statusMsg.ts;
      } catch (statusError) {
        logger.warn({
          event: 'status_message_post_failed',
          error: statusError instanceof Error ? statusError.message : String(statusError),
          traceId: trace.id,
        });
      }

      /**
       * Update the status message with tool-specific text.
       * Debounced to avoid Slack rate limits (300ms minimum between updates).
       *
       * @see Story 7.3 - Contextual Tool Feedback (AC1-AC5)
       */
      const updateStatusMessage = async (params: {
        phase?: 'gather' | 'act' | 'tool' | 'verify' | 'final';
        toolName?: string | null;
        toolInput?: Record<string, unknown>;
        allTools?: Array<{ name: string; input: Record<string, unknown> }>;
      }): Promise<void> => {
        if (!statusMessageTs) return;

        const now = Date.now();
        if (now - lastStatusUpdate < STATUS_DEBOUNCE_MS) return;
        lastStatusUpdate = now;

        const messages = buildLoadingMessages(params);
        // Final phase returns empty array - skip update
        if (messages.length === 0) return;

        try {
          await client.chat.update({
            channel: channelId,
            ts: statusMessageTs,
            text: messages[0] ?? 'Working…',
          });
        } catch (updateError) {
          logger.debug({
            event: 'status_message_update_failed',
            error: updateError instanceof Error ? updateError.message : String(updateError),
            traceId: trace.id,
          });
        }
      };

      /**
       * Delete the status message (cleanup after completion or error).
       */
      const deleteStatusMessage = async (): Promise<void> => {
        if (!statusMessageTs) return;
        try {
          await client.chat.delete({
            channel: channelId,
            ts: statusMessageTs,
          });
        } catch (deleteError) {
          logger.debug({
            event: 'status_message_delete_failed',
            error: deleteError instanceof Error ? deleteError.message : String(deleteError),
            traceId: trace.id,
          });
        }
      };

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

        // Story 6.1: Inject skills hint into system prompt (AC#4)
        // Uses metadata-only loading for token efficiency (~100 tokens/skill vs ~5000)
        try {
          const skillMetadata = await getSkillMetadata(trace.id ?? 'no-trace');
          if (skillMetadata.length > 0) {
            const skillsHint = buildSkillsHint(skillMetadata);
            systemPrompt = `${systemPrompt}\n\n${skillsHint}`;
            logger.info({
              event: 'skills_hint_injected',
              skillCount: skillMetadata.length,
              skillNames: skillMetadata.map((s) => s.name),
              traceId: trace.id,
            });
          }
        } catch (skillsError) {
          // Best-effort: log and continue without skills
          logger.warn({
            event: 'skills_hint_injection_failed',
            reason: skillsError instanceof Error ? skillsError.message : String(skillsError),
            traceId: trace.id,
          });
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

        // Set summarize tool context (Story 7.6)
        setSummarizeToolContext({
          client,
          traceId: trace.id ?? '',
          channelId,
          threadTs,
          messageTs: mentionEvent.ts,
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
          // Story 7.3: Enhanced status with tool context (AC1-AC5)
          setStatus: ({ phase, toolName, toolInput, allTools }) => {
            logger.debug({
              event: 'agent_status_update',
              phase,
              toolName,
              toolCount: allTools?.length,
              traceId: trace.id,
            });
            void updateStatusMessage({ phase, toolName, toolInput, allTools });
          },
        });

        // Stream response chunks (AC#3 - real-time streaming)
        let fullResponse = '';
        let agentResult: AgentResult | undefined;
        let lastYieldToEventLoop = Date.now();

        while (true) {
          const next = await agentResponse.next();
          if (next.done) {
            agentResult = next.value;
            break;
          }

          const chunk = next.value;
          // Format chunk for Slack mrkdwn
          const formattedChunk = formatSlackMrkdwn(chunk);
          // append() is sync with internal debounce; yield to event loop periodically
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

        // Stop streaming and get metrics
        let streamMetrics;
        try {
          streamMetrics = await streamer.stop();
        } catch (stopError) {
          logger.error({
            event: 'stream_delivery_failed',
            channel: channelId,
            threadTs,
            userId,
            error: stopError instanceof Error ? stopError.message : String(stopError),
            traceId: trace.id,
          });

          // Notify user of delivery failure
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: '⚠️ *Message delivery failed*\n\nI generated a response but couldn\'t deliver it to Slack. Please try again.',
          });

          throw stopError;
        }

        // Story 3.4: Delete status message now that streaming is complete
        await deleteStatusMessage();

        // Story 2.7 + Source Citations Fix: Only use sources from tool results
        // NOTE: Thread messages are NOT sources - they're the conversation context.
        // Only tool results (web search, MCP, summarization) can provide sources.
        const clickableSources = filterClickableSources(agentResult?.sources ?? []);

        if (clickableSources.length > 0) {
          const sourceCitations: SourceCitation[] = clickableSources.map((s, i) => ({
            id: i + 1,
            title: s.title,
            url: s.url,
            isMemory: s.type === 'memory',
            isTool: s.type === 'tool',
            toolContext: s.toolContext,
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

        // Upload any images from sources inline (GCS URLs from Imagen/Veo)
        const sourceUrls = (agentResult?.sources ?? [])
          .filter((s) => s.url)
          .map((s) => s.url as string)
          .join(' ');
        const allUrls = `${fullResponse} ${sourceUrls}`;
        try {
          const imageResults = await uploadImagesFromResponse(
            client,
            channelId,
            threadTs,
            allUrls,
            trace.id
          );
          if (imageResults.length > 0) {
            logger.info({
              event: 'images_uploaded',
              channelId,
              threadTs,
              total: imageResults.length,
              successful: imageResults.filter((r) => r.success).length,
              traceId: trace.id,
            });
          }
        } catch (imageError) {
          logger.warn({
            event: 'image_upload_failed',
            error: imageError instanceof Error ? imageError.message : String(imageError),
            traceId: trace.id,
          });
        }

        // Story 6.6: Upload generated files from code execution (PTC Skills)
        const generatedFileIds = agentResult?.generatedFileIds ?? [];
        if (generatedFileIds.length > 0) {
          // Fire-and-forget upload — don't block the response
          const filesClient = createFilesApiClient();
          const uploader = createSlackFileUploader(filesClient, client);

          uploader
            .uploadFiles(generatedFileIds, channelId, threadTs, {
              deleteAfterUpload: true,
              traceId: trace.id,
            })
            .then((result) => {
              logger.info({
                event: 'files_uploaded',
                channelId,
                threadTs,
                total: result.results.length,
                successful: result.successCount,
                failed: result.failureCount,
                totalBytes: result.totalBytes,
                traceId: trace.id,
              });
            })
            .catch((fileError) => {
              logger.warn({
                event: 'files_upload_failed',
                error: fileError instanceof Error ? fileError.message : String(fileError),
                traceId: trace.id,
              });
            });
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
            streamDuration: streamMetrics.totalDuration,
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
          event: 'app_mention_handled',
          userId,
          streamDuration: streamMetrics.totalDuration,
          totalDuration,
          responseLength: fullResponse.length,
          timeToStreamStart,
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

        // Story 7.4: Add ✅ on successful completion (AC1)
        try {
          await client.reactions.add({
            channel: channelId,
            timestamp: mentionEvent.ts,
            name: 'white_check_mark',
          });
          logger.debug({
            event: 'completion_reaction_added',
            traceId: trace.id,
          });
        } catch (reactionError) {
          logger.warn({
            event: 'completion_reaction_failed',
            error: reactionError instanceof Error ? reactionError.message : String(reactionError),
            traceId: trace.id,
          });
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

        // Clear summarize tool context (Story 7.6)
        clearSummarizeToolContext();
        // Clear memory tool context (Story 5.1)
        clearMemoryToolContext();

        return fullResponse;
      } catch (error) {
        // Clear summarize tool context on error (Story 7.6)
        clearSummarizeToolContext();
        // Clear memory tool context on error (Story 5.1)
        clearMemoryToolContext();

        // Story 3.4: Clean up status message on error
        await deleteStatusMessage();

        // Ensure stream is stopped even on error
        try {
          await streamer.stop();
        } catch (stopError) {
          // Log but don't throw - we're already in error path
          logger.warn({
            event: 'stream_stop_failed_during_error_cleanup',
            channel: channelId,
            threadTs,
            error: stopError instanceof Error ? stopError.message : String(stopError),
            traceId: trace.id,
          });
        }

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

        // Post error message to thread
        const errorText = 'Sorry, I encountered an error processing your message.';
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: errorText,
        });

        throw error;
      }
    }
  );
}
