/**
 * Skills Initialization Module
 *
 * Handles startup initialization of skills including sync to Anthropic API.
 * Ensures idempotent initialization and graceful error handling.
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#1 - Skills uploaded at startup
 * @see AC#6 - Langfuse captures upload metrics
 * @see AC#7 - ANTHROPIC_SKILLS_ENABLED=false skips upload
 */

import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { getLangfuse } from '../observability/langfuse.js';
import { syncSkills, type SyncResult } from './sync-service.js';

/**
 * Skills Initialization State Manager (Singleton)
 *
 * Encapsulates initialization state to avoid module-level mutable variables.
 * Per project-context.md: "NO global mutable state"
 *
 * @internal
 */
class SkillsInitStateManager {
  private static instance: SkillsInitStateManager;
  private initialized = false;
  private syncResult: SyncResult | null = null;

  private constructor() {}

  static getInstance(): SkillsInitStateManager {
    if (!SkillsInitStateManager.instance) {
      SkillsInitStateManager.instance = new SkillsInitStateManager();
    }
    return SkillsInitStateManager.instance;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setInitialized(value: boolean): void {
    this.initialized = value;
  }

  getSyncResult(): SyncResult | null {
    return this.syncResult;
  }

  setSyncResult(result: SyncResult | null): void {
    this.syncResult = result;
  }

  reset(): void {
    this.initialized = false;
    this.syncResult = null;
  }
}

/**
 * Reset module state for testing.
 * @internal
 */
export function _resetForTests(): void {
  SkillsInitStateManager.getInstance().reset();
}

/**
 * Check if skills have been initialized.
 *
 * @returns true if skills have been successfully initialized
 */
export function isSkillsInitialized(): boolean {
  return SkillsInitStateManager.getInstance().isInitialized();
}

/**
 * Get the last sync result.
 *
 * @returns Last sync result or null if not synced
 */
export function getLastSyncResult(): SyncResult | null {
  return SkillsInitStateManager.getInstance().getSyncResult();
}

/**
 * Initialize skills at startup.
 *
 * - Syncs local skills to Anthropic Skills API
 * - Caches skill IDs for container parameter building
 * - Emits Langfuse metrics
 *
 * Handles errors gracefully - logs warning but doesn't throw.
 * This allows the app to start even if skills initialization fails.
 *
 * @param traceId - Trace ID for observability
 *
 * @see AC#1 - Skills uploaded at startup
 * @see AC#6 - Langfuse captures upload metrics
 * @see AC#7 - Skips when disabled
 */
export async function initializeSkills(traceId: string): Promise<void> {
  const stateManager = SkillsInitStateManager.getInstance();

  // Skip if already initialized (idempotent)
  if (stateManager.isInitialized()) {
    logger.debug({
      event: 'skills.init.already_initialized',
      traceId,
    });
    return;
  }

  // Skip if skills are disabled via config (AC#7)
  if (!config.anthropic?.skillsEnabled) {
    logger.info({
      event: 'skills.init.skipped',
      reason: 'disabled',
      traceId,
    });
    return;
  }

  const langfuse = getLangfuse();
  const span = langfuse?.span?.({ traceId, name: 'skills.init', input: { traceId } });

  try {
    // Sync skills to API
    const result = await syncSkills(traceId);
    stateManager.setSyncResult(result);

    // Mark as initialized on success
    stateManager.setInitialized(true);

    // Log metrics
    logger.info({
      event: 'skills.init.complete',
      traceId,
      uploaded: result.uploaded,
      updated: result.updated ?? 0,
      cached: result.cached,
      failed: result.failed,
      skillCount: Object.keys(result.skillIds).length,
    });

    // End span with metrics (AC#6)
    span?.end({
      output: {
        uploaded: result.uploaded,
        updated: result.updated ?? 0,
        cached: result.cached,
        failed: result.failed,
        skillCount: Object.keys(result.skillIds).length,
      },
    });
  } catch (error) {
    // Handle errors gracefully - don't crash the app
    stateManager.setInitialized(false);
    stateManager.setSyncResult(null);

    logger.warn({
      event: 'skills.init.failed',
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });

    // End span with error
    span?.end({
      output: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
