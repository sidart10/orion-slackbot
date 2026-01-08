/**
 * Upload Custom Skills Script Tests
 *
 * @see Story 6.9 - Upload Custom Skills Script
 * @see AC#1 - Upload all skills and print IDs
 * @see AC#2 - Upload single skill by name
 * @see AC#3 - Dry-run mode preview
 * @see AC#4 - Force mode re-upload
 * @see AC#5 - List uploaded skills
 * @see AC#6 - Output skill ID mapping
 * @see AC#7 - Continue on error
 * @see AC#8 - Fail fast on missing API key
 * @see AC#9 - Update cache after upload
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { SkillMetadata, ApiSkill, SkillCache } from '../src/skills/types.js';

// =============================================================================
// FACTORIES
// =============================================================================

/**
 * Create mock SkillMetadata for testing.
 */
function createSkillMetadata(overrides: Partial<SkillMetadata> = {}): SkillMetadata {
  const name = overrides.name ?? faker.helpers.slugify(faker.word.noun()).toLowerCase();
  return {
    name,
    description: faker.lorem.sentence(),
    filePath: `.skills/${name}/SKILL.md`,
    skillPath: `.skills/${name}`,
    hasExecutableScripts: false,
    ...overrides,
  };
}

/**
 * Create mock ApiSkill for testing.
 */
function createApiSkill(overrides: Partial<ApiSkill> = {}): ApiSkill {
  return {
    id: `skill_${faker.string.alphanumeric(24)}`,
    display_title: faker.word.noun(),
    source: 'custom',
    latest_version: String(faker.date.recent().getTime() * 1000), // Epoch microseconds
    created_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock SkillCache for testing.
 */
function createSkillCache(skills: Record<string, { skillId: string; contentHash: string }> = {}): SkillCache {
  const cache: SkillCache = { skills: {} };
  for (const [name, { skillId, contentHash }] of Object.entries(skills)) {
    cache.skills[name] = {
      skillId,
      latestVersion: String(faker.date.recent().getTime() * 1000),
      contentHash,
      lastSynced: faker.date.recent().toISOString(),
    };
  }
  return cache;
}

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

vi.mock('../src/skills/api-client.js', () => ({
  SkillsApiClient: vi.fn().mockImplementation(() => ({
    listSkills: vi.fn(),
    createSkill: vi.fn(),
    createSkillVersion: vi.fn(),
    retrieveSkill: vi.fn(),
  })),
}));

vi.mock('../src/skills/sync-service.js', () => ({
  hashSkillDirectory: vi.fn(),
  loadSkillFiles: vi.fn(),
  getCachedSkillIds: vi.fn(),
}));

vi.mock('../src/skills/loader.js', () => ({
  loadSkillMetadata: vi.fn(),
}));

// =============================================================================
// TEST SUITES
// =============================================================================

describe('scripts/upload-skills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.argv for each test
    process.argv = ['node', 'upload-skills.ts'];
    // Reset process.env
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // AC#1: Upload all skills
  // ===========================================================================

  describe('AC#1: uploadAllSkills', () => {
    it('uploads all skills from .skills directory and prints IDs', async () => {
      // GIVEN: Multiple skills in .skills directory
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const { hashSkillDirectory, loadSkillFiles } = await import('../src/skills/sync-service.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');

      const skill1 = createSkillMetadata({ name: 'summarize' });
      const skill2 = createSkillMetadata({ name: 'algorithmic_art' });
      const skill3 = createSkillMetadata({ name: 'd3js_visualization' });

      vi.mocked(loadSkillMetadata).mockResolvedValue([skill1, skill2, skill3]);
      vi.mocked(existsSync).mockReturnValue(false); // No cache
      vi.mocked(hashSkillDirectory).mockResolvedValue('sha256:new_hash');
      vi.mocked(loadSkillFiles).mockResolvedValue([{ name: 'SKILL.md', content: '# Skill' }]);
      vi.mocked(readFile).mockResolvedValue('# Skill content');

      const mockCreateSkill = vi.fn()
        .mockResolvedValueOnce(createApiSkill({ id: 'skill_summarize123' }))
        .mockResolvedValueOnce(createApiSkill({ id: 'skill_art456' }))
        .mockResolvedValueOnce(createApiSkill({ id: 'skill_d3js789' }));

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running uploadAllSkills
      // NOTE: Implementation doesn't exist yet - this test will FAIL (RED phase)
      const { uploadAllSkills } = await import('./upload-skills.js');
      const result = await uploadAllSkills();

      // THEN: All skills uploaded
      expect(mockCreateSkill).toHaveBeenCalledTimes(3);
      expect(result.uploaded).toBe(3);
      expect(result.skillIds).toHaveProperty('summarize');
      expect(result.skillIds).toHaveProperty('algorithmic_art');
      expect(result.skillIds).toHaveProperty('d3js_visualization');
    });

    it('skips Anthropic built-in skills (xlsx, pdf, docx)', async () => {
      // GIVEN: Mix of custom and built-in skills
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const { hashSkillDirectory, loadSkillFiles } = await import('../src/skills/sync-service.js');
      const { existsSync } = await import('fs');

      const customSkill = createSkillMetadata({ name: 'summarize' });
      const xlsxSkill = createSkillMetadata({ name: 'xlsx' });
      const pdfSkill = createSkillMetadata({ name: 'pdf' });
      const docxSkill = createSkillMetadata({ name: 'docx' });

      vi.mocked(loadSkillMetadata).mockResolvedValue([customSkill, xlsxSkill, pdfSkill, docxSkill]);
      vi.mocked(existsSync).mockReturnValue(false); // No cache
      vi.mocked(hashSkillDirectory).mockResolvedValue('sha256:new_hash');
      vi.mocked(loadSkillFiles).mockResolvedValue([{ name: 'SKILL.md', content: '# Skill' }]);

      const mockCreateSkill = vi.fn()
        .mockResolvedValue(createApiSkill({ id: 'skill_custom' }));

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running uploadAllSkills
      const { uploadAllSkills } = await import('./upload-skills.js');
      await uploadAllSkills();

      // THEN: Only custom skill uploaded, built-ins skipped
      expect(mockCreateSkill).toHaveBeenCalledTimes(1);
      expect(mockCreateSkill).toHaveBeenCalledWith('summarize', expect.any(Array));
    });
  });

  // ===========================================================================
  // AC#2: Upload single skill by name
  // ===========================================================================

  describe('AC#2: uploadSingleSkill', () => {
    it('uploads only the specified skill when --skill flag provided', async () => {
      // GIVEN: --skill summarize flag
      process.argv = ['node', 'upload-skills.ts', '--skill', 'summarize'];

      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const { hashSkillDirectory, loadSkillFiles } = await import('../src/skills/sync-service.js');
      const { existsSync } = await import('fs');

      const skill1 = createSkillMetadata({ name: 'summarize' });
      const skill2 = createSkillMetadata({ name: 'other_skill' });

      vi.mocked(loadSkillMetadata).mockResolvedValue([skill1, skill2]);
      vi.mocked(existsSync).mockReturnValue(false); // No cache
      vi.mocked(hashSkillDirectory).mockResolvedValue('sha256:new_hash');
      vi.mocked(loadSkillFiles).mockResolvedValue([{ name: 'SKILL.md', content: '# Skill' }]);

      const mockCreateSkill = vi.fn()
        .mockResolvedValue(createApiSkill({ id: 'skill_summarize' }));

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main with --skill flag
      const { main } = await import('./upload-skills.js');
      await main();

      // THEN: Only summarize skill uploaded
      expect(mockCreateSkill).toHaveBeenCalledTimes(1);
      expect(mockCreateSkill).toHaveBeenCalledWith('summarize', expect.any(Array));
    });

    it('exits with error when specified skill not found', async () => {
      // GIVEN: --skill nonexistent flag
      process.argv = ['node', 'upload-skills.ts', '--skill', 'nonexistent'];

      const { loadSkillMetadata } = await import('../src/skills/loader.js');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'summarize' }),
      ]);

      // WHEN: Running main
      const { main } = await import('./upload-skills.js');
      const exitCode = await main();

      // THEN: Exit with error code
      expect(exitCode).toBe(2); // EXIT_FATAL_ERROR
    });
  });

  // ===========================================================================
  // AC#3: Dry-run mode
  // ===========================================================================

  describe('AC#3: dryRunMode', () => {
    it('shows what would be uploaded without making API calls in --dry-run mode', async () => {
      // GIVEN: --dry-run flag
      process.argv = ['node', 'upload-skills.ts', '--dry-run'];

      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'skill1' }),
        createSkillMetadata({ name: 'skill2' }),
      ]);

      const mockCreateSkill = vi.fn();
      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main with --dry-run
      const { main } = await import('./upload-skills.js');
      await main();

      // THEN: No API calls made
      expect(mockCreateSkill).not.toHaveBeenCalled();
    });

    it('displays skill names and actions in dry-run mode', async () => {
      // GIVEN: --dry-run flag with console.log spy
      process.argv = ['node', 'upload-skills.ts', '--dry-run'];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { loadSkillMetadata } = await import('../src/skills/loader.js');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'summarize' }),
      ]);

      // WHEN: Running main
      const { main } = await import('./upload-skills.js');
      await main();

      // THEN: Output shows what would happen
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('summarize'));

      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // AC#4: Force mode
  // ===========================================================================

  describe('AC#4: forceMode', () => {
    it('re-uploads skills even if cached with --force flag', async () => {
      // GIVEN: --force flag with cached skills
      process.argv = ['node', 'upload-skills.ts', '--force'];

      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const { getCachedSkillIds, hashSkillDirectory } = await import('../src/skills/sync-service.js');
      const { existsSync } = await import('fs');
      const { readFile } = await import('fs/promises');

      const cachedSkill = createSkillMetadata({ name: 'cached_skill' });
      vi.mocked(loadSkillMetadata).mockResolvedValue([cachedSkill]);

      // Cache exists with same hash
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('.cache/skills.json')) {
          return JSON.stringify(createSkillCache({
            'cached_skill': { skillId: 'skill_old123', contentHash: 'sha256:same_hash' }
          }));
        }
        return '# Skill';
      });
      vi.mocked(hashSkillDirectory).mockResolvedValue('sha256:same_hash');
      vi.mocked(getCachedSkillIds).mockReturnValue({ 'cached_skill': 'skill_old123' });

      const mockCreateSkillVersion = vi.fn()
        .mockResolvedValue({ version: '1759178020000000' });

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn(),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: mockCreateSkillVersion,
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main with --force
      const { main } = await import('./upload-skills.js');
      await main();

      // THEN: Skill is re-uploaded despite matching hash
      expect(mockCreateSkillVersion).toHaveBeenCalled();
    });

    it('uses parallel uploads with concurrency limit in force mode', async () => {
      // GIVEN: --force flag with multiple skills
      process.argv = ['node', 'upload-skills.ts', '--force'];

      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const { hashSkillDirectory, loadSkillFiles } = await import('../src/skills/sync-service.js');
      const { existsSync } = await import('fs');

      // Create 5 skills to test concurrency
      const skills = Array.from({ length: 5 }, (_, i) =>
        createSkillMetadata({ name: `skill_${i}` })
      );
      vi.mocked(loadSkillMetadata).mockResolvedValue(skills);

      // Mock cache and file operations for force mode
      vi.mocked(existsSync).mockReturnValue(false); // No cache
      vi.mocked(hashSkillDirectory).mockResolvedValue('sha256:new_hash');
      vi.mocked(loadSkillFiles).mockResolvedValue([{ name: 'SKILL.md', content: '# Skill' }]);

      const uploadTimes: number[] = [];
      const mockCreateSkill = vi.fn().mockImplementation(async () => {
        uploadTimes.push(Date.now());
        await new Promise(r => setTimeout(r, 10)); // Small delay
        return createApiSkill();
      });

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main with --force
      const { main } = await import('./upload-skills.js');
      await main();

      // THEN: All skills uploaded (concurrency limit 3 from story)
      expect(mockCreateSkill).toHaveBeenCalledTimes(5);
    });
  });

  // ===========================================================================
  // AC#5: List uploaded skills
  // ===========================================================================

  describe('AC#5: listSkills', () => {
    it('lists all uploaded skills with --list flag', async () => {
      // GIVEN: --list flag
      process.argv = ['node', 'upload-skills.ts', '--list'];

      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockSkills: ApiSkill[] = [
        createApiSkill({ id: 'skill_summarize', display_title: 'summarize', source: 'custom' }),
        createApiSkill({ id: 'skill_art', display_title: 'algorithmic_art', source: 'custom' }),
        createApiSkill({ id: 'xlsx', display_title: 'xlsx', source: 'anthropic' }),
      ];

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn(),
        listSkills: vi.fn().mockResolvedValue(mockSkills),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main with --list
      const { main } = await import('./upload-skills.js');
      await main();

      // THEN: Skills listed in table format
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('UPLOADED SKILLS'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('summarize'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('algorithmic_art'));

      consoleSpy.mockRestore();
    });

    it('handles empty skill list gracefully', async () => {
      // GIVEN: --list flag with no skills
      process.argv = ['node', 'upload-skills.ts', '--list'];

      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn(),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main with --list
      const { main } = await import('./upload-skills.js');
      const exitCode = await main();

      // THEN: Empty message displayed, exit success
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No skills'));
      expect(exitCode).toBe(0);

      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // AC#6: Output format
  // ===========================================================================

  describe('AC#6: outputFormat', () => {
    it('outputs skill ID mapping in YAML format for .orion/skills.yaml', async () => {
      // GIVEN: Skills uploaded successfully
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'summarize' }),
      ]);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn().mockResolvedValue(
          createApiSkill({ id: 'skill_01AbCdEfGhIjKlMnOpQrStUv' })
        ),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running uploadAllSkills
      const { uploadAllSkills } = await import('./upload-skills.js');
      await uploadAllSkills();

      // THEN: Output includes YAML-friendly format
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('skills:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('summarize:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('skill_id:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('type: custom'));

      consoleSpy.mockRestore();
    });

    it('prints summary table with upload statistics', async () => {
      // GIVEN: Mixed results
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'skill1' }),
        createSkillMetadata({ name: 'skill2' }),
      ]);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn()
          .mockResolvedValueOnce(createApiSkill())
          .mockRejectedValueOnce(new Error('Upload failed')),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running uploadAllSkills
      const { uploadAllSkills } = await import('./upload-skills.js');
      await uploadAllSkills();

      // THEN: Summary shows statistics
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SKILL UPLOAD SUMMARY'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Uploaded'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed'));

      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // AC#7: Continue on error
  // ===========================================================================

  describe('AC#7: continueOnError', () => {
    it('continues uploading other skills when one fails', async () => {
      // GIVEN: Multiple skills, middle one fails
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'skill1' }),
        createSkillMetadata({ name: 'skill2_fails' }),
        createSkillMetadata({ name: 'skill3' }),
      ]);

      const mockCreateSkill = vi.fn()
        .mockResolvedValueOnce(createApiSkill({ id: 'skill_1' }))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(createApiSkill({ id: 'skill_3' }));

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running uploadAllSkills
      const { uploadAllSkills } = await import('./upload-skills.js');
      const result = await uploadAllSkills();

      // THEN: Other skills still uploaded
      expect(mockCreateSkill).toHaveBeenCalledTimes(3);
      expect(result.uploaded).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('logs error for failed skill and continues', async () => {
      // GIVEN: Skill that will fail
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'failing_skill' }),
        createSkillMetadata({ name: 'good_skill' }),
      ]);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn()
          .mockRejectedValueOnce(new Error('Network timeout'))
          .mockResolvedValueOnce(createApiSkill()),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running uploadAllSkills
      const { uploadAllSkills } = await import('./upload-skills.js');
      await uploadAllSkills();

      // THEN: Error logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('failing_skill'),
      );

      consoleErrorSpy.mockRestore();
    });

    it('returns EXIT_PARTIAL_FAILURE when some skills fail', async () => {
      // GIVEN: Some skills fail
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'good' }),
        createSkillMetadata({ name: 'bad' }),
      ]);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn()
          .mockResolvedValueOnce(createApiSkill())
          .mockRejectedValueOnce(new Error('Failed')),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main
      const { main } = await import('./upload-skills.js');
      const exitCode = await main();

      // THEN: Exit code is partial failure
      expect(exitCode).toBe(1); // EXIT_PARTIAL_FAILURE
    });
  });

  // ===========================================================================
  // AC#8: Missing API key
  // ===========================================================================

  describe('AC#8: missingApiKey', () => {
    it('fails fast with clear error when ANTHROPIC_API_KEY missing', async () => {
      // GIVEN: No API key
      delete process.env.ANTHROPIC_API_KEY;
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // WHEN: Running main
      const { main } = await import('./upload-skills.js');
      const exitCode = await main();

      // THEN: Exit with fatal error and clear message
      expect(exitCode).toBe(2); // EXIT_FATAL_ERROR
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ANTHROPIC_API_KEY'),
      );

      consoleErrorSpy.mockRestore();
    });

    it('validates API key before attempting any uploads', async () => {
      // GIVEN: No API key
      delete process.env.ANTHROPIC_API_KEY;

      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');

      // These should NOT be called
      vi.mocked(loadSkillMetadata).mockResolvedValue([createSkillMetadata()]);

      const mockCreateSkill = vi.fn();
      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: mockCreateSkill,
        listSkills: vi.fn(),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      // WHEN: Running main
      const { main } = await import('./upload-skills.js');
      await main();

      // THEN: No API calls attempted
      expect(loadSkillMetadata).not.toHaveBeenCalled();
      expect(mockCreateSkill).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC#9: Cache update
  // ===========================================================================

  describe('AC#9: cacheUpdate', () => {
    it('updates .skills/.cache/skills.json after successful upload', async () => {
      // GIVEN: Skill to upload
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const { writeFile, mkdir } = await import('fs/promises');

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'new_skill' }),
      ]);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn().mockResolvedValue(
          createApiSkill({ id: 'skill_new123', latest_version: '1759178010641129' })
        ),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      // WHEN: Running uploadAllSkills
      const { uploadAllSkills } = await import('./upload-skills.js');
      await uploadAllSkills();

      // THEN: Cache file written with new skill
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.skills/.cache/skills.json'),
        expect.stringContaining('new_skill'),
        'utf-8'
      );
    });

    it('preserves existing cache entries when adding new skills', async () => {
      // GIVEN: Existing cache with one skill, adding another
      const { loadSkillMetadata } = await import('../src/skills/loader.js');
      const { SkillsApiClient } = await import('../src/skills/api-client.js');
      const { existsSync } = await import('fs');
      const { readFile, writeFile, mkdir } = await import('fs/promises');

      const existingCache = createSkillCache({
        'existing_skill': { skillId: 'skill_existing', contentHash: 'sha256:old' }
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('.cache/skills.json')) {
          return JSON.stringify(existingCache);
        }
        return '# Skill';
      });

      vi.mocked(loadSkillMetadata).mockResolvedValue([
        createSkillMetadata({ name: 'new_skill' }),
      ]);

      vi.mocked(SkillsApiClient).mockImplementation(() => ({
        createSkill: vi.fn().mockResolvedValue(createApiSkill({ id: 'skill_new' })),
        listSkills: vi.fn().mockResolvedValue([]),
        createSkillVersion: vi.fn(),
        retrieveSkill: vi.fn(),
      }) as unknown as InstanceType<typeof SkillsApiClient>);

      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      // WHEN: Running uploadAllSkills
      const { uploadAllSkills } = await import('./upload-skills.js');
      await uploadAllSkills();

      // THEN: Cache contains both skills
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/existing_skill.*new_skill|new_skill.*existing_skill/s),
        'utf-8'
      );
    });
  });

  // ===========================================================================
  // Argument Parsing
  // ===========================================================================

  describe('parseArgs', () => {
    it('parses --skill flag', async () => {
      process.argv = ['node', 'upload-skills.ts', '--skill', 'summarize'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.skill).toBe('summarize');
    });

    it('parses -s shorthand for --skill', async () => {
      process.argv = ['node', 'upload-skills.ts', '-s', 'summarize'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.skill).toBe('summarize');
    });

    it('parses --dry-run flag', async () => {
      process.argv = ['node', 'upload-skills.ts', '--dry-run'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.dryRun).toBe(true);
    });

    it('parses --force flag', async () => {
      process.argv = ['node', 'upload-skills.ts', '--force'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.force).toBe(true);
    });

    it('parses --list flag', async () => {
      process.argv = ['node', 'upload-skills.ts', '--list'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.list).toBe(true);
    });

    it('parses --verbose flag', async () => {
      process.argv = ['node', 'upload-skills.ts', '--verbose'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.verbose).toBe(true);
    });

    it('parses positional argument as skill name', async () => {
      process.argv = ['node', 'upload-skills.ts', 'summarize'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.skill).toBe('summarize');
    });

    it('parses multiple flags together', async () => {
      process.argv = ['node', 'upload-skills.ts', '--force', '--verbose', '--skill', 'test'];

      const { parseArgs } = await import('./upload-skills.js');
      const options = parseArgs();

      expect(options.force).toBe(true);
      expect(options.verbose).toBe(true);
      expect(options.skill).toBe('test');
    });
  });

  // ===========================================================================
  // Help Output
  // ===========================================================================

  describe('helpOutput', () => {
    it('displays help with --help flag', async () => {
      process.argv = ['node', 'upload-skills.ts', '--help'];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { main } = await import('./upload-skills.js');
      const exitCode = await main();

      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--skill'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--dry-run'));

      consoleSpy.mockRestore();
    });
  });
});
