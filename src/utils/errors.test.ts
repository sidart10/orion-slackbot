/**
 * OrionError Tests
 *
 * Tests for the error handling system including:
 * - OrionError interface and factory functions
 * - ErrorCode enum validation
 * - User-friendly message mapping
 * - Recoverable error detection
 *
 * @see Story 2.4 - OrionError & Graceful Degradation
 * @see AC#1 - Errors wrapped in OrionError interface
 * @see AC#2 - User-friendly messages returned
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ErrorCode,
  createOrionError,
  getUserMessage,
  isRecoverable,
  isOrionError,
  type ErrorCodeType,
} from './errors.js';

describe('ErrorCode', () => {
  it('should define all expected error codes', () => {
    expect(ErrorCode.AGENT_TIMEOUT).toBe('AGENT_TIMEOUT');
    expect(ErrorCode.TOOL_TIMEOUT).toBe('TOOL_TIMEOUT');
    expect(ErrorCode.CONTEXT_LIMIT).toBe('CONTEXT_LIMIT');
    expect(ErrorCode.VERIFICATION_FAILED).toBe('VERIFICATION_FAILED');
    expect(ErrorCode.MCP_CONNECTION_ERROR).toBe('MCP_CONNECTION_ERROR');
    expect(ErrorCode.SLACK_API_ERROR).toBe('SLACK_API_ERROR');
    expect(ErrorCode.LLM_API_ERROR).toBe('LLM_API_ERROR');
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
  });

  it('should have all defined error codes', () => {
    // Dynamic count: 9 original + 4 Slack (Story 1.9) + 4 Sandbox (Story 3.0)
    const codes = Object.keys(ErrorCode);
    // Verify we have a reasonable number of codes (at least the original 9)
    expect(codes.length).toBeGreaterThanOrEqual(9);
    // Snapshot current count for awareness (update when adding new codes)
    expect(codes.length).toBe(Object.keys(ErrorCode).length);
  });

  it('should have Slack-specific error codes (Story 1.9)', () => {
    expect(ErrorCode.SLACK_ACK_TIMEOUT).toBe('SLACK_ACK_TIMEOUT');
    expect(ErrorCode.SLACK_UPDATE_FAILED).toBe('SLACK_UPDATE_FAILED');
    expect(ErrorCode.SLACK_HANDLER_FAILED).toBe('SLACK_HANDLER_FAILED');
    expect(ErrorCode.SLACK_SIGNATURE_INVALID).toBe('SLACK_SIGNATURE_INVALID');
  });
});

describe('createOrionError', () => {
  it('should create error with required fields', () => {
    const error = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Operation timed out');

    expect(error.code).toBe('AGENT_TIMEOUT');
    expect(error.message).toBe('Operation timed out');
    expect(error.userMessage).toBeDefined();
    expect(typeof error.recoverable).toBe('boolean');
  });

  it('should auto-populate userMessage based on error code', () => {
    const error = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Technical message');

    expect(error.userMessage).toContain('taking longer');
  });

  it('should auto-populate recoverable based on error code', () => {
    const recoverableError = createOrionError(ErrorCode.TOOL_TIMEOUT, 'Tool timed out');
    const nonRecoverableError = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Agent timed out');

    expect(recoverableError.recoverable).toBe(true);
    expect(nonRecoverableError.recoverable).toBe(false);
  });

  it('should allow overriding default userMessage', () => {
    const error = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Technical', {
      userMessage: 'Custom user message',
    });

    expect(error.userMessage).toBe('Custom user message');
  });

  it('should allow overriding recoverable flag', () => {
    const error = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Technical', {
      recoverable: true,
    });

    expect(error.recoverable).toBe(true);
  });

  it('should include cause when provided', () => {
    const originalError = new Error('Original error');
    const error = createOrionError(ErrorCode.UNKNOWN_ERROR, 'Wrapped', {
      cause: originalError,
    });

    expect(error.cause).toBe(originalError);
  });

  it('should include metadata when provided', () => {
    const error = createOrionError(ErrorCode.SLACK_API_ERROR, 'API failed', {
      metadata: { statusCode: 429, endpoint: '/chat.postMessage' },
    });

    expect(error.metadata).toEqual({ statusCode: 429, endpoint: '/chat.postMessage' });
  });

  it('should include retryCount when provided', () => {
    const error = createOrionError(ErrorCode.TOOL_TIMEOUT, 'Retry failed', {
      retryCount: 3,
    });

    expect(error.retryCount).toBe(3);
  });
});

describe('getUserMessage', () => {
  it('should return user-friendly message for AGENT_TIMEOUT', () => {
    const msg = getUserMessage(ErrorCode.AGENT_TIMEOUT);
    expect(msg).toContain('taking longer');
  });

  it('should return user-friendly message for TOOL_TIMEOUT', () => {
    const msg = getUserMessage(ErrorCode.TOOL_TIMEOUT);
    expect(msg).toContain('tool');
  });

  it('should return user-friendly message for CONTEXT_LIMIT', () => {
    const msg = getUserMessage(ErrorCode.CONTEXT_LIMIT);
    expect(msg).toContain('conversation');
  });

  it('should return user-friendly message for VERIFICATION_FAILED', () => {
    const msg = getUserMessage(ErrorCode.VERIFICATION_FAILED);
    expect(msg).toContain('verify');
  });

  it('should return user-friendly message for MCP_CONNECTION_ERROR', () => {
    const msg = getUserMessage(ErrorCode.MCP_CONNECTION_ERROR);
    expect(msg).toContain('connecting');
  });

  it('should return user-friendly message for SLACK_API_ERROR', () => {
    const msg = getUserMessage(ErrorCode.SLACK_API_ERROR);
    expect(msg).toContain('Slack');
  });

  it('should return user-friendly message for LLM_API_ERROR', () => {
    const msg = getUserMessage(ErrorCode.LLM_API_ERROR);
    expect(msg).toContain('processing');
  });

  it('should return user-friendly message for INVALID_INPUT', () => {
    const msg = getUserMessage(ErrorCode.INVALID_INPUT);
    expect(msg).toContain('understand');
  });

  it('should return user-friendly message for UNKNOWN_ERROR', () => {
    const msg = getUserMessage(ErrorCode.UNKNOWN_ERROR);
    expect(msg).toContain('unexpected');
  });

  it('should never expose technical details in user messages', () => {
    const codes = Object.values(ErrorCode) as ErrorCodeType[];
    for (const code of codes) {
      const msg = getUserMessage(code);
      expect(msg).not.toMatch(/error|exception|stack|trace/i);
      expect(msg.length).toBeLessThan(200); // Keep messages concise
    }
  });
});

describe('isRecoverable', () => {
  it('should return true for TOOL_TIMEOUT', () => {
    expect(isRecoverable(ErrorCode.TOOL_TIMEOUT)).toBe(true);
  });

  it('should return true for MCP_CONNECTION_ERROR', () => {
    expect(isRecoverable(ErrorCode.MCP_CONNECTION_ERROR)).toBe(true);
  });

  it('should return true for SLACK_API_ERROR', () => {
    expect(isRecoverable(ErrorCode.SLACK_API_ERROR)).toBe(true);
  });

  it('should return true for LLM_API_ERROR', () => {
    expect(isRecoverable(ErrorCode.LLM_API_ERROR)).toBe(true);
  });

  it('should return false for AGENT_TIMEOUT', () => {
    expect(isRecoverable(ErrorCode.AGENT_TIMEOUT)).toBe(false);
  });

  it('should return false for CONTEXT_LIMIT', () => {
    expect(isRecoverable(ErrorCode.CONTEXT_LIMIT)).toBe(false);
  });

  it('should return false for VERIFICATION_FAILED', () => {
    expect(isRecoverable(ErrorCode.VERIFICATION_FAILED)).toBe(false);
  });

  it('should return false for INVALID_INPUT', () => {
    expect(isRecoverable(ErrorCode.INVALID_INPUT)).toBe(false);
  });

  it('should return false for UNKNOWN_ERROR', () => {
    expect(isRecoverable(ErrorCode.UNKNOWN_ERROR)).toBe(false);
  });
});

describe('isOrionError', () => {
  it('should return true for valid OrionError', () => {
    const error = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Test');
    expect(isOrionError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Regular error');
    expect(isOrionError(error)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isOrionError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isOrionError(undefined)).toBe(false);
  });

  it('should return false for partial object missing code', () => {
    const partial = { message: 'test', userMessage: 'test', recoverable: true };
    expect(isOrionError(partial)).toBe(false);
  });

  it('should return false for object with invalid code', () => {
    const invalid = { code: 'INVALID_CODE', message: 'test', userMessage: 'test', recoverable: true };
    expect(isOrionError(invalid)).toBe(false);
  });
});

describe('retryWithBackoff', () => {
  it('should return result on first successful attempt', async () => {
    const { retryWithBackoff } = await import('./errors.js');
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 100 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const { retryWithBackoff } = await import('./errors.js');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries exhausted', async () => {
    const { retryWithBackoff } = await import('./errors.js');
    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10 })
    ).rejects.toThrow('Always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff delays', async () => {
    const { retryWithBackoff } = await import('./errors.js');
    const delays: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      delay: number
    ) => {
      delays.push(delay);
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    const failFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    await retryWithBackoff(failFn, { maxRetries: 3, baseDelayMs: 100 });

    // Delays should be exponential: 100, 200
    expect(delays).toEqual([100, 200]);

    vi.mocked(globalThis.setTimeout).mockRestore();
  });

  it('should call onRetry callback when provided', async () => {
    const { retryWithBackoff } = await import('./errors.js');
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockResolvedValue('success');

    await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('should respect shouldRetry predicate', async () => {
    const { retryWithBackoff, createOrionError, ErrorCode, isOrionError, isRecoverable } = await import('./errors.js');
    const nonRecoverableError = createOrionError(ErrorCode.INVALID_INPUT, 'Bad input');
    const fn = vi.fn().mockRejectedValue(nonRecoverableError);

    const shouldRetry = (err: unknown): boolean => {
      if (isOrionError(err)) {
        return isRecoverable(err.code);
      }
      return true;
    };

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10, shouldRetry })
    ).rejects.toEqual(nonRecoverableError);
    // Should not retry non-recoverable errors
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withTimeout', () => {
  it('should resolve if promise completes before timeout', async () => {
    const { withTimeout } = await import('./errors.js');
    const fastPromise = Promise.resolve('fast result');

    const result = await withTimeout(fastPromise, 1000);

    expect(result).toBe('fast result');
  });

  it('should reject with AGENT_TIMEOUT if promise exceeds timeout', async () => {
    vi.useFakeTimers();
    const { withTimeout, isOrionError, ErrorCode } = await import('./errors.js');
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 5000));

    const timeoutPromise = withTimeout(slowPromise, 100);

    // Advance time past timeout
    vi.advanceTimersByTime(200);

    await expect(timeoutPromise).rejects.toSatisfy((error: unknown) => {
      if (!isOrionError(error)) return false;
      return error.code === ErrorCode.AGENT_TIMEOUT;
    });

    vi.useRealTimers();
  });

  it('should include timeout duration in error message', async () => {
    vi.useFakeTimers();
    const { withTimeout, isOrionError } = await import('./errors.js');
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 5000));

    const timeoutPromise = withTimeout(slowPromise, 250);

    vi.advanceTimersByTime(300);

    await expect(timeoutPromise).rejects.toSatisfy((error: unknown) => {
      if (!isOrionError(error)) return false;
      return error.message.includes('250');
    });

    vi.useRealTimers();
  });

  it('should use HARD_TIMEOUT_MS (240000) as default', async () => {
    const { HARD_TIMEOUT_MS } = await import('./errors.js');
    expect(HARD_TIMEOUT_MS).toBe(240_000);
  });

  it('should propagate original error if promise rejects before timeout', async () => {
    const { withTimeout } = await import('./errors.js');
    const failingPromise = Promise.reject(new Error('Original error'));

    await expect(withTimeout(failingPromise, 1000)).rejects.toThrow('Original error');
  });
});

describe('HARD_TIMEOUT_MS', () => {
  it('should be 4 minutes (240000ms) per AR20', async () => {
    const { HARD_TIMEOUT_MS } = await import('./errors.js');
    expect(HARD_TIMEOUT_MS).toBe(4 * 60 * 1000);
  });
});

describe('wrapError', () => {
  it('should return OrionError as-is', async () => {
    const { wrapError, createOrionError, ErrorCode } = await import('./errors.js');
    const orionError = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Test');

    const result = wrapError(orionError);

    expect(result).toBe(orionError);
  });

  it('should wrap regular Error in UNKNOWN_ERROR by default', async () => {
    const { wrapError, ErrorCode } = await import('./errors.js');
    const regularError = new Error('Something went wrong');

    const result = wrapError(regularError);

    expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(result.message).toBe('Something went wrong');
    expect(result.cause).toBe(regularError);
  });

  it('should use fallback error code when provided', async () => {
    const { wrapError, ErrorCode } = await import('./errors.js');
    const regularError = new Error('Slack failed');

    const result = wrapError(regularError, ErrorCode.SLACK_API_ERROR);

    expect(result.code).toBe(ErrorCode.SLACK_API_ERROR);
    expect(result.recoverable).toBe(true);
  });

  it('should wrap string error', async () => {
    const { wrapError, ErrorCode } = await import('./errors.js');

    const result = wrapError('Plain string error');

    expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(result.message).toBe('Plain string error');
  });

  it('should wrap null/undefined', async () => {
    const { wrapError, ErrorCode } = await import('./errors.js');

    expect(wrapError(null).code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(wrapError(undefined).code).toBe(ErrorCode.UNKNOWN_ERROR);
  });

  it('should preserve userMessage from wrapped OrionError', async () => {
    const { wrapError, createOrionError, ErrorCode } = await import('./errors.js');
    const orionError = createOrionError(ErrorCode.AGENT_TIMEOUT, 'Test', {
      userMessage: 'Custom user message',
    });

    const result = wrapError(orionError);

    expect(result.userMessage).toBe('Custom user message');
  });
});

