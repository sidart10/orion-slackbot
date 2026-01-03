/**
 * Conversation History Fetching for Summarization
 *
 * Fetches message history from channels, group DMs, or DMs.
 * Returns ToolResult — never throws.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#3 - Fetch Conversation History
 * @see AC#8 - Error Handling (MANDATORY)
 */

import type { WebClient } from '@slack/web-api';
import type { ToolResult } from '../utils/tool-result.js';
import { logger } from '../utils/logger.js';
import { getLangfuse } from '../observability/langfuse.js';

export interface ConversationMessage {
  user: string;
  text: string;
  ts: string;
  isBot: boolean;
  threadTs?: string;
  replyCount?: number;
}

export interface FetchConversationHistoryParams {
  client: WebClient;
  channel: string;
  oldest: Date;
  latest: Date;
  maxMessages?: number;
  traceId: string;
}

export interface ConversationHistoryResult {
  messages: ConversationMessage[];
  totalFetched: number;
  truncated: boolean;
  channelInfo: {
    name: string;
    type: 'public_channel' | 'private_channel' | 'mpim' | 'im';
    memberCount?: number;
  };
}

const DEFAULT_MAX_MESSAGES = 500;
const RATE_LIMIT_DELAY_MS = 100; // 100ms between requests (safe for tier 3)

/**
 * Fetch conversation history for a channel, group DM, or DM.
 * Returns ToolResult — never throws.
 *
 * @see Story 7.6 - AC#3 Fetch Conversation History
 * @see AC#8 - Error Handling (MANDATORY)
 */
export async function fetchConversationHistory({
  client,
  channel,
  oldest,
  latest,
  maxMessages = DEFAULT_MAX_MESSAGES,
  traceId,
}: FetchConversationHistoryParams): Promise<ToolResult<ConversationHistoryResult>> {
  const messages: ConversationMessage[] = [];
  let cursor: string | undefined;
  let truncated = false;

  // AC7: Langfuse span for conversation fetch
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: 'summarize.fetch',
    metadata: { traceId, channel },
  });
  const span = trace?.span({
    name: 'summarize.fetch',
    input: {
      channel,
      oldest: oldest.toISOString(),
      latest: latest.toISOString(),
      maxMessages,
    },
  });

  try {
    // Get channel info first
    const infoResult = await client.conversations.info({ channel });

    if (!infoResult.ok || !infoResult.channel) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: "I couldn't find that conversation. It may have been deleted or I don't have access.",
          retryable: false,
        },
      };
    }

    const channelData = infoResult.channel as {
      id?: string;
      name?: string;
      is_private?: boolean;
      is_mpim?: boolean;
      is_im?: boolean;
      num_members?: number;
    };

    const channelInfo = {
      name: channelData.name || channelData.id || channel,
      type: getChannelType(channelData),
      memberCount: channelData.num_members,
    };

    // Convert dates to Slack timestamps
    const oldestTs = (oldest.getTime() / 1000).toString();
    const latestTs = (latest.getTime() / 1000).toString();

    logger.info({
      event: 'conversation_history.fetch_start',
      channel,
      channelType: channelInfo.type,
      oldest: oldest.toISOString(),
      latest: latest.toISOString(),
      traceId,
    });

    do {
      const result = await client.conversations.history({
        channel,
        oldest: oldestTs,
        latest: latestTs,
        limit: Math.min(200, maxMessages - messages.length),
        inclusive: true,
        cursor,
      });

      if (!result.messages || result.messages.length === 0) break;

      for (const msg of result.messages) {
        messages.push({
          user: msg.user || 'unknown',
          text: msg.text || '',
          ts: msg.ts || '',
          isBot: !!msg.bot_id,
          threadTs: msg.thread_ts,
          replyCount: msg.reply_count,
        });

        if (messages.length >= maxMessages) {
          truncated = true;
          break;
        }
      }

      cursor = result.response_metadata?.next_cursor;

      // Rate limiting: 100ms delay between pagination requests
      if (cursor && messages.length < maxMessages) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    } while (cursor && messages.length < maxMessages);

    logger.info({
      event: 'conversation_history.fetch_complete',
      channel,
      messageCount: messages.length,
      truncated,
      traceId,
    });

    // Sort by timestamp (oldest first for summarization)
    messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    span?.end({
      output: {
        messageCount: messages.length,
        truncated,
        channelType: channelInfo.type,
      },
    });

    return {
      success: true,
      data: {
        messages,
        totalFetched: messages.length,
        truncated,
        channelInfo,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      event: 'conversation_history.fetch_failed',
      channel,
      error: errorMessage,
      traceId,
    });

    span?.end({ level: 'ERROR', statusMessage: errorMessage });

    // Handle specific Slack API errors with user-friendly messages
    if (errorMessage.includes('channel_not_found')) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: "I couldn't find that channel. It may have been deleted.",
          retryable: false,
        },
      };
    }

    if (errorMessage.includes('not_in_channel')) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: "I'm not a member of that channel. Please invite me with `/invite @Orion`.",
          retryable: false,
        },
      };
    }

    if (errorMessage.includes('missing_scope')) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: "I don't have permission to read that conversation. An admin may need to update my permissions.",
          retryable: false,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Failed to fetch conversation history. Please try again.',
        retryable: true,
      },
    };
  }
}

function getChannelType(channel: {
  is_mpim?: boolean;
  is_im?: boolean;
  is_private?: boolean;
}): 'public_channel' | 'private_channel' | 'mpim' | 'im' {
  if (channel?.is_mpim) return 'mpim';
  if (channel?.is_im) return 'im';
  if (channel?.is_private) return 'private_channel';
  return 'public_channel';
}

