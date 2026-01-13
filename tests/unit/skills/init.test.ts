/**
 * Skills Initialization Tests
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#1 - Skills uploaded at startup
 * @see AC#6 - Langfuse captures upload metrics
 * @see AC#7 - ANTHROPIC_SKILLS_ENABLED=false skips upload
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config first (before importing modules that use it)
const mockConfig = {
  anthropicApiKey: 'test-api-key',
  anthropic: {
    skillsEnabled: true,
    allBetas: [
      'context-management-2025-06-27',
      'advanced-tool-use-2025-11-20',
      'code-execution-2025-08-25',
      'skills-2025-10-02',
      'files-api-2025-04-14',
    ],
  },
};

vi.mock('@/config/environment.js', () => ({
  config: mockConfig,
}));

vi.mock('@/skills/sync-service.js', () => ({
  syncSkills: vi.fn(),
  getUploadedSkillIds: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/observability/langfuse.js', () => ({
  getLangfuse: vi.fn(() => ({
    span: vi.fn(() => ({
      end: vi.fn(),
      update: vi.fn(),
    })),
    event: vi.fn(),
  })),
}));

describe('skills/init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state
    vi.resetModules();
    // Reset skillsEnabled to default
    mockConfig.anthropic.skillsEnabled = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // AC#1: Skills uploaded at startup
  // ==========================================================================

  describe('initializeSkills', () => {
    it('calls syncSkills on startup', async () => {
      // GIVEN: Skills are enabled
      const { syncSkills } = await import('@/skills/sync-service.js');
      vi.mocked(syncSkills).mockResolvedValue({
        uploaded: 2,
        updated: 0,
        cached: 1,
        failed: 0,
        skillIds: { skill1: 'skill_01', skill2: 'skill_02' },
      });

      // WHEN: Initializing skills
      const { initializeSkills, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('startup-trace-id');

      // THEN: syncSkills is called with traceId
      expect(syncSkills).toHaveBeenCalledWith('startup-trace-id');
    });

    it('sets skillsInitialized flag to true on success', async () => {
      // GIVEN: Skills sync succeeds
      const { syncSkills } = await import('@/skills/sync-service.js');
      vi.mocked(syncSkills).mockResolvedValue({
        uploaded: 1,
        updated: 0,
        cached: 0,
        failed: 0,
        skillIds: { skill: 'skill_01' },
      });

      // WHEN: Initializing skills
      const { initializeSkills, isSkillsInitialized, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('trace-id');

      // THEN: skillsInitialized is true
      expect(isSkillsInitialized()).toBe(true);
    });

    it('only initializes once (idempotent)', async () => {
      // GIVEN: Skills already initialized
      const { syncSkills } = await import('@/skills/sync-service.js');
      vi.mocked(syncSkills).mockResolvedValue({
        uploaded: 1,
        updated: 0,
        cached: 0,
        failed: 0,
        skillIds: { skill: 'skill_01' },
      });

      // WHEN: Initializing twice
      const { initializeSkills, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('trace-1');
      await initializeSkills('trace-2');

      // THEN: syncSkills called only once
      expect(syncSkills).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // AC#6: Langfuse captures upload metrics
  // ==========================================================================

  describe('observability', () => {
    it('creates Langfuse span for skill initialization', async () => {
      // GIVEN: Langfuse is available
      const { getLangfuse } = await import('@/observability/langfuse.js');
      const mockSpan = { end: vi.fn(), update: vi.fn() };
      vi.mocked(getLangfuse).mockReturnValue({
        span: vi.fn().mockReturnValue(mockSpan),
        event: vi.fn(),
      } as unknown as ReturnType<typeof getLangfuse>);

      const { syncSkills } = await import('@/skills/sync-service.js');
      vi.mocked(syncSkills).mockResolvedValue({
        uploaded: 3,
        updated: 0,
        cached: 2,
        failed: 1,
        skillIds: { s1: 'skill_01', s2: 'skill_02', s3: 'skill_03' },
      });

      // WHEN: Initializing skills
      const { initializeSkills, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('trace-id');

      // THEN: Span created and ended with metrics
      const langfuse = getLangfuse();
      expect(langfuse?.span).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'skills.init',
        })
      );
      expect(mockSpan.end).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            uploaded: 3,
            cached: 2,
            failed: 1,
          }),
        })
      );
    });

    it('logs skill initialization metrics', async () => {
      // GIVEN: Skills sync returns metrics
      const { syncSkills } = await import('@/skills/sync-service.js');
      const { logger } = await import('@/utils/logger.js');
      vi.mocked(syncSkills).mockResolvedValue({
        uploaded: 2,
        updated: 0,
        cached: 1,
        failed: 0,
        skillIds: { s1: 'skill_01', s2: 'skill_02', s3: 'skill_03' },
      });

      // WHEN: Initializing skills
      const { initializeSkills, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('trace-id');

      // THEN: Metrics logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.init.complete',
          traceId: 'trace-id',
          uploaded: 2,
          cached: 1,
          failed: 0,
        })
      );
    });
  });

  // ==========================================================================
  // AC#7: ANTHROPIC_SKILLS_ENABLED=false skips upload
  // ==========================================================================

  describe('skills disabled', () => {
    it('skips initialization when ANTHROPIC_SKILLS_ENABLED=false', async () => {
      // GIVEN: Skills are disabled via config
      mockConfig.anthropic.skillsEnabled = false;

      const { syncSkills } = await import('@/skills/sync-service.js');
      const { logger } = await import('@/utils/logger.js');

      // WHEN: Initializing skills
      const { initializeSkills, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('trace-id');

      // THEN: syncSkills not called
      expect(syncSkills).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.init.skipped',
          reason: 'disabled',
        })
      );
    });

    it('sets skillsInitialized to false when disabled', async () => {
      // GIVEN: Skills are disabled
      mockConfig.anthropic.skillsEnabled = false;

      // WHEN: Initializing skills
      const { initializeSkills, isSkillsInitialized, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('trace-id');

      // THEN: skillsInitialized is false
      expect(isSkillsInitialized()).toBe(false);
    });
  });

  // ==========================================================================
  // Error Handling (Task 5.4)
  // ==========================================================================

  describe('error handling', () => {
    it('handles sync failures gracefully (logs warning, continues)', async () => {
      // GIVEN: syncSkills throws error
      const { syncSkills } = await import('@/skills/sync-service.js');
      const { logger } = await import('@/utils/logger.js');
      vi.mocked(syncSkills).mockRejectedValue(new Error('Sync failed'));

      // WHEN: Initializing skills
      const { initializeSkills, isSkillsInitialized, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await initializeSkills('trace-id');

      // THEN: Warning logged, doesn't throw, initialized is false
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.init.failed',
          error: 'Sync failed',
        })
      );
      expect(isSkillsInitialized()).toBe(false);
    });

    it('does not throw when initialization fails', async () => {
      // GIVEN: syncSkills throws error
      const { syncSkills } = await import('@/skills/sync-service.js');
      vi.mocked(syncSkills).mockRejectedValue(new Error('API unavailable'));

      // WHEN/THEN: Initializing skills does not throw
      const { initializeSkills, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();
      await expect(initializeSkills('trace-id')).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Skill ID Access (Task 5.5)
  // ==========================================================================

  describe('skillsInitialized flag', () => {
    it('exports isSkillsInitialized function', async () => {
      // GIVEN: Module imported
      const init = await import('@/skills/init.js');

      // THEN: Function is exported
      expect(typeof init.isSkillsInitialized).toBe('function');
    });

    it('returns false before initialization', async () => {
      // GIVEN: Skills not yet initialized
      const { isSkillsInitialized, _resetForTests } = await import('@/skills/init.js');
      _resetForTests?.();

      // THEN: Returns false
      expect(isSkillsInitialized()).toBe(false);
    });
  });
});
