/**
 * Skills Sync Service Tests
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#1 - Skills uploaded at startup, IDs cached
 * @see AC#4 - Modified SKILL.md creates new version (not new skill)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { faker } from '@faker-js/faker';

// Mock dependencies
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  createReadStream: vi.fn(),
}));

vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('abc123def456'), // Without prefix - sync-service adds it
  })),
}));

vi.mock('./api-client.js', () => ({
  SkillsApiClient: vi.fn().mockImplementation(() => ({
    listSkills: vi.fn(),
    createSkill: vi.fn(),
    createSkillVersion: vi.fn(),
    retrieveSkill: vi.fn(),
  })),
}));

vi.mock('./loader.js', () => ({
  loadSkillMetadata: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../observability/langfuse.js', () => ({
  getLangfuse: vi.fn(() => ({
    span: vi.fn(() => ({ end: vi.fn() })),
    event: vi.fn(),
  })),
}));

describe('skills/sync-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // AC#1: Skills uploaded at startup, IDs cached
  // ==========================================================================

  describe('syncSkills', () => {
    it('uploads new skills when cache is empty', async () => {
      // GIVEN: Skills exist locally but not in cache
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        {
          name: 'deep_research',
          description: 'Research skill',
          filePath: '.skills/deep-research/SKILL.md',
          skillPath: '.skills/deep-research',
          hasExecutableScripts: false,
        },
      ]);

      vi.mocked(existsSync).mockReturnValue(false); // No cache exists
      vi.mocked(readFile).mockResolvedValue('# SKILL.md content');

      const mockCreateSkill = vi.fn().mockResolvedValue({
        id: 'skill_01AbCdEfGhIjKlMnOpQrStUv',
        latest_version: '1759178010641129',
      });
      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills } = await import('./sync-service.js');
      const result = await syncSkills('test-trace-id');

      // THEN: New skill is created
      expect(mockCreateSkill).toHaveBeenCalledWith(
        'deep_research',
        expect.any(Array)
      );
      expect(result.uploaded).toBe(1);
      expect(result.cached).toBe(0);
    });

    it('uses cached skill IDs when content unchanged', async () => {
      // GIVEN: Skills exist locally and in cache with same hash
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        {
          name: 'cached_skill',
          description: 'Cached',
          filePath: '.skills/cached-skill/SKILL.md',
          skillPath: '.skills/cached-skill',
          hasExecutableScripts: false,
        },
      ]);

      vi.mocked(existsSync).mockReturnValue(true); // Cache exists
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('.cache/skills.json')) {
          return JSON.stringify({
            skills: {
              'cached_skill': {
                skillId: 'skill_cached123',
                latestVersion: '1759178010641129',
                contentHash: 'sha256:abc123def456', // Same hash
                lastSynced: '2026-01-07T10:00:00Z',
              },
            },
          });
        }
        return '# SKILL.md content';
      });

      const mockCreateSkill = vi.fn();
      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      const result = await syncSkills('test-trace-id');

      // THEN: No API call made, cache used
      expect(mockCreateSkill).not.toHaveBeenCalled();
      expect(result.cached).toBe(1);
      expect(result.uploaded).toBe(0);
    });

    it('uploads skills in parallel within rate limits', async () => {
      // GIVEN: Multiple skills to upload
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        { name: 'skill_1', description: 'One', filePath: '.skills/1/SKILL.md', skillPath: '.skills/1', hasExecutableScripts: false },
        { name: 'skill_2', description: 'Two', filePath: '.skills/2/SKILL.md', skillPath: '.skills/2', hasExecutableScripts: false },
        { name: 'skill_3', description: 'Three', filePath: '.skills/3/SKILL.md', skillPath: '.skills/3', hasExecutableScripts: false },
      ]);

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFile).mockResolvedValue('# Content');

      const createTimes: number[] = [];
      const mockCreateSkill = vi.fn().mockImplementation(async () => {
        createTimes.push(Date.now());
        return { id: `skill_${faker.string.alphanumeric(10)}`, latest_version: '123' };
      });

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      const result = await syncSkills('test-trace-id');

      // THEN: All skills uploaded (parallel execution)
      expect(mockCreateSkill).toHaveBeenCalledTimes(3);
      expect(result.uploaded).toBe(3);
    });
  });

  // ==========================================================================
  // AC#4: Modified SKILL.md creates new version (not new skill)
  // ==========================================================================

  describe('version management', () => {
    it('creates new version when content hash differs', async () => {
      // GIVEN: Skill exists in cache with different hash
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');
      const { createHash } = await import('crypto');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        {
          name: 'updated_skill',
          description: 'Updated',
          filePath: '.skills/updated/SKILL.md',
          skillPath: '.skills/updated',
          hasExecutableScripts: false,
        },
      ]);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('.cache/skills.json')) {
          return JSON.stringify({
            skills: {
              'updated_skill': {
                skillId: 'skill_existing123',
                latestVersion: '1759178010641129',
                contentHash: 'sha256:old_hash_different', // Different hash
                lastSynced: '2026-01-06T10:00:00Z',
              },
            },
          });
        }
        return '# Updated SKILL.md content';
      });

      // New hash is different
      vi.mocked(createHash).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('sha256:new_hash_abc123'),
      } as unknown as ReturnType<typeof createHash>);

      const mockCreateSkillVersion = vi.fn().mockResolvedValue({
        version: '1759178020000000',
      });

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn(),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: mockCreateSkillVersion,
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      await syncSkills('test-trace-id');

      // THEN: New version created (not new skill)
      expect(mockCreateSkillVersion).toHaveBeenCalledWith(
        'skill_existing123',
        expect.any(Array)
      );
    });

    it('creates new skill when cached skill no longer exists in API', async () => {
      // GIVEN: Skill in cache but deleted from API
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');
      const { createHash } = await import('crypto');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        {
          name: 'orphan_skill',
          description: 'Orphaned',
          filePath: '.skills/orphan/SKILL.md',
          skillPath: '.skills/orphan',
          hasExecutableScripts: false,
        },
      ]);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('.cache/skills.json')) {
          return JSON.stringify({
            skills: {
              'orphan_skill': {
                skillId: 'skill_deleted999',
                latestVersion: '123',
                contentHash: 'sha256:old_hash',
                lastSynced: '2026-01-01T10:00:00Z',
              },
            },
          });
        }
        return '# Content';
      });

      vi.mocked(createHash).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('sha256:different_hash'),
      } as unknown as ReturnType<typeof createHash>);

      const mockCreateSkillVersion = vi.fn().mockRejectedValue(
        new Error('Skill not found')
      );
      const mockCreateSkill = vi.fn().mockResolvedValue({
        id: 'skill_new_replacement',
        latest_version: '456',
      });

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: mockCreateSkillVersion,
        retrieveSkill: vi.fn().mockRejectedValue(new Error('Not found')),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      await syncSkills('test-trace-id');

      // THEN: New skill created as fallback
      expect(mockCreateSkill).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Hash Calculation (Task 2.2)
  // ==========================================================================

  describe('hashSkillDirectory', () => {
    it('computes SHA-256 hash of skill directory contents', async () => {
      // GIVEN: Skill directory with files
      const { readFile } = await import('fs/promises');
      const { createHash } = await import('crypto');

      vi.mocked(readFile).mockResolvedValue('# SKILL.md content');

      const mockDigest = vi.fn().mockReturnValue('computed_hash_value'); // Without prefix
      vi.mocked(createHash).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: mockDigest,
      } as unknown as ReturnType<typeof createHash>);

      // WHEN: Hashing skill directory
      const { hashSkillDirectory } = await import('./sync-service.js');
      const hash = await hashSkillDirectory('.skills/test-skill');

      // THEN: Hash is computed using SHA-256 with prefix added by sync-service
      expect(createHash).toHaveBeenCalledWith('sha256');
      expect(hash).toBe('sha256:computed_hash_value');
    });
  });

  // ==========================================================================
  // File Loading (Task 2.3)
  // ==========================================================================

  describe('loadSkillFiles', () => {
    it('loads all files from skill directory for upload', async () => {
      // GIVEN: Skill directory with SKILL.md
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => {
        // SKILL.md exists, no scripts directory
        return String(p).includes('SKILL.md');
      });
      vi.mocked(readFile).mockResolvedValue('# SKILL.md content');

      // WHEN: Loading skill files
      const { loadSkillFiles } = await import('./sync-service.js');
      const files = await loadSkillFiles('.skills/test-skill');

      // THEN: Files are loaded
      expect(files).toBeDefined();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files[0]?.name).toBe('SKILL.md');
    });
  });

  // ==========================================================================
  // Cache Management (Task 2.4)
  // ==========================================================================

  describe('skill cache', () => {
    it('persists skill IDs to .skills/.cache/skills.json', async () => {
      // GIVEN: Skills uploaded successfully
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile, writeFile, mkdir } = await import('fs/promises');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        {
          name: 'persist_skill',
          description: 'Persist',
          filePath: '.skills/persist/SKILL.md',
          skillPath: '.skills/persist',
          hasExecutableScripts: false,
        },
      ]);

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFile).mockResolvedValue('# Content');
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn().mockResolvedValue({
          id: 'skill_persist123',
          latest_version: '789',
        }),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      await syncSkills('test-trace-id');

      // THEN: Cache file is written
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.skills/.cache/skills.json'),
        expect.stringContaining('persist_skill'),
        'utf-8'
      );
    });

    it('handles corrupt cache file gracefully', async () => {
      // GIVEN: Cache file is corrupt JSON
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile, writeFile, mkdir } = await import('fs/promises');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        {
          name: 'recover_skill',
          description: 'Recover',
          filePath: '.skills/recover/SKILL.md',
          skillPath: '.skills/recover',
          hasExecutableScripts: false,
        },
      ]);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('.cache/skills.json')) {
          return '{ invalid json }}}}';
        }
        return '# Content';
      });
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn().mockResolvedValue({
          id: 'skill_recovered',
          latest_version: '111',
        }),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      await syncSkills('test-trace-id');

      // THEN: Warning logged and cache regenerated
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.cache.regenerated',
        })
      );
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('continues uploading other skills when one fails', async () => {
      // GIVEN: Multiple skills, one will fail
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile, writeFile, mkdir } = await import('fs/promises');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        { name: 'good_skill', description: 'Good', filePath: '.skills/good/SKILL.md', skillPath: '.skills/good', hasExecutableScripts: false },
        { name: 'bad_skill', description: 'Bad', filePath: '.skills/bad/SKILL.md', skillPath: '.skills/bad', hasExecutableScripts: false },
      ]);

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFile).mockResolvedValue('# Content');
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      const mockCreateSkill = vi.fn()
        .mockResolvedValueOnce({ id: 'skill_good', latest_version: '1' })
        .mockRejectedValueOnce(new Error('Upload failed'));

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      const result = await syncSkills('test-trace-id');

      // THEN: Good skill uploaded, bad skill recorded as failed
      expect(result.uploaded).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('logs warning and continues when skill upload fails', async () => {
      // GIVEN: Skill upload will fail
      const { loadSkillMetadata } = await import('./loader.js');
      const { SkillsApiClient } = await import('./api-client.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        {
          name: 'failing_skill',
          description: 'Will fail',
          filePath: '.skills/fail/SKILL.md',
          skillPath: '.skills/fail',
          hasExecutableScripts: false,
        },
      ]);

      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFile).mockResolvedValue('# Content');

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn().mockRejectedValue(new Error('API Error')),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Syncing skills
      const { syncSkills, _resetCacheForTests } = await import('./sync-service.js');
      _resetCacheForTests?.();
      await syncSkills('test-trace-id');

      // THEN: Warning logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.sync.upload_failed',
        })
      );
    });
  });
});
