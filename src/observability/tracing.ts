/**
 * Tracing Utilities for Langfuse
 *
 * Provides high-level wrappers for creating traces and spans.
 * Use startActiveObservation for all top-level handlers.
 *
 * @see AR11 - All handlers must be wrapped in Langfuse traces
 * @see AC#4 - startActiveObservation creates properly scoped traces
 * @see AC#6 - Traces include userId, input, output, duration, metadata
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { getLangfuse, type LangfuseTrace, type LangfuseSpan } from './langfuse.js';

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
 * Wrap an async operation in a Langfuse trace.
 * Use this for all top-level handlers (Slack events, API endpoints).
 *
 * @example
 * await startActiveObservation('user-message-handler', async (trace) => {
 *   trace.update({ input: message.text, userId: user.id });
 *   const result = await processMessage(message);
 *   trace.update({ output: result });
 *   return result;
 * });
 *
 * @example
 * await startActiveObservation({
 *   name: 'slack-message',
 *   userId: 'U123',
 *   sessionId: 'thread_ts',
 *   input: { text: 'Hello' },
 * }, async (trace) => {
 *   // Process message
 *   return response;
 * });
 */
export async function startActiveObservation<T>(
  context: TraceContext | string,
  operation: (_trace: LangfuseTrace) => Promise<T>
): Promise<T> {
  const langfuse = getLangfuse();
  const tracer = trace.getTracer('orion-slack-agent');
  const ctx = typeof context === 'string' ? { name: context } : context;

  // Create Langfuse trace (langfuse always returns a client, possibly no-op)
  const langfuseTrace: LangfuseTrace = langfuse
    ? langfuse.trace({
        name: ctx.name,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        input: ctx.input,
        metadata: ctx.metadata,
      })
    : {
        id: 'noop-trace-id',
        update: (): void => {},
        span: (): LangfuseSpan => ({ end: (): void => {} }),
        generation: (): void => {},
      };

  const startTime = Date.now();

  return tracer.startActiveSpan(ctx.name, async (span) => {
    span.setAttributes({
      'orion.user_id': ctx.userId ?? 'unknown',
      'orion.session_id': ctx.sessionId ?? 'unknown',
      'orion.trace.input_present': ctx.input !== undefined,
    });

    try {
      const result = await operation(langfuseTrace);

      const durationMs = Date.now() - startTime;

      langfuseTrace.update({
        output: result,
        metadata: {
          ...ctx.metadata,
          durationMs,
          status: 'success',
        },
      });

      span.setAttributes({
        'orion.trace.status': 'success',
        'orion.trace.duration_ms': durationMs,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      langfuseTrace.update({
        metadata: {
          ...ctx.metadata,
          durationMs,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });

      span.setAttributes({
        'orion.trace.status': 'error',
        'orion.trace.duration_ms': durationMs,
      });
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.end();
      throw error;
    }
  });
}

/**
 * Create a span within an existing trace.
 * Use this for sub-operations within a handler.
 *
 * @example
 * const gatherSpan = createSpan(trace, { name: 'gather-context' });
 * const context = await gatherContext();
 * gatherSpan.end({ output: context });
 */
export function createSpan(
  trace: LangfuseTrace,
  context: SpanContext
): LangfuseSpan {
  return trace.span({
    name: context.name,
    input: context.input,
    metadata: context.metadata,
  });
}

/**
 * Log a generation (LLM call) within a trace.
 * Use this for Claude API calls.
 *
 * @example
 * logGeneration(trace, {
 *   name: 'claude-response',
 *   model: 'claude-sonnet-4-20250514',
 *   input: prompt,
 *   output: response,
 *   usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 * });
 */
export function logGeneration(
  trace: LangfuseTrace,
  params: GenerationParams
): void {
  trace.generation({
    name: params.name,
    model: params.model,
    input: params.input,
    output: params.output,
    usage: params.usage,
    metadata: params.metadata,
  });
}
