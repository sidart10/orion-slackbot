/**
 * Timeout wrapper for tool execution.
 *
 * Uses AbortController for cancellation propagation and guarantees a ToolResult
 * is returned on timeout.
 *
 * @see Story 3.3 - Tool Execution & Error Handling
 * @see NFR21 - 30 second timeout per tool call
 */

import type { ToolResult } from '../utils/tool-result.js';
import { isRetryable } from '../utils/tool-result.js';

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<ToolResult<T>>,
  timeoutMs: number
): Promise<ToolResult<T>> {
  const controller = new AbortController();

  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<ToolResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: `Timeout after ${timeoutMs}ms`,
          retryable: true,
        },
      });
    }, timeoutMs);
  });

  const fnPromise = fn(controller.signal).catch((e: unknown) => {
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: e instanceof Error ? e.message : String(e),
        retryable: isRetryable(e),
      },
    } satisfies ToolResult<T>;
  });

  try {
    return await Promise.race([fnPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}


