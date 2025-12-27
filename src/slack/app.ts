/**
 * Slack Bolt App Configuration
 *
 * Supports two modes:
 * - Socket Mode: For local development (uses WebSocket, no public URL needed)
 * - HTTP Mode: For Cloud Run deployment (uses ExpressReceiver)
 *
 * Set SLACK_SOCKET_MODE=true for local dev.
 *
 * @see AC#1 - Receives messages via Bolt app
 * @see AC#2 - Validates request signatures via signing secret
 * @see NFR7 - All Slack requests validated via signing secret
 * @see Story 1.6 - Docker & Cloud Run Deployment
 */

import bolt from '@slack/bolt';
import type {
  App as AppType,
  ExpressReceiver as ExpressReceiverType,
} from '@slack/bolt';
import { config } from '../config/environment.js';
import { handleFeedback } from './handlers/feedback.js';
import { getMcpServersConfig, getAllServerHealth } from '../tools/mcp/index.js';

const { App, ExpressReceiver, LogLevel } = bolt;

/**
 * Check if Socket Mode is enabled for local development.
 */
export const isSocketMode = process.env.SLACK_SOCKET_MODE === 'true';

/**
 * Creates an ExpressReceiver for HTTP mode with health endpoint.
 *
 * @returns Configured ExpressReceiver with health endpoint
 */
export function createReceiver(): ExpressReceiverType {
  const receiver = new ExpressReceiver({
    signingSecret: config.slackSigningSecret,
    endpoints: '/slack/events',
  });

  // Health check endpoint (required for Cloud Run)
  receiver.router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    });
  });

  /**
   * MCP Health endpoint - lightweight snapshot of configured servers.
   *
   * Non-blocking: Does NOT force-connect to servers (respects lazy connection).
   * Returns configured servers and last-known client stats when available.
   *
   * @see Story 3.1 - AC#7
   */
  receiver.router.get('/health/mcp', (_req, res) => {
    try {
      // Get configured servers (does not connect)
      const configuredServers = getMcpServersConfig();
      const serverNames = Object.keys(configuredServers);

      // Get last-known health stats (from actual client usage, if any)
      const healthStats = getAllServerHealth();

      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        configuredServers: serverNames,
        serverCount: serverNames.length,
        healthStats: healthStats.map((h) => ({
          name: h.name,
          available: h.available,
          failureCount: h.failureCount,
          lastError: h.lastError,
          lastErrorTime: h.lastErrorTime?.toISOString(),
        })),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return receiver;
}

/**
 * Creates and configures a Slack Bolt App instance.
 *
 * Configuration:
 * - Socket Mode (SLACK_SOCKET_MODE=true): For local dev, uses WebSocket
 * - HTTP Mode (default): For Cloud Run, uses ExpressReceiver
 * - Signing secret for request validation (AC#2, NFR7)
 * - Health endpoint at /health for Cloud Run readiness probes
 * - Log level based on environment
 *
 * @returns Configured Bolt App instance and optional receiver (null in socket mode)
 */
export function createSlackApp(): { app: AppType; receiver: ExpressReceiverType | null } {
  const logLevel = config.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO;

  if (isSocketMode) {
    // Socket Mode for local development
    const app = new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      socketMode: true,
      logLevel,
    });

    // Register feedback button action handler (Story 1.8)
    app.action('orion_feedback', handleFeedback);

    return { app, receiver: null };
  }

  // HTTP Mode for Cloud Run
  const receiver = createReceiver();

  const app = new App({
    token: config.slackBotToken,
    receiver,
    logLevel,
  });

  // Register feedback button action handler (Story 1.8)
  app.action('orion_feedback', handleFeedback);

  return { app, receiver };
}

// Export type for use in handlers
export type SlackApp = AppType;

