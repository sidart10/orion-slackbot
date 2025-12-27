import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout } from './timeout.js';
import type { ToolResult } from '../utils/tool-result.js';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns timeout ToolResult after timeoutMs, and aborts the signal', async () => {
    let receivedSignal: AbortSignal | null = null;

    const promise = withTimeout<string>(
      async (signal) => {
        receivedSignal = signal;
        // Never resolve; simulate a stuck tool call that ignores abort.
        await new Promise<void>(() => undefined);
        return { success: true, data: 'unreachable' };
      },
      1000
    );

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
      expect(result.error.retryable).toBe(true);
    }

    expect(receivedSignal).not.toBeNull();
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('returns the underlying ToolResult when it resolves before timeout', async () => {
    const expected: ToolResult<string> = { success: true, data: 'ok' };

    const promise = withTimeout(async () => expected, 1000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(expected);
  });

  it('converts thrown errors into a ToolResult (no throw)', async () => {
    const promise = withTimeout(async () => {
      throw new Error('boom');
    }, 1000);

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
      expect(result.error.message).toContain('boom');
    }
  });
});


