/**
 * Tool result types and helpers.
 *
 * Canonical ToolResult<T> shape for all tool handlers.
 *
 * @see Project Context - Tool Handler Pattern (MANDATORY)
 */

export type ToolErrorCode =
  | 'TOOL_NOT_IMPLEMENTED'
  | 'TOOL_INVALID_INPUT'
  | 'TOOL_UNAVAILABLE'
  | 'TOOL_EXECUTION_FAILED'
  | 'TOOL_TIMEOUT'
  | 'RATE_LIMITED'
  | 'MCP_CONNECTION_FAILED'
  | 'TOOL_NOT_FOUND'
  | 'MEMORY_NOT_FOUND'
  | 'MEMORY_WRITE_FAILED'
  | 'SKILL_NOT_GKE'; // Story 6.12: Skill should use Anthropic container (PTC), not GKE sandbox

export type ToolError = {
  code: ToolErrorCode;
  message: string;
  retryable: boolean;
};

export type ToolResult<T = unknown> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ToolError;
    };

/**
 * Best-effort classifier for retryable errors.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors, rate limits, and temporary failures are retryable
    return (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    );
  }
  return false;
}


