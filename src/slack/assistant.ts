/**
 * Slack Assistant Class for Orion
 *
 * The Assistant class is Slack's native API for AI agent applications.
 * It provides automatic thread management, context storage, and UI utilities.
 *
 * Events handled:
 * - threadStarted: User opens a new thread with Orion
 * - threadContextChanged: User switches context (e.g., different channel)
 * - userMessage: User sends a message in an existing thread
 *
 * @see AC#1 - threadStarted events handled
 * @see AC#2 - threadContextChanged events handled
 * @see AC#3 - userMessage events handled
 * @see https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/
 */

import bolt from '@slack/bolt';
import type { Assistant as AssistantType } from '@slack/bolt';
import { handleThreadStarted } from './handlers/thread-started.js';

const { Assistant } = bolt;
import { handleThreadContextChanged } from './handlers/thread-context-changed.js';
import { handleAssistantUserMessage } from './handlers/user-message.js';

/**
 * Creates a Slack Assistant instance configured with Orion handlers.
 *
 * @returns Configured Assistant instance
 */
export function createAssistant(): AssistantType {
  return new Assistant({
    threadStarted: handleThreadStarted,
    threadContextChanged: handleThreadContextChanged,
    userMessage: handleAssistantUserMessage,
  });
}

/**
 * Default assistant instance for use in the application.
 * Created via factory function for testability.
 */
export const assistant = createAssistant();

