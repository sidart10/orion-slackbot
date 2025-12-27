/**
 * Slack Identity Resolution
 *
 * Provides cached lookups for channel and user names from Slack IDs.
 * Used for clear trace naming in Langfuse (e.g., "app-mention #engineering @sid").
 *
 * @see Enhanced Langfuse Tracing Plan
 */

import type { WebClient } from '@slack/web-api';
import { logger } from '../utils/logger.js';

// Cache channel/user names to avoid repeated API calls
// These are stable enough to cache for the lifetime of the process
const channelCache = new Map<string, string>();
const userCache = new Map<string, string>();

/**
 * Get the human-readable channel name for a channel ID.
 * Results are cached to avoid repeated API calls.
 *
 * @param client - Slack WebClient instance
 * @param channelId - Slack channel ID (e.g., "C05XXXXXX")
 * @returns Channel name (e.g., "engineering") or the ID if lookup fails
 */
export async function getChannelName(
  client: WebClient,
  channelId: string
): Promise<string> {
  // Return cached value if available
  if (channelCache.has(channelId)) {
    return channelCache.get(channelId)!;
  }

  try {
    const info = await client.conversations.info({ channel: channelId });
    const name = info.channel?.name ?? channelId;
    channelCache.set(channelId, name);
    return name;
  } catch (error) {
    logger.warn({
      event: 'channel_name_lookup_failed',
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Cache the ID itself to avoid repeated failed lookups
    channelCache.set(channelId, channelId);
    return channelId;
  }
}

/**
 * Get the human-readable display name for a user ID.
 * Results are cached to avoid repeated API calls.
 *
 * @param client - Slack WebClient instance
 * @param userId - Slack user ID (e.g., "U05XXXXXX")
 * @returns User display name or real name, or the ID if lookup fails
 */
export async function getUserDisplayName(
  client: WebClient,
  userId: string
): Promise<string> {
  // Return cached value if available
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    const info = await client.users.info({ user: userId });
    const name =
      info.user?.profile?.display_name ||
      info.user?.real_name ||
      info.user?.name ||
      userId;
    userCache.set(userId, name);
    return name;
  } catch (error) {
    logger.warn({
      event: 'user_name_lookup_failed',
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Cache the ID itself to avoid repeated failed lookups
    userCache.set(userId, userId);
    return userId;
  }
}

/**
 * Clear all cached identity data.
 * Useful for testing or when cache invalidation is needed.
 */
export function clearIdentityCache(): void {
  channelCache.clear();
  userCache.clear();
}

/**
 * Get cache sizes for monitoring.
 * @internal
 */
export function getIdentityCacheStats(): {
  channelCacheSize: number;
  userCacheSize: number;
} {
  return {
    channelCacheSize: channelCache.size,
    userCacheSize: userCache.size,
  };
}

