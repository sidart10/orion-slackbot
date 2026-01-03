/**
 * Smart Summarization Entry Point
 *
 * Detects context (thread vs channel) and routes accordingly.
 * Context-aware detection: if user is in a thread and asks "summarize this",
 * we use conversations.replies. Otherwise, we use conversations.history.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#5 - Handle All Conversation Types
 */

import type { ToolResult } from '../../utils/tool-result.js';
import type { SummarizeParams, SummaryResult } from './summarize-types.js';
import { summarizeThread } from './summarize-thread.js';
import { summarizeConversation } from './summarize-conversation.js';
import { logger } from '../../utils/logger.js';

/**
 * Parse Slack thread URL to extract channel and timestamp.
 * URL format: https://workspace.slack.com/archives/C123456/p1234567890123456
 */
function parseSlackThreadUrl(text: string): { channel: string; ts: string } | null {
  const match = text.match(/slack\.com\/archives\/([A-Z0-9]+)\/p(\d+)/i);
  if (!match) return null;

  const channel = match[1];
  // Convert p-format timestamp to Slack ts format (add decimal)
  const rawTs = match[2];
  const ts = `${rawTs.slice(0, 10)}.${rawTs.slice(10)}`;

  return { channel, ts };
}

/**
 * Smart summarization entry point.
 * Detects context (thread vs channel) and routes accordingly.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#5 - Handle All Conversation Types
 */
export async function summarize(
  params: SummarizeParams
): Promise<ToolResult<SummaryResult>> {
  const { userMessage, currentChannelId, currentThreadTs, messageTs, client, traceId } =
    params;

  try {
    // Check 1: Is there a thread URL in the message?
    const threadUrl = parseSlackThreadUrl(userMessage);
    if (threadUrl) {
      return summarizeThread({
        client,
        channel: threadUrl.channel,
        threadTs: threadUrl.ts,
        traceId,
      });
    }

    // Check 2: Is user in a thread and asking about "this"?
    const isInThread = currentThreadTs && currentThreadTs !== messageTs;
    const asksAboutThis = /this|here|^summarize$|^tldr$/i.test(userMessage);

    if (isInThread && asksAboutThis) {
      return summarizeThread({
        client,
        channel: currentChannelId,
        threadTs: currentThreadTs,
        traceId,
      });
    }

    // Check 3: Channel/MPIM/DM summarization (with time range)
    return summarizeConversation({
      userMessage,
      currentChannelId,
      client,
      traceId,
    });
  } catch (error) {
    logger.error({
      event: 'summarize.routing_failed',
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });

    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Failed to determine summarization target',
        retryable: true,
      },
    };
  }
}

