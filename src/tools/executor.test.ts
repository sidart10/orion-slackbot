import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolResult } from '../utils/tool-result.js';

vi.mock('./observability.js', () => ({
  startToolExecuteSpan: vi.fn(() => ({ trace: {}, span: { end: vi.fn() } })),
  endToolExecuteSpan: vi.fn(),
  logToolRetry: vi.fn(),
}));

import { endToolExecuteSpan, logToolRetry } from './observability.js';
import { executeTool } from './executor.js';

describe('executeTool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns success on first attempt and stringifies non-string data', async () => {
    const route = vi.fn().mockResolvedValue({ success: true, data: { ok: true } } satisfies ToolResult);

    const resultPromise = executeTool('test', 'id-1', {}, route, { traceId: 'trace-1' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(JSON.stringify({ ok: true }));
    }
    expect(route).toHaveBeenCalledTimes(1);
    expect(endToolExecuteSpan).toHaveBeenCalled();
  });

  it('retries on retryable error and logs tool.retry', async () => {
    const route = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'TOOL_EXECUTION_FAILED', message: '503 Service Unavailable', retryable: true },
      } satisfies ToolResult)
      .mockResolvedValueOnce({ success: true, data: 'ok' } satisfies ToolResult);

    const resultPromise = executeTool('test', 'id-2', {}, route, { traceId: 'trace-2' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(route).toHaveBeenCalledTimes(2);
    expect(logToolRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-2',
        toolName: 'test',
      })
    );
  });

  it('does not retry non-retryable errors', async () => {
    const route = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'TOOL_UNAVAILABLE', message: '401 Unauthorized', retryable: false },
    } satisfies ToolResult);

    const resultPromise = executeTool('test', 'id-3', {}, route, { traceId: 'trace-3' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('uses 30s delay for rate limit errors', async () => {
    const route = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'TOOL_EXECUTION_FAILED', message: '429 Too Many Requests', retryable: true },
      } satisfies ToolResult)
      .mockResolvedValueOnce({ success: true, data: 'ok' } satisfies ToolResult);

    const resultPromise = executeTool('test', 'id-4', {}, route, { traceId: 'trace-4' });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(route).toHaveBeenCalledTimes(2);
  });

  it('returns TOOL_EXECUTION_FAILED on timeout', async () => {
    const route = vi.fn().mockImplementation(async () => {
      await new Promise<void>(() => undefined);
      return { success: true, data: 'unreachable' } satisfies ToolResult;
    });

    const resultPromise = executeTool(
      'test',
      'id-5',
      {},
      route,
      { traceId: 'trace-5', timeoutMs: 1000, maxRetries: 1 }
    );

    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
    }
  });

  it('extracts text from MCP content block arrays (AC#6 normalization)', async () => {
    const mcpResponse = {
      content: [
        { type: 'text', text: 'First block' },
        { type: 'text', text: 'Second block' },
      ],
    };
    const route = vi.fn().mockResolvedValue({ success: true, data: mcpResponse } satisfies ToolResult);

    const resultPromise = executeTool('mcp_tool', 'id-6', {}, route, { traceId: 'trace-6' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    if (result.success) {
      // Should extract and join text from content blocks, not JSON.stringify
      expect(result.data).toBe('First block\nSecond block');
    }
  });

  it('JSON-stringifies MCP content with empty text blocks', async () => {
    const mcpResponse = {
      content: [
        { type: 'image', data: 'base64...' }, // No text field
      ],
    };
    const route = vi.fn().mockResolvedValue({ success: true, data: mcpResponse } satisfies ToolResult);

    const resultPromise = executeTool('mcp_tool', 'id-7', {}, route, { traceId: 'trace-7' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    if (result.success) {
      // Falls back to JSON.stringify when no text content found
      expect(result.data).toBe(JSON.stringify(mcpResponse));
    }
  });
});


