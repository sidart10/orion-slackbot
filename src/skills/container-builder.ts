/**
 * Container Parameter Builder
 *
 * Builds the container parameter for Anthropic Messages API
 * with skills configuration.
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#2 - Container param includes skills + code_execution tool
 * @see AC#5 - Max 8 skills per request (API limit)
 */

import { logger } from '../utils/logger.js';
import type { ContainerParameter } from './types.js';

/** Maximum skills allowed per API request */
const MAX_SKILLS_PER_REQUEST = 8;

/**
 * Skill entry for container parameter.
 */
export interface SkillEntry {
  skillId: string;
  type: 'custom' | 'anthropic';
  version?: string; // Defaults to 'latest'
}

/**
 * Build container parameter for Anthropic Messages API.
 *
 * Creates the container structure with skills array using snake_case keys
 * per the Anthropic API specification.
 *
 * @param customSkillIds - Array of custom skill IDs to include
 * @param existingContainerId - Optional container ID from previous turn (for reuse)
 * @param additionalSkills - Optional additional skills with explicit types/versions
 * @returns Container parameter or undefined if no skills
 *
 * @see AC#2 - Container param includes uploaded skills
 * @see AC#5 - Max 8 skills per request
 */
export function buildContainerParameter(
  customSkillIds: string[],
  existingContainerId?: string,
  additionalSkills?: SkillEntry[]
): ContainerParameter | undefined {
  // Combine custom skills with additional skills
  const allSkills: Array<{
    type: 'custom' | 'anthropic';
    skill_id: string;
    version: string;
  }> = [];

  // Add custom skill IDs (default to type: 'custom', version: 'latest')
  for (const skillId of customSkillIds) {
    allSkills.push({
      type: 'custom',
      skill_id: skillId,
      version: 'latest',
    });
  }

  // Add additional skills with explicit type/version
  for (const entry of additionalSkills ?? []) {
    allSkills.push({
      type: entry.type,
      skill_id: entry.skillId,
      version: entry.version ?? 'latest',
    });
  }

  // Return undefined if no skills
  if (allSkills.length === 0) {
    return undefined;
  }

  // Enforce max skills limit (AC#5)
  let skillsToInclude = allSkills;
  if (allSkills.length > MAX_SKILLS_PER_REQUEST) {
    logger.warn({
      event: 'skills.container.truncated',
      requested: allSkills.length,
      included: MAX_SKILLS_PER_REQUEST,
    });
    skillsToInclude = allSkills.slice(0, MAX_SKILLS_PER_REQUEST);
  }

  // Build container parameter
  const container: ContainerParameter = {
    skills: skillsToInclude,
  };

  // Include container ID for session reuse
  if (existingContainerId) {
    container.id = existingContainerId;
  }

  return container;
}

/**
 * Extract skill IDs from a cached skill map.
 *
 * Helper for converting sync service output to container builder input.
 *
 * @param cachedSkills - Map of skill name to skill ID
 * @returns Array of skill IDs
 */
export function extractSkillIds(cachedSkills: Record<string, string>): string[] {
  return Object.values(cachedSkills);
}
