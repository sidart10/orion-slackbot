/**
 * Skills Loader
 *
 * Discovers and loads SKILL.md files from the .skills directory.
 * Handles errors gracefully - invalid skills are logged but don't block others.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#1 - Skills discovered from .skills directory
 * @see AC#3 - Invalid skills logged but don't prevent others from loading
 * @see AC#8 - Script paths cataloged for GKE sandbox execution
 */

import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { parseSkillMd, parseSkillFrontmatterOnly } from './parser.js';
import { getLangfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import type {
  Skill,
  SkillMetadata,
  SkillScript,
  SkillLoadResult,
  SkillMetadataLoadResult,
} from './types.js';

const SKILLS_DIR = '.skills';

/**
 * Discover Python scripts in a skill's scripts/ directory.
 *
 * @param skillDir - Path to the skill directory
 * @returns Array of discovered scripts
 *
 * @see Story 6.1 AC#8 - Script paths cataloged for GKE sandbox execution
 */
async function discoverScripts(skillDir: string): Promise<SkillScript[]> {
  const scriptsDir = path.join(skillDir, 'scripts');

  if (!existsSync(scriptsDir)) {
    return [];
  }

  const pyFiles = await glob('*.py', { cwd: scriptsDir });
  const requirementsPath = path.join(scriptsDir, 'requirements.txt');
  const hasRequirements = existsSync(requirementsPath);

  return pyFiles.map((file) => ({
    name: file,
    path: path.join(scriptsDir, file),
    requirements: hasRequirements ? requirementsPath : undefined,
  }));
}

/**
 * Load all skills from the .skills directory.
 *
 * Discovers SKILL.md files, parses them, and returns validated skills.
 * Invalid skills are logged but don't prevent other skills from loading.
 *
 * @param traceId - Required for log correlation
 * @returns Array of valid skills
 *
 * @see Story 6.1 - Agent Skills Loader
 */
export async function loadSkills(traceId: string): Promise<Skill[]> {
  const langfuse = getLangfuse();
  const span = langfuse?.span({
    traceId,
    name: 'skills.load',
  });
  const startTime = Date.now();

  try {
    // Handle missing directory gracefully
    if (!existsSync(SKILLS_DIR)) {
      logger.info({
        event: 'skills.directory_missing',
        traceId,
        path: SKILLS_DIR,
      });
      span?.end({ output: { loaded: 0, reason: 'directory_missing' } });
      return [];
    }

    // Find all SKILL.md files
    const skillPaths = await glob(`${SKILLS_DIR}/*/SKILL.md`);

    logger.info({
      event: 'skills.discovery',
      traceId,
      found: skillPaths.length,
    });

    // Parse each skill file
    const results = await Promise.allSettled(
      skillPaths.map(async (skillPath) => {
        const content = await readFile(skillPath, 'utf-8');
        const skill = parseSkillMd(content, skillPath);

        // Discover scripts in the skill's directory
        const skillDir = path.dirname(skillPath);
        const scripts = await discoverScripts(skillDir);

        return {
          ...skill,
          scripts: scripts.length > 0 ? scripts : undefined,
          hasExecutableScripts: scripts.length > 0,
        };
      })
    );

    // Collect successful parses
    const skills: Skill[] = [];
    const failures: Array<{ path: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        skills.push(result.value);
      } else {
        const errorMsg = result.reason?.message ?? String(result.reason);
        failures.push({ path: skillPaths[index], error: errorMsg });
        logger.warn({
          event: 'skills.parse_failed',
          traceId,
          path: skillPaths[index],
          error: errorMsg,
        });
      }
    });

    const duration = Date.now() - startTime;

    span?.end({
      output: {
        loaded: skills.length,
        failed: failures.length,
        skillNames: skills.map((s) => s.name),
        failures,
      },
      metadata: { durationMs: duration },
    });

    logger.info({
      event: 'skills.loaded',
      traceId,
      loaded: skills.length,
      failed: failures.length,
      skillNames: skills.map((s) => s.name),
      durationMs: duration,
    });

    return skills;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    span?.end({
      metadata: { error: errorMsg },
    });

    logger.error({
      event: 'skills.load_error',
      traceId,
      error: errorMsg,
    });

    // Return empty array - don't crash on skill loading failure
    return [];
  }
}

/**
 * Load skills with full result including failures.
 *
 * @param traceId - Required for log correlation
 * @returns Skills and failures
 */
export async function loadSkillsWithResult(traceId: string): Promise<SkillLoadResult> {
  const langfuse = getLangfuse();
  const span = langfuse?.span({
    traceId,
    name: 'skills.load',
  });
  const startTime = Date.now();

  const skills: Skill[] = [];
  const failures: Array<{ path: string; error: string }> = [];

  try {
    // Handle missing directory gracefully
    if (!existsSync(SKILLS_DIR)) {
      logger.info({
        event: 'skills.directory_missing',
        traceId,
        path: SKILLS_DIR,
      });
      span?.end({ output: { loaded: 0, reason: 'directory_missing' } });
      return { skills: [], failures: [] };
    }

    // Find all SKILL.md files
    const skillPaths = await glob(`${SKILLS_DIR}/*/SKILL.md`);

    logger.info({
      event: 'skills.discovery',
      traceId,
      found: skillPaths.length,
    });

    // Parse each skill file
    const results = await Promise.allSettled(
      skillPaths.map(async (skillPath) => {
        const content = await readFile(skillPath, 'utf-8');
        const skill = parseSkillMd(content, skillPath);

        // Discover scripts in the skill's directory
        const skillDir = path.dirname(skillPath);
        const scripts = await discoverScripts(skillDir);

        return {
          ...skill,
          scripts: scripts.length > 0 ? scripts : undefined,
          hasExecutableScripts: scripts.length > 0,
        };
      })
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        skills.push(result.value);
      } else {
        const errorMsg = result.reason?.message ?? String(result.reason);
        failures.push({ path: skillPaths[index], error: errorMsg });
        logger.warn({
          event: 'skills.parse_failed',
          traceId,
          path: skillPaths[index],
          error: errorMsg,
        });
      }
    });

    const duration = Date.now() - startTime;

    span?.end({
      output: {
        loaded: skills.length,
        failed: failures.length,
        skillNames: skills.map((s) => s.name),
        failures,
      },
      metadata: { durationMs: duration },
    });

    logger.info({
      event: 'skills.loaded',
      traceId,
      loaded: skills.length,
      failed: failures.length,
      skillNames: skills.map((s) => s.name),
      durationMs: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    span?.end({
      metadata: { error: errorMsg },
    });

    logger.error({
      event: 'skills.load_error',
      traceId,
      error: errorMsg,
    });
  }

  return { skills, failures };
}

// Cache loaded skills (per-process)
let cachedSkills: Skill[] | null = null;

/**
 * Get cached skills or load them.
 *
 * Cache is invalidated by calling reloadSkills().
 *
 * @param traceId - Required for log correlation
 * @returns Cached or freshly loaded skills
 */
export async function getSkills(traceId: string): Promise<Skill[]> {
  if (!cachedSkills) {
    cachedSkills = await loadSkills(traceId);
  }
  return cachedSkills;
}

/**
 * Invalidate skill cache.
 *
 * Call this when:
 * - Skills directory contents change (in dev with file watching)
 * - Admin requests skill reload
 * - On container restart (automatic - cache is in-memory)
 */
export function reloadSkills(): void {
  cachedSkills = null;
}

/**
 * Reset cache for testing.
 * @internal
 */
export function _resetCacheForTests(): void {
  cachedSkills = null;
  cachedSkillMetadata = null;
}

// ============================================================================
// METADATA-ONLY LOADING (Progressive Disclosure Level 1)
// ============================================================================

/**
 * Load skill metadata from the .skills directory (no instructions loaded).
 *
 * This is the preferred function for startup loading. Instructions are loaded
 * on-demand when the skill is invoked.
 *
 * @param traceId - Required for log correlation
 * @returns Array of valid skill metadata (no instructions)
 *
 * @see Story 6.1 AC#2 - Metadata-only loading at startup
 */
export async function loadSkillMetadata(traceId: string): Promise<SkillMetadata[]> {
  const langfuse = getLangfuse();
  const span = langfuse?.span({
    traceId,
    name: 'skills.load_metadata',
  });
  const startTime = Date.now();

  try {
    const { skills, failures, reason } = await loadSkillMetadataInternal(traceId);

    const duration = Date.now() - startTime;

    span?.end({
      output: {
        loaded: skills.length,
        failed: failures.length,
        skillNames: skills.map((s) => s.name),
        failures,
        ...(reason ? { reason } : {}),
      },
      metadata: { durationMs: duration },
    });

    logger.info({
      event: 'skills.metadata_loaded',
      traceId,
      loaded: skills.length,
      failed: failures.length,
      skillNames: skills.map((s) => s.name),
      durationMs: duration,
    });

    return skills;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    span?.end({
      metadata: { error: errorMsg },
    });

    logger.error({
      event: 'skills.metadata_load_error',
      traceId,
      error: errorMsg,
    });

    // Return empty array - don't crash on skill loading failure
    return [];
  }
}

/**
 * Load skill metadata with full result including failures.
 *
 * @param traceId - Required for log correlation
 * @returns Skills metadata and failures
 */
export async function loadSkillMetadataWithResult(
  traceId: string
): Promise<SkillMetadataLoadResult> {
  // Return both successful results and parse failures (for observability/debugging).
  // Note: loadSkillMetadata() already logs failures; this provides structured access.
  const { skills, failures } = await loadSkillMetadataInternal(traceId);
  return { skills, failures };
}

async function loadSkillMetadataInternal(traceId: string): Promise<{
  skills: SkillMetadata[];
  failures: Array<{ path: string; error: string }>;
  reason?: 'directory_missing';
}> {
  // Handle missing directory gracefully
  if (!existsSync(SKILLS_DIR)) {
    logger.info({
      event: 'skills.directory_missing',
      traceId,
      path: SKILLS_DIR,
    });
    return { skills: [], failures: [], reason: 'directory_missing' };
  }

  // Find all SKILL.md files
  const skillPaths = await glob(`${SKILLS_DIR}/*/SKILL.md`);

  logger.info({
    event: 'skills.metadata_discovery',
    traceId,
    found: skillPaths.length,
  });

  // Parse each skill file (frontmatter only)
  const results = await Promise.allSettled(
    skillPaths.map(async (skillPath) => {
      const content = await readFile(skillPath, 'utf-8');
      const skillDir = path.dirname(skillPath);
      const metadata = parseSkillFrontmatterOnly(content, skillPath, skillDir);

      // Discover scripts in the skill's directory
      const scripts = await discoverScripts(skillDir);

      return {
        ...metadata,
        scripts: scripts.length > 0 ? scripts : undefined,
        hasExecutableScripts: scripts.length > 0,
      };
    })
  );

  const skills: SkillMetadata[] = [];
  const failures: Array<{ path: string; error: string }> = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      skills.push(result.value);
    } else {
      const errorMsg = result.reason?.message ?? String(result.reason);
      failures.push({ path: skillPaths[index], error: errorMsg });
      logger.warn({
        event: 'skills.metadata_parse_failed',
        traceId,
        path: skillPaths[index],
        error: errorMsg,
      });
    }
  });

  return { skills, failures };
}

// Cache for skill metadata (per-process)
let cachedSkillMetadata: SkillMetadata[] | null = null;

/**
 * Get cached skill metadata or load it.
 *
 * This is the preferred function for system prompt injection.
 * Cache is invalidated by calling reloadSkillMetadata().
 *
 * @param traceId - Required for log correlation
 * @returns Cached or freshly loaded skill metadata
 *
 * @see Story 6.1 AC#4 - Skills hint for system prompt injection
 */
export async function getSkillMetadata(traceId: string): Promise<SkillMetadata[]> {
  if (!cachedSkillMetadata) {
    cachedSkillMetadata = await loadSkillMetadata(traceId);
  }
  return cachedSkillMetadata;
}

/**
 * Invalidate skill metadata cache.
 *
 * Call this when:
 * - Skills directory contents change (in dev with file watching)
 * - Admin requests skill reload
 * - On container restart (automatic - cache is in-memory)
 */
export function reloadSkillMetadata(): void {
  cachedSkillMetadata = null;
}

// ============================================================================
// ON-DEMAND INSTRUCTION LOADING (Progressive Disclosure Level 2)
// ============================================================================

/**
 * Load full skill content on-demand (including instructions).
 *
 * This is called when a skill is invoked and the agent needs to read
 * the full SKILL.md instructions. In the GKE sandbox, this will be done
 * via execute_code reading from /skills/{skill-name}/SKILL.md.
 *
 * @param skillPath - Path to skill directory (from SkillMetadata.skillPath)
 * @param traceId - Required for log correlation
 * @returns Full skill content including instructions, or null if not found
 *
 * @see Story 6.1 AC#9 - On-demand instruction loading
 */
export async function loadSkillInstructions(
  skillPath: string,
  traceId: string
): Promise<Skill | null> {
  const langfuse = getLangfuse();
  const span = langfuse?.span({
    traceId,
    name: 'skills.load_instructions',
  });
  const startTime = Date.now();

  try {
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    if (!existsSync(skillMdPath)) {
      logger.warn({
        event: 'skills.instructions_not_found',
        traceId,
        path: skillMdPath,
      });
      span?.end({ output: { found: false, reason: 'file_not_found' } });
      return null;
    }

    const content = await readFile(skillMdPath, 'utf-8');
    const skill = parseSkillMd(content, skillMdPath);

    // Discover scripts in the skill's directory
    const scripts = await discoverScripts(skillPath);

    const duration = Date.now() - startTime;

    span?.end({
      output: {
        found: true,
        skillName: skill.name,
        instructionLength: skill.instructions.length,
      },
      metadata: { durationMs: duration },
    });

    logger.info({
      event: 'skills.instructions_loaded',
      traceId,
      skillName: skill.name,
      instructionLength: skill.instructions.length,
      durationMs: duration,
    });

    return {
      ...skill,
      scripts: scripts.length > 0 ? scripts : undefined,
      hasExecutableScripts: scripts.length > 0,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    span?.end({
      metadata: { error: errorMsg },
    });

    logger.error({
      event: 'skills.instructions_load_error',
      traceId,
      skillPath,
      error: errorMsg,
    });

    return null;
  }
}

