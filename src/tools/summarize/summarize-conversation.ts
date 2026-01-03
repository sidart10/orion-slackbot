/**
 * Conversation Summarization (Channels, Group DMs, DMs)
 *
 * Summarizes a channel, MPIM, or DM over a time range.
 * Returns ToolResult — never throws.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#5 - Handle All Conversation Types
 * @see AC#8 - Error Handling (MANDATORY)
 */

import type { ToolResult } from '../../utils/tool-result.js';
import type { SummarizeConversationParams, SummaryResult } from './summarize-types.js';
import { fetchConversationHistory } from '../../slack/conversation-history.js';
import { parseTimeRange } from './parse-time-range.js';
import { parseConversationTarget } from './parse-conversation-target.js';
import { generateSummary } from './generate-summary.js';
import { getLangfuse } from '../../observability/langfuse.js';
import { getMessagePermalink } from '../../slack/permalinks.js';
import { logger } from '../../utils/logger.js';

/**
 * Summarize a channel, MPIM, or DM over a time range.
 * Returns ToolResult — never throws.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#8 - Error Handling (MANDATORY)
 */
export async function summarizeConversation(
  params: SummarizeConversationParams
): Promise<ToolResult<SummaryResult>> {
  const { userMessage, currentChannelId, client, traceId } = params;

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: 'summarize.conversation',
    metadata: { traceId, currentChannelId },
  });
  const span = trace?.span({
    name: 'summarize.conversation',
    input: { currentChannelId },
  });

  // Parse time range
  const timeRange = parseTimeRange(userMessage);

  // Parse conversation target
  const target = parseConversationTarget(userMessage, currentChannelId);
  const channelId = target.channelId || currentChannelId;

  // Handle unresolved DM/MPIM targets (user lookup not implemented in MVP)
  if (!channelId) {
    span?.end({ level: 'WARNING', statusMessage: 'unresolved_target' });
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message:
          "I couldn't determine which conversation to summarize. Try mentioning the channel directly (e.g., #channel-name) or say 'summarize this channel'.",
        retryable: false,
      },
    };
  }

  // Fetch history (returns ToolResult)
  const historyResult = await fetchConversationHistory({
    client,
    channel: channelId,
    oldest: timeRange.oldest,
    latest: timeRange.latest,
    maxMessages: 500,
    traceId,
  });

  if (!historyResult.success) {
    span?.end({ level: 'ERROR', statusMessage: historyResult.error.message });
    return historyResult as ToolResult<SummaryResult>;
  }

  const history = historyResult.data;

  if (history.messages.length === 0) {
    span?.end({ output: { messageCount: 0 } });
    return {
      success: true,
      data: {
        summary: `No messages found in this conversation for the ${timeRange.description}.`,
        messageCount: 0,
        type: history.channelInfo.type,
        timeRange,
        truncated: false,
      },
    };
  }

  const participants = [...new Set(history.messages.map((m) => m.user))];

  // Get permalinks for key messages so Claude can cite them inline
  // Pick up to 15 evenly spaced messages to keep API calls reasonable
  const MAX_LINKED_MESSAGES = 15;
  const messages = history.messages;
  const messagesToLink: typeof messages = [];

  if (messages.length <= MAX_LINKED_MESSAGES) {
    messagesToLink.push(...messages);
  } else {
    const step = Math.floor(messages.length / MAX_LINKED_MESSAGES);
    for (let i = 0; i < MAX_LINKED_MESSAGES; i++) {
      messagesToLink.push(messages[i * step]);
    }
  }

  // Fetch permalinks in parallel for key messages
  const permalinkMap = new Map<string, string>();
  await Promise.all(
    messagesToLink.map(async (msg) => {
      try {
        const url = await getMessagePermalink(client, channelId, msg.ts);
        if (url) permalinkMap.set(msg.ts, url);
      } catch {
        // Fallback: construct URL directly
        const tsNoDot = msg.ts.replace('.', '');
        permalinkMap.set(msg.ts, `https://slack.com/archives/${channelId}/p${tsNoDot}`);
      }
    })
  );

  logger.info({
    event: 'summarize.permalinks_fetched',
    channelId,
    linkedCount: permalinkMap.size,
    totalMessages: messages.length,
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
  const summary = await generateSummary(
    formattedMessages,
    history.channelInfo.type,
    traceId
  );

  // First message link for "View conversation" fallback
  const sourceUrl = permalinkMap.get(messages[0]?.ts);

  span?.end({
    output: {
      messageCount: history.messages.length,
      participantCount: participants.length,
      truncated: history.truncated,
    },
  });

  return {
    success: true,
    data: {
      summary,
      messageCount: history.messages.length,
      type: history.channelInfo.type,
      participants,
      timeRange,
      truncated: history.truncated,
      sourceUrl, // Link to oldest message in range
    },
  };
}

