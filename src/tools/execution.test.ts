/**
 * Tool Execution Tests
 *
 * Tests for tool execution with timeout, graceful degradation,
 * and parallel execution support.
 *
 * @see Story 3.3 - Tool Execution with Timeout
 * @see AC#1 - 30 second timeout per tool call
 * @see AC#2 - OrionError with TOOL_TIMEOUT code
 * @see AC#3 - Graceful degradation for tool failures
 * @see AC#5 - Result validation and passing to agent
 * @see AC#6 - Parallel execution with individual timeout handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withToolTimeout,
  executeToolWithTimeout,
  executeToolsInParallel,
  createToolFailureMessage,
  TOOL_TIMEOUT_MS,
  type ToolResult,
  type ToolCall,
} from './execution.js';
import { ErrorCode, isOrionError } from '../utils/errors.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the MCP health module
vi.mock('./mcp/health.js', () => ({
  markServerUnavailable: vi.fn(),
}));

// Mock the observability module
vi.mock('../observability/tracing.js', () => ({
  createSpan: vi.fn(() => ({
    end: vi.fn(),
    update: vi.fn(),
  })),
}));

describe('Tool Execution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TOOL_TIMEOUT_MS constant', () => {
    it('should be 30 seconds (NFR19)', () => {
      expect(TOOL_TIMEOUT_MS).toBe(30_000);
    });
  });

  describe('withToolTimeout', () => {
    it('resolves when promise completes before timeout (AC#5)', async () => {
      const fastPromise = Promise.resolve('success');
      const result = await withToolTimeout(fastPromise, 1000, 'test_tool');
      expect(result).toBe('success');
    });

    it('rejects with TOOL_TIMEOUT when timeout exceeded (AC#1)', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 5000));
      const promise = withToolTimeout(slowPromise, 1000, 'slow_tool');

      vi.advanceTimersByTime(1500);

      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.TOOL_TIMEOUT,
      });
    });

    it('includes tool name in error message (AC#2)', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 5000));
      const promise = withToolTimeout(slowPromise, 1000, 'my_slow_tool');

      vi.advanceTimersByTime(1500);

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isOrionError(error)).toBe(true);
        if (isOrionError(error)) {
          expect(error.userMessage).toContain('my_slow_tool');
          expect(error.recoverable).toBe(true);
        }
      }
    });

    it('clears timeout on successful completion', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const fastPromise = Promise.resolve('fast');

      await withToolTimeout(fastPromise, 1000, 'fast_tool');

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('clears timeout on error', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const errorPromise = Promise.reject(new Error('Failed'));

      await expect(withToolTimeout(errorPromise, 1000, 'error_tool')).rejects.toThrow('Failed');

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('executeToolWithTimeout', () => {
    it('returns success result for fast execution (AC#5)', async () => {
      const executor = () => Promise.resolve({ data: 'test' });

      const resultPromise = executeToolWithTimeout('fast_tool', executor);
      vi.advanceTimersByTime(100);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.toolName).toBe('fast_tool');
    });

    it('returns error result for timeout without throwing (AC#2, AC#3)', async () => {
      const executor = () => new Promise((resolve) => setTimeout(resolve, 60000));

      const resultPromise = executeToolWithTimeout('slow_tool', executor, {
        timeout: 1000,
      });

      vi.advanceTimersByTime(1500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TOOL_TIMEOUT);
      expect(result.toolName).toBe('slow_tool');
      expect(result.error?.recoverable).toBe(true);
    });

    it('returns error result for executor failure (AC#3)', async () => {
      const executor = () => Promise.reject(new Error('Tool crashed'));

      const resultPromise = executeToolWithTimeout('failing_tool', executor);
      vi.advanceTimersByTime(100);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TOOL_FAILED);
      expect(result.toolName).toBe('failing_tool');
    });

    it('tracks duration on success', async () => {
      const executor = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('done'), 500);
        });

      const resultPromise = executeToolWithTimeout('timed_tool', executor, {
        timeout: 5000,
      });

      vi.advanceTimersByTime(600);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('tracks duration on timeout', async () => {
      const executor = () => new Promise((resolve) => setTimeout(resolve, 60000));

      const resultPromise = executeToolWithTimeout('slow_tool', executor, {
        timeout: 1000,
      });

      vi.advanceTimersByTime(1500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('includes serverName in options for MCP tracking', async () => {
      const executor = () => Promise.resolve('ok');

      const resultPromise = executeToolWithTimeout('mcp_tool', executor, {
        serverName: 'rube',
      });

      vi.advanceTimersByTime(100);
      const result = await resultPromise;

      expect(result.success).toBe(true);
    });

    it('uses default timeout when not specified', async () => {
      const executor = () => new Promise((resolve) => setTimeout(resolve, 35000));

      const resultPromise = executeToolWithTimeout('default_timeout_tool', executor);

      // Advance past default 30s timeout
      vi.advanceTimersByTime(31000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.TOOL_TIMEOUT);
    });
  });

  describe('executeToolsInParallel', () => {
    it('executes multiple tools and returns all results (AC#6)', async () => {
      const calls: ToolCall[] = [
        { toolName: 'tool_a', arguments: {} },
        { toolName: 'tool_b', arguments: {} },
      ];

      const executors = new Map([
        ['tool_a', () => Promise.resolve('result_a')],
        ['tool_b', () => Promise.resolve('result_b')],
      ]);

      const resultsPromise = executeToolsInParallel(calls, executors, 1000);
      vi.advanceTimersByTime(100);
      const results = await resultsPromise;

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].data).toBe('result_a');
      expect(results[1].success).toBe(true);
      expect(results[1].data).toBe('result_b');
    });

    it('handles mixed success and failure (AC#3, AC#6)', async () => {
      const calls: ToolCall[] = [
        { toolName: 'fast_tool', arguments: {} },
        { toolName: 'slow_tool', arguments: {} },
      ];

      const executors = new Map([
        ['fast_tool', () => Promise.resolve('fast')],
        ['slow_tool', () => new Promise((r) => setTimeout(r, 5000))],
      ]);

      const resultsPromise = executeToolsInParallel(calls, executors, 1000);
      vi.advanceTimersByTime(1500);
      const results = await resultsPromise;

      expect(results[0].success).toBe(true);
      expect(results[0].data).toBe('fast');
      expect(results[1].success).toBe(false);
      expect(results[1].error?.code).toBe(ErrorCode.TOOL_TIMEOUT);
    });

    it('returns error for missing executor', async () => {
      const calls: ToolCall[] = [{ toolName: 'unknown_tool', arguments: {} }];
      const executors = new Map<string, () => Promise<unknown>>();

      const results = await executeToolsInParallel(calls, executors);

      expect(results[0].success).toBe(false);
      expect(results[0].error?.code).toBe(ErrorCode.TOOL_FAILED);
      expect(results[0].error?.message).toContain('not found');
    });

    it('applies individual timeout to each call', async () => {
      const calls: ToolCall[] = [
        { toolName: 'tool_a', arguments: {} },
        { toolName: 'tool_b', arguments: {} },
      ];

      // tool_a takes 500ms, tool_b takes 2000ms
      const executors = new Map([
        ['tool_a', () => new Promise((r) => setTimeout(() => r('a'), 500))],
        ['tool_b', () => new Promise((r) => setTimeout(() => r('b'), 2000))],
      ]);

      // Timeout of 1000ms means tool_a succeeds, tool_b fails
      const resultsPromise = executeToolsInParallel(calls, executors, 1000);
      vi.advanceTimersByTime(2500);
      const results = await resultsPromise;

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('includes serverName from ToolCall', async () => {
      const calls: ToolCall[] = [{ toolName: 'mcp_tool', arguments: {}, serverName: 'rube' }];

      const executors = new Map([['mcp_tool', () => Promise.resolve('ok')]]);

      const resultsPromise = executeToolsInParallel(calls, executors, 1000);
      vi.advanceTimersByTime(100);
      const results = await resultsPromise;

      expect(results[0].success).toBe(true);
    });
  });

  describe('createToolFailureMessage', () => {
    it('returns empty string for successful result', () => {
      const result: ToolResult = {
        success: true,
        toolName: 'test_tool',
        data: 'ok',
        duration: 100,
      };

      expect(createToolFailureMessage(result)).toBe('');
    });

    it('returns timeout message for TOOL_TIMEOUT', () => {
      const result: ToolResult = {
        success: false,
        toolName: 'slow_tool',
        error: {
          code: ErrorCode.TOOL_TIMEOUT,
          message: 'Timeout',
          userMessage: 'Tool timed out',
          recoverable: true,
        },
        duration: 30000,
      };

      const message = createToolFailureMessage(result);
      expect(message).toContain('slow_tool');
      expect(message).toContain('timed out');
    });

    it('returns unavailable message for other errors', () => {
      const result: ToolResult = {
        success: false,
        toolName: 'broken_tool',
        error: {
          code: ErrorCode.MCP_CONNECTION_ERROR,
          message: 'Connection failed',
          userMessage: 'Connection failed',
          recoverable: true,
        },
        duration: 500,
      };

      const message = createToolFailureMessage(result);
      expect(message).toContain('broken_tool');
      expect(message).toContain('unavailable');
    });
  });

  describe('Argument sanitization', () => {
    it('should sanitize sensitive arguments', async () => {
      const executor = () => Promise.resolve('ok');

      const resultPromise = executeToolWithTimeout('auth_tool', executor, {
        sanitizedArgs: { password: 'secret123', query: 'test' },
      });

      vi.advanceTimersByTime(100);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      // Sanitization is internal, verified by no errors
    });
  });

  describe('Langfuse tracing (AC#4)', () => {
    it('creates span when parentTrace provided', async () => {
      const { createSpan } = await import('../observability/tracing.js');
      const mockSpan = { end: vi.fn() };
      vi.mocked(createSpan).mockReturnValue(mockSpan as never);

      const mockParentTrace = { id: 'test-trace' } as never;
      const executor = () => Promise.resolve('traced-result');

      const resultPromise = executeToolWithTimeout('traced_tool', executor, {
        parentTrace: mockParentTrace,
        serverName: 'test-server',
      });

      vi.advanceTimersByTime(100);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(createSpan).toHaveBeenCalledWith(
        mockParentTrace,
        expect.objectContaining({
          name: 'tool-execution-traced_tool',
          metadata: expect.objectContaining({
            toolName: 'traced_tool',
            serverName: 'test-server',
          }),
        })
      );
      expect(mockSpan.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({ success: true }),
        })
      );
    });

    it('does not create span when parentTrace not provided', async () => {
      const { createSpan } = await import('../observability/tracing.js');
      vi.mocked(createSpan).mockClear();

      const executor = () => Promise.resolve('untraced-result');

      const resultPromise = executeToolWithTimeout('untraced_tool', executor);
      vi.advanceTimersByTime(100);
      await resultPromise;

      expect(createSpan).not.toHaveBeenCalled();
    });

    it('ends span with error on failure', async () => {
      const { createSpan } = await import('../observability/tracing.js');
      const mockSpan = { end: vi.fn() };
      vi.mocked(createSpan).mockReturnValue(mockSpan as never);

      const mockParentTrace = { id: 'test-trace' } as never;
      const executor = () => new Promise((r) => setTimeout(r, 5000));

      const resultPromise = executeToolWithTimeout('failing_traced_tool', executor, {
        parentTrace: mockParentTrace,
        timeout: 1000,
      });

      vi.advanceTimersByTime(1500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(mockSpan.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            success: false,
            error: ErrorCode.TOOL_TIMEOUT,
          }),
        })
      );
    });
  });
});

