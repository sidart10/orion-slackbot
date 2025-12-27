/**
 * Tool execution wrapper: timeout + retry + observability + Claude-facing formatting.
 *
 * Always returns ToolResult<string> (never throws).
 *
 * @see Story 3.3 - Tool Execution & Error Handling
 * @see NFR21 - 30 second timeout per tool call
 * @see NFR15 - Retry with exponential backoff for transient failures
 */

import type { ToolResult } from '../utils/tool-result.js';
import type { ToolError } from '../utils/tool-result.js';
import { formatErrorForClaude, toToolError } from './errors.js';
import { withRetry } from './retry.js';
import { withTimeout } from './timeout.js';
import { endToolExecuteSpan, logToolRetry, startToolExecuteSpan } from './observability.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

export interface ExecuteToolOptions {
  timeoutMs?: number;
  maxRetries?: number;
  traceId: string;
}

export type RouteToolCall = (input: {
  toolName: string;
  toolUseId: string;
  args: Record<string, unknown>;
  traceId: string;
  signal: AbortSignal;
}) => Promise<ToolResult<unknown>>;

export async function executeTool(
  toolName: string,
  toolUseId: string,
  args: Record<string, unknown>,
  routeToolCall: RouteToolCall,
  options: ExecuteToolOptions
): Promise<ToolResult<string>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const traceId = options.traceId;

  const started = startToolExecuteSpan({ toolName, traceId, timeoutMs, maxRetries });

  const startMs = Date.now();
  let attempts = 0;

  try {
    const raw = await withRetry(
      async () => {
        attempts += 1;

        const result = await withTimeout(
          async (signal) =>
            routeToolCall({
              toolName,
              toolUseId,
              args,
              traceId,
              signal,
            }),
          timeoutMs
        );

        if (result.success) return result;

        // Normalize error codes/messages for retry policy + downstream formatting.
        return { success: false, error: normalizeToolError(result.error) };
      },
      {
        maxAttempts: maxRetries,
        onRetry: ({ attempt, delayMs, error }) => {
          logToolRetry({
            traceId,
            toolName,
            attempt,
            delayMs,
            code: error.code,
            message: error.message,
          });
        },
      }
    );

    const durationMs = Date.now() - startMs;

    if (raw.success) {
      endToolExecuteSpan(started?.span ?? null, {
        toolName,
        traceId,
        durationMs,
        attempts,
        success: true,
      });

      return { success: true, data: toClaudeToolContent(raw.data) };
    }

    endToolExecuteSpan(started?.span ?? null, {
      toolName,
      traceId,
      durationMs,
      attempts,
      success: false,
      errorCode: raw.error.code,
    });

    return {
      success: false,
      error: {
        ...raw.error,
        message: formatErrorForClaude(toolName, raw.error),
      },
    };
  } catch (e) {
    // Safety catch: this function must never throw.
    const durationMs = Date.now() - startMs;
    const err = toToolError(e);

    endToolExecuteSpan(started?.span ?? null, {
      toolName,
      traceId,
      durationMs,
      attempts,
      success: false,
      errorCode: err.code,
    });

    return {
      success: false,
      error: {
        ...err,
        message: formatErrorForClaude(toolName, err),
      },
    };
  }
}

/**
 * Normalize tool errors for consistent retry policy and Claude formatting.
 *
 * NOTE: Intentional Redundancy
 * ----------------------------
 * Rate-limit detection happens in multiple places:
 * 1. errors.ts toToolError() - parses "429" / "rate limit" from message
 * 2. This function - re-parses via toToolError(new Error(message))
 * 3. retry.ts getDelayMs() - checks code === 'RATE_LIMITED' for 30s backoff
 *
 * This redundancy is intentional for robustness:
 * - MCP servers may return errors with generic codes but "429" in message
 * - HTTP layer may return status codes that get stringified
 * - Re-parsing catches edge cases where code wasn't set correctly upstream
 *
 * The cost is minimal (string parsing) and ensures rate limits are never missed.
 */
function normalizeToolError(error: ToolError): ToolError {
  // Preserve explicitly classified errors - don't re-parse if already correct.
  if (
    error.code === 'RATE_LIMITED' ||
    error.code === 'MCP_CONNECTION_FAILED' ||
    error.code === 'TOOL_INVALID_INPUT' ||
    error.code === 'TOOL_UNAVAILABLE' ||
    error.code === 'TOOL_NOT_FOUND'
  ) {
    return error;
  }

  // Re-parse message to catch rate limits, timeouts, network errors in generic errors.
  const normalized = toToolError(new Error(error.message));

  // Preserve caller's retryability signal (e.g., HTTP 5xx from MCP client sets retryable=true).
  if (error.retryable) normalized.retryable = true;

  return normalized;
}

function toClaudeToolContent(data: unknown): string {
  if (typeof data === 'string') return data;

  if (data && typeof data === 'object') {
    // Common MCP success shape: { content: [{ type: 'text', text: '...' }, ...] }
    if ('content' in data && Array.isArray((data as { content?: unknown }).content)) {
      const blocks = (data as { content: Array<{ text?: unknown }> }).content;
      const texts = blocks
        .map((b) => (typeof b.text === 'string' ? b.text : ''))
        .filter((t) => t.length > 0);
      if (texts.length > 0) return texts.join('\n');
    }
  }

  return JSON.stringify(data);
}


