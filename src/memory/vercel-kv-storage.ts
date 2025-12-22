/**
 * Vercel KV Storage Adapter
 *
 * Implements persistent memory storage using Vercel KV (Redis).
 * Used for preferences and conversations in production (Vercel serverless).
 *
 * Key format: `orion:{type}:{key}`
 * - orion:preference:{userId}
 * - orion:conversation:{channelId}:{threadTs}
 *
 * @see Story 2.8 - Task 9: Implement Vercel KV Adapter
 */

import { kv } from '@vercel/kv';
import { logger } from '../utils/logger.js';

/**
 * Memory types that can be stored in Vercel KV
 */
export type KVMemoryType = 'preference' | 'conversation' | 'knowledge';

/**
 * Build a Vercel KV key from type and identifier
 *
 * @param type - Memory type
 * @param key - Unique identifier (userId, channelId_threadTs, etc.)
 * @returns Formatted KV key
 */
export function buildKVKey(type: KVMemoryType, key: string): string {
  return `orion:${type}:${key}`;
}

/**
 * Parse a Vercel KV key into type and identifier
 *
 * @param kvKey - The full KV key
 * @returns Parsed type and key, or null if invalid format
 */
export function parseKVKey(kvKey: string): { type: KVMemoryType; key: string } | null {
  const match = kvKey.match(/^orion:(preference|conversation|knowledge):(.+)$/);
  if (!match) return null;
  return { type: match[1] as KVMemoryType, key: match[2] };
}

/**
 * Stored memory data structure in KV
 */
export interface KVMemoryData<T = unknown> {
  /** The actual data */
  data: T;
  /** When the memory was created */
  createdAt: string;
  /** When the memory was last updated */
  updatedAt: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Save data to Vercel KV
 *
 * @param type - Memory type
 * @param key - Unique identifier
 * @param data - Data to store
 * @param metadata - Optional metadata
 */
export async function saveToKV<T>(
  type: KVMemoryType,
  key: string,
  data: T,
  metadata?: Record<string, unknown>
): Promise<void> {
  const kvKey = buildKVKey(type, key);
  const now = new Date().toISOString();

  // Try to get existing to preserve createdAt
  const existing = await loadFromKV<T>(type, key);
  const createdAt = existing?.createdAt ?? now;

  const memoryData: KVMemoryData<T> = {
    data,
    createdAt,
    updatedAt: now,
    metadata,
  };

  await kv.set(kvKey, memoryData);

  logger.info({
    event: 'kv_memory_saved',
    type,
    key,
    kvKey,
  });
}

/**
 * Load data from Vercel KV
 *
 * @param type - Memory type
 * @param key - Unique identifier
 * @returns Stored memory data or null if not found
 */
export async function loadFromKV<T>(
  type: KVMemoryType,
  key: string
): Promise<KVMemoryData<T> | null> {
  const kvKey = buildKVKey(type, key);

  try {
    const data = await kv.get<KVMemoryData<T>>(kvKey);
    return data;
  } catch (error) {
    logger.warn({
      event: 'kv_memory_load_failed',
      type,
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Delete data from Vercel KV
 *
 * @param type - Memory type
 * @param key - Unique identifier
 * @returns True if deleted, false if not found
 */
export async function deleteFromKV(type: KVMemoryType, key: string): Promise<boolean> {
  const kvKey = buildKVKey(type, key);
  const result = await kv.del(kvKey);
  return result > 0;
}

/**
 * List all keys of a specific memory type
 *
 * Uses SCAN to iterate through keys with the type prefix.
 *
 * @param type - Memory type to list
 * @param pattern - Optional additional pattern after type prefix
 * @returns Array of keys (without the orion:{type}: prefix)
 */
export async function listKVKeys(type: KVMemoryType, pattern?: string): Promise<string[]> {
  const prefix = `orion:${type}:${pattern ?? ''}*`;
  const keys: string[] = [];

  // Use scanIterator for cleaner async iteration
  for await (const kvKey of kv.scanIterator({ match: prefix, count: 100 })) {
    const parsed = parseKVKey(kvKey);
    if (parsed) {
      keys.push(parsed.key);
    }
  }

  return keys;
}

/**
 * Check if Vercel KV is available
 *
 * @returns True if KV is configured and accessible
 */
export async function isKVAvailable(): Promise<boolean> {
  try {
    // Simple ping to check connectivity
    await kv.ping();
    return true;
  } catch {
    return false;
  }
}

