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
 * Maximum number of thread messages to fetch for context.
 * Used across all handlers for consistency.
 */
export const THREAD_HISTORY_LIMIT = 20;

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
}: FetchThreadHistoryParams): Promise<ThreadMessage[]> {
  const allMessages: ThreadMessage[] = [];
  let cursor: string | undefined;
  let totalChars = 0;
  const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE;

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
        const charCount = text.length;

        // Check if adding this message would exceed token limit
        if (totalChars + charCount > maxChars && allMessages.length > 0) {
          logger.info({
            event: 'thread_history_token_limit_reached',
            channel,
            threadTs,
            messagesLoaded: allMessages.length,
            totalChars,
            maxChars,
          });
          // Return what we have, excluding current message
          return allMessages.slice(0, -1);
        }

        allMessages.push({
          user: msg.user || 'unknown',
          text,
          ts: msg.ts || '',
          isBot: !!msg.bot_id,
        });

        totalChars += charCount;
      }

      // Get cursor for next page
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    // Filter out the current message (last one) to avoid duplication
    // Keep all previous messages for context
    return allMessages.slice(0, -1);
  } catch (error) {
    logger.error({
      event: 'fetch_thread_history_failed',
      channel,
      threadTs,
      error: error instanceof Error ? error.message : String(error),
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

/**
 * Format thread history as an array for agent context.
 *
 * Converts thread messages into role-prefixed strings for agent context.
 * Used by runOrionAgent() to pass thread history.
 *
 * @param messages - Array of thread messages
 * @returns Array of "Role: message" strings
 */
export function formatThreadHistoryForAgent(messages: ThreadMessage[]): string[] {
  return messages.map((m) => `${m.isBot ? 'Orion' : 'User'}: ${m.text}`);
}

