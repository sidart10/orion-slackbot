/**
 * Orion Slack Agent - Entry Point
 *
 * Initializes and starts the Slack Bolt app with the Assistant class.
 *
 * @see AC#1 - threadStarted events handled via Assistant
 * @see AC#2 - threadContextChanged events handled via Assistant
 * @see AC#3 - userMessage events handled via Assistant
 * @see AC#6 - Structured logging
 */

// CRITICAL: instrumentation must be imported first
import { shutdownInstrumentation } from './instrumentation.js';

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createSlackApp, isSocketMode } from './slack/app.js';
import { assistant } from './slack/assistant.js';
import { handleAppMention } from './slack/handlers/app-mention.js';
import { config } from './config/environment.js';
import { logger } from './utils/logger.js';
import { shutdown as shutdownLangfuse } from './observability/langfuse.js';

/**
 * Starts the Orion Slack agent.
 *
 * - Creates Slack Bolt app
 * - Registers Assistant for thread handling
 * - Starts HTTP server for Cloud Run
 */
export async function startApp(): Promise<void> {
  logger.info({
    event: 'orion_starting',
    nodeEnv: config.nodeEnv,
  });

  // Create and configure Slack app with ExpressReceiver
  const { app } = createSlackApp();

  // Register the Assistant class with the Bolt app
  // This handles threadStarted, threadContextChanged, and userMessage events
  app.assistant(assistant);

  // Register app_mention handler for channel @orion mentions (Story 2.8)
  // This runs parallel to Assistant - uses same agent infrastructure
  app.event('app_mention', handleAppMention);

  // Start the app
  await app.start(config.port);

  logger.info({
    event: 'app_started',
    mode: isSocketMode ? 'socket' : 'http',
    port: isSocketMode ? 'N/A (WebSocket)' : config.port,
    environment: config.nodeEnv,
    assistant: 'registered',
  });

  // Register centralized graceful shutdown handler
  // Coordinates shutdown of Langfuse client and OpenTelemetry SDK
  process.on('SIGTERM', async () => {
    logger.info({ event: 'server.shutdown.started' });
    // Shutdown Langfuse client first (flushes pending traces)
    await shutdownLangfuse();
    // Then shutdown OTel SDK (stops span processor)
    await shutdownInstrumentation();
    logger.info({ event: 'server.shutdown.complete' });
    process.exit(0);
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

// Auto-start ONLY when run directly (avoid side effects on import)
if (isMainModule()) {
  startApp().catch((error) => {
    logger.error({
      event: 'orion_startup_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
