/**
 * Context Compaction Module
 *
 * Implements manual context compaction via summarization for long conversations.
 * Claude Agent SDK does NOT have built-in compaction - we implement it manually.
 *
 * @see Story 2.6 - Context Compaction
 * @see NFR24 - Support 200k token context window
 * @see AR30 - Manual compaction via summarization
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/errors.js';
import type { LangfuseTrace } from '../observability/langfuse.js';

/** Maximum context window size (NFR24) */
export const TOKEN_LIMIT = 200_000;

/** Threshold percentage at which to trigger compaction (80% of limit) */
export const COMPACTION_THRESHOLD = 0.8;

/**
 * Result of a compaction operation
 */
export interface CompactionResult {
  /** Token count before compaction */
  originalTokens: number;
  /** Token count after compaction */
  compactedTokens: number;
  /** List of key items preserved in summary */
  preservedItems: string[];
}

/**
 * A message in the conversation history
 */
export interface ConversationMessage {
  /** Message role: user or assistant */
  role: 'user' | 'assistant';
  /** Message content */
  content: string;
}

/**
 * Estimate token count for text content
 *
 * Uses ~4 characters per token as a rough approximation.
 * This is consistent with common tokenizer behavior for English text.
 *
 * **LIMITATION**: This is a rough estimate that may be off by 20-30% depending on:
 * - Code vs prose (code often has shorter tokens)
 * - Special characters and punctuation
 * - Unicode/multilingual content (non-ASCII uses more tokens)
 *
 * For production accuracy, consider using `@anthropic-ai/tokenizer`.
 * The 80% threshold provides a safety margin for this estimation error.
 *
 * @param text - Text to estimate tokens for (handles null/undefined safely)
 * @returns Estimated token count (0 for falsy input)
 */
export function estimateTokenCount(text: string | null | undefined): number {
  if (text === null || text === undefined || text === '') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Check if compaction should be triggered based on token count
 *
 * Triggers when token count exceeds 80% of the 200k limit (160k tokens).
 *
 * @param tokenCount - Current token count
 * @returns true if compaction should be triggered
 *
 * @example
 * if (shouldTriggerCompaction(estimateTokenCount(context))) {
 *   await compactConversation(messages, client);
 * }
 */
export function shouldTriggerCompaction(tokenCount: number): boolean {
  const threshold = TOKEN_LIMIT * COMPACTION_THRESHOLD;
  return tokenCount > threshold;
}

/**
 * Result of compacting a conversation
 */
export interface CompactedConversation {
  /** Summary of older messages */
  summary: string;
  /** Most recent messages preserved in full */
  recentMessages: ConversationMessage[];
}

/**
 * Options for conversation compaction
 */
export interface CompactionOptions {
  /** Minimum number of recent messages to keep in full (default: 10) */
  minRecentMessages?: number;
}

/** Model used for summarization (cost-effective choice) */
const SUMMARIZATION_MODEL = 'claude-sonnet-4-20250514';

/** Default minimum recent messages to preserve in full detail */
const DEFAULT_MIN_RECENT_MESSAGES = 10;

/**
 * Compact conversation history by summarizing older messages
 *
 * Strategy: Keep at least minRecentMessages in full detail,
 * summarize the rest into a structured format.
 *
 * Claude SDK does NOT have automatic compaction - we implement it manually
 * by calling Claude to summarize the older portion of the conversation.
 *
 * @param messages - Full conversation history
 * @param options - Compaction options
 * @returns Summary of older messages and array of recent messages
 *
 * @example
 * const { summary, recentMessages } = await compactConversation(messages);
 * const compactedContext = [
 *   { role: 'assistant', content: `Previous context: ${summary}` },
 *   ...recentMessages
 * ];
 */
export async function compactConversation(
  messages: ConversationMessage[],
  options: CompactionOptions = {}
): Promise<CompactedConversation> {
  const minRecent = options.minRecentMessages ?? DEFAULT_MIN_RECENT_MESSAGES;

  // Handle edge cases
  if (messages.length === 0) {
    return { summary: '', recentMessages: [] };
  }

  if (messages.length === 1) {
    return { summary: '', recentMessages: messages };
  }

  // Determine split point - keep at least minRecent messages, or 50% if fewer
  const splitPoint = Math.max(
    0,
    Math.min(
      Math.floor(messages.length / 2),
      messages.length - minRecent
    )
  );

  const olderMessages = messages.slice(0, splitPoint);
  const recentMessages = messages.slice(splitPoint);

  // If no older messages to summarize, return as-is
  if (olderMessages.length === 0) {
    return { summary: '', recentMessages };
  }

  // Create Anthropic client
  const client = new Anthropic({
    apiKey: config.anthropicApiKey,
  });

  // Build the summarization prompt
  const summarizationPrompt = `Summarize this conversation history into a structured format.

Preserve and organize into these sections:

## Preferences
User preferences, communication style, and stated requirements.

## Facts
Key facts, data, and decisions that were established.

## Previous Discussion
Brief summary of topics discussed and conclusions reached.

Conversation to summarize:
${olderMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n')}

Provide a concise, well-structured summary.`;

  // Use Claude to summarize older conversation with structured output (AC#3)
  // Wrapped in retry logic for transient API failures (M3 fix)
  const summaryResponse = await retryWithBackoff(
    () =>
      client.messages.create({
        model: SUMMARIZATION_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: summarizationPrompt,
          },
        ],
      }),
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (attempt, error) => {
        logger.warn({
          event: 'compaction_summarization_retry',
          attempt,
          error: error.message,
        });
      },
      shouldRetry: (error) => {
        // Retry on rate limits, timeouts, and transient API errors
        const message = error instanceof Error ? error.message : String(error);
        return /rate.?limit|timeout|overloaded|503|529|429/i.test(message);
      },
    }
  );

  // Extract summary text
  const summary =
    summaryResponse.content[0].type === 'text'
      ? summaryResponse.content[0].text
      : '';

  return { summary, recentMessages };
}

/**
 * Calculate total token count for conversation messages
 *
 * @param messages - Array of conversation messages
 * @returns Total estimated token count
 */
export function calculateContextTokens(messages: ConversationMessage[]): number {
  if (messages.length === 0) return 0;

  return messages.reduce((total, msg) => {
    return total + estimateTokenCount(msg.content);
  }, 0);
}

/**
 * Full compaction result with logging metrics
 */
export interface CompactionResultWithMessages extends CompactionResult {
  /** Compacted messages ready for use */
  compactedMessages: ConversationMessage[];
}

/**
 * Compact conversation with Langfuse logging (AC#5)
 *
 * Creates a Langfuse span for the compaction operation and logs:
 * - Pre/post token counts
 * - Preserved information summary
 * - Compaction event for frequency tracking
 *
 * @param messages - Full conversation history
 * @param parentTrace - Langfuse trace for observability
 * @param options - Compaction options
 * @returns Full compaction result with metrics
 */
export async function compactWithLogging(
  messages: ConversationMessage[],
  parentTrace: LangfuseTrace,
  options: CompactionOptions = {}
): Promise<CompactionResultWithMessages> {
  const originalTokens = calculateContextTokens(messages);

  // Create Langfuse span for compaction
  const span = parentTrace.span({
    name: 'context-compaction',
    input: {
      messageCount: messages.length,
      originalTokens,
      threshold: TOKEN_LIMIT * COMPACTION_THRESHOLD,
    },
  });

  try {
    // Perform compaction
    const { summary, recentMessages } = await compactConversation(messages, options);

    // Build compacted context
    const compactedMessages = buildCompactedContext(summary, recentMessages);
    const compactedTokens = calculateContextTokens(compactedMessages);

    // Extract preserved items from summary sections
    const preservedItems = extractPreservedItems(summary);

    // Log compaction event for frequency tracking
    logger.info({
      event: 'context_compaction',
      originalTokens,
      compactedTokens,
      tokensSaved: originalTokens - compactedTokens,
      compressionRatio: compactedTokens / originalTokens,
      messagesCompacted: messages.length - recentMessages.length,
      preservedItemCount: preservedItems.length,
    });

    // End span with output
    span.end({
      output: {
        compactedTokens,
        tokensSaved: originalTokens - compactedTokens,
        compressionRatio: compactedTokens / originalTokens,
        preservedItems,
      },
    });

    return {
      originalTokens,
      compactedTokens,
      preservedItems,
      compactedMessages,
    };
  } catch (error) {
    // Log error and end span
    logger.error({
      event: 'context_compaction_error',
      error: error instanceof Error ? error.message : String(error),
    });

    span.end({
      output: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

/**
 * Extract preserved items from structured summary
 */
function extractPreservedItems(summary: string): string[] {
  if (!summary) return [];

  const items: string[] = [];

  // Look for section headers and their content
  const sections = ['Preferences', 'Facts', 'Previous Discussion'];
  for (const section of sections) {
    if (summary.includes(section)) {
      items.push(section);
    }
  }

  return items;
}

/**
 * Build a compacted context array for seamless continuation (AC#4)
 *
 * Prepends the summary as context, then includes recent messages.
 * This allows the conversation to continue naturally without
 * visible interruption to the user.
 *
 * @param summary - Summary of older messages
 * @param recentMessages - Recent messages to preserve
 * @returns New message array ready for agent use
 */
export function buildCompactedContext(
  summary: string,
  recentMessages: ConversationMessage[]
): ConversationMessage[] {
  // If no summary, just return recent messages
  if (!summary) {
    return recentMessages;
  }

  // Prepend summary as a context message
  const contextMessage: ConversationMessage = {
    role: 'user',
    content: `[Previous context from earlier in our conversation]\n\n${summary}\n\n[End of previous context]`,
  };

  return [contextMessage, ...recentMessages];
}

