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
import { parseSkillMd } from './parser.js';
import { getLangfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import type { Skill, SkillScript, SkillLoadResult } from './types.js';

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
}

