/**
 * Context Compaction Utilities
 *
 * Provides utilities for compacting long conversation history by summarizing
 * older messages while preserving key information. This allows long conversations
 * to continue without hitting context window limits.
 *
 * @see Story 2.6 - Context Compaction
 * @see NFR28 - Large context window model with compaction for long threads
 * @see FR5 - Manage conversation context across long-running threads
 */

import type Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

/**
 * A message in conversation history.
 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Result of context compaction.
 */
export interface CompactionResult {
  /** Compacted history with summary injected before kept messages */
  compactedHistory: HistoryMessage[];
  /** The summary text (empty if no compaction applied) */
  summary: string;
  /** Estimated tokens before compaction */
  originalEstimatedTokens: number;
  /** Estimated tokens after compaction */
  compactedEstimatedTokens: number;
  /** Whether compaction was actually applied */
  compactionApplied: boolean;
}

/**
 * Arguments for shouldTriggerCompaction.
 */
export interface CompactionThresholdArgs {
  /** Estimated current token count */
  estimatedTokens: number;
  /** Maximum context window tokens for the model */
  maxContextTokens: number;
  /** Threshold ratio (e.g., 0.8 = trigger at 80% of max) */
  threshold: number;
}

/**
 * Arguments for compactThreadHistory.
 */
export interface CompactThreadHistoryArgs {
  /** Current thread history */
  threadHistory: HistoryMessage[];
  /** The new user message (not yet in history) */
  userMessage: string;
  /** System prompt for token estimation */
  systemPrompt: string;
  /** Anthropic SDK client */
  anthropic: Anthropic;
  /** Model to use for summarization */
  model: string;
  /** Maximum tokens for the summary */
  maxSummaryTokens: number;
  /** Number of recent messages to keep verbatim */
  keepLastN: number;
  /** Optional trace ID for logging */
  traceId?: string;
}

/**
 * Conservative fallback for max context tokens when not explicitly configured.
 *
 * Story 2.6 mandates: do NOT hardcode model names or per-model context limits.
 * The caller should provide a maxContextTokens value via config/env; if not set,
 * we use this conservative fallback.
 */
const DEFAULT_MAX_CONTEXT_TOKENS = 100_000;

/**
 * Resolve the max context tokens for compaction decisions.
 *
 * @param args - Optional configured max context tokens
 * @returns Max context tokens to use for compaction threshold calculations
 */
export function resolveMaxContextTokens(args: {
  configuredMaxContextTokens?: number;
}): number {
  const n = args.configuredMaxContextTokens;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return Math.floor(n);
  }
  return DEFAULT_MAX_CONTEXT_TOKENS;
}

/**
 * Rough token estimate for text.
 * Uses ~4 chars per token as approximation.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens for a conversation context.
 *
 * @param args - System prompt, history, and user message
 * @returns Total estimated tokens
 */
export function estimateContextTokens(args: {
  systemPrompt: string;
  threadHistory: HistoryMessage[];
  userMessage: string;
}): number {
  const systemTokens = estimateTokens(args.systemPrompt);
  const historyTokens = args.threadHistory.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0
  );
  const userTokens = estimateTokens(args.userMessage);

  return systemTokens + historyTokens + userTokens;
}

/**
 * Determine if compaction should be triggered based on token count.
 *
 * @param args - Token count, max context, and threshold
 * @returns true if compaction should be triggered
 *
 * @example
 * ```typescript
 * const shouldCompact = shouldTriggerCompaction({
 *   estimatedTokens: 160000,
 *   maxContextTokens: 200000,
 *   threshold: 0.8, // 80%
 * });
 * // Returns true (160000 >= 200000 * 0.8 = 160000)
 * ```
 */
export function shouldTriggerCompaction(args: CompactionThresholdArgs): boolean {
  const thresholdTokens = Math.floor(args.maxContextTokens * args.threshold);
  return args.estimatedTokens >= thresholdTokens;
}

/**
 * Summarization prompt for compacting conversation history.
 * Designed to preserve critical information per Story 2.6 Task 3.
 */
const SUMMARIZATION_PROMPT = `You are summarizing a conversation to preserve critical context. Extract and structure the following:

## Preferences
- User formatting preferences (code style, response length, tone)
- Communication constraints or requests

## Facts & Decisions
- Key facts established (IDs, names, configurations)
- Decisions made and approaches chosen
- Tool outputs that are authoritative

## Open Items
- Unresolved questions or tasks
- TODOs mentioned by user or assistant
- Pending actions

## Key Context
- Project constraints (e.g., "always use ESM .js imports")
- Technical requirements mentioned
- Important background information

Be comprehensive but concise. Use bullet points. Preserve exact values (IDs, paths, names).
Do NOT include conversational filler or pleasantries.
Do NOT summarize the most recent messages - only summarize what you're given.`;

/**
 * Compact conversation history by summarizing older messages.
 *
 * Keeps the most recent messages verbatim to maintain conversational grounding,
 * and summarizes older messages into a single "context" message.
 *
 * This is best-effort: on any failure, returns the original history unchanged.
 *
 * @param args - Compaction arguments
 * @returns CompactionResult with compacted or original history
 *
 * @see Story 2.6 - Context Compaction
 * @see AC#2 - Older context summarized, recent messages kept verbatim
 * @see AC#3 - Key information preserved in summary
 */
export async function compactThreadHistory(
  args: CompactThreadHistoryArgs
): Promise<CompactionResult> {
  const {
    threadHistory,
    userMessage,
    systemPrompt,
    anthropic,
    model,
    maxSummaryTokens,
    keepLastN,
    traceId,
  } = args;

  // Calculate original token estimate
  const originalEstimatedTokens = estimateContextTokens({
    systemPrompt,
    threadHistory,
    userMessage,
  });

  // Not enough messages to warrant compaction
  if (threadHistory.length <= keepLastN) {
    return {
      compactedHistory: threadHistory,
      summary: '',
      originalEstimatedTokens,
      compactedEstimatedTokens: originalEstimatedTokens,
      compactionApplied: false,
    };
  }

  // Split history into messages to summarize and messages to keep
  const messagesToSummarize = threadHistory.slice(0, -keepLastN);
  const messagesToKeep = threadHistory.slice(-keepLastN);

  // Format messages for summarization
  const conversationText = messagesToSummarize
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  try {
    logger.info({
      event: 'compaction.summarizing',
      messagesToSummarize: messagesToSummarize.length,
      messagesToKeep: messagesToKeep.length,
      originalEstimatedTokens,
      ...(traceId && { traceId }),
    });

    // Call Anthropic to generate summary
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxSummaryTokens,
      system: SUMMARIZATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation history:\n\n${conversationText}`,
        },
      ],
    });

    // Extract text from response
    const summaryContent = response.content.find((block) => block.type === 'text');
    if (!summaryContent || summaryContent.type !== 'text') {
      throw new Error('No text content in summarization response');
    }

    const summary = summaryContent.text;

    // Build compacted history with summary as first message
    const summaryMessage: HistoryMessage = {
      role: 'assistant',
      content: `[Previous conversation summary]\n\n${summary}`,
    };

    const compactedHistory = [summaryMessage, ...messagesToKeep];

    // Calculate new token estimate
    const compactedEstimatedTokens = estimateContextTokens({
      systemPrompt,
      threadHistory: compactedHistory,
      userMessage,
    });

    logger.info({
      event: 'compaction.complete',
      originalMessages: threadHistory.length,
      compactedMessages: compactedHistory.length,
      originalEstimatedTokens,
      compactedEstimatedTokens,
      tokenReduction: originalEstimatedTokens - compactedEstimatedTokens,
      ...(traceId && { traceId }),
    });

    return {
      compactedHistory,
      summary,
      originalEstimatedTokens,
      compactedEstimatedTokens,
      compactionApplied: true,
    };
  } catch (error) {
    // Best-effort: on failure, return original history
    logger.warn({
      event: 'compaction.failed',
      error: error instanceof Error ? error.message : String(error),
      originalMessages: threadHistory.length,
      originalEstimatedTokens,
      ...(traceId && { traceId }),
    });

    return {
      compactedHistory: threadHistory,
      summary: '',
      originalEstimatedTokens,
      compactedEstimatedTokens: originalEstimatedTokens,
      compactionApplied: false,
    };
  }
}

