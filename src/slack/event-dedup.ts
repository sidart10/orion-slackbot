/**
 * Event Deduplication for Slack Message Handlers
 *
 * Prevents duplicate responses when Slack routes the same message to multiple handlers.
 * Uses an in-memory LRU-style cache with TTL to track recently processed messages.
 *
 * @see Story 7.5 - Fix Duplicate Response Bug
 * @see AC2 - Single Response Delivery
 */

import { logger } from '../utils/logger.js';

/** How long to remember processed messages (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum number of entries to keep (prevents memory leaks) */
const MAX_CACHE_SIZE = 1000;

interface CacheEntry {
  timestamp: number;
  handlerId: string;
}

/**
 * In-memory cache of recently processed message events.
 * Key format: `${channelId}:${messageTs}`
 */
const processedMessages = new Map<string, CacheEntry>();

/**
 * Check if a message event has already been processed.
 * If not, marks it as being processed by this handler.
 *
 * @param channelId - Slack channel ID
 * @param messageTs - Message timestamp (unique per message)
 * @param handlerId - Identifier for the handler (e.g., 'app_mention', 'assistant')
 * @param traceId - Optional trace ID for log correlation
 * @returns true if this is a duplicate (already processed), false if first time
 */
export function isDuplicateEvent(
  channelId: string,
  messageTs: string,
  handlerId: string,
  traceId?: string
): boolean {
  const cacheKey = `${channelId}:${messageTs}`;
  const existing = processedMessages.get(cacheKey);

  if (existing) {
    logger.debug({
      event: 'event_dedup.duplicate_detected',
      cacheKey,
      originalHandler: existing.handlerId,
      duplicateHandler: handlerId,
      ageMs: Date.now() - existing.timestamp,
      traceId,
    });
    return true;
  }

  // Mark as processed
  processedMessages.set(cacheKey, {
    timestamp: Date.now(),
    handlerId,
  });

  // Cleanup old entries if cache is getting large
  if (processedMessages.size > MAX_CACHE_SIZE) {
    cleanupCache();
  }

  logger.debug({
    event: 'event_dedup.registered',
    cacheKey,
    handlerId,
    cacheSize: processedMessages.size,
    traceId,
  });

  return false;
}

/**
 * Remove expired entries from the cache.
 * Called automatically when cache exceeds MAX_CACHE_SIZE.
 */
function cleanupCache(): void {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of processedMessages) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      processedMessages.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    logger.debug({
      event: 'event_dedup.cleanup',
      removed,
      remaining: processedMessages.size,
    });
  }
}

/**
 * Clear all cached entries (for testing).
 */
export function clearDedupCache(): void {
  processedMessages.clear();
}

/**
 * Get current cache size (for testing/monitoring).
 */
export function getDedupCacheSize(): number {
  return processedMessages.size;
}

/**
 * Force cleanup of expired entries (for testing).
 * @internal
 */
export function forceCleanup(): void {
  cleanupCache();
}

/**
 * Get cache TTL in milliseconds (for testing).
 * @internal
 */
export const CACHE_TTL = CACHE_TTL_MS;

/**
 * Get max cache size (for testing).
 * @internal
 */
export const MAX_CACHE = MAX_CACHE_SIZE;

