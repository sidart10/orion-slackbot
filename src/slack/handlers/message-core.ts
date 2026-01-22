/**
 * Shared Message Handler Core
 *
 * Provides the core message handling logic shared by DM, Group DM, and App Mention handlers.
 * Uses the same agent infrastructure (runOrionAgent, tool calling, observability).
 *
 * @see PLAN-dm-group-dm-support.md - Task 1: Create Shared Message Handler Core
 */

import type { WebClient } from '@slack/web-api';
import type { Block } from '@slack/web-api';
import type { StringIndexed } from '@slack/bolt';
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
import { filterClickableSources } from '../source-builder.js';
import {
  formatReferencesBlock,
  contextSourceToToolSource,
  parseCitationsWithMetadata,
  type DocumentMetadata,
} from '../citations/index.js';
import { buildLoadingMessages } from '../status-messages.js';
import { createStatusUpdater } from '../status/index.js';
import { runOrionAgent, type AgentResult } from '../../agent/orion.js';
import { loadAgentPrompt } from '../../agent/loader.js';
import { config } from '../../config/environment.js';
import { getChannelName, getUserDisplayName } from '../identity.js';
import { stripImageUrls, uploadImagesFromResponse } from '../utils/media-upload.js';
import { createSlackFileUploader } from '../utils/file-uploader.js';
import { createFilesApiClient, ingestSlackFiles } from '../../files/index.js';
import {
  setSummarizeToolContext,
  clearSummarizeToolContext,
} from '../../tools/summarize/index.js';
import { clearMemoryToolContext } from '../../tools/memory/index.js';
import { getSkillMetadata, buildSkillsHint } from '../../skills/index.js';
import type { SlackFile } from '../files/types.js';
import {
  buildDocumentBlocks,
  formatFileErrors,
  type DocumentBlock,
} from '../../agent/document-blocks.js';

/**
 * Context for handling a message event.
 * Normalizes the differences between DM, Group DM, and App Mention events.
 */
export interface MessageContext {
  /** Channel ID where the message was sent */
  channelId: string;
  /** Message timestamp (unique identifier) */
  messageTs: string;
  /** User ID who sent the message */
  userId: string;
  /** Message text content */
  text: string;
  /** Thread timestamp (for threaded conversations) */
  threadTs?: string;
  /** Whether this is a reply in an existing thread */
  isThread: boolean;
  /** Type of channel: 'im' (DM), 'mpim' (group DM), 'channel', 'group' */
  channelType: 'im' | 'mpim' | 'channel' | 'group';
  /** Files attached to the message */
  files?: SlackFile[];
  /** Slack Web API client */
  client: WebClient;
  /** Bolt context with team/user info */
  context: StringIndexed;
  /** Handler identifier for trace naming */
  handlerName: string;
}

/**
 * Core message handling logic shared across all message handlers.
 *
 * This function handles:
 * - Event deduplication (caller must handle)
 * - Streaming setup within 500ms
 * - Status updates
 * - Thread/conversation history
 * - File ingestion
 * - System prompt + skills injection
 * - Agent execution with runOrionAgent()
 * - Response streaming with Slack mrkdwn formatting
 * - References, feedback, reactions
 * - Error handling and cleanup
 *
 * @param ctx - Normalized message context
 * @returns Promise that resolves when message is fully handled
 */
export async function handleMessage(ctx: MessageContext): Promise<string> {
  const {
    channelId,
    messageTs,
    userId,
    text,
    threadTs,
    isThread,
    channelType,
    files,
    client,
    context,
    handlerName,
  } = ctx;

  const messageReceiptTime = Date.now();

  // For DMs/group DMs, respond in the same channel (no thread)
  // For channel mentions, respond in thread
  const replyThreadTs = threadTs ?? messageTs;

  // Add eyes reaction to acknowledge message receipt
  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: messageTs,
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

  return startActiveObservation(
    {
      name: `${handlerName} ${channelType === 'im' ? 'DM' : channelType === 'mpim' ? 'Group DM' : `#${channelName}`} @${userName}`,
      userId,
      sessionId: replyThreadTs,
      input: { text },
      metadata: {
        teamId: context.teamId,
        channelId,
        channelName,
        userName,
        eventType: handlerName,
        channelType,
      },
    },
    async (trace: TraceWrapper) => {
      logger.info({
        event: `${handlerName}_received`,
        userId,
        userName,
        channelId,
        channelName,
        channelType,
        messageLength: text.length,
        isThreadReply: isThread,
        traceId: trace.id,
      });

      // CRITICAL: Initialize streamer within 500ms of message receipt (NFR4/AC#3)
      const streamer = createStreamer({
        client,
        channel: channelId,
        threadTs: replyThreadTs,
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

      // Create unified StatusUpdater for status message handling
      const statusUpdater = createStatusUpdater({
        client,
        channel: channelId,
        thread_ts: replyThreadTs,
        traceId: trace.id,
      });

      // Post initial status message
      await statusUpdater.update('Thinking...');

      let agentSpan: ReturnType<typeof trace.startSpan> | null = null;

      try {
        // Fetch conversation history
        // For threads: use conversations.replies
        // For DMs/group DMs (flat): use conversations.history
        let anthropicHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

        if (isThread && replyThreadTs) {
          // Thread context - use replies API
          const threadHistory = await fetchThreadHistory({
            client,
            channel: channelId,
            threadTs: replyThreadTs,
            limit: 20,
            traceId: trace.id,
          });

          anthropicHistory = threadHistory
            .filter((msg) => typeof msg.text === 'string' && msg.text.length > 0)
            .map((msg) => ({
              role: (msg.isBot ? 'assistant' : 'user') as 'user' | 'assistant',
              content: msg.text,
            }));
        }
        // For DMs/group DMs, we could fetch flat history here
        // For now, we don't include history context for DMs (simpler initial implementation)
        // The user can enable this by setting isThread: true and providing threadTs

        logger.info({
          event: 'context_gathered',
          historyCount: anthropicHistory.length,
          isThread,
          channelType,
          traceId: trace.id,
        });

        // File ingestion for Claude context
        let documentBlocksForAgent: DocumentBlock[] = [];
        let fileIngestionErrors: string[] = [];

        if (files && files.length > 0) {
          logger.info({
            event: 'file_ingestion.start',
            fileCount: files.length,
            filenames: files.map((f) => f.name),
            traceId: trace.id,
          });

          const ingestionResult = await ingestSlackFiles(files, {
            traceId: trace.id ?? undefined,
          });

          const { documentBlocks, errors, processedFiles, failedFiles } =
            buildDocumentBlocks(ingestionResult.results, {
              enableCitations: true,
              traceId: trace.id ?? undefined,
            });

          documentBlocksForAgent = documentBlocks;
          fileIngestionErrors = errors;

          logger.info({
            event: 'file_ingestion.complete',
            documentBlockCount: documentBlocks.length,
            errorCount: errors.length,
            processedFiles,
            failedFiles,
            traceId: trace.id,
          });

          // Send user-friendly error messages for failed files
          if (fileIngestionErrors.length > 0) {
            const errorMessage = formatFileErrors(fileIngestionErrors);
            if (errorMessage) {
              await client.chat.postMessage({
                channel: channelId,
                thread_ts: replyThreadTs,
                text: errorMessage,
              });
            }
          }
        }

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

        // Inject skills hint into system prompt
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
          logger.warn({
            event: 'skills_hint_injection_failed',
            reason: skillsError instanceof Error ? skillsError.message : String(skillsError),
            traceId: trace.id,
          });
        }

        // Update trace with context
        trace.update({
          input: {
            text,
            historyLength: anthropicHistory.length,
          },
        });

        // Run Orion agent with full tool calling capability
        agentSpan = trace.startSpan('agent.orion', {
          input: { messageText: text, historyLength: anthropicHistory.length },
        });

        // Set summarize tool context
        setSummarizeToolContext({
          client,
          traceId: trace.id ?? '',
          channelId,
          threadTs: replyThreadTs,
          messageTs,
        });

        const agentResponse = runOrionAgent(text, {
          context: {
            threadHistory: anthropicHistory,
            userId: userId ?? 'unknown',
            channelId,
            traceId: trace.id,
          },
          systemPrompt,
          trace: trace._span,
          setStatus: ({ phase, toolName, toolInput, allTools }) => {
            logger.debug({
              event: 'agent_status_update',
              phase,
              toolName,
              toolCount: allTools?.length,
              traceId: trace.id,
            });
            const messages = buildLoadingMessages({ phase, toolName, toolInput, allTools });
            if (messages.length > 0) {
              void statusUpdater.update(messages[0] ?? 'Working...');
            }
          },
          documentBlocks: documentBlocksForAgent.length > 0
            ? documentBlocksForAgent as unknown as import('../../agent/orion.js').DocumentBlockParam[]
            : undefined,
        });

        // Stream response chunks
        let fullResponse = '';
        let agentResult: AgentResult | undefined;
        let lastYieldToEventLoop = Date.now();

        for (;;) {
          const next = await agentResponse.next();
          if (next.done) {
            agentResult = next.value;
            break;
          }

          const chunk = next.value;
          const cleanedChunk = stripImageUrls(chunk);
          const formattedChunk = formatSlackMrkdwn(cleanedChunk);
          streamer.append(formattedChunk);
          fullResponse += chunk;

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
          input: { message: text, historyLength: anthropicHistory.length },
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
            threadTs: replyThreadTs,
            userId,
            error: stopError instanceof Error ? stopError.message : String(stopError),
            traceId: trace.id,
          });

          await client.chat.postMessage({
            channel: channelId,
            thread_ts: replyThreadTs,
            text: "I generated a response but couldn't deliver it to Slack. Please try again.",
          });

          throw stopError;
        }

        // Delete status message now that streaming is complete
        await statusUpdater.cleanup();

        // Unified References Footer Block
        const clickableSources = filterClickableSources(agentResult?.sources ?? []);
        const formattedToolSources = clickableSources.map(contextSourceToToolSource);

        const docMetadata: DocumentMetadata[] = documentBlocksForAgent.map((doc, index) => ({
          index,
          name: doc.title ?? `Document ${index + 1}`,
          source_type: 'file' as const,
        }));

        const rawDocCitations = agentResult?.documentCitations ?? [];
        const parsedDocCitations = parseCitationsWithMetadata(rawDocCitations, docMetadata);

        const hasToolSources = formattedToolSources.length > 0;
        const hasDocCitations = parsedDocCitations.length > 0;

        if (hasToolSources || hasDocCitations) {
          const referencesBlock = formatReferencesBlock(formattedToolSources, parsedDocCitations);
          if (referencesBlock) {
            try {
              await client.chat.postMessage({
                channel: channelId,
                thread_ts: replyThreadTs,
                text: ' ',
                blocks: [referencesBlock as unknown as Block],
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

        // Upload any images from sources
        const sourceUrls = (agentResult?.sources ?? [])
          .filter((s) => s.url)
          .map((s) => s.url as string)
          .join(' ');
        const allUrls = `${fullResponse} ${sourceUrls}`;
        try {
          const imageResults = await uploadImagesFromResponse(
            client,
            channelId,
            replyThreadTs,
            allUrls,
            trace.id
          );
          if (imageResults.length > 0) {
            logger.info({
              event: 'images_uploaded',
              channelId,
              threadTs: replyThreadTs,
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

        // Upload generated files from code execution
        const generatedFileIds = agentResult?.generatedFileIds ?? [];
        if (generatedFileIds.length > 0) {
          const filesClient = createFilesApiClient();
          const uploader = createSlackFileUploader(filesClient, client);

          uploader
            .uploadFiles(generatedFileIds, channelId, replyThreadTs, {
              deleteAfterUpload: true,
              traceId: trace.id,
            })
            .then((result) => {
              logger.info({
                event: 'files_uploaded',
                channelId,
                threadTs: replyThreadTs,
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

        // Post feedback buttons as follow-up message
        try {
          const feedbackMessage = await client.chat.postMessage({
            channel: channelId,
            thread_ts: replyThreadTs,
            text: ' ',
            blocks: [feedbackBlock as unknown as Block],
            metadata: {
              event_type: 'orion_response',
              event_payload: { traceId: trace.id ?? '' },
            },
          });

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
            contextMessages: anthropicHistory.length,
            nfr1Met: totalDuration < 3000,
            ...(agentResult && {
              inputTokens: agentResult.inputTokens,
              outputTokens: agentResult.outputTokens,
            }),
          },
        });

        logger.info({
          event: `${handlerName}_handled`,
          userId,
          streamDuration: streamMetrics.totalDuration,
          totalDuration,
          responseLength: fullResponse.length,
          timeToStreamStart,
          nfr1Met: totalDuration < 3000,
          traceId: trace.id,
        });

        // Remove eyes reaction after successful response
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: messageTs,
            name: 'eyes',
          });
        } catch {
          // Ignore if already removed
        }

        // Add checkmark on successful completion
        try {
          await client.reactions.add({
            channel: channelId,
            timestamp: messageTs,
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

        // Clear tool contexts
        clearSummarizeToolContext();
        clearMemoryToolContext();

        return fullResponse;
      } catch (error) {
        // Clear tool contexts on error
        clearSummarizeToolContext();
        clearMemoryToolContext();

        // Clean up status message on error
        await statusUpdater.cleanup();

        // Ensure stream is stopped even on error
        try {
          await streamer.stop();
        } catch (stopError) {
          logger.warn({
            event: 'stream_stop_failed_during_error_cleanup',
            channel: channelId,
            threadTs: replyThreadTs,
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
          event: `${handlerName}_error`,
          error: error instanceof Error ? error.message : String(error),
          traceId: trace.id,
        });

        // Remove eyes reaction on failure
        try {
          await client.reactions.remove({
            channel: channelId,
            timestamp: messageTs,
            name: 'eyes',
          });
        } catch {
          // Ignore
        }

        // Post error message
        const errorText = 'Sorry, I encountered an error processing your message.';
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: replyThreadTs,
          text: errorText,
        });

        throw error;
      }
    }
  );
}
