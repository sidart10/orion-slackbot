/**
 * Skill Registry Tests
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('skills/registry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // AC#1: Registry loads from cache file
  // ==========================================================================

  describe('initialize', () => {
    it('loads skills from valid cache file', async () => {
      // GIVEN: Cache file exists with skills
      const { existsSync, readFileSync } = await import('fs');
      const mockCache = {
        skills: {
          summarize: {
            skillId: 'skill_01AbCdEfGhIjKlMnOpQrStUv',
            latestVersion: '1759178010641129',
            contentHash: 'sha256:abc123',
            lastSynced: '2026-01-07T10:00:00Z',
          },
          research: {
            skillId: 'skill_02BcDeFgHiJkLmNoPqRsTuVw',
            latestVersion: '1759178020641130',
            contentHash: 'sha256:def456',
            lastSynced: '2026-01-07T10:30:00Z',
          },
        },
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockCache));

      // WHEN: Initializing registry
      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear(); // Reset singleton
      skillRegistry.initialize('test-trace-id');

      // THEN: Skills are loaded
      expect(skillRegistry.getSkillId('summarize')).toBe('skill_01AbCdEfGhIjKlMnOpQrStUv');
      expect(skillRegistry.getSkillId('research')).toBe('skill_02BcDeFgHiJkLmNoPqRsTuVw');
      expect(skillRegistry.isInitialized()).toBe(true);
    });

    it('is idempotent - multiple calls do not reload', async () => {
      // GIVEN: Cache file exists
      const { existsSync, readFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ skills: {} }));

      // WHEN: Initializing multiple times
      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize('trace-1');
      skillRegistry.initialize('trace-2');
      skillRegistry.initialize('trace-3');

      // THEN: Cache file only read once
      expect(readFileSync).toHaveBeenCalledTimes(1);
    });

    it('logs debug event on successful initialization', async () => {
      // GIVEN: Valid cache file
      const { existsSync, readFileSync } = await import('fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: { test_skill: { skillId: 'skill_123', latestVersion: '123', contentHash: 'sha256:abc', lastSynced: '2026-01-07T00:00:00Z' } },
      }));

      // WHEN: Initializing registry
      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize('trace-abc');

      // THEN: Debug log emitted with traceId
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.registry.initialized',
          traceId: 'trace-abc',
        })
      );
    });
  });

  // ==========================================================================
  // AC#6: Missing/corrupt cache handled gracefully
  // ==========================================================================

  describe('error handling', () => {
    it('initializes with built-in skills only when cache file missing', async () => {
      // GIVEN: Cache file does not exist
      const { existsSync } = await import('fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockReturnValue(false);

      // WHEN: Initializing registry
      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize('test-trace');

      // THEN: Built-in skills are available, warning logged
      expect(skillRegistry.getSkillId('xlsx')).toBe('xlsx');
      expect(skillRegistry.getSkillId('pdf')).toBe('pdf');
      expect(skillRegistry.getSkillId('docx')).toBe('docx');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.registry.cache_missing',
        })
      );
    });

    it('initializes with built-in skills only when cache file is corrupt', async () => {
      // GIVEN: Cache file contains invalid JSON
      const { existsSync, readFileSync } = await import('fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{ invalid json }}}}');

      // WHEN: Initializing registry
      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize('test-trace');

      // THEN: Does not throw, built-in skills available, warning logged
      expect(skillRegistry.getSkillId('xlsx')).toBe('xlsx');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.registry.cache_error',
        })
      );
    });

    it('does not throw on initialization failure', async () => {
      // GIVEN: readFileSync throws error
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // WHEN: Initializing registry
      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();

      // THEN: Does not throw
      expect(() => skillRegistry.initialize('test-trace')).not.toThrow();
      expect(skillRegistry.isInitialized()).toBe(true);
    });
  });

  // ==========================================================================
  // AC#2: getSkillId() returns Anthropic skill ID
  // ==========================================================================

  describe('getSkillId', () => {
    it('returns skill ID for custom skill', async () => {
      // GIVEN: Custom skill in cache
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          my_custom_skill: {
            skillId: 'skill_custom_abc123',
            latestVersion: '123',
            contentHash: 'sha256:xyz',
            lastSynced: '2026-01-07T00:00:00Z',
          },
        },
      }));

      // WHEN: Getting skill ID
      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // THEN: Returns correct skill ID
      expect(skillRegistry.getSkillId('my_custom_skill')).toBe('skill_custom_abc123');
    });

    it('returns undefined for unknown skill', async () => {
      // GIVEN: Registry initialized
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting ID for non-existent skill
      const result = skillRegistry.getSkillId('nonexistent_skill');

      // THEN: Returns undefined
      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // AC#3: Built-in skills use name as ID
  // ==========================================================================

  describe('built-in skills', () => {
    it('returns xlsx for xlsx built-in skill', async () => {
      // GIVEN: Registry initialized (even without cache)
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting xlsx skill ID
      // THEN: Returns 'xlsx' (name as ID)
      expect(skillRegistry.getSkillId('xlsx')).toBe('xlsx');
    });

    it('returns pdf for pdf built-in skill', async () => {
      // GIVEN: Registry initialized
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN/THEN
      expect(skillRegistry.getSkillId('pdf')).toBe('pdf');
    });

    it('returns docx for docx built-in skill', async () => {
      // GIVEN: Registry initialized
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN/THEN
      expect(skillRegistry.getSkillId('docx')).toBe('docx');
    });
  });

  describe('isBuiltinSkill', () => {
    it('returns true for xlsx', async () => {
      const { skillRegistry } = await import('./registry.js');
      expect(skillRegistry.isBuiltinSkill('xlsx')).toBe(true);
    });

    it('returns true for pdf', async () => {
      const { skillRegistry } = await import('./registry.js');
      expect(skillRegistry.isBuiltinSkill('pdf')).toBe(true);
    });

    it('returns true for docx', async () => {
      const { skillRegistry } = await import('./registry.js');
      expect(skillRegistry.isBuiltinSkill('docx')).toBe(true);
    });

    it('returns true for pptx', async () => {
      const { skillRegistry } = await import('./registry.js');
      expect(skillRegistry.isBuiltinSkill('pptx')).toBe(true);
    });

    it('returns false for custom skill', async () => {
      const { skillRegistry } = await import('./registry.js');
      expect(skillRegistry.isBuiltinSkill('my_custom_skill')).toBe(false);
    });

    it('returns false for unknown skill', async () => {
      const { skillRegistry } = await import('./registry.js');
      expect(skillRegistry.isBuiltinSkill('random_nonexistent')).toBe(false);
    });
  });

  // ==========================================================================
  // AC#4: getAllSkillIds() returns all skill IDs
  // ==========================================================================

  describe('getAllSkillIds', () => {
    it('returns built-in skills when cache is empty', async () => {
      // GIVEN: No cache file
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting all skill IDs
      const skillIds = skillRegistry.getAllSkillIds();

      // THEN: Returns built-in skills (xlsx, pdf, docx, pptx)
      expect(skillIds).toContain('xlsx');
      expect(skillIds).toContain('pdf');
      expect(skillIds).toContain('docx');
      expect(skillIds).toContain('pptx');
      expect(skillIds.length).toBe(4);
    });

    it('returns custom skills combined with built-in skills', async () => {
      // GIVEN: Cache with custom skills
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          summarize: { skillId: 'skill_sum123', latestVersion: '1', contentHash: 'sha256:a', lastSynced: '2026-01-07' },
          research: { skillId: 'skill_res456', latestVersion: '2', contentHash: 'sha256:b', lastSynced: '2026-01-07' },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting all skill IDs
      const skillIds = skillRegistry.getAllSkillIds();

      // THEN: Contains both custom and built-in (2 custom + 4 built-in = 6)
      expect(skillIds).toContain('skill_sum123');
      expect(skillIds).toContain('skill_res456');
      expect(skillIds).toContain('xlsx');
      expect(skillIds).toContain('pdf');
      expect(skillIds).toContain('docx');
      expect(skillIds).toContain('pptx');
      expect(skillIds.length).toBe(6);
    });
  });

  // ==========================================================================
  // AC#5: getSkillMetadata() returns full metadata
  // ==========================================================================

  describe('getSkillMetadata', () => {
    it('returns full metadata for custom skill by ID', async () => {
      // GIVEN: Custom skill in cache
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          my_skill: {
            skillId: 'skill_meta_test',
            latestVersion: '1759178010641129',
            contentHash: 'sha256:abc123',
            lastSynced: '2026-01-07T10:00:00Z',
          },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting metadata by skill ID
      const metadata = skillRegistry.getSkillMetadata('skill_meta_test');

      // THEN: Returns full metadata
      expect(metadata).toEqual({
        name: 'my_skill',
        skillId: 'skill_meta_test',
        type: 'custom',
        version: '1759178010641129',
        contentHash: 'sha256:abc123',
        lastSynced: '2026-01-07T10:00:00Z',
      });
    });

    it('returns metadata for built-in skill', async () => {
      // GIVEN: Registry initialized
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting metadata for built-in skill
      const metadata = skillRegistry.getSkillMetadata('xlsx');

      // THEN: Returns built-in metadata
      expect(metadata).toEqual({
        name: 'xlsx',
        skillId: 'xlsx',
        type: 'anthropic',
        version: 'latest',
      });
    });

    it('returns undefined for unknown skill ID', async () => {
      // GIVEN: Registry initialized
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting metadata for non-existent skill
      const metadata = skillRegistry.getSkillMetadata('skill_nonexistent');

      // THEN: Returns undefined
      expect(metadata).toBeUndefined();
    });
  });

  // ==========================================================================
  // AC#7: refresh() reloads from cache
  // ==========================================================================

  describe('refresh', () => {
    it('reloads skills from cache file', async () => {
      // GIVEN: Initial cache with one skill
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({
        skills: {
          old_skill: { skillId: 'skill_old', latestVersion: '1', contentHash: 'sha256:old', lastSynced: '2026-01-06' },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize('trace-1');

      expect(skillRegistry.getSkillId('old_skill')).toBe('skill_old');

      // WHEN: Cache updated and refresh called
      vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({
        skills: {
          new_skill: { skillId: 'skill_new', latestVersion: '2', contentHash: 'sha256:new', lastSynced: '2026-01-07' },
        },
      }));

      skillRegistry.refresh('trace-2');

      // THEN: New skills available, old skills gone
      expect(skillRegistry.getSkillId('new_skill')).toBe('skill_new');
      expect(skillRegistry.getSkillId('old_skill')).toBeUndefined();
    });

    it('clears existing entries before reload', async () => {
      // GIVEN: Cache with skills
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          skill_a: { skillId: 'skill_a_id', latestVersion: '1', contentHash: 'sha256:a', lastSynced: '2026-01-07' },
          skill_b: { skillId: 'skill_b_id', latestVersion: '1', contentHash: 'sha256:b', lastSynced: '2026-01-07' },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // Initial state: 6 skills (2 custom + 4 built-in)
      expect(skillRegistry.size).toBe(6);

      // WHEN: Refresh with empty cache
      vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ skills: {} }));
      skillRegistry.refresh();

      // THEN: Only built-in skills remain (4)
      expect(skillRegistry.size).toBe(4);
    });

    it('logs debug event on refresh', async () => {
      // GIVEN: Registry initialized
      const { existsSync, readFileSync } = await import('fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ skills: {} }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();
      vi.mocked(logger.debug).mockClear();

      // WHEN: Refreshing
      skillRegistry.refresh('trace-refresh');

      // THEN: Debug log emitted
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.registry.refreshed',
          traceId: 'trace-refresh',
        })
      );
    });
  });

  // ==========================================================================
  // Task 4: getContainerSkills() - API-ready format
  // ==========================================================================

  describe('getContainerSkills', () => {
    it('returns ContainerSkillReference array with correct structure', async () => {
      // GIVEN: Cache with custom skills
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          summarize: { skillId: 'skill_sum', latestVersion: '123', contentHash: 'sha256:a', lastSynced: '2026-01-07' },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting container skills
      const containerSkills = skillRegistry.getContainerSkills();

      // THEN: Returns API-ready structure with snake_case
      expect(containerSkills).toEqual(
        expect.arrayContaining([
          { type: 'custom', skill_id: 'skill_sum', version: '123' },
          { type: 'anthropic', skill_id: 'xlsx', version: 'latest' },
          { type: 'anthropic', skill_id: 'pdf', version: 'latest' },
          { type: 'anthropic', skill_id: 'docx', version: 'latest' },
        ])
      );
    });

    it('uses correct type field for custom vs anthropic skills', async () => {
      // GIVEN: Registry with both skill types
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          my_custom: { skillId: 'skill_custom', latestVersion: '1', contentHash: 'sha256:c', lastSynced: '2026-01-07' },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting container skills
      const containerSkills = skillRegistry.getContainerSkills();

      // THEN: Custom skill has type 'custom', built-in has type 'anthropic'
      const customSkill = containerSkills.find(s => s.skill_id === 'skill_custom');
      const builtinSkill = containerSkills.find(s => s.skill_id === 'xlsx');

      expect(customSkill?.type).toBe('custom');
      expect(builtinSkill?.type).toBe('anthropic');
    });

    it('uses version from cache for custom skills', async () => {
      // GIVEN: Custom skill with specific version
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          versioned_skill: { skillId: 'skill_v', latestVersion: '1759178099999999', contentHash: 'sha256:v', lastSynced: '2026-01-07' },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN: Getting container skills
      const containerSkills = skillRegistry.getContainerSkills();
      const versionedSkill = containerSkills.find(s => s.skill_id === 'skill_v');

      // THEN: Version matches cache
      expect(versionedSkill?.version).toBe('1759178099999999');
    });
  });

  // ==========================================================================
  // Singleton and size property
  // ==========================================================================

  describe('singleton behavior', () => {
    it('exports singleton instance', async () => {
      // GIVEN/WHEN: Importing registry twice
      const { skillRegistry: reg1 } = await import('./registry.js');
      const { skillRegistry: reg2 } = await import('./registry.js');

      // THEN: Same instance
      expect(reg1).toBe(reg2);
    });
  });

  describe('size property', () => {
    it('returns total count of registered skills', async () => {
      // GIVEN: Cache with 2 custom skills
      const { existsSync, readFileSync } = await import('fs');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        skills: {
          skill_1: { skillId: 'id_1', latestVersion: '1', contentHash: 'sha256:1', lastSynced: '2026-01-07' },
          skill_2: { skillId: 'id_2', latestVersion: '2', contentHash: 'sha256:2', lastSynced: '2026-01-07' },
        },
      }));

      const { skillRegistry } = await import('./registry.js');
      skillRegistry._clear();
      skillRegistry.initialize();

      // WHEN/THEN: Size includes custom + built-in (2 + 4 = 6)
      expect(skillRegistry.size).toBe(6);
    });
  });
});
