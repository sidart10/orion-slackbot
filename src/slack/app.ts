/**
 * Slack Bolt App Configuration
 *
 * Supports two modes:
 * - Socket Mode: For local development (requires SLACK_APP_TOKEN)
 * - HTTP Mode: For Cloud Run deployment (uses ExpressReceiver)
 *
 * @see AC#1 - Receives messages via Bolt app
 * @see AC#2 - Validates request signatures via signing secret
 * @see NFR7 - All Slack requests validated via signing secret
 * @see Story 1-6 - Health endpoint for Cloud Run
 */

import type { App as AppType, ExpressReceiver as ExpressReceiverType } from '@slack/bolt';
import type { Request, Response } from 'express';
import bolt from '@slack/bolt';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Read version from package.json at startup (works in Docker where npm_package_version is unavailable)
const __dirname = dirname(fileURLToPath(import.meta.url));
let appVersion = '0.1.0';
try {
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  appVersion = pkg.version || appVersion;
} catch {
  // Fallback to default version if package.json not found
}

const { App, ExpressReceiver, LogLevel } = bolt as {
  App: typeof AppType;
  ExpressReceiver: typeof ExpressReceiverType;
  LogLevel: typeof bolt.LogLevel;
};

import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';

/**
 * Express receiver for HTTP mode with custom routes.
 * Enables health check endpoint required for Cloud Run.
 */
let receiver: ExpressReceiverType | undefined;

/**
 * Check if Socket Mode should be used (local development).
 * Socket Mode is enabled when SLACK_APP_TOKEN is provided.
 */
function useSocketMode(): boolean {
  return !!config.slackAppToken && config.slackAppToken.startsWith('xapp-');
}

/**
 * Creates and configures a Slack Bolt App instance.
 *
 * Mode selection:
 * - Socket Mode: When SLACK_APP_TOKEN is present (local dev, no public URL needed)
 * - HTTP Mode: When no app token (Cloud Run with public URL)
 *
 * @returns Configured Bolt App instance
 */
export function createSlackApp(): AppType {
  const socketMode = useSocketMode();

  if (socketMode) {
    // Socket Mode for local development
    logger.info({
      event: 'slack_app_mode',
      mode: 'socket',
      reason: 'SLACK_APP_TOKEN detected',
    });

    return new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      socketMode: true,
      logLevel: config.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
    });
  }

  // HTTP Mode for Cloud Run deployment
  logger.info({
    event: 'slack_app_mode',
    mode: 'http',
    reason: 'No SLACK_APP_TOKEN, using ExpressReceiver',
  });

  // Create Express receiver for HTTP mode (Cloud Run)
  receiver = new ExpressReceiver({
    signingSecret: config.slackSigningSecret,
    endpoints: '/slack/events',
  });

  // Add health check endpoint (required for Cloud Run)
  // Express router is typed as IRouter which has get() method
  receiver.router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: appVersion,
    });
  });

  // Create Bolt app in HTTP mode with custom receiver
  return new App({
    token: config.slackBotToken,
    receiver,
    logLevel: config.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  });
}

/**
 * Gets the Express receiver for testing purposes.
 * @returns The ExpressReceiver instance or undefined if not initialized
 */
export function getReceiver(): ExpressReceiverType | undefined {
  return receiver;
}

// Export type for use in handlers
export type SlackApp = AppType;

