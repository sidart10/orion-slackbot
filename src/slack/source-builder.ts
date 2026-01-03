/**
 * Source Builder for Thread Messages
 *
 * Builds clickable source citations from thread messages at handler level.
 * Generates Slack permalinks and human-readable titles.
 *
 * @see Tech-Spec: Source Citations Fix
 */

import type { WebClient } from '@slack/web-api';
import type { ThreadMessage } from './thread-context.js';
import type { ContextSource } from '../agent/gather.js';
import { getMessagePermalink } from './permalinks.js';
import { getUserDisplayName } from './identity.js';
import { logger } from '../utils/logger.js';

export interface ThreadSourceParams {
  client: WebClient;
  channel: string;
  threadTs: string;
  messages: ThreadMessage[];
  /** Max sources to generate (default: 5) */
  maxSources?: number;
}

/**
 * Build sources from thread messages with permalinks.
 * Only returns sources that have valid URLs.
 *
 * @param params - Thread source parameters
 * @returns Array of context sources with permalinks
 */
export async function buildThreadSources(
  params: ThreadSourceParams
): Promise<ContextSource[]> {
  const { client, channel, messages, maxSources = 5 } = params;
  const sources: ContextSource[] = [];

  // Skip bot messages and exclude the most recent user message
  // (that's the current question - citing it is useless)
  const userMessages = messages.filter((msg) => !msg.isBot);
  
  // If there's only 0-1 user messages, there's no meaningful history to cite
  if (userMessages.length <= 1) {
    return sources;
  }
  
  // Take from history EXCLUDING the most recent (current) message
  const historyMessages = userMessages.slice(0, -1);
  const messagesToSource = historyMessages.slice(-maxSources);

  if (messagesToSource.length === 0) {
    return sources;
  }

  // Resolve user names and permalinks in parallel (with error handling)
  // Each call is wrapped to ensure one failure doesn't block others
  const uniqueUserIds = [...new Set(messagesToSource.map((m) => m.user))];
  const userNameMap = new Map<string, string>();

  try {
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        if (userId && userId !== 'unknown') {
          try {
            const displayName = await getUserDisplayName(client, userId);
            userNameMap.set(userId, displayName);
          } catch (err) {
            // Individual user lookup failed - log and continue
            logger.debug({
              event: 'user_name_lookup_failed_in_source_builder',
              userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      })
    );
  } catch (err) {
    // Entire Promise.all failed - log and continue with empty map
    logger.warn({
      event: 'user_name_resolution_failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Generate permalinks in parallel for performance (with 2s timeout per call)
  const PERMALINK_TIMEOUT_MS = 2000;
  const permalinkPromises = messagesToSource.map(async (msg) => {
    try {
      const result = await Promise.race([
        getMessagePermalink(client, channel, msg.ts),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('permalink_timeout')), PERMALINK_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch {
      // Timeout or error - return null (source will be skipped)
      return null;
    }
  });
  const permalinks = await Promise.all(permalinkPromises);

  for (let i = 0; i < messagesToSource.length; i++) {
    const msg = messagesToSource[i];
    const permalink = permalinks[i];
    if (!permalink) continue; // Skip if no URL available

    // Build human-readable title with resolved userName
    const resolvedName = userNameMap.get(msg.user);
    const role = msg.isBot ? 'Orion' : resolvedName ?? msg.userName ?? 'User';
    const excerpt =
      msg.text.length > 50 ? msg.text.slice(0, 50) + '…' : msg.text;
    const title = `${role}: "${excerpt}"`;

    sources.push({
      type: 'thread',
      title,
      reference: `${channel}/${msg.ts}`,
      url: permalink,
      excerpt: msg.text.slice(0, 200),
    });
  }

  return sources;
}

/**
 * Filter sources to only include displayable ones.
 * - Memory sources: always shown (implicit trust)
 * - Tool sources: only show if NO URL (Claude cites URLs inline in response)
 * - Thread/file sources: must have URLs to be clickable
 *
 * @param sources - Array of context sources
 * @returns Filtered array with displayable sources
 */
export function filterClickableSources(sources: ContextSource[]): ContextSource[] {
  return sources.filter((s) => {
    // Memory sources: always show (implicit trust)
    if (s.type === 'memory') return true;
    // Tool sources: only show if NO URL (Claude cites URLs inline)
    if (s.type === 'tool') return !s.url;
    // Thread/file sources: must have URL to be clickable
    return !!s.url;
  });
}

