/**
 * Tracing Utilities for Langfuse
 *
 * Provides high-level wrappers for creating traces and spans using the new
 * @langfuse/tracing SDK with OpenTelemetry integration.
 *
 * Use startActiveObservation for all top-level handlers.
 *
 * @see AR11 - All handlers must be wrapped in Langfuse traces
 * @see AC#4 - startActiveObservation creates properly scoped traces
 * @see AC#6 - Traces include userId, input, output, duration, metadata
 */

import {
  startActiveObservation as lfStartActiveObservation,
  startObservation as lfStartObservation,
  updateActiveObservation,
  type LangfuseSpan as NewLangfuseSpan,
  type LangfuseSpanAttributes,
  type LangfuseGenerationAttributes,
} from '@langfuse/tracing';
// Note: langfuse.ts is still used for feedback scoring (logFeedbackScore)
// which requires the old SDK's score()/event() methods not available in @langfuse/tracing

// Re-export new SDK functions for direct use
export {
  updateActiveObservation,
  type NewLangfuseSpan,
  type LangfuseSpanAttributes,
  type LangfuseGenerationAttributes,
};

// --- Trace ID Cache for Feedback Correlation ---
// Maps message timestamps to trace IDs for correlating feedback with original responses
// @see Story 1.8 - Feedback Button Infrastructure, AC#2

interface TraceIdCacheEntry {
  traceId: string;
  timestamp: number;
}

const traceIdCache = new Map<string, TraceIdCacheEntry>();
const DAY_MS = 24 * 60 * 60 * 1000;

// Cleanup expired entries hourly
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of traceIdCache.entries()) {
    if (now - entry.timestamp > DAY_MS) {
      traceIdCache.delete(key);
    }
  }
}, 60 * 60 * 1000);

/**
 * Store a trace ID associated with a message timestamp.
 * Used to correlate feedback button clicks with the original response trace.
 *
 * @param messageTs - Slack message timestamp (e.g., "1234567890.123456")
 * @param traceId - Langfuse trace ID to associate
 * @see Story 1.8 - AC#2 Feedback correlated with original trace
 */
export function setTraceIdForMessage(messageTs: string, traceId: string): void {
  traceIdCache.set(messageTs, { traceId, timestamp: Date.now() });
}

/**
 * Retrieve a trace ID for a message timestamp.
 * Returns null if not found or expired (>24 hours old).
 *
 * @param messageTs - Slack message timestamp
 * @returns Trace ID or null if not found/expired
 * @see Story 1.8 - AC#2 Feedback correlated with original trace
 */
export function getTraceIdFromMessageTs(messageTs: string): string | null {
  const entry = traceIdCache.get(messageTs);
  if (!entry) return null;

  // Check for expiration
  if (Date.now() - entry.timestamp > DAY_MS) {
    traceIdCache.delete(messageTs);
    return null;
  }

  return entry.traceId;
}

/**
 * Expose cache for testing purposes only.
 * @internal
 */
export function _getTraceIdCacheForTesting(): Map<string, TraceIdCacheEntry> {
  return traceIdCache;
}

// Type definitions for trace and span contexts
export interface TraceContext {
  name: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SpanContext {
  name: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface GenerationParams {
  name: string;
  model: string;
  input: unknown;
  output: unknown;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Trace wrapper interface that provides access to trace ID and span methods.
 * Compatible with both the new SDK and legacy patterns.
 */
export interface TraceWrapper {
  /** The trace ID (may be undefined if tracing is disabled) */
  id: string | undefined;
  /** Update the trace with additional data */
  update: (data: LangfuseSpanAttributes) => void;
  /** Create a nested span using the new SDK */
  startSpan: (name: string, attributes?: LangfuseSpanAttributes) => NewLangfuseSpan;
  /** Create a nested generation using the new SDK */
  startGeneration: (name: string, attributes?: LangfuseGenerationAttributes) => { end: () => void };
  /** The underlying new SDK span for direct access */
  _span: NewLangfuseSpan;
}

/**
 * Wrap an async operation in a Langfuse trace using the new @langfuse/tracing SDK.
 * Use this for all top-level handlers (Slack events, API endpoints).
 *
 * @example
 * await startActiveObservation({
 *   name: 'app-mention-handler',
 *   userId: 'U123',
 *   sessionId: 'thread_ts',
 *   input: { text: 'Hello' },
 * }, async (trace) => {
 *   // Create nested spans
 *   const span = trace.startSpan('processing', { input: data });
 *   // ... work ...
 *   span.update({ output: result }).end();
 *   
 *   trace.update({ output: response });
 *   return response;
 * });
 */
export async function startActiveObservation<T>(
  context: TraceContext | string,
  operation: (trace: TraceWrapper) => Promise<T>
): Promise<T> {
  const ctx = typeof context === 'string' ? { name: context } : context;
  const startTime = Date.now();

  // Use the new SDK's startActiveObservation
  return lfStartActiveObservation(ctx.name, async (span) => {
    // Set initial attributes via update
    span.update({
      input: ctx.input,
      metadata: {
        ...ctx.metadata,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
      },
    });

    // Create a wrapper that provides a clean interface
    const traceWrapper: TraceWrapper = {
      id: span.traceId,
      update: (data: LangfuseSpanAttributes) => {
        span.update(data);
      },
      startSpan: (name: string, attributes?: LangfuseSpanAttributes) => {
        return span.startObservation(name, attributes);
      },
      startGeneration: (name: string, attributes: LangfuseGenerationAttributes = {}) => {
        return span.startObservation(name, attributes, { asType: 'generation' });
      },
      _span: span,
    };

    try {
      const result = await operation(traceWrapper);
      const durationMs = Date.now() - startTime;

      span.update({
        output: result,
        metadata: {
          ...ctx.metadata,
          durationMs,
          status: 'success',
        },
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      span.update({
        metadata: {
          ...ctx.metadata,
          durationMs,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  });
}

// Legacy createSpan and logGeneration removed — use trace.startSpan() and trace.startGeneration() instead

/**
 * Start a manual span that must be explicitly ended.
 * Use this when you need control over the observation lifecycle.
 *
 * @example
 * const span = startSpan('processing', { input: data });
 * const result = await process(data);
 * span.update({ output: result }).end();
 */
export function startSpan(
  name: string,
  attributes?: LangfuseSpanAttributes
): NewLangfuseSpan {
  return lfStartObservation(name, attributes);
}

/**
 * Start a manual generation observation that must be explicitly ended.
 * Use this for LLM calls when you need control over the observation lifecycle.
 *
 * @example
 * const gen = startGeneration('llm-call', { model: 'claude-3' });
 * const result = await callLLM(prompt);
 * gen.update({ output: result, usageDetails: { input: 100, output: 50 } }).end();
 */
export function startGeneration(
  name: string,
  attributes: LangfuseGenerationAttributes = {}
): NewLangfuseSpan {
  return lfStartObservation(name, attributes, { asType: 'generation' });
}
