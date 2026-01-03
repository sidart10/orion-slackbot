/**
 * Slack Message Permalink Utilities
 *
 * Generates clickable Slack permalinks for thread messages.
 * Uses chat.getPermalink API with fallback to constructed URLs.
 *
 * @see Tech-Spec: Source Citations Fix
 */

import type { WebClient } from '@slack/web-api';
import { logger } from '../utils/logger.js';

/**
 * Generate Slack permalink for a message.
 *
 * Uses the Slack API `chat.getPermalink` for reliability.
 * Falls back to constructing a URL if the API fails.
 *
 * @param client - Slack WebClient instance
 * @param channel - Channel ID
 * @param messageTs - Message timestamp
 * @returns Permalink URL or null on critical failure
 */
export async function getMessagePermalink(
  client: WebClient,
  channel: string,
  messageTs: string
): Promise<string | null> {
  try {
    const result = await client.chat.getPermalink({
      channel,
      message_ts: messageTs,
    });
    return result.permalink ?? null;
  } catch (error) {
    // Log the error for debugging, then fallback to constructed URL
    logger.debug({
      event: 'permalink_api_fallback',
      channel,
      messageTs,
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback: construct URL (less reliable but better than nothing)
    // Format: https://slack.com/archives/{channel}/p{ts_without_dot}
    const tsNoDot = messageTs.replace('.', '');
    return `https://slack.com/archives/${channel}/p${tsNoDot}`;
  }
}

