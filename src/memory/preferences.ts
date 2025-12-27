/**
 * User Preferences Module
 *
 * Handles storage and retrieval of per-user preferences.
 *
 * ## Storage Backend
 * - **Vercel Production**: Uses Vercel KV (Redis) for persistence across function invocations
 * - **Local Development**: Uses YAML files in orion-context/user-preferences/
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#3 - User preferences stored in orion-context/user-preferences/
 * @see Task 10: Migrate Preferences to Vercel KV
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import YAML from 'yaml';
import { ORION_CONTEXT_ROOT } from './index.js';
import { logger } from '../utils/logger.js';
import { saveToKV, loadFromKV } from './vercel-kv-storage.js';

/**
 * Check if running on Vercel (production)
 * Vercel KV requires KV_REST_API_URL to be set
 */
function isVercelKVAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

/** Directory for user preference files */
const PREFERENCES_DIR = join(ORION_CONTEXT_ROOT, 'user-preferences');

/**
 * User preference data structure
 */
export interface UserPreference {
  /** Slack user ID */
  userId: string;
  /** Key-value preference map */
  preferences: Record<string, string | number | boolean>;
  /** When preference was first created */
  createdAt: string;
  /** When preference was last updated */
  updatedAt: string;
}

/**
 * Get the file path for a user's preferences
 *
 * @param userId - Slack user ID
 * @returns Path to the user's preference file
 */
export function getPreferencePath(userId: string): string {
  return join(PREFERENCES_DIR, `${userId}.yaml`);
}

/**
 * Load a user's preferences
 *
 * Uses Vercel KV on production, file-based storage locally.
 *
 * @param userId - Slack user ID
 * @returns User preference object or null if not found
 */
export async function loadUserPreference(userId: string): Promise<UserPreference | null> {
  // Use Vercel KV on production
  if (isVercelKVAvailable()) {
    return loadUserPreferenceFromKV(userId);
  }

  // Fall back to file-based storage locally
  return loadUserPreferenceFromFile(userId);
}

/**
 * Load preferences from Vercel KV
 */
async function loadUserPreferenceFromKV(userId: string): Promise<UserPreference | null> {
  const result = await loadFromKV<UserPreference>('preference', userId);
  if (!result) return null;

  return {
    userId: result.data.userId || userId,
    preferences: result.data.preferences || {},
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * Load preferences from file (local development)
 */
async function loadUserPreferenceFromFile(userId: string): Promise<UserPreference | null> {
  const path = getPreferencePath(userId);

  try {
    const content = await readFile(path, 'utf-8');
    const data = YAML.parse(content);

    return {
      userId: data.userId || userId,
      preferences: data.preferences || {},
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  } catch {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Save or update a user's preferences
 *
 * Merges with existing preferences if they exist.
 * Uses Vercel KV on production, file-based storage locally.
 *
 * @param userId - Slack user ID
 * @param newPreferences - Preferences to save/update
 */
export async function saveUserPreference(
  userId: string,
  newPreferences: Record<string, string | number | boolean>
): Promise<void> {
  // Use Vercel KV on production
  if (isVercelKVAvailable()) {
    return saveUserPreferenceToKV(userId, newPreferences);
  }

  // Fall back to file-based storage locally
  return saveUserPreferenceToFile(userId, newPreferences);
}

/**
 * Save preferences to Vercel KV
 */
async function saveUserPreferenceToKV(
  userId: string,
  newPreferences: Record<string, string | number | boolean>
): Promise<void> {
  // Load existing preferences if they exist
  const existing = await loadUserPreference(userId);

  const preference: UserPreference = {
    userId,
    preferences: {
      ...(existing?.preferences || {}),
      ...newPreferences,
    },
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveToKV('preference', userId, preference);

  logger.info({
    event: 'user_preference_saved',
    userId,
    preferencesCount: Object.keys(preference.preferences).length,
    storage: 'vercel-kv',
  });
}

/**
 * Save preferences to file (local development)
 */
async function saveUserPreferenceToFile(
  userId: string,
  newPreferences: Record<string, string | number | boolean>
): Promise<void> {
  const path = getPreferencePath(userId);
  const now = new Date().toISOString();

  // Load existing preferences if they exist
  const existing = await loadUserPreference(userId);

  const preference: UserPreference = {
    userId,
    preferences: {
      ...(existing?.preferences || {}),
      ...newPreferences,
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  // Write YAML file
  const content = YAML.stringify(preference);
  await writeFile(path, content);

  logger.info({
    event: 'user_preference_saved',
    userId,
    preferencesCount: Object.keys(preference.preferences).length,
    path,
  });
}

/**
 * Get a specific preference value for a user
 *
 * @param userId - Slack user ID
 * @param key - Preference key to retrieve
 * @returns Preference value or undefined if not set
 */
export async function getUserPreferenceValue(
  userId: string,
  key: string
): Promise<string | number | boolean | undefined> {
  const pref = await loadUserPreference(userId);
  return pref?.preferences[key];
}

