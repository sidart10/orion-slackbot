/**
 * Thread Context Utilities
 *
 * Provides thread history fetching from Slack API.
 * Uses conversations.replies for authoritative thread context (AR29).
 *
 * @see AC#4 - Thread history fetched from Slack API
 * @see AR29 - Slack API fetch for thread context (stateless Cloud Run)
 */

import type { WebClient } from '@slack/web-api';
import { logger } from '../utils/logger.js';

/**
 * Represents a single message in a thread.
 */
export interface ThreadMessage {
  user: string;
  text: string;
  ts: string;
  isBot: boolean;
}

/**
 * Parameters for fetching thread history.
 */
export interface FetchThreadHistoryParams {
  client: WebClient;
  channel: string;
  threadTs: string;
  /** Maximum messages to fetch per page (default: 100) */
  limit?: number;
  /** Maximum tokens to include in history (default: 4000) */
  maxTokens?: number;
  /** Keep only the most recent N messages (default: 50) */
  keepLastN?: number;
  /** Trace ID for observability (passed through to logs) */
  traceId?: string;
}

/**
 * Default maximum tokens to include in thread history.
 * Assumes ~4 chars per token as rough estimate.
 */
const DEFAULT_MAX_TOKENS = 4000;
const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Fetch thread history from Slack API with pagination support.
 *
 * Uses conversations.replies to get all messages in a thread.
 * This is the authoritative source for thread context (AR29).
 * Handles pagination for long threads and limits by token count.
 *
 * @param params - Parameters for fetching thread history
 * @returns Array of thread messages (excluding the current message)
 */
export async function fetchThreadHistory({
  client,
  channel,
  threadTs,
  limit = 100,
  maxTokens = DEFAULT_MAX_TOKENS,
  keepLastN = 50,
  traceId,
}: FetchThreadHistoryParams): Promise<ThreadMessage[]> {
  const recentMessages: ThreadMessage[] = [];
  let cursor: string | undefined;
  const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE;
  let recentChars = 0;
  let loggedTokenTrim = false;

  const pushRecent = (msg: ThreadMessage): void => {
    recentMessages.push(msg);
    recentChars += msg.text.length;

    // Enforce "keep only the most recent N"
    while (recentMessages.length > keepLastN) {
      const removed = recentMessages.shift();
      if (removed) recentChars -= removed.text.length;
    }

    // Enforce token/char budget on the retained window (keep most recent)
    while (recentChars > maxChars && recentMessages.length > 0) {
      const removed = recentMessages.shift();
      if (removed) recentChars -= removed.text.length;

      if (!loggedTokenTrim) {
        loggedTokenTrim = true;
        logger.info({
          event: 'thread_history_token_budget_trimmed',
          channel,
          threadTs,
          keepLastN,
          maxChars,
          ...(traceId && { traceId }),
        });
      }
    }
  };

  try {
    // Paginate through all messages in the thread
    do {
      const result = await client.conversations.replies({
        channel,
        ts: threadTs,
        limit: Math.min(limit, 200), // Slack max per request
        inclusive: true,
        cursor,
      });

      if (!result.messages || result.messages.length === 0) {
        break;
      }

      for (const msg of result.messages) {
        const text = msg.text || '';
        pushRecent({
          user: msg.user || 'unknown',
          text,
          ts: msg.ts || '',
          isBot: !!msg.bot_id,
        });
      }

      // Get cursor for next page
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    // Filter out the current message (last one) to avoid duplication
    // Keep all previous messages for context
    return recentMessages.slice(0, -1);
  } catch (error) {
    logger.error({
      event: 'fetch_thread_history_failed',
      channel,
      threadTs,
      error: error instanceof Error ? error.message : String(error),
      ...(traceId && { traceId }),
    });
    return [];
  }
}

/**
 * Format thread history for LLM context.
 *
 * Converts thread messages into a format suitable for the LLM system prompt.
 *
 * @param messages - Array of thread messages
 * @returns Formatted string for LLM context
 */
export function formatThreadHistoryForContext(
  messages: ThreadMessage[]
): string {
  if (messages.length === 0) {
    return 'No previous messages in this thread.';
  }

  return messages
    .map((msg) => {
      const role = msg.isBot ? 'Orion' : 'User';
      return `${role}: ${msg.text}`;
    })
    .join('\n\n');
}

