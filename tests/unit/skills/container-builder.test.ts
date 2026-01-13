/**
 * Container Builder Tests
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#2 - Container param includes skills + code_execution tool
 * @see AC#5 - Max 8 skills per request (API limit)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { faker } from '@faker-js/faker';

vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('skills/container-builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // AC#2: Container param includes skills
  // ==========================================================================

  describe('buildContainerParameter', () => {
    it('returns container with custom skills array', async () => {
      // GIVEN: Uploaded skill IDs
      const skillIds = [
        'skill_01AbCdEfGhIjKlMnOpQrStUv',
        'skill_02BcDeFgHiJkLmNoPqRsTuVw',
      ];

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds);

      // THEN: Container includes skills array with snake_case keys
      expect(container).toBeDefined();
      expect(container?.skills).toHaveLength(2);
      expect(container?.skills[0]).toEqual({
        type: 'custom',
        skill_id: 'skill_01AbCdEfGhIjKlMnOpQrStUv',
        version: 'latest',
      });
    });

    it('returns undefined when no skill IDs provided', async () => {
      // GIVEN: Empty skill IDs array
      const skillIds: string[] = [];

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds);

      // THEN: Returns undefined (no container needed)
      expect(container).toBeUndefined();
    });

    it('reuses container ID across turns', async () => {
      // GIVEN: Existing container ID from previous response
      const skillIds = ['skill_01AbCdEfGhIjKlMnOpQrStUv'];
      const existingContainerId = 'container-abc123-xyz789';

      // WHEN: Building container parameter with existing ID
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds, existingContainerId);

      // THEN: Container includes the existing ID
      expect(container?.id).toBe(existingContainerId);
      expect(container?.skills).toHaveLength(1);
    });

    it('supports both custom and anthropic-managed skills', async () => {
      // GIVEN: Mix of custom and anthropic skill IDs
      const customSkillId = 'skill_custom123';
      const anthropicSkillId = 'skill_anthropic456';

      // WHEN: Building container with skill types
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(
        [customSkillId],
        undefined,
        [{ skillId: anthropicSkillId, type: 'anthropic' }]
      );

      // THEN: Both types are included
      expect(container?.skills).toContainEqual(
        expect.objectContaining({ type: 'custom', skill_id: customSkillId })
      );
      expect(container?.skills).toContainEqual(
        expect.objectContaining({ type: 'anthropic', skill_id: anthropicSkillId })
      );
    });

    it('supports version pinning instead of latest', async () => {
      // GIVEN: Skill with specific version
      const skillId = 'skill_versioned123';
      const specificVersion = '1759178010641129';

      // WHEN: Building container with pinned version
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(
        [],
        undefined,
        [{ skillId, type: 'custom', version: specificVersion }]
      );

      // THEN: Version is pinned (not 'latest')
      expect(container?.skills[0].version).toBe(specificVersion);
    });
  });

  // ==========================================================================
  // AC#5: Max 8 skills per request (API limit)
  // ==========================================================================

  describe('skill limits', () => {
    it('enforces maximum 8 skills per request', async () => {
      // GIVEN: 10 skill IDs (exceeds limit)
      const skillIds = Array.from({ length: 10 }, () =>
        `skill_${faker.string.alphanumeric(20)}`
      );

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds);

      // THEN: Only 8 skills included
      expect(container?.skills).toHaveLength(8);
    });

    it('logs warning when skills are truncated', async () => {
      // GIVEN: More than 8 skills
      const { logger } = await import('@/utils/logger.js');
      const skillIds = Array.from({ length: 12 }, () =>
        `skill_${faker.string.alphanumeric(20)}`
      );

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      buildContainerParameter(skillIds);

      // THEN: Warning logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.container.truncated',
          requested: 12,
          included: 8,
        })
      );
    });

    it('allows exactly 8 skills without warning', async () => {
      // GIVEN: Exactly 8 skills
      const { logger } = await import('@/utils/logger.js');
      const skillIds = Array.from({ length: 8 }, () =>
        `skill_${faker.string.alphanumeric(20)}`
      );

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds);

      // THEN: All 8 included, no warning
      expect(container?.skills).toHaveLength(8);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Container Parameter Structure
  // ==========================================================================

  describe('parameter structure', () => {
    it('uses snake_case for skill_id (API spec)', async () => {
      // GIVEN: A skill ID
      const skillIds = ['skill_test123'];

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds);

      // THEN: Uses skill_id (snake_case), not skillId (camelCase)
      const skill = container?.skills[0];
      expect(skill).toHaveProperty('skill_id');
      expect(skill).not.toHaveProperty('skillId');
    });

    it('defaults version to "latest"', async () => {
      // GIVEN: Skills without explicit version
      const skillIds = ['skill_default_version'];

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds);

      // THEN: Version defaults to 'latest'
      expect(container?.skills[0].version).toBe('latest');
    });

    it('excludes id field when no existing container', async () => {
      // GIVEN: No existing container ID
      const skillIds = ['skill_new123'];

      // WHEN: Building container parameter
      const { buildContainerParameter } = await import('@/skills/container-builder.js');
      const container = buildContainerParameter(skillIds);

      // THEN: id field is undefined or not present
      expect(container?.id).toBeUndefined();
    });
  });
});
