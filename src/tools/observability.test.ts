import { describe, it, expect, vi } from 'vitest';

vi.mock('../observability/langfuse.js', () => {
  return {
    getLangfuse: vi.fn(),
  };
});

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getLangfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import { startToolExecuteSpan, endToolExecuteSpan, logToolRetry } from './observability.js';

describe('tools/observability', () => {
  it('returns null when Langfuse is not available', () => {
    vi.mocked(getLangfuse).mockReturnValueOnce(null);
    const span = startToolExecuteSpan({
      toolName: 'test',
      traceId: 'trace-1',
      timeoutMs: 30_000,
      maxRetries: 3,
    });
    expect(span).toBeNull();
  });

  it('creates a tool.execute trace + span with traceId in sessionId/metadata', () => {
    const spanEnd = vi.fn();
    const traceSpan = vi.fn(() => ({ end: spanEnd }));
    const trace = { span: traceSpan, update: vi.fn(), generation: vi.fn() };
    const lf = { trace: vi.fn(() => trace), flushAsync: vi.fn(), shutdownAsync: vi.fn() };

    vi.mocked(getLangfuse).mockReturnValueOnce(lf as never);

    const started = startToolExecuteSpan({
      toolName: 'my_tool',
      traceId: 'trace-123',
      timeoutMs: 30_000,
      maxRetries: 3,
    });

    expect(lf.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'tool.execute',
        sessionId: 'trace-123',
        metadata: expect.objectContaining({ traceId: 'trace-123', tool: 'my_tool' }),
      })
    );
    expect(traceSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'tool.execute',
        metadata: expect.objectContaining({ traceId: 'trace-123', tool: 'my_tool' }),
      })
    );

    endToolExecuteSpan(started?.span ?? null, {
      toolName: 'my_tool',
      traceId: 'trace-123',
      durationMs: 12,
      attempts: 2,
      success: true,
    });

    expect(spanEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ durationMs: 12, attempts: 2, success: true }),
      })
    );
  });

  it('logs retries as tool.retry with traceId', () => {
    logToolRetry({
      traceId: 'trace-999',
      toolName: 'my_tool',
      attempt: 2,
      delayMs: 1000,
      code: 'TOOL_EXECUTION_FAILED',
      message: 'timeout',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tool.retry',
        traceId: 'trace-999',
        tool: 'my_tool',
        attempt: 2,
        delayMs: 1000,
        code: 'TOOL_EXECUTION_FAILED',
      })
    );
  });
});


