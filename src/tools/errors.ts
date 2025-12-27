/**
 * Tool error normalization and LLM-facing formatting.
 *
 * @see Story 3.3 - Tool Execution & Error Handling
 * @see AC#6 - MCP { isError: true } becomes tool_result content (never throw)
 * @see AC#7 - 429 becomes RATE_LIMITED with retry
 */

import type { ToolError } from '../utils/tool-result.js';
import { isRetryable } from '../utils/tool-result.js';

type McpErrorContentLike = {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
};

function isMcpErrorContentLike(value: unknown): value is McpErrorContentLike {
  if (!value || typeof value !== 'object') return false;
  return 'isError' in value && 'content' in value;
}

function extractMcpErrorMessage(value: McpErrorContentLike): string {
  const blocks = Array.isArray(value.content) ? value.content : [];
  const texts = blocks
    .map((b) => (typeof b?.text === 'string' ? b.text : ''))
    .filter((t) => t.length > 0);

  if (texts.length > 0) return texts.join('\n');
  return 'MCP tool returned an error response';
}

export function toToolError(e: unknown): ToolError {
  // MCP tools/call can return { isError: true, content: [...] } inside "success" payloads.
  // We normalize it to ToolError so callers can return it to Claude as tool_result content.
  if (isMcpErrorContentLike(e) && e.isError === true) {
    return {
      code: 'TOOL_EXECUTION_FAILED',
      message: extractMcpErrorMessage(e),
      retryable: false,
    };
  }

  const message = e instanceof Error ? e.message : String(e);
  const m = message.toLowerCase();

  if (m.includes('429') || m.includes('rate limit')) {
    return { code: 'RATE_LIMITED', message, retryable: true };
  }

  if (
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('aborted') ||
    (e instanceof Error && e.name === 'AbortError')
  ) {
    return { code: 'TOOL_EXECUTION_FAILED', message, retryable: true };
  }

  if (
    m.includes('econnrefused') ||
    m.includes('econnreset') ||
    m.includes('network') ||
    m.includes('dns')
  ) {
    return { code: 'MCP_CONNECTION_FAILED', message, retryable: true };
  }

  if (m.includes('401') || m.includes('403')) {
    return { code: 'TOOL_UNAVAILABLE', message: `Auth error: ${message}`, retryable: false };
  }

  if (m.includes('400') || m.includes('404')) {
    return { code: 'TOOL_INVALID_INPUT', message, retryable: false };
  }

  return { code: 'TOOL_EXECUTION_FAILED', message, retryable: isRetryable(e) };
}

export function formatErrorForClaude(toolName: string, error: ToolError): string {
  if (error.code === 'RATE_LIMITED') {
    return `The ${toolName} tool is rate limited right now. Please wait a bit and try again.`;
  }
  if (error.code === 'TOOL_INVALID_INPUT') {
    return `The ${toolName} tool request was invalid. Try rephrasing or providing required fields.`;
  }
  if (error.code === 'TOOL_NOT_FOUND') {
    return `The ${toolName} tool is not available.`;
  }
  if (error.code === 'MCP_CONNECTION_FAILED') {
    return `I couldn't reach the ${toolName} tool service. Try again in a moment.`;
  }
  if (error.code === 'TOOL_UNAVAILABLE') {
    return `The ${toolName} tool is unavailable right now.`;
  }
  return `The ${toolName} tool failed. Try again or use a different approach.`;
}


