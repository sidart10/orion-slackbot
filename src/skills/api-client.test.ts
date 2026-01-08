/**
 * Skills API Client Tests
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#1 - Skills uploaded to Anthropic Skills API at startup
 * @see AC#3 - Listed skills have correct metadata and version
 * @see AC#5 - Beta headers included via config.anthropic.allBetas
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions that we can control
const mockSkillsList = vi.fn();
const mockSkillsCreate = vi.fn();
const mockSkillsRetrieve = vi.fn();
const mockSkillsVersionsCreate = vi.fn();
const mockSkillsVersionsDelete = vi.fn();
const mockSkillsDelete = vi.fn();

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      skills: {
        list: mockSkillsList,
        create: mockSkillsCreate,
        retrieve: mockSkillsRetrieve,
        versions: {
          create: mockSkillsVersionsCreate,
          delete: mockSkillsVersionsDelete,
        },
        delete: mockSkillsDelete,
      },
    },
  })),
  toFile: vi.fn(),
}));

vi.mock('../config/environment.js', () => ({
  config: {
    anthropicApiKey: 'test-api-key',
    anthropic: {
      allBetas: [
        'context-management-2025-06-27',
        'advanced-tool-use-2025-11-20',
        'code-execution-2025-08-25',
        'skills-2025-10-02',
        'files-api-2025-04-14',
      ],
      skillsEnabled: true,
    },
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockLangfuseEvent = vi.fn();
vi.mock('../observability/langfuse.js', () => ({
  getLangfuse: vi.fn(() => ({
    event: mockLangfuseEvent,
    span: vi.fn(() => ({ end: vi.fn() })),
  })),
}));

// Import after mocks are set up
import { SkillsApiClient } from './api-client.js';
import type { ApiSkill, ApiSkillVersion } from './types.js';

describe('skills/api-client', () => {
  beforeEach(() => {
    // Reset mock call history and return values
    mockSkillsList.mockReset();
    mockSkillsCreate.mockReset();
    mockSkillsRetrieve.mockReset();
    mockSkillsVersionsCreate.mockReset();
    mockSkillsVersionsDelete.mockReset();
    mockSkillsDelete.mockReset();
    mockLangfuseEvent.mockReset();
  });

  // ==========================================================================
  // AC#1: Skills uploaded to Anthropic Skills API
  // ==========================================================================

  describe('SkillsApiClient', () => {
    describe('listSkills', () => {
      it('returns custom skills when source is custom', async () => {
        // GIVEN: Skills API returns custom skills
        const mockSkills: ApiSkill[] = [
          {
            id: 'skill_01custom',
            display_title: 'Custom Skill',
            source: 'custom',
            latest_version: '1759178010641129',
            created_at: '2026-01-07T10:30:00Z',
          },
        ];
        mockSkillsList.mockResolvedValueOnce({ data: mockSkills });

        // WHEN: Listing custom skills
        const client = new SkillsApiClient('test-trace');
        const skills = await client.listSkills('custom');

        // THEN: Custom skills are returned
        expect(skills).toBeDefined();
        expect(Array.isArray(skills)).toBe(true);
        expect(skills).toEqual(mockSkills);
        expect(mockSkillsList).toHaveBeenCalledWith({ source: 'custom' });
      });

      it('returns anthropic-managed skills when source is anthropic', async () => {
        // GIVEN: Skills API returns anthropic skills
        const mockSkills: ApiSkill[] = [
          {
            id: 'skill_01anthropic',
            display_title: 'Anthropic Skill',
            source: 'anthropic',
            latest_version: '1759178010641130',
            created_at: '2026-01-07T11:00:00Z',
          },
        ];
        mockSkillsList.mockResolvedValueOnce({ data: mockSkills });

        // WHEN: Listing anthropic skills
        const client = new SkillsApiClient('test-trace');
        const skills = await client.listSkills('anthropic');

        // THEN: Anthropic skills are returned
        expect(skills).toBeDefined();
        expect(mockSkillsList).toHaveBeenCalledWith({ source: 'anthropic' });
      });

      it('returns all skills when source is not specified', async () => {
        // GIVEN: Skills API returns all skills
        mockSkillsList.mockResolvedValueOnce({ data: [] });

        // WHEN: Listing all skills
        const client = new SkillsApiClient('test-trace');
        const skills = await client.listSkills();

        // THEN: All skills are returned
        expect(skills).toBeDefined();
        expect(mockSkillsList).toHaveBeenCalledWith(undefined);
      });
    });

    describe('createSkill', () => {
      it('creates a new skill with display title and files', async () => {
        // GIVEN: Valid skill data
        const mockCreated: ApiSkill = {
          id: 'skill_01newskill',
          display_title: 'Deep Research',
          source: 'custom',
          latest_version: '1759178010641131',
          created_at: '2026-01-07T12:00:00Z',
        };
        mockSkillsCreate.mockResolvedValueOnce(mockCreated);

        const displayTitle = 'Deep Research';
        const files = [{ name: 'SKILL.md', content: Buffer.from('# Skill') }];

        // WHEN: Creating a skill
        const client = new SkillsApiClient('test-trace');
        const result = await client.createSkill(displayTitle, files);

        // THEN: Skill is created with ID
        expect(result).toBeDefined();
        expect(result.id).toMatch(/^skill_/);
        expect(mockSkillsCreate).toHaveBeenCalledWith(
          expect.objectContaining({ display_title: 'Deep Research' })
        );
      });

      it('throws error when display title exceeds 64 characters', async () => {
        // GIVEN: Title exceeds limit
        const longTitle = 'A'.repeat(65);
        const files = [{ name: 'SKILL.md', content: Buffer.from('# Skill') }];

        // WHEN/THEN: Creating skill throws validation error
        const client = new SkillsApiClient('test-trace');
        await expect(client.createSkill(longTitle, files)).rejects.toThrow(/64/);
      });
    });

    describe('retrieveSkill', () => {
      it('retrieves skill by ID with metadata', async () => {
        // GIVEN: Skill exists
        const skillId = 'skill_01AbCdEfGhIjKlMnOpQrStUv';
        const mockSkill: ApiSkill = {
          id: skillId,
          display_title: 'Test Skill',
          source: 'custom',
          latest_version: '1759178010641129',
          created_at: '2026-01-07T10:30:00Z',
        };
        mockSkillsRetrieve.mockResolvedValueOnce(mockSkill);

        // WHEN: Retrieving skill
        const client = new SkillsApiClient('test-trace');
        const skill = await client.retrieveSkill(skillId);

        // THEN: Skill metadata is returned
        expect(skill).toBeDefined();
        expect(skill.id).toBe(skillId);
        expect(skill.display_title).toBeDefined();
        expect(skill.source).toBe('custom');
        expect(skill.latest_version).toBeDefined();
      });

      it('throws error when skill does not exist', async () => {
        // GIVEN: Skill does not exist
        const skillId = 'skill_nonexistent';
        const notFoundError = new Error('Not Found');
        (notFoundError as Error & { status: number }).status = 404;
        mockSkillsRetrieve.mockRejectedValueOnce(notFoundError);

        // WHEN/THEN: Retrieving throws not found error
        const client = new SkillsApiClient('test-trace');
        await expect(client.retrieveSkill(skillId)).rejects.toThrow(/not found/i);
      });
    });

    describe('createSkillVersion', () => {
      it('creates new version of existing skill', async () => {
        // GIVEN: Skill exists
        const skillId = 'skill_01AbCdEfGhIjKlMnOpQrStUv';
        const mockVersion: ApiSkillVersion = {
          version: '1759178010641130',
          created_at: '2026-01-07T11:00:00Z',
        };
        mockSkillsVersionsCreate.mockResolvedValueOnce(mockVersion);

        const files = [{ name: 'SKILL.md', content: Buffer.from('# Updated') }];
        const skillName = 'test-skill';

        // WHEN: Creating new version
        const client = new SkillsApiClient('test-trace');
        const version = await client.createSkillVersion(skillId, files, skillName);

        // THEN: Version is created with epoch timestamp
        expect(version).toBeDefined();
        expect(version.version).toMatch(/^\d+$/); // Epoch timestamp
        expect(mockSkillsVersionsCreate).toHaveBeenCalledWith(skillId, expect.any(Object));
      });

      it('throws error when skill does not exist', async () => {
        // GIVEN: Skill does not exist
        const skillId = 'skill_nonexistent';
        const notFoundError = new Error('Not Found');
        (notFoundError as Error & { status: number }).status = 404;
        mockSkillsVersionsCreate.mockRejectedValueOnce(notFoundError);

        const files = [{ name: 'SKILL.md', content: Buffer.from('# Skill') }];
        const skillName = 'nonexistent-skill';

        // WHEN/THEN: Creating version throws error
        const client = new SkillsApiClient('test-trace');
        await expect(client.createSkillVersion(skillId, files, skillName)).rejects.toThrow();
      });
    });

    describe('deleteSkillVersion', () => {
      it('deletes specific version of skill', async () => {
        // GIVEN: Skill version exists
        const skillId = 'skill_01AbCdEfGhIjKlMnOpQrStUv';
        const version = '1759178010641129';
        mockSkillsVersionsDelete.mockResolvedValueOnce({});

        // WHEN: Deleting version
        const client = new SkillsApiClient('test-trace');
        await client.deleteSkillVersion(skillId, version);

        // THEN: API called with correct skill ID and version
        expect(mockSkillsVersionsDelete).toHaveBeenCalledWith(skillId, version);
        expect(mockSkillsVersionsDelete).toHaveBeenCalledTimes(1);
      });
    });

    describe('deleteSkill', () => {
      it('deletes skill and all its versions', async () => {
        // GIVEN: Skill exists
        const skillId = 'skill_01AbCdEfGhIjKlMnOpQrStUv';
        mockSkillsDelete.mockResolvedValueOnce({});

        // WHEN: Deleting skill
        const client = new SkillsApiClient('test-trace');
        await client.deleteSkill(skillId);

        // THEN: API called with correct skill ID
        expect(mockSkillsDelete).toHaveBeenCalledWith(skillId);
        expect(mockSkillsDelete).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ==========================================================================
  // AC#5: Beta headers included
  // ==========================================================================

  describe('beta headers', () => {
    it('uses skills-2025-10-02 beta for Skills API calls', async () => {
      // GIVEN/WHEN: Client is constructed
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      new SkillsApiClient('test-trace');

      // THEN: Anthropic client includes skills beta header
      expect(Anthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultHeaders: expect.objectContaining({
            'anthropic-beta': expect.stringContaining('skills-2025-10-02'),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Retry Logic (Task 1.8)
  // ==========================================================================

  describe('retry logic', () => {
    it('retries on 5xx errors with exponential backoff', async () => {
      // GIVEN: API returns 500 error twice, then succeeds
      const serverError = { status: 500, message: 'Server error' };
      mockSkillsList
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: [] });

      // WHEN: Listing skills
      const client = new SkillsApiClient('test-trace');
      const result = await client.listSkills();

      // THEN: Retried and succeeded
      expect(mockSkillsList).toHaveBeenCalledTimes(3);
      expect(result).toEqual([]);
    }, 15000); // Extended timeout for retries

    it('emits Langfuse event on rate limit (429)', async () => {
      // GIVEN: API returns 429 rate limit
      const rateLimitError = { status: 429, message: 'Rate limited' };
      mockSkillsList.mockRejectedValue(rateLimitError);

      // WHEN: Listing skills (will fail after retries)
      const client = new SkillsApiClient('test-trace');

      await expect(client.listSkills()).rejects.toMatchObject({ status: 429 });

      // THEN: Langfuse event emitted for rate limit
      expect(mockLangfuseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'skills.api.rate_limited',
        })
      );
    }, 15000);

    it('fails after max 3 retries on persistent 5xx errors', async () => {
      // GIVEN: API always returns 500
      const serverError = { status: 500, message: 'Server error' };
      mockSkillsList.mockRejectedValue(serverError);

      // WHEN: Listing skills
      const client = new SkillsApiClient('test-trace');

      // THEN: Fails after 3 retries (1 initial + 3 retries = 4 calls)
      await expect(client.listSkills()).rejects.toMatchObject({ status: 500 });
      expect(mockSkillsList).toHaveBeenCalledTimes(4); // 1 + 3 retries
    }, 15000);

    it('emits Langfuse event on API unavailable (5xx after retries)', async () => {
      // GIVEN: API always returns 503
      const serverError = { status: 503, message: 'Service unavailable' };
      mockSkillsList.mockRejectedValue(serverError);

      // WHEN: Listing skills
      const client = new SkillsApiClient('test-trace');

      await expect(client.listSkills()).rejects.toMatchObject({ status: 503 });

      // THEN: Langfuse event emitted for unavailable
      expect(mockLangfuseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'skills.api.unavailable',
        })
      );
    }, 15000);

    it('does not retry on 4xx client errors (except 429)', async () => {
      // GIVEN: API returns 400 Bad Request
      const badRequestError = { status: 400, message: 'Bad Request' };
      mockSkillsList.mockRejectedValueOnce(badRequestError);

      // WHEN: Listing skills
      const client = new SkillsApiClient('test-trace');

      await expect(client.listSkills()).rejects.toMatchObject({ status: 400 });

      // THEN: Should not retry 4xx errors
      expect(mockSkillsList).toHaveBeenCalledTimes(1);
    });
  });
});
