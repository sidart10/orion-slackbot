/**
 * Skill Registry Service
 *
 * Centralized registry that extends the sync-service cache with:
 * - Anthropic built-in skill support (xlsx, pdf, docx)
 * - Metadata lookup by skill ID
 * - Type classification (custom vs anthropic)
 * - API-ready container format
 *
 * @see Story 6.4 - Skill Registry Service
 * @see AC#1 - Registry loads from cache file
 * @see AC#2 - getSkillId() returns Anthropic skill ID
 * @see AC#3 - Built-in skills use name as ID
 * @see AC#4 - getAllSkillIds() returns all skill IDs
 * @see AC#5 - getSkillMetadata() returns full metadata
 * @see AC#6 - Missing/corrupt cache handled gracefully
 * @see AC#7 - refresh() reloads from cache
 * @see AC#8 - Debug logs with traceId
 */

import { existsSync, readFileSync } from 'fs';
import { logger } from '../utils/logger.js';
import type {
  SkillCache,
  SkillRegistryEntry,
  ContainerSkillReference,
} from './types.js';

/** Path to skill cache file (created by sync-service in Story 6.2) */
const CACHE_FILE_PATH = '.skills/.cache/skills.json';

/** Anthropic's built-in skills - use name as skill_id
 * @see https://platform.claude.com/docs/en/build-with-claude/skills-guide
 */
const ANTHROPIC_BUILTIN_SKILLS = new Set(['xlsx', 'pdf', 'docx', 'pptx']);

/**
 * Skill Registry - centralized skill ID and metadata lookup.
 *
 * Wraps the sync-service cache file with built-in skill support
 * and provides type-safe accessors for skill metadata.
 *
 * @example
 * // Initialize at startup
 * skillRegistry.initialize(traceId);
 *
 * // Look up skill ID for container param
 * const id = skillRegistry.getSkillId('summarize');
 *
 * // Check if a skill is built-in
 * if (skillRegistry.isBuiltinSkill('xlsx')) {
 *   // Handle differently
 * }
 *
 * // Get API-ready format for container
 * const skills = skillRegistry.getContainerSkills();
 */
class SkillRegistry {
  private skills = new Map<string, SkillRegistryEntry>();
  /** Secondary index for O(1) lookup by skillId */
  private skillIdIndex = new Map<string, SkillRegistryEntry>();
  private initialized = false;

  /**
   * Initialize registry from cache file.
   *
   * Safe to call multiple times - idempotent after first load.
   * Loads built-in skills first, then custom skills from cache.
   *
   * @param traceId - Trace ID for observability (optional)
   *
   * @see AC#1 - Registry loads from cache file
   * @see AC#6 - Missing/corrupt cache handled gracefully
   * @see AC#8 - Debug logs with traceId
   */
  initialize(traceId?: string): void {
    if (this.initialized) return;

    // Add built-in skills first (AC#3)
    for (const name of ANTHROPIC_BUILTIN_SKILLS) {
      const entry: SkillRegistryEntry = {
        name,
        skillId: name, // Built-in skills use name as ID
        type: 'anthropic',
        version: 'latest',
      };
      this.skills.set(name, entry);
      this.skillIdIndex.set(name, entry); // O(1) lookup index
    }

    // Load custom skills from cache (AC#1, AC#6)
    try {
      if (existsSync(CACHE_FILE_PATH)) {
        const cacheContent = readFileSync(CACHE_FILE_PATH, 'utf-8');
        const cache: SkillCache = JSON.parse(cacheContent);

        for (const [name, cacheEntry] of Object.entries(cache.skills)) {
          const entry: SkillRegistryEntry = {
            name,
            skillId: cacheEntry.skillId,
            type: 'custom',
            version: cacheEntry.latestVersion,
            contentHash: cacheEntry.contentHash,
            lastSynced: cacheEntry.lastSynced,
          };
          this.skills.set(name, entry);
          this.skillIdIndex.set(cacheEntry.skillId, entry); // O(1) lookup index
        }

        logger.debug({
          event: 'skills.registry.initialized',
          traceId,
          customSkillCount: Object.keys(cache.skills).length,
          builtinSkillCount: ANTHROPIC_BUILTIN_SKILLS.size,
        });
      } else {
        logger.warn({
          event: 'skills.registry.cache_missing',
          traceId,
          message: 'Skill cache not found, registry initialized with built-in skills only',
        });
      }
    } catch (error) {
      logger.warn({
        event: 'skills.registry.cache_error',
        traceId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to load skill cache, registry initialized with built-in skills only',
      });
    }

    this.initialized = true;
  }

  /**
   * Get Anthropic skill ID for a local skill name.
   *
   * @param name - Local skill name (e.g., "summarize" or "xlsx")
   * @returns Anthropic skill ID, or undefined if not found
   *
   * @see AC#2 - Returns Anthropic skill ID
   * @see AC#3 - Built-in skills use name as ID
   */
  getSkillId(name: string): string | undefined {
    const entry = this.skills.get(name);
    return entry?.skillId;
  }

  /**
   * Get all available skill IDs for container parameter.
   *
   * Returns both custom and built-in skill IDs.
   *
   * @returns Array of all skill IDs
   *
   * @see AC#4 - Returns all skill IDs
   */
  getAllSkillIds(): string[] {
    return Array.from(this.skills.values()).map((e) => e.skillId);
  }

  /**
   * Get full metadata for a skill by its Anthropic skill ID.
   *
   * Uses O(1) index lookup for performance.
   *
   * @param skillId - Anthropic skill ID (e.g., "skill_01AbCd..." or "xlsx")
   * @returns Full metadata or undefined if not found
   *
   * @see AC#5 - Returns full metadata including type, version, timestamps
   */
  getSkillMetadata(skillId: string): SkillRegistryEntry | undefined {
    return this.skillIdIndex.get(skillId);
  }

  /**
   * Check if a skill is an Anthropic built-in.
   *
   * @param name - Skill name to check
   * @returns true if name is a built-in skill (xlsx, pdf, docx)
   *
   * @see AC#3 - Built-in skill detection
   */
  isBuiltinSkill(name: string): boolean {
    return ANTHROPIC_BUILTIN_SKILLS.has(name);
  }

  /**
   * Get skills formatted for container parameter in Messages API.
   *
   * Returns API-ready structure with snake_case field names.
   *
   * @returns Array of ContainerSkillReference with correct type and version
   *
   * @see AC#4 - API-ready container format
   */
  getContainerSkills(): ContainerSkillReference[] {
    return Array.from(this.skills.values()).map((entry) => ({
      type: entry.type,
      skill_id: entry.skillId, // snake_case for API
      version: entry.version,
    }));
  }

  /**
   * Refresh registry from cache file.
   *
   * Use after sync-service updates the cache to pick up new skills.
   * Clears all existing entries and reloads from scratch.
   *
   * @param traceId - Trace ID for observability (optional)
   *
   * @see AC#7 - Reloads from cache
   * @see AC#8 - Debug logs with traceId
   */
  refresh(traceId?: string): void {
    this.skills.clear();
    this.initialized = false;
    this.initialize(traceId);

    logger.debug({
      event: 'skills.registry.refreshed',
      traceId,
      totalSkills: this.skills.size,
    });
  }

  /**
   * Check if registry has been initialized.
   *
   * @returns true if initialize() has been called
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get count of registered skills.
   *
   * Includes both custom and built-in skills.
   */
  get size(): number {
    return this.skills.size;
  }

  /**
   * Reset registry state.
   *
   * FOR TESTING ONLY - clears all skills and resets initialized flag.
   * @internal
   */
  _clear(): void {
    this.skills.clear();
    this.skillIdIndex.clear();
    this.initialized = false;
  }
}

/** Singleton skill registry instance */
export const skillRegistry = new SkillRegistry();
