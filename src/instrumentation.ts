/**
 * Langfuse Instrumentation
 *
 * CRITICAL: This file MUST be imported first in index.ts
 * It initializes tracing before any other imports.
 *
 * Uses native Langfuse SDK for tracing (not OTEL integration) to avoid
 * version conflicts between @langfuse/otel and @opentelemetry packages.
 *
 * @see AR13 - Instrumentation.ts MUST be imported first in index.ts
 * @see NFR21 - OpenTelemetry-compatible tracing for Langfuse integration
 */

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

if (hasLangfuseCredentials) {
  logStructured('info', 'instrumentation_loaded', {
    tracing: 'enabled',
    backend: 'langfuse-native-sdk',
    baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
  });
} else {
  logStructured('warn', 'instrumentation_loaded', {
    tracing: 'disabled',
    reason: 'missing_langfuse_credentials',
    hint: 'Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY environment variables',
  });
}

// Export flag for verification
export const instrumentationLoaded = true;
