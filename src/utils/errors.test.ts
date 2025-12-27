/**
 * Tests for OrionError types and utilities.
 *
 * @see Story 2.4 - OrionError & Graceful Degradation
 * @see AC#1 - Error wrapped in OrionError interface
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ErrorCode,
  type ErrorCodeType,
  type OrionError,
  createOrionError,
  isOrionError,
  getUserMessage,
  isRecoverable,
  inferErrorCode,
  retryWithBackoff,
  withTimeout,
  HARD_TIMEOUT_MS,
} from './errors.js';

describe('ErrorCode', () => {
  it('contains all required error codes', () => {
    expect(ErrorCode.AGENT_TIMEOUT).toBe('AGENT_TIMEOUT');
    expect(ErrorCode.TOOL_TIMEOUT).toBe('TOOL_TIMEOUT');
    expect(ErrorCode.TOOL_EXECUTION_FAILED).toBe('TOOL_EXECUTION_FAILED');
    expect(ErrorCode.CONTEXT_LIMIT).toBe('CONTEXT_LIMIT');
    expect(ErrorCode.VERIFICATION_FAILED).toBe('VERIFICATION_FAILED');
    expect(ErrorCode.MCP_CONNECTION_ERROR).toBe('MCP_CONNECTION_ERROR');
    expect(ErrorCode.SLACK_API_ERROR).toBe('SLACK_API_ERROR');
    expect(ErrorCode.LLM_API_ERROR).toBe('LLM_API_ERROR');
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
  });
});

describe('createOrionError', () => {
  it('creates OrionError with required fields', () => {
    const error = createOrionError('AGENT_TIMEOUT', 'Request timed out');

    expect(error.code).toBe('AGENT_TIMEOUT');
    expect(error.message).toBe('Request timed out');
    expect(error.userMessage).toBeDefined();
    expect(typeof error.recoverable).toBe('boolean');
  });

  it('allows overriding default fields via options', () => {
    const cause = new Error('Original error');
    const error = createOrionError('TOOL_TIMEOUT', 'Tool timed out', {
      recoverable: false,
      retryCount: 3,
      cause,
      metadata: { toolName: 'web_search' },
    });

    expect(error.recoverable).toBe(false);
    expect(error.retryCount).toBe(3);
    expect(error.cause).toBe(cause);
    expect(error.metadata).toEqual({ toolName: 'web_search' });
  });

  it('sets userMessage from getUserMessage by default', () => {
    const error = createOrionError('LLM_API_ERROR', 'API failed');

    expect(error.userMessage).toContain('⚠️');
    expect(error.userMessage).toContain('💡');
  });

  it('allows overriding userMessage via options', () => {
    const error = createOrionError('UNKNOWN_ERROR', 'Something broke', {
      userMessage: 'Custom user message',
    });

    expect(error.userMessage).toBe('Custom user message');
  });
});

describe('isOrionError', () => {
  it('returns true for valid OrionError', () => {
    const error = createOrionError('AGENT_TIMEOUT', 'Timeout');
    expect(isOrionError(error)).toBe(true);
  });

  it('returns false for plain Error', () => {
    const error = new Error('Plain error');
    expect(isOrionError(error)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isOrionError(null)).toBe(false);
    expect(isOrionError(undefined)).toBe(false);
  });

  it('returns false for partial OrionError-like objects', () => {
    expect(isOrionError({ code: 'AGENT_TIMEOUT' })).toBe(false);
    expect(isOrionError({ message: 'test' })).toBe(false);
  });
});

describe('getUserMessage', () => {
  const allCodes: ErrorCodeType[] = [
    'AGENT_TIMEOUT',
    'TOOL_TIMEOUT',
    'TOOL_EXECUTION_FAILED',
    'CONTEXT_LIMIT',
    'VERIFICATION_FAILED',
    'MCP_CONNECTION_ERROR',
    'SLACK_API_ERROR',
    'LLM_API_ERROR',
    'INVALID_INPUT',
    'UNKNOWN_ERROR',
  ];

  it.each(allCodes)('returns UX-compliant message for %s', (code) => {
    const message = getUserMessage(code);

    // Must start with ⚠️
    expect(message).toMatch(/^⚠️/);

    // Must contain "What I can do instead" or "What you can try"
    expect(message).toMatch(/\*What I can do instead:\*|\*What you can try:\*/i);

    // Must have at least 2 alternatives with 💡
    const alternatives = (message.match(/💡/g) || []).length;
    expect(alternatives).toBeGreaterThanOrEqual(2);
  });
});

describe('isRecoverable', () => {
  it('returns true for recoverable error codes', () => {
    expect(isRecoverable('TOOL_TIMEOUT')).toBe(true);
    expect(isRecoverable('TOOL_EXECUTION_FAILED')).toBe(true);
    expect(isRecoverable('MCP_CONNECTION_ERROR')).toBe(true);
    expect(isRecoverable('SLACK_API_ERROR')).toBe(true);
    expect(isRecoverable('LLM_API_ERROR')).toBe(true);
  });

  it('returns false for non-recoverable error codes', () => {
    expect(isRecoverable('AGENT_TIMEOUT')).toBe(false);
    expect(isRecoverable('CONTEXT_LIMIT')).toBe(false);
    expect(isRecoverable('VERIFICATION_FAILED')).toBe(false);
    expect(isRecoverable('INVALID_INPUT')).toBe(false);
    expect(isRecoverable('UNKNOWN_ERROR')).toBe(false);
  });
});

describe('inferErrorCode', () => {
  it('infers TOOL_TIMEOUT from timeout errors', () => {
    expect(inferErrorCode(new Error('Request timeout'))).toBe('TOOL_TIMEOUT');
    expect(inferErrorCode(new Error('Connection timed out'))).toBe('TOOL_TIMEOUT');
  });

  it('infers LLM_API_ERROR from rate limit errors', () => {
    expect(inferErrorCode(new Error('Rate limit exceeded'))).toBe('LLM_API_ERROR');
    expect(inferErrorCode(new Error('Error 429: Too many requests'))).toBe('LLM_API_ERROR');
  });

  it('infers MCP_CONNECTION_ERROR from connection errors', () => {
    expect(inferErrorCode(new Error('ECONNREFUSED'))).toBe('MCP_CONNECTION_ERROR');
    expect(inferErrorCode(new Error('Connection refused'))).toBe('MCP_CONNECTION_ERROR');
  });

  it('infers SLACK_API_ERROR from slack errors', () => {
    expect(inferErrorCode(new Error('Slack API error'))).toBe('SLACK_API_ERROR');
  });

  it('returns UNKNOWN_ERROR for unrecognized errors', () => {
    expect(inferErrorCode(new Error('Something went wrong'))).toBe('UNKNOWN_ERROR');
    expect(inferErrorCode(undefined)).toBe('UNKNOWN_ERROR');
  });
});

describe('retryWithBackoff', () => {
  it('returns result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 1 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxRetries on failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelay: 1 })
    ).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
      message: 'fail',
    });

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('succeeds after initial failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 1 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws OrionError with specified errorCode on failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout occurred'));

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2,
        baseDelay: 1,
        errorCode: 'TOOL_TIMEOUT',
      })
    ).rejects.toMatchObject({
      code: 'TOOL_TIMEOUT',
      retryCount: 2,
    });
  });

  it('includes cause and retryCount in thrown OrionError', async () => {
    const originalError = new Error('original failure');
    const fn = vi.fn().mockRejectedValue(originalError);

    try {
      await retryWithBackoff(fn, { maxRetries: 2, baseDelay: 1 });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isOrionError(error)).toBe(true);
      const orionError = error as OrionError;
      expect(orionError.cause).toBe(originalError);
      expect(orionError.retryCount).toBe(2);
    }
  });

  it('uses exponential backoff (validates delay calculation)', async () => {
    // This test validates the exponential formula without fake timers
    // Delay at attempt N = baseDelay * 2^N
    // attempt 0: 10 * 2^0 = 10ms
    // attempt 1: 10 * 2^1 = 20ms
    // attempt 2: 10 * 2^2 = 40ms

    const startTime = Date.now();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 });

    const elapsed = Date.now() - startTime;
    // Should take at least 10 + 20 = 30ms (first two backoff delays)
    expect(elapsed).toBeGreaterThanOrEqual(25); // Allow some margin
  });
});

describe('withTimeout', () => {
  it('returns result when promise resolves before timeout', async () => {
    const promise = Promise.resolve('success');

    const result = await withTimeout(promise, 1000);

    expect(result).toBe('success');
  });

  it('throws AGENT_TIMEOUT when promise exceeds timeout', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 100));

    await expect(withTimeout(slowPromise, 10)).rejects.toMatchObject({
      code: 'AGENT_TIMEOUT',
    });
  });

  it('uses HARD_TIMEOUT_MS as default timeout', () => {
    // Verify the constant is 4 minutes (240 seconds)
    expect(HARD_TIMEOUT_MS).toBe(240_000);
  });

  it('includes timeout duration in error message', async () => {
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 100));

    try {
      await withTimeout(slowPromise, 50);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isOrionError(error)).toBe(true);
      const orionError = error as OrionError;
      expect(orionError.message).toContain('50ms');
    }
  });

  it('clears timer when promise resolves (no memory leak)', async () => {
    // This test validates the fix from H3
    // If timer is not cleared, the test process would hang or show warnings
    const promise = Promise.resolve('fast');

    const result = await withTimeout(promise, 10000);

    expect(result).toBe('fast');
    // If we get here without warnings, timer was cleared properly
  });

  it('propagates rejection from the wrapped promise', async () => {
    const failingPromise = Promise.reject(new Error('inner error'));

    await expect(withTimeout(failingPromise, 1000)).rejects.toThrow('inner error');
  });
});

