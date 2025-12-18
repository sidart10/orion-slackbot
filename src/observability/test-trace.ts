/**
 * Manual Test Harness for Langfuse Tracing
 *
 * Run this script to verify traces appear in the Langfuse dashboard.
 *
 * Usage: pnpm trace:test
 *
 * Expected behavior:
 * 1. Creates a trace named 'test-trace' with user and session IDs
 * 2. Creates nested spans for gather, act, and verify phases
 * 3. Logs a generation event
 * 4. Flushes traces to Langfuse
 *
 * Verify in Langfuse dashboard that:
 * - Trace appears with name 'test-trace'
 * - Trace has userId 'test-user-123' and sessionId 'test-session-456'
 * - Nested spans show gather-context, generate-response, verify-response
 * - Duration is tracked for each span
 * - Metadata includes all expected fields
 */

// Import instrumentation first (mimics production startup)
import '../instrumentation.js';

import { startActiveObservation, createSpan, logGeneration } from './tracing.js';
import { getLangfuse, shutdown } from './langfuse.js';

// Structured logging helper
function log(message: string, data?: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'trace_test',
      message,
      ...data,
    })
  );
}

async function testTracing(): Promise<void> {
  log('Starting trace test...');

  const langfuse = getLangfuse();
  if (!langfuse) {
    log('Langfuse not configured. Running in no-op mode. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to send real traces.');
  }

  await startActiveObservation(
    {
      name: 'test-trace',
      userId: 'test-user-123',
      sessionId: 'test-session-456',
      input: { query: 'What is Orion?' },
      metadata: {
        environment: 'development',
        testRun: true,
        testTimestamp: new Date().toISOString(),
      },
    },
    async (trace) => {
      log('Created trace', { traceId: trace.id });

      // Simulate gather phase (like collecting context from Slack/Confluence)
      const gatherSpan = createSpan(trace, {
        name: 'gather-context',
        input: { sources: ['slack', 'confluence'] },
        metadata: { phase: 'gather' },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      gatherSpan.end({ output: { documentsFound: 5, relevantSources: 3 } });
      log('Completed gather phase');

      // Simulate act phase (like generating a response with Claude)
      const actSpan = createSpan(trace, {
        name: 'generate-response',
        input: { prompt: 'Summarize context about Orion' },
        metadata: { phase: 'act' },
      });
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Log a generation event (simulating Claude API call)
      logGeneration(trace, {
        name: 'claude-completion',
        model: 'claude-sonnet-4-20250514',
        input: 'Summarize context about Orion',
        output: 'Orion is an agentic AI system built with Claude.',
        usage: {
          promptTokens: 150,
          completionTokens: 50,
          totalTokens: 200,
        },
        metadata: { temperature: 0.7 },
      });

      actSpan.end({
        output: { response: 'Orion is an agentic AI system.' },
      });
      log('Completed act phase');

      // Simulate verify phase (like checking response quality)
      const verifySpan = createSpan(trace, {
        name: 'verify-response',
        input: { response: 'Orion is an agentic AI system.' },
        metadata: { phase: 'verify' },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      verifySpan.end({
        output: { verified: true, confidence: 0.95 },
      });
      log('Completed verify phase');

      return {
        success: true,
        response: 'Orion is an agentic AI system built with Claude.',
      };
    }
  );

  // Ensure traces are flushed before exit
  log('Flushing traces to Langfuse...');
  if (langfuse) {
    await langfuse.flushAsync();
  }

  log('Shutting down Langfuse client...');
  await shutdown();

  log('Trace test complete!');
  log('Check your Langfuse dashboard for the test-trace.');
  log('Expected: trace with gather/act/verify spans and generation event.');
}

testTracing().catch((error) => {
  console.error('Trace test failed:', error);
  process.exit(1);
});
