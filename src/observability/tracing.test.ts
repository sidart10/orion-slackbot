import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions that persist across tests
const mockSpanUpdate = vi.fn().mockReturnThis();
const mockSpanEnd = vi.fn();

interface MockSpan {
  update: typeof mockSpanUpdate;
  end: typeof mockSpanEnd;
  traceId: string;
  id: string;
  startObservation: () => MockSpan;
}

const mockStartObservation = vi.fn((): MockSpan => ({
  update: mockSpanUpdate,
  end: mockSpanEnd,
  traceId: 'test-trace-id',
  id: 'test-span-id',
  startObservation: mockStartObservation,
}));

// Mock @langfuse/tracing
vi.mock('@langfuse/tracing', () => ({
  startActiveObservation: vi.fn(
    async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
      const mockSpan = {
        update: mockSpanUpdate,
        end: mockSpanEnd,
        traceId: 'test-trace-id',
        id: 'test-span-id',
        startObservation: mockStartObservation,
      };
      return fn(mockSpan);
    }
  ),
  startObservation: mockStartObservation,
  updateActiveObservation: vi.fn(),
}));

describe('tracing utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it('should export startSpan function', async () => {
      const { startSpan } = await import('./tracing.js');
      expect(startSpan).toBeDefined();
      expect(typeof startSpan).toBe('function');
    });

    it('should export startGeneration function', async () => {
      const { startGeneration } = await import('./tracing.js');
      expect(startGeneration).toBeDefined();
      expect(typeof startGeneration).toBe('function');
    });

    it('should export setTraceIdForMessage function', async () => {
      const { setTraceIdForMessage } = await import('./tracing.js');
      expect(setTraceIdForMessage).toBeDefined();
      expect(typeof setTraceIdForMessage).toBe('function');
    });

    it('should export getTraceIdFromMessageTs function', async () => {
      const { getTraceIdFromMessageTs } = await import('./tracing.js');
      expect(getTraceIdFromMessageTs).toBeDefined();
      expect(typeof getTraceIdFromMessageTs).toBe('function');
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

    it('should provide trace wrapper with id', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      let capturedTraceId: string | undefined;
      await startActiveObservation('test', async (trace) => {
        capturedTraceId = trace.id;
        return 'done';
      });

      expect(capturedTraceId).toBe('test-trace-id');
    });

    it('should provide trace wrapper with startSpan method', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      await startActiveObservation('test', async (trace) => {
        const span = trace.startSpan('child-span', { input: 'test' });
        expect(span).toBeDefined();
        expect(span.update).toBeDefined();
        expect(span.end).toBeDefined();
        return 'done';
      });

      expect(mockStartObservation).toHaveBeenCalledWith('child-span', { input: 'test' });
    });

    it('should rethrow errors from operation', async () => {
      const { startActiveObservation } = await import('./tracing.js');

      await expect(
        startActiveObservation('test', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });
  });

  describe('trace ID cache for feedback correlation', () => {
    it('should store and retrieve trace ID by message timestamp', async () => {
      const { setTraceIdForMessage, getTraceIdFromMessageTs } =
        await import('./tracing.js');

      const messageTs = '1234567890.123456';
      const traceId = 'trace-abc123';

      setTraceIdForMessage(messageTs, traceId);
      const retrieved = getTraceIdFromMessageTs(messageTs);

      expect(retrieved).toBe(traceId);
    });

    it('should return null for unknown message timestamp', async () => {
      const { getTraceIdFromMessageTs } = await import('./tracing.js');

      const result = getTraceIdFromMessageTs('unknown.timestamp');

      expect(result).toBeNull();
    });

    it('should overwrite existing trace ID for same message timestamp', async () => {
      const { setTraceIdForMessage, getTraceIdFromMessageTs } =
        await import('./tracing.js');

      const messageTs = '1234567890.999999';
      setTraceIdForMessage(messageTs, 'old-trace');
      setTraceIdForMessage(messageTs, 'new-trace');

      expect(getTraceIdFromMessageTs(messageTs)).toBe('new-trace');
    });

    it('should return null for expired entries (older than 24 hours)', async () => {
      const {
        setTraceIdForMessage,
        getTraceIdFromMessageTs,
        _getTraceIdCacheForTesting,
      } = await import('./tracing.js');

      const messageTs = '1234567890.expired';
      const traceId = 'trace-expired';

      setTraceIdForMessage(messageTs, traceId);

      // Manually expire the entry by manipulating timestamp
      const cache = _getTraceIdCacheForTesting();
      const entry = cache.get(messageTs);
      if (entry) {
        entry.timestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      }

      const result = getTraceIdFromMessageTs(messageTs);
      expect(result).toBeNull();
    });
  });
});
