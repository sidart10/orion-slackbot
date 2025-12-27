/**
 * Tool-level observability helpers (Langfuse).
 *
 * NOTE: Trace Hierarchy
 * ---------------------
 * The agent loop (`loop.ts`) already creates `tool.${name}` spans under the agent trace.
 * This module creates ADDITIONAL `tool.execute` traces linked via `sessionId: traceId`.
 *
 * This means Langfuse shows:
 * - Agent trace → contains tool spans (from loop.ts)
 * - tool.execute traces → independent, linked by session (from executor.ts)
 *
 * Both contain the required data (tool name, duration, attempts, success, errorCode).
 * The duplication enables independent tool analytics without requiring parent trace objects
 * to be passed through the entire call stack.
 *
 * Future improvement: Pass parent span to executor for a cleaner hierarchy.
 *
 * @see Story 3.3 - Tool Execution & Error Handling (AC#5)
 */

import { getLangfuse, type LangfuseSpan, type LangfuseTrace } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';

export type ToolExecuteSpan = {
  trace: LangfuseTrace;
  span: LangfuseSpan;
};

/**
 * Start a tool.execute trace + span for independent tool-level observability.
 *
 * Creates a NEW trace (not a child span) linked via sessionId. See module doc for rationale.
 */
export function startToolExecuteSpan(params: {
  toolName: string;
  traceId: string;
  timeoutMs: number;
  maxRetries: number;
}): ToolExecuteSpan | null {
  const lf = getLangfuse();
  if (!lf) return null;

  const trace = lf.trace({
    name: 'tool.execute',
    sessionId: params.traceId,
    input: { tool: params.toolName },
    metadata: {
      traceId: params.traceId,
      tool: params.toolName,
      timeoutMs: params.timeoutMs,
      maxRetries: params.maxRetries,
    },
  });

  const span = trace.span({
    name: 'tool.execute',
    input: { tool: params.toolName },
    metadata: {
      traceId: params.traceId,
      tool: params.toolName,
    },
  });

  return { trace, span };
}

export function endToolExecuteSpan(
  span: LangfuseSpan | null,
  params: {
    toolName: string;
    traceId: string;
    durationMs: number;
    attempts: number;
    success: boolean;
    errorCode?: string;
  }
): void {
  span?.end({
    metadata: {
      traceId: params.traceId,
      tool: params.toolName,
      durationMs: params.durationMs,
      attempts: params.attempts,
      success: params.success,
      errorCode: params.errorCode,
    },
  });
}

export function logToolRetry(params: {
  traceId: string;
  toolName: string;
  attempt: number;
  delayMs: number;
  code: string;
  message: string;
}): void {
  logger.warn({
    event: 'tool.retry',
    traceId: params.traceId,
    tool: params.toolName,
    attempt: params.attempt,
    delayMs: params.delayMs,
    code: params.code,
    error: params.message,
  });
}


