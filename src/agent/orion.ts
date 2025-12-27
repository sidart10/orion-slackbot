/**
 * Orion Agent Core Module
 *
 * Public streaming entry point for Orion.
 *
 * Story 2.2 refactors the canonical loop into `src/agent/loop.ts`.
 * This module remains the stable API used by Slack handlers.
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see AC#1 - Messages passed to Anthropic API via messages.create() with streaming
 * @see AC#3 - Response streamed back to Slack
 * @see AC#5 - Response time 1-3 seconds (NFR1)
 */

import { executeAgentLoop } from './loop.js';
import type { LangfuseTrace } from '../observability/langfuse.js';
import type { NewLangfuseSpan } from '../observability/tracing.js';
import type { ContextSource } from './gather.js';
import { randomUUID } from 'node:crypto';
import { executeTool as executeToolWithPolicies } from '../tools/executor.js';
import { executeToolCall } from '../tools/router.js';

/**
 * Context for agent execution.
 * Includes thread history, user info, and optional trace ID for observability.
 */
export interface AgentContext {
  /** Conversation history from the thread */
  threadHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Slack user ID */
  userId: string;
  /** Slack channel ID */
  channelId: string;
  /** Langfuse trace ID for observability correlation */
  traceId?: string;
}

/**
 * Options for running the Orion agent.
 */
export interface AgentOptions {
  /** Agent execution context */
  context: AgentContext;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Optional Langfuse trace/span for phase-level spans (Story 2.2) - accepts both legacy and new SDK types */
  trace?: LangfuseTrace | NewLangfuseSpan;
  /** Optional status hook (Story 2.2 FR47) */
  setStatus?: (params: {
    phase: 'gather' | 'act' | 'tool' | 'verify' | 'final';
    toolName?: string | null;
  }) => void | Promise<void>;
}

/**
 * Source gathered during the gather phase.
 * Re-exported from gather.ts for convenience.
 */
export type { ContextSource } from './gather.js';

/**
 * Result metadata from agent execution.
 * Available after the generator completes.
 */
export interface AgentResult {
  /** Total input tokens used */
  inputTokens: number;
  /** Total output tokens generated */
  outputTokens: number;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether NFR1 (1-3s response time) was met */
  nfr1Met: boolean;
  /** Sources gathered during the gather phase (Story 2.7) */
  sources?: ContextSource[];
}

/**
 * Run the Orion agent with a user message.
 *
 * Uses Anthropic's streaming messages API for real-time response delivery.
 * Yields text chunks as they arrive for immediate streaming to Slack.
 *
 * @param userMessage - The user's message text
 * @param options - Agent context and configuration
 * @yields Text chunks from the agent response
 *
 * @example
 * ```typescript
 * const response = runOrionAgent('Hello!', {
 *   context: { threadHistory: [], userId: 'U123', channelId: 'C456' },
 *   systemPrompt: 'You are Orion, a helpful assistant.',
 * });
 *
 * for await (const chunk of response) {
 *   await streamer.append(chunk);
 * }
 * ```
 */
export async function* runOrionAgent(
  userMessage: string,
  options: AgentOptions
): AsyncGenerator<string, AgentResult, undefined> {
  const effectiveTraceId = options.context.traceId ?? randomUUID();

  const loop = executeAgentLoop(userMessage, {
    context: { ...options.context, traceId: effectiveTraceId },
    systemPrompt: options.systemPrompt,
    trace: options.trace,
    setStatus: options.setStatus,
    executeTool: async ({ name, toolUseId, input }) => {
      const args =
        input && typeof input === 'object' && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : null;

      if (!args) {
        return JSON.stringify({
          success: false,
          error: {
            code: 'TOOL_INVALID_INPUT',
            message: 'Tool input must be an object',
            retryable: false,
          },
        });
      }

      const result = await executeToolWithPolicies(
        name,
        toolUseId,
        args,
        executeToolCall,
        { traceId: effectiveTraceId }
      );

      // The agent loop expects tool_result.content to always be a string.
      // We pass success payload or formatted error message (AC#6).
      return result.success ? result.data : result.error.message;
    },
  });

  // NOTE: for-await-of does NOT expose the generator's return value.
  // We manually consume to preserve the AgentResult return value contract.
  while (true) {
    const next = await loop.next();
    if (next.done) {
      return next.value;
    }
    yield next.value;
  }
}

/**
 * Rough token estimate for pre-call planning.
 * Uses ~4 chars per token as approximation.
 *
 * Note: Actual token counts are available from `stream.finalMessage().usage`
 * after the API call completes. This function is useful for pre-flight
 * estimates (e.g., context compaction decisions).
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 *
 * @see Story 2.6 - Context Compaction (uses this for pre-compaction estimates)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

