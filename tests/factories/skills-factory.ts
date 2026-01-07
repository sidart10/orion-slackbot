/**
 * Skills Test Data Factories
 *
 * Factories for creating realistic test data for skills-related tests.
 * Uses @faker-js/faker to generate varied, realistic data.
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see docs/testing-standards.md - Data Factory pattern
 *
 * Usage:
 *   import { createApiSkill, createSkillCache } from '../../../tests/factories/skills-factory';
 *
 *   const skill = createApiSkill({ display_title: 'Custom Title' });
 *   const cache = createSkillCache({ skillCount: 3 });
 */

import { faker } from '@faker-js/faker';

// ============================================================================
// API Skill Factory (Story 6.2)
// ============================================================================

/**
 * Skill as returned from Anthropic Skills API.
 */
export interface ApiSkill {
  id: string;
  display_title: string;
  source: 'custom' | 'anthropic';
  latest_version: string;
  created_at: string;
}

/**
 * Creates a realistic API skill response.
 *
 * @param overrides - Partial skill to override defaults
 * @returns Complete ApiSkill with realistic data
 *
 * @example
 * // Default skill with random data
 * const skill = createApiSkill();
 *
 * @example
 * // Override specific fields
 * const skill = createApiSkill({
 *   display_title: 'Deep Research',
 *   source: 'anthropic',
 * });
 */
export function createApiSkill(overrides: Partial<ApiSkill> = {}): ApiSkill {
  return {
    id: overrides.id ?? createSkillId(),
    display_title:
      overrides.display_title ?? faker.lorem.words({ min: 1, max: 3 }),
    source: overrides.source ?? 'custom',
    latest_version: overrides.latest_version ?? createEpochVersion(),
    created_at: overrides.created_at ?? faker.date.recent().toISOString(),
  };
}

/**
 * Creates multiple API skills.
 *
 * @param count - Number of skills to create
 * @returns Array of ApiSkill objects
 */
export function createApiSkills(count: number): ApiSkill[] {
  return Array.from({ length: count }, () => createApiSkill());
}

// ============================================================================
// Skill Version Factory
// ============================================================================

/**
 * Skill version from API.
 */
export interface ApiSkillVersion {
  version: string;
  created_at: string;
}

/**
 * Creates a skill version.
 *
 * @param overrides - Partial version to override defaults
 * @returns Complete ApiSkillVersion
 */
export function createApiSkillVersion(
  overrides: Partial<ApiSkillVersion> = {}
): ApiSkillVersion {
  return {
    version: overrides.version ?? createEpochVersion(),
    created_at: overrides.created_at ?? faker.date.recent().toISOString(),
  };
}

// ============================================================================
// Skill Cache Factory
// ============================================================================

/**
 * Cached skill mapping.
 */
export interface SkillCacheEntry {
  skillId: string;
  latestVersion: string;
  contentHash: string;
  lastSynced: string;
}

/**
 * Full skill cache structure.
 */
export interface SkillCache {
  skills: Record<string, SkillCacheEntry>;
}

/**
 * Creates a skill cache entry.
 *
 * @param overrides - Partial entry to override defaults
 * @returns Complete cache entry
 */
export function createSkillCacheEntry(
  overrides: Partial<SkillCacheEntry> = {}
): SkillCacheEntry {
  return {
    skillId: overrides.skillId ?? createSkillId(),
    latestVersion: overrides.latestVersion ?? createEpochVersion(),
    contentHash: overrides.contentHash ?? `sha256:${faker.string.hexadecimal({ length: 64 }).slice(2)}`,
    lastSynced: overrides.lastSynced ?? faker.date.recent().toISOString(),
  };
}

/**
 * Creates a skill cache with multiple entries.
 *
 * @param params - Configuration for cache generation
 * @returns Complete SkillCache object
 *
 * @example
 * // Create cache with 3 random skills
 * const cache = createSkillCache({ skillCount: 3 });
 *
 * @example
 * // Create cache with specific skill names
 * const cache = createSkillCache({
 *   skillNames: ['deep_research', 'summarize', 'code_review'],
 * });
 */
export function createSkillCache(
  params: { skillCount?: number; skillNames?: string[] } = {}
): SkillCache {
  const skills: Record<string, SkillCacheEntry> = {};

  if (params.skillNames) {
    for (const name of params.skillNames) {
      skills[name] = createSkillCacheEntry();
    }
  } else {
    const count = params.skillCount ?? 1;
    for (let i = 0; i < count; i++) {
      const name = createSkillName();
      skills[name] = createSkillCacheEntry();
    }
  }

  return { skills };
}

// ============================================================================
// Container Parameter Factory
// ============================================================================

/**
 * Container parameter for Messages API.
 */
export interface ContainerParameter {
  id?: string;
  skills: Array<{
    type: 'custom' | 'anthropic';
    skill_id: string;
    version: string;
  }>;
}

/**
 * Creates a container parameter for Messages API.
 *
 * @param overrides - Partial container to override defaults
 * @returns Complete ContainerParameter
 *
 * @example
 * const container = createContainerParameter({
 *   id: 'existing-container-id',
 * });
 */
export function createContainerParameter(
  overrides: Partial<ContainerParameter> = {}
): ContainerParameter {
  return {
    id: overrides.id,
    skills: overrides.skills ?? [
      {
        type: 'custom',
        skill_id: createSkillId(),
        version: 'latest',
      },
    ],
  };
}

// ============================================================================
// Skill Files Factory
// ============================================================================

/**
 * File for skill upload.
 */
export interface SkillFile {
  name: string;
  content: Buffer;
}

/**
 * Creates skill files for upload.
 *
 * @param skillName - Name of the skill
 * @returns Array of skill files (SKILL.md, optionally scripts)
 */
export function createSkillFiles(skillName: string = 'test_skill'): SkillFile[] {
  const skillMdContent = `---
name: ${skillName}
description: ${faker.lorem.sentence()}
version: ${faker.system.semver()}
---

# ${skillName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}

${faker.lorem.paragraphs(2)}
`;

  return [
    {
      name: `${skillName}/SKILL.md`,
      content: Buffer.from(skillMdContent),
    },
  ];
}

/**
 * Creates skill files with Python scripts.
 *
 * @param skillName - Name of the skill
 * @returns Array of skill files including scripts
 */
export function createSkillFilesWithScripts(
  skillName: string = 'test_skill'
): SkillFile[] {
  const baseFiles = createSkillFiles(skillName);

  const scriptContent = `#!/usr/bin/env python3
"""${skillName} script"""

def main():
    print("Hello from ${skillName}")

if __name__ == "__main__":
    main()
`;

  return [
    ...baseFiles,
    {
      name: `${skillName}/scripts/run.py`,
      content: Buffer.from(scriptContent),
    },
  ];
}

// ============================================================================
// Skill Generated File Factory (AC#9)
// ============================================================================

/**
 * File generated by skill execution.
 */
export interface SkillGeneratedFile {
  file_id: string;
  filename?: string;
}

/**
 * Creates a skill-generated file reference.
 *
 * @param overrides - Partial file to override defaults
 * @returns SkillGeneratedFile
 */
export function createSkillGeneratedFile(
  overrides: Partial<SkillGeneratedFile> = {}
): SkillGeneratedFile {
  return {
    file_id: overrides.file_id ?? `file_${faker.string.alphanumeric(24)}`,
    filename: overrides.filename ?? faker.system.fileName(),
  };
}

// ============================================================================
// Sync Result Factory
// ============================================================================

/**
 * Result from syncSkills operation.
 */
export interface SyncSkillsResult {
  uploaded: number;
  cached: number;
  failed: number;
}

/**
 * Creates a sync result.
 *
 * @param overrides - Partial result to override defaults
 * @returns Complete sync result
 */
export function createSyncResult(
  overrides: Partial<SyncSkillsResult> = {}
): SyncSkillsResult {
  return {
    uploaded: overrides.uploaded ?? faker.number.int({ min: 0, max: 5 }),
    cached: overrides.cached ?? faker.number.int({ min: 0, max: 5 }),
    failed: overrides.failed ?? 0,
  };
}

// ============================================================================
// Mock Stream with Skills/Container Factory
// ============================================================================

/**
 * Creates mock Anthropic stream events with container field (for PTC + skills).
 *
 * @param params - Stream configuration
 * @returns Array of stream events
 */
export function createMockStreamWithContainer(params: {
  containerId?: string;
  text?: string;
  model?: string;
}) {
  const {
    containerId = `container-${faker.string.alphanumeric(12)}`,
    text = faker.lorem.sentence(),
    model = 'claude-sonnet-4-20250514',
  } = params;

  return [
    {
      type: 'message_start',
      message: {
        model,
        container: containerId,
      },
    },
    {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text },
    },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  ];
}

/**
 * Creates mock stream with pause_turn stop reason (for long-running skills).
 *
 * @param params - Stream configuration
 * @returns Array of stream events with pause_turn
 */
export function createMockStreamWithPauseTurn(params: {
  containerId?: string;
  model?: string;
} = {}) {
  const {
    containerId = `container-${faker.string.alphanumeric(12)}`,
    model = 'claude-sonnet-4-20250514',
  } = params;

  return [
    {
      type: 'message_start',
      message: {
        model,
        container: containerId,
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'server_tool_use',
        id: `stu_${faker.string.alphanumeric(10)}`,
        name: 'code_execution',
        input: {},
      },
    },
    {
      type: 'message_delta',
      delta: { stop_reason: 'pause_turn' },
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  ];
}

/**
 * Creates mock bash_code_execution_tool_result with file_id (AC#9).
 *
 * @param params - Result configuration
 * @returns Stream event with file IDs
 */
export function createMockCodeExecutionResultWithFiles(params: {
  fileIds?: string[];
  returnCode?: number;
} = {}) {
  const {
    fileIds = [createSkillGeneratedFile().file_id],
    returnCode = 0,
  } = params;

  return {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'code_execution_tool_result',
      content: {
        return_code: returnCode,
        stdout: `Files created: ${fileIds.join(', ')}`,
        stderr: '',
        files: fileIds.map((id) => ({ file_id: id })),
      },
    },
  };
}

// ============================================================================
// ID Generators
// ============================================================================

/**
 * Creates a realistic Anthropic skill ID.
 *
 * Format: skill_ followed by 24 alphanumeric characters
 */
export function createSkillId(): string {
  return `skill_${faker.string.alphanumeric({ length: 24, casing: 'mixed' })}`;
}

/**
 * Creates a skill name in snake_case format.
 */
export function createSkillName(): string {
  const words = faker.lorem.words({ min: 1, max: 3 }).split(' ');
  return words.join('_').toLowerCase();
}

/**
 * Creates an epoch timestamp version string.
 *
 * Format: 16-digit epoch timestamp in microseconds
 */
export function createEpochVersion(): string {
  const timestamp = Date.now() * 1000 + faker.number.int({ min: 0, max: 999999 });
  return String(timestamp);
}

/**
 * Creates a container ID.
 */
export function createContainerId(): string {
  return `container-${faker.string.alphanumeric(12)}-${faker.string.alphanumeric(6)}`;
}
