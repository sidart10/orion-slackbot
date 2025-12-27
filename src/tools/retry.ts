/**
 * Retry wrapper for tool execution.
 *
 * Implements a small retry policy for transient failures:
 * - Max 3 total attempts
 * - Exponential backoff (1s, 2s, 4s)
 * - 429 / RATE_LIMITED uses 30s backoff
 * - No retries on 400/401/403/404
 *
 * Always returns ToolResult<T> (never throws).
 *
 * @see Story 3.3 - Tool Execution & Error Handling
 * @see NFR15 - Retry with exponential backoff for transient failures
 */

import type { ToolError, ToolResult } from '../utils/tool-result.js';
import { isRetryable } from '../utils/tool-result.js';

export async function withRetry<T>(
  fn: () => Promise<ToolResult<T>>,
  options?: {
    maxAttempts?: number;
    onRetry?: (params: { attempt: number; delayMs: number; error: ToolError }) => void;
  }
): Promise<ToolResult<T>> {
  const maxAttempts = options?.maxAttempts ?? 3;

  let last: ToolResult<T> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      last = result;

      if (result.success) return result;

      const err = result.error;
      if (!shouldRetry(err)) return result;
      if (attempt === maxAttempts) return result;

      const delayMs = getDelayMs(err, attempt);
      options?.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    } catch (e: unknown) {
      const err: ToolError = {
        code: 'TOOL_EXECUTION_FAILED',
        message: e instanceof Error ? e.message : String(e),
        retryable: isRetryable(e),
      };
      last = { success: false, error: err };

      if (!shouldRetry(err)) return last;
      if (attempt === maxAttempts) return last;

      const delayMs = getDelayMs(err, attempt);
      options?.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }

  return (
    last ?? {
      success: false,
      error: { code: 'TOOL_EXECUTION_FAILED', message: 'Unknown tool failure', retryable: true },
    }
  );
}

function shouldRetry(err: ToolError): boolean {
  if (!err.retryable) return false;

  const m = err.message.toLowerCase();

  // Never retry client/auth errors.
  if (m.includes('400') || m.includes('401') || m.includes('403') || m.includes('404')) {
    return false;
  }

  return true;
}

function getDelayMs(err: ToolError, attempt: number): number {
  if (err.code === 'RATE_LIMITED') return 30_000;
  return 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


