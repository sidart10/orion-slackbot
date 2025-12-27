import { describe, it, expect } from 'vitest';
import { formatErrorForClaude, toToolError } from './errors.js';

describe('toToolError', () => {
  it('maps rate limit errors to RATE_LIMITED (retryable)', () => {
    const err = toToolError(new Error('429 Too Many Requests'));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryable).toBe(true);
  });

  it('maps timeout/abort errors to TOOL_EXECUTION_FAILED (retryable)', () => {
    expect(toToolError(new Error('timeout while calling API')).code).toBe('TOOL_EXECUTION_FAILED');
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    const e = toToolError(abortErr);
    expect(e.code).toBe('TOOL_EXECUTION_FAILED');
    expect(e.retryable).toBe(true);
  });

  it('maps network/connection errors to MCP_CONNECTION_FAILED (retryable)', () => {
    const err = toToolError(new Error('ECONNREFUSED'));
    expect(err.code).toBe('MCP_CONNECTION_FAILED');
    expect(err.retryable).toBe(true);
  });

  it('maps auth errors to TOOL_UNAVAILABLE (not retryable)', () => {
    const err = toToolError(new Error('401 Unauthorized'));
    expect(err.code).toBe('TOOL_UNAVAILABLE');
    expect(err.retryable).toBe(false);
  });

  it('maps 400/404 to TOOL_INVALID_INPUT (not retryable)', () => {
    const err = toToolError(new Error('404 Not Found'));
    expect(err.code).toBe('TOOL_INVALID_INPUT');
    expect(err.retryable).toBe(false);
  });

  it('maps MCP isError payloads to TOOL_EXECUTION_FAILED (not retryable)', () => {
    const err = toToolError({
      isError: true,
      content: [{ type: 'text', text: 'MCP failed' }],
    });
    expect(err.code).toBe('TOOL_EXECUTION_FAILED');
    expect(err.retryable).toBe(false);
    expect(err.message).toContain('MCP failed');
  });
});

describe('formatErrorForClaude', () => {
  it('produces concise, tool-specific messages', () => {
    const msg = formatErrorForClaude('search', {
      code: 'RATE_LIMITED',
      message: '429',
      retryable: true,
    });
    expect(msg).toContain('search');
    expect(msg.toLowerCase()).toContain('rate');
  });
});


