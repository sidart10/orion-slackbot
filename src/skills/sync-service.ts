/**
 * Skills Sync Service
 *
 * Synchronizes local skills to Anthropic Skills API.
 * Handles versioning, caching, and error recovery.
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#1 - Skills uploaded at startup, IDs cached
 * @see AC#4 - Modified SKILL.md creates new version (not new skill)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve } from 'path';
import { glob } from 'glob';
import { SkillsApiClient } from './api-client.js';
import { loadSkillMetadata } from './loader.js';
import { logger } from '../utils/logger.js';
import { getLangfuse } from '../observability/langfuse.js';
import type { SkillCache, SkillFile } from './types.js';

/** Cache file path */
const CACHE_PATH = '.skills/.cache/skills.json';

/** Maximum concurrent skill uploads (rate limit friendly) */
const MAX_CONCURRENT_UPLOADS = 3;

/**
 * Skill Cache Manager (Singleton)
 *
 * Encapsulates cache state to avoid module-level mutable variables.
 * Per project-context.md: "NO global mutable state"
 *
 * @internal
 */
class SkillCacheManager {
  private static instance: SkillCacheManager;
  private cache: SkillCache | null = null;

  private constructor() {}

  static getInstance(): SkillCacheManager {
    if (!SkillCacheManager.instance) {
      SkillCacheManager.instance = new SkillCacheManager();
    }
    return SkillCacheManager.instance;
  }

  getCache(): SkillCache | null {
    return this.cache;
  }

  setCache(cache: SkillCache): void {
    this.cache = cache;
  }

  reset(): void {
    this.cache = null;
  }
}

/**
 * Reset cache for testing.
 * @internal
 */
export function _resetCacheForTests(): void {
  SkillCacheManager.getInstance().reset();
}

/**
 * Compute SHA-256 hash of a skill directory.
 *
 * Used to detect changes and determine if a new version is needed.
 *
 * @param skillPath - Path to skill directory
 * @returns SHA-256 hash prefixed with "sha256:"
 */
export async function hashSkillDirectory(skillPath: string): Promise<string> {
  const skillMdPath = join(skillPath, 'SKILL.md');
  const content = await readFile(skillMdPath, 'utf-8');

  const hash = createHash('sha256');
  hash.update(content);

  // Include scripts directory hash if exists
  const scriptsPath = join(skillPath, 'scripts');
  if (existsSync(scriptsPath)) {
    const scriptFiles = await glob('**/*.py', { cwd: scriptsPath });
    for (const file of scriptFiles.sort()) {
      const scriptContent = await readFile(join(scriptsPath, file), 'utf-8');
      hash.update(file);
      hash.update(scriptContent);
    }
  }

  const digest = hash.digest('hex');
  // Return with sha256: prefix if not already present
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
}

/**
 * Load all files from a skill directory for upload.
 *
 * @param skillPath - Path to skill directory
 * @returns Array of files ready for API upload
 */
export async function loadSkillFiles(skillPath: string): Promise<SkillFile[]> {
  const files: SkillFile[] = [];

  // Load SKILL.md (required)
  const skillMdPath = join(skillPath, 'SKILL.md');
  if (existsSync(skillMdPath)) {
    const content = await readFile(skillMdPath, 'utf-8');
    files.push({ name: 'SKILL.md', content });
  }

  // Load scripts if present
  const scriptsPath = join(skillPath, 'scripts');
  if (existsSync(scriptsPath)) {
    const scriptFiles = await glob('**/*.py', { cwd: scriptsPath });
    for (const file of scriptFiles) {
      const content = await readFile(join(scriptsPath, file), 'utf-8');
      files.push({ name: `scripts/${file}`, content });
    }
  }

  return files;
}

/**
 * Load skill cache from disk.
 *
 * @returns Cached skill data or empty cache
 */
async function loadCache(): Promise<SkillCache> {
  const cacheManager = SkillCacheManager.getInstance();
  const existingCache = cacheManager.getCache();

  if (existingCache) {
    return existingCache;
  }

  const cachePath = resolve(CACHE_PATH);

  if (!existsSync(cachePath)) {
    const emptyCache: SkillCache = { skills: {} };
    cacheManager.setCache(emptyCache);
    return emptyCache;
  }

  try {
    const content = await readFile(cachePath, 'utf-8');
    const parsedCache = JSON.parse(content) as SkillCache;
    cacheManager.setCache(parsedCache);
    return parsedCache;
  } catch (error) {
    logger.warn({
      event: 'skills.cache.regenerated',
      reason: 'parse_error',
      error: error instanceof Error ? error.message : String(error),
    });
    const emptyCache: SkillCache = { skills: {} };
    cacheManager.setCache(emptyCache);
    return emptyCache;
  }
}

/**
 * Save skill cache to disk.
 *
 * @param cache - Cache data to persist
 */
async function saveCache(cache: SkillCache): Promise<void> {
  const cachePath = resolve(CACHE_PATH);
  const cacheDir = join(cachePath, '..');

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  SkillCacheManager.getInstance().setCache(cache);
}

/**
 * Sync result statistics.
 */
export interface SyncResult {
  uploaded: number;
  updated: number;
  cached: number;
  failed: number;
  skillIds: Record<string, string>;
}

/**
 * Synchronize local skills to Anthropic Skills API.
 *
 * - Loads local skill metadata
 * - Compares against cached hashes
 * - Uploads new or modified skills
 * - Creates new versions for modified skills
 * - Caches skill IDs for container parameter building
 *
 * @param traceId - Trace ID for observability
 * @returns Sync statistics
 *
 * @see AC#1 - Skills uploaded at startup, IDs cached
 * @see AC#4 - Modified SKILL.md creates new version
 */
export async function syncSkills(traceId: string): Promise<SyncResult> {
  const langfuse = getLangfuse();
  const span = langfuse?.span?.({ traceId, name: 'skills.sync' });

  const result: SyncResult = {
    uploaded: 0,
    updated: 0,
    cached: 0,
    failed: 0,
    skillIds: {},
  };

  try {
    // Load local skills
    const localSkills = await loadSkillMetadata(traceId);
    if (localSkills.length === 0) {
      logger.info({ event: 'skills.sync.no_skills', traceId });
      span?.end({ output: result });
      return result;
    }

    // Load cache
    const cache = await loadCache();
    const apiClient = new SkillsApiClient(traceId);

    // Process skills with concurrency limit using simple batching
    const processSkill = async (skill: typeof localSkills[number]) => {
      try {
        const contentHash = await hashSkillDirectory(skill.skillPath);
        const cached = cache.skills[skill.name];

        // Check if cached and unchanged
        if (cached && cached.contentHash === contentHash) {
          result.cached++;
          result.skillIds[skill.name] = cached.skillId;

          logger.debug({
            event: 'skills.sync.cached',
            skillName: skill.name,
            skillId: cached.skillId,
            traceId,
          });
          return;
        }

        // Load files for upload
        const files = await loadSkillFiles(skill.skillPath);

        // Determine if new skill or new version
        if (cached) {
          // Try to create new version
          try {
            const version = await apiClient.createSkillVersion(cached.skillId, files, skill.name);

            result.updated++;
            result.skillIds[skill.name] = cached.skillId;

            // Update cache
            cache.skills[skill.name] = {
              skillId: cached.skillId,
              latestVersion: version.version,
              contentHash,
              lastSynced: new Date().toISOString(),
            };

            logger.info({
              event: 'skills.sync.version_created',
              skillName: skill.name,
              skillId: cached.skillId,
              version: version.version,
              traceId,
            });
            return;
          } catch (versionError) {
            // Skill may have been deleted from API - create new
            logger.warn({
              event: 'skills.sync.version_failed_creating_new',
              skillName: skill.name,
              error: versionError instanceof Error ? versionError.message : String(versionError),
              traceId,
            });
            // Fall through to create new skill
          }
        }

        // Create new skill
        const created = await apiClient.createSkill(skill.name, files);

        result.uploaded++;
        result.skillIds[skill.name] = created.id;

        // Update cache
        cache.skills[skill.name] = {
          skillId: created.id,
          latestVersion: created.latest_version,
          contentHash,
          lastSynced: new Date().toISOString(),
        };

        logger.info({
          event: 'skills.sync.uploaded',
          skillName: skill.name,
          skillId: created.id,
          version: created.latest_version,
          traceId,
        });
      } catch (error) {
        result.failed++;
        logger.warn({
          event: 'skills.sync.upload_failed',
          skillName: skill.name,
          error: error instanceof Error ? error.message : String(error),
          traceId,
        });
      }
    };

    // Process in batches of MAX_CONCURRENT_UPLOADS
    for (let i = 0; i < localSkills.length; i += MAX_CONCURRENT_UPLOADS) {
      const batch = localSkills.slice(i, i + MAX_CONCURRENT_UPLOADS);
      await Promise.all(batch.map(processSkill));
    }

    // Save updated cache
    await saveCache(cache);

    logger.info({
      event: 'skills.sync.complete',
      uploaded: result.uploaded,
      updated: result.updated,
      cached: result.cached,
      failed: result.failed,
      traceId,
    });

    span?.end({ output: result });
    return result;
  } catch (error) {
    logger.error({
      event: 'skills.sync.error',
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });
    span?.end({ output: { ...result, error: String(error) } });
    throw error;
  }
}

/**
 * Get cached skill IDs.
 *
 * Returns the current in-memory cache of skill IDs.
 * Call syncSkills() first to populate.
 *
 * @returns Map of skill name to skill ID
 */
export function getCachedSkillIds(): Record<string, string> {
  const cache = SkillCacheManager.getInstance().getCache();
  if (!cache) {
    return {};
  }
  const ids: Record<string, string> = {};
  for (const [name, data] of Object.entries(cache.skills)) {
    ids[name] = data.skillId;
  }
  return ids;
}
