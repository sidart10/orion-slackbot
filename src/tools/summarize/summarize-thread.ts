/**
 * Thread Summarization
 *
 * Summarizes a single Slack thread (parent + replies).
 * Reuses existing fetchThreadHistory from thread-context.ts.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#5 - Handle All Conversation Types (threads)
 * @see AC#8 - Error Handling (MANDATORY)
 */

import type { ToolResult } from '../../utils/tool-result.js';
import type { SummarizeThreadParams, SummaryResult } from './summarize-types.js';
import { fetchThreadHistory } from '../../slack/thread-context.js';
import { generateSummary } from './generate-summary.js';
import { logger } from '../../utils/logger.js';
import { getLangfuse } from '../../observability/langfuse.js';
import { getMessagePermalink } from '../../slack/permalinks.js';

/**
 * Summarize a single Slack thread (parent + replies).
 * Reuses existing fetchThreadHistory from thread-context.ts.
 * Returns ToolResult — never throws.
 *
 * @see Story 7.6 - AC#5 Threads detected via thread_ts
 * @see AC#8 - Error Handling (MANDATORY)
 */
export async function summarizeThread(
  params: SummarizeThreadParams
): Promise<ToolResult<SummaryResult>> {
  const { client, channel, threadTs, traceId } = params;

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: 'summarize.thread',
    metadata: { traceId, channel, threadTs },
  });
  const span = trace?.span({
    name: 'summarize.thread',
    input: { channel, threadTs },
  });

  try {
    // Reuse existing fetchThreadHistory — respects maxTokens and keepLastN
    const messages = await fetchThreadHistory({
      client,
      channel,
      threadTs,
      limit: 100,
      maxTokens: 8000, // Allow more for summarization
      keepLastN: 100, // Keep more messages for summary
      traceId,
    });

    if (messages.length === 0) {
      span?.end({ output: { messageCount: 0 } });
      return {
        success: true,
        data: {
          summary: 'This thread has no messages to summarize.',
          messageCount: 0,
          type: 'thread',
        },
      };
    }

    const participants = [...new Set(messages.map((m) => m.user))];

    // Get permalinks for key thread messages so Claude can cite them inline
    // Limit to 25 messages max to avoid API rate limits on large threads
    const MAX_LINKED_THREAD_MESSAGES = 25;
    const messagesToLink =
      messages.length <= MAX_LINKED_THREAD_MESSAGES
        ? messages
        : messages.slice(0, MAX_LINKED_THREAD_MESSAGES);

    const permalinkMap = new Map<string, string>();
    await Promise.all(
      messagesToLink.map(async (msg) => {
        try {
          const url = await getMessagePermalink(client, channel, msg.ts);
          if (url) permalinkMap.set(msg.ts, url);
        } catch {
          // Fallback: construct URL directly
          const tsNoDot = msg.ts.replace('.', '');
          permalinkMap.set(msg.ts, `https://slack.com/archives/${channel}/p${tsNoDot}`);
        }
      })
    );

    logger.info({
      event: 'summarize.thread_permalinks_fetched',
      channel,
      threadTs,
      linkedCount: permalinkMap.size,
      traceId,
    });

    // Format messages for Claude WITH permalinks so it can cite inline
    // Format: [Username](url): message text
    const formattedMessages = messages
      .map((m) => {
        const user = m.isBot ? 'Orion' : m.user;
        const link = permalinkMap.get(m.ts);
        if (link) {
          return `[${user}](${link}): ${m.text}`;
        }
        return `[${user}]: ${m.text}`;
      })
      .join('\n\n');

    // Generate summary - Claude will use the permalinks to cite sources inline
    const summary = await generateSummary(formattedMessages, 'thread', traceId);

    // Thread parent link for "View thread" fallback
    const sourceUrl = permalinkMap.get(threadTs) || permalinkMap.values().next().value;

    span?.end({
      output: {
        messageCount: messages.length,
        participantCount: participants.length,
        summaryLength: summary.length,
      },
    });

    return {
      success: true,
      data: {
        summary,
        messageCount: messages.length,
        type: 'thread',
        participants,
        sourceUrl: sourceUrl ?? undefined,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      event: 'summarize.thread_failed',
      channel,
      threadTs,
      error: errorMessage,
      traceId,
    });

    span?.end({ level: 'ERROR', statusMessage: errorMessage });

    // Handle specific Slack errors
    if (errorMessage.includes('channel_not_found')) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message:
            "I couldn't find that thread. The link might be incorrect or the channel may have been deleted.",
          retryable: false,
        },
      };
    }

    if (errorMessage.includes('not_in_channel')) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message:
            "I don't have access to that channel. Please invite me first with `/invite @Orion`.",
          retryable: false,
        },
      };
    }

    if (errorMessage.includes('missing_scope')) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message:
            "I don't have permission to read that thread. An admin may need to update my permissions.",
          retryable: false,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Failed to summarize thread. Please try again.',
        retryable: true,
      },
    };
  }
}

