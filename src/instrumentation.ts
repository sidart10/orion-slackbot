/**
 * Langfuse Instrumentation
 *
 * CRITICAL: This file MUST be imported first in index.ts
 * It initializes OpenTelemetry with LangfuseSpanProcessor before any other imports.
 *
 * Uses @langfuse/otel for proper trace collection and nesting.
 *
 * @see AR13 - Instrumentation.ts MUST be imported first in index.ts
 * @see NFR21 - OpenTelemetry-compatible tracing for Langfuse integration
 */

// Load dotenv FIRST before checking env vars
import 'dotenv/config';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

// Service identification constants
export const SERVICE_NAME = 'orion-slack-agent';
export const SERVICE_VERSION = '0.1.0';

// Structured logging helper per AR12
function logStructured(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      service: SERVICE_NAME,
      ...data,
    })
  );
}

// Check if we have Langfuse credentials
const hasLangfuseCredentials = !!(
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
);

// Initialize OpenTelemetry SDK with Langfuse span processor
let sdk: NodeSDK | null = null;

if (hasLangfuseCredentials) {
  try {
    sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor()],
      serviceName: SERVICE_NAME,
    });
    sdk.start();

    logStructured('info', 'instrumentation_loaded', {
      tracing: 'enabled',
      backend: 'langfuse-otel',
      baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
    });
  } catch (error) {
    logStructured('error', 'instrumentation_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
} else {
  logStructured('warn', 'instrumentation_loaded', {
    tracing: 'disabled',
    reason: 'missing_langfuse_credentials',
    hint: 'Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY environment variables',
  });
}

/**
 * Gracefully shutdown the OpenTelemetry SDK.
 * Should be called during application shutdown, before process exit.
 */
export async function shutdownInstrumentation(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    logStructured('info', 'instrumentation_shutdown');
  }
}

// Export flag for verification
export const instrumentationLoaded = true;
