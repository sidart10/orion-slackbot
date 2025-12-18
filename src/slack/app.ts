/**
 * Slack Bolt App Configuration
 *
 * Initializes the Slack Bolt app in HTTP mode for Cloud Run deployment.
 * Uses signing secret validation for request verification.
 *
 * @see AC#1 - Receives messages via Bolt app
 * @see AC#2 - Validates request signatures via signing secret
 * @see NFR7 - All Slack requests validated via signing secret
 */

import { App, LogLevel } from '@slack/bolt';
import { config } from '../config/environment.js';

/**
 * Creates and configures a Slack Bolt App instance.
 *
 * Configuration:
 * - HTTP mode (not socket mode) for Cloud Run compatibility
 * - Signing secret for request validation (AC#2, NFR7)
 * - Log level based on environment
 *
 * @returns Configured Bolt App instance
 */
export function createSlackApp(): App {
  return new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret,
    // HTTP mode - not socket mode for Cloud Run
    socketMode: false,
    logLevel: config.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  });
}

// Export type for use in handlers
export type SlackApp = App;

