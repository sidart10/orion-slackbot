import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry.js';
import type { ToolResult } from '../utils/tool-result.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns success on first attempt', async () => {
    const fn = vi.fn<[], Promise<ToolResult<string>>>().mockResolvedValue({
      success: true,
      data: 'ok',
    });

    const resultPromise = withRetry(fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable ToolResult errors and returns success', async () => {
    const fn = vi
      .fn<[], Promise<ToolResult<string>>>()
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'TOOL_EXECUTION_FAILED', message: '503 Service Unavailable', retryable: true },
      })
      .mockResolvedValueOnce({ success: true, data: 'ok' });

    const resultPromise = withRetry(fn);

    // backoff for attempt=1 is 1s
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable ToolResult errors', async () => {
    const fn = vi.fn<[], Promise<ToolResult<string>>>().mockResolvedValue({
      success: false,
      error: { code: 'TOOL_INVALID_INPUT', message: 'bad request', retryable: false },
    });

    const resultPromise = withRetry(fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry 401/403/404 even if error.retryable=true', async () => {
    const fn = vi
      .fn<[], Promise<ToolResult<string>>>()
      .mockResolvedValue({
        success: false,
        error: { code: 'TOOL_EXECUTION_FAILED', message: '401 Unauthorized', retryable: true },
      });

    const resultPromise = withRetry(fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses 30s delay for RATE_LIMITED (429) and can succeed on retry', async () => {
    const fn = vi
      .fn<[], Promise<ToolResult<string>>>()
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'RATE_LIMITED', message: '429 Too Many Requests', retryable: true },
      })
      .mockResolvedValueOnce({ success: true, data: 'ok' });

    const resultPromise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops after maxAttempts and returns the last failure', async () => {
    const fn = vi.fn<[], Promise<ToolResult<string>>>().mockResolvedValue({
      success: false,
      error: { code: 'MCP_CONNECTION_FAILED', message: 'Network error', retryable: true },
    });

    const resultPromise = withRetry(fn, { maxAttempts: 3 });

    // attempt1 delay 1s, attempt2 delay 2s; attempt3 returns immediately
    await vi.advanceTimersByTimeAsync(1_000 + 2_000);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});


