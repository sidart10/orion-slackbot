import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions that persist across tests
const mockTraceUpdate = vi.fn();
const mockSpanEnd = vi.fn();
const mockGeneration = vi.fn();
const mockSpan = vi.fn(() => ({
  end: mockSpanEnd,
  setStatus: vi.fn(),
  setAttributes: vi.fn(),
}));

// Track whether langfuse should be available
let langfuseEnabled = true;

// Mock getLangfuse
vi.mock('./langfuse.js', () => ({
  getLangfuse: vi.fn(() => {
    if (!langfuseEnabled) return null;
    return {
      trace: vi.fn(() => ({
        id: 'test-trace-id',
        update: mockTraceUpdate,
        span: mockSpan,
        generation: mockGeneration,
      })),
    };
  }),
}));

// Mock OpenTelemetry tracer to avoid creating real spans
vi.mock('@opentelemetry/api', () => {
  return {
    SpanStatusCode: { OK: 1, ERROR: 2 },
    trace: {
      getTracer: (): { startActiveSpan: (_name: string, fn: (span: unknown) => unknown) => unknown } => ({
        startActiveSpan: (_name: string, fn: (span: unknown) => unknown): unknown =>
          fn(mockSpan()),
      }),
    },
  };
});

describe('tracing utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    langfuseEnabled = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exports', () => {
    it('should export startActiveObservation function', async () => {
      const { startActiveObservation } = await import('./tracing.js');
      expect(startActiveObservation).toBeDefined();
      expect(typeof startActiveObservation).toBe('function');
    });

    it('should export createSpan function', async () => {
      const { createSpan } = await import('./tracing.js');
      expect(createSpan).toBeDefined();
      expect(typeof createSpan).toBe('function');
    });

    it('should export logGeneration function', async () => {
      const { logGeneration } = await import('./tracing.js');
      expect(logGeneration).toBeDefined();
      expect(typeof logGeneration).toBe('function');
    });
  });

  describe('startActiveObservation', () => {
    it('should execute operation and return result', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      const result = await startActiveObservation(
        'test-operation',
        async () => 'test-result'
      );

      expect(result).toBe('test-result');
    });

    it('should accept TraceContext object', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      const result = await startActiveObservation(
        {
          name: 'full-operation',
          userId: 'user-123',
          sessionId: 'session-456',
          input: { query: 'test' },
          metadata: { source: 'slack' },
        },
        async () => 'done'
      );

      expect(result).toBe('done');
    });

    it('should update trace with output on success', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      await startActiveObservation('test', async () => ({ data: 'result' }));

      expect(mockTraceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          output: { data: 'result' },
          metadata: expect.objectContaining({
            status: 'success',
            durationMs: expect.any(Number),
          }),
        })
      );
    });

    it('should update trace with error details on failure', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      await expect(
        startActiveObservation('test', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      expect(mockTraceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            status: 'error',
            error: 'test error',
            durationMs: expect.any(Number),
          }),
        })
      );
    });

    it('should track duration automatically', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      await startActiveObservation('test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'done';
      });

      const updateCall = mockTraceUpdate.mock.calls[0][0];
      expect(updateCall.metadata.durationMs).toBeGreaterThanOrEqual(50);
    });

    it('should work without Langfuse client (no-op mode)', async () => {
      langfuseEnabled = false;

      // Need to reset module to pick up new langfuseEnabled value
      vi.resetModules();
      const { startActiveObservation } = await import('./tracing.js');

      const result = await startActiveObservation('test', async () => 'result');

      expect(result).toBe('result');
      // mockTraceUpdate should not be called when langfuse is disabled
    });
  });

  describe('createSpan', () => {
    it('should create a span on the trace', async () => {
      const { createSpan } = await import('./tracing.js');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockParentTrace = { span: mockSpan } as any;

      createSpan(mockParentTrace, {
        name: 'child-span',
        input: { data: 'input' },
        metadata: { phase: 'gather' },
      });

      expect(mockSpan).toHaveBeenCalledWith({
        name: 'child-span',
        input: { data: 'input' },
        metadata: { phase: 'gather' },
      });
    });

    it('should return the span for later ending', async () => {
      const { createSpan } = await import('./tracing.js');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockParentTrace = { span: mockSpan } as any;
      const span = createSpan(mockParentTrace, { name: 'test' });

      expect(span).toBeDefined();
      expect(span.end).toBeDefined();
    });
  });

  describe('logGeneration', () => {
    it('should log a generation on the trace', async () => {
      const { logGeneration } = await import('./tracing.js');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockParentTrace = { generation: mockGeneration } as any;

      logGeneration(mockParentTrace, {
        name: 'claude-call',
        model: 'claude-sonnet-4-20250514',
        input: 'prompt',
        output: 'response',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        metadata: { temperature: 0.7 },
      });

      expect(mockGeneration).toHaveBeenCalledWith({
        name: 'claude-call',
        model: 'claude-sonnet-4-20250514',
        input: 'prompt',
        output: 'response',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        metadata: { temperature: 0.7 },
      });
    });

    it('should work without usage info', async () => {
      const { logGeneration } = await import('./tracing.js');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockParentTrace = { generation: mockGeneration } as any;

      logGeneration(mockParentTrace, {
        name: 'simple-call',
        model: 'claude-sonnet-4-20250514',
        input: 'prompt',
        output: 'response',
      });

      expect(mockGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'simple-call',
          usage: undefined,
        })
      );
    });
  });
});
