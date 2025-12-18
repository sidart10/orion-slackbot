/**
 * Orion Slack Agent - Entry Point
 *
 * Initializes and starts the Slack Bolt app with the Assistant class.
 *
 * @see AC#1 - threadStarted events handled via Assistant
 * @see AC#2 - threadContextChanged events handled via Assistant
 * @see AC#3 - userMessage events handled via Assistant
 * @see AC#5 - Startup traced in Langfuse
 * @see AC#6 - Structured logging
 */

// CRITICAL: instrumentation must be imported first
import './instrumentation.js';

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createSlackApp } from './slack/app.js';
import { assistant } from './slack/assistant.js';
import { handleUserMessage } from './slack/handlers/user-message.js';
import { config } from './config/environment.js';
import { logger } from './utils/logger.js';
import { startActiveObservation } from './observability/tracing.js';

/**
 * Starts the Orion Slack agent.
 *
 * - Creates Slack Bolt app
 * - Registers Assistant for thread handling
 * - Starts HTTP server for Cloud Run
 * - Wraps startup in Langfuse trace
 */
export async function startApp(): Promise<void> {
  await startActiveObservation(
    {
      name: 'orion-startup',
      metadata: {
        nodeEnv: config.nodeEnv,
        version: '0.1.0',
      },
    },
    async (trace) => {
      logger.info({
        event: 'orion_starting',
        nodeEnv: config.nodeEnv,
        traceId: trace.id,
      });

      // Create and configure Slack app
      const app = createSlackApp();

      // Register the Assistant class with the Bolt app
      // This handles threadStarted, threadContextChanged, and userMessage events
      app.assistant(assistant);

      // Also handle legacy DM message events (Story 1-3)
      // This enables "DM the bot" flows outside the Assistant UI.
      app.message(handleUserMessage);

      // Start the app
      await app.start(config.port);

      logger.info({
        event: 'app_started',
        port: config.port,
        environment: config.nodeEnv,
        assistant: 'registered',
        traceId: trace.id,
      });

      console.log(`⚡️ Orion is running on port ${config.port}`);

      return { status: 'initialized' };
    }
  );
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
