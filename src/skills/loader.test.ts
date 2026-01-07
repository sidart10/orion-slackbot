/**
 * Skills Loader Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#1 - Skills discovered from .skills directory
 * @see AC#3 - Invalid skills logged but don't prevent others from loading
 * @see AC#8 - Script paths cataloged for GKE sandbox
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('glob', () => ({
  glob: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../observability/langfuse.js', () => ({
  getLangfuse: vi.fn(() => ({
    span: vi.fn(() => ({
      end: vi.fn(),
    })),
  })),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('skills/loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadSkills', () => {
    it('returns empty array when .skills directory does not exist', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { loadSkills, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const skills = await loadSkills('test-trace-id');

      expect(skills).toEqual([]);
    });

    it('returns empty array when no SKILL.md files found', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(glob).mockResolvedValue([]);

      const { loadSkills, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const skills = await loadSkills('test-trace-id');

      expect(skills).toEqual([]);
    });

    it('loads valid skills successfully', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => {
        if (String(p) === '.skills') return true;
        return false; // No scripts directories
      });

      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/test-skill/SKILL.md'];
        }
        return []; // No .py files
      });

      vi.mocked(readFile).mockResolvedValue(`---
name: test_skill
description: A test skill
version: 1.0.0
---

# Test Skill Instructions

Use this skill for testing.`);

      const { loadSkills, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const skills = await loadSkills('test-trace-id');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('test_skill');
      expect(skills[0].description).toBe('A test skill');
      expect(skills[0].version).toBe('1.0.0');
      expect(skills[0].instructions).toContain('Test Skill Instructions');
      expect(skills[0].hasExecutableScripts).toBe(false);
    });

    it('handles parse errors gracefully and continues loading other skills', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockImplementation((p) => {
        if (String(p) === '.skills') return true;
        return false;
      });

      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return [
            '.skills/valid-skill/SKILL.md',
            '.skills/invalid-skill/SKILL.md',
          ];
        }
        return [];
      });

      // Use mockReturnValueOnce in order
      vi.mocked(readFile)
        .mockResolvedValueOnce(`---
name: valid_skill
description: Valid skill
---
Content`)
        .mockResolvedValueOnce(`---
not_a_name: invalid
---
No proper fields`);

      const { loadSkillsWithResult, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const result = await loadSkillsWithResult('test-trace-id');

      // Use loadSkillsWithResult to verify failures are captured
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('valid_skill');
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].path).toContain('invalid-skill');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.parse_failed',
          traceId: 'test-trace-id',
        })
      );
    });

    it('discovers scripts in skills with scripts/ directory', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path === '.skills') return true;
        if (path.includes('scripts')) return true;
        if (path.includes('requirements.txt')) return true;
        return false;
      });

      vi.mocked(glob).mockImplementation(async (pattern, options) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/script-skill/SKILL.md'];
        }
        if (String(pattern) === '*.py') {
          return ['search.py', 'process.py'];
        }
        return [];
      });

      vi.mocked(readFile).mockResolvedValue(`---
name: script_skill
description: Skill with scripts
---
Instructions`);

      const { loadSkills, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const skills = await loadSkills('test-trace-id');

      expect(skills).toHaveLength(1);
      expect(skills[0].hasExecutableScripts).toBe(true);
      expect(skills[0].scripts).toHaveLength(2);
      expect(skills[0].scripts![0].name).toBe('search.py');
      expect(skills[0].scripts![0].requirements).toContain('requirements.txt');
    });

    it('logs skills loaded with traceId', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockImplementation((p) => String(p) === '.skills');
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/logged-skill/SKILL.md'];
        }
        return [];
      });
      vi.mocked(readFile).mockResolvedValue(`---
name: logged_skill
description: Test logging
---
Content`);

      const { loadSkills, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      await loadSkills('trace-123');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.loaded',
          traceId: 'trace-123',
          loaded: 1,
          failed: 0,
        })
      );
    });
  });

  describe('getSkills (caching)', () => {
    it('caches skills after first load', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => String(p) === '.skills');
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/cached-skill/SKILL.md'];
        }
        return [];
      });
      vi.mocked(readFile).mockResolvedValue(`---
name: cached_skill
description: Cached
---
Content`);

      const { getSkills, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      // First call - should load
      const skills1 = await getSkills('trace-1');
      expect(skills1).toHaveLength(1);

      // Second call - should use cache
      const skills2 = await getSkills('trace-2');
      expect(skills2).toHaveLength(1);

      // glob should only have been called once per pattern
      expect(vi.mocked(glob)).toHaveBeenCalledTimes(1);
    });
  });

  describe('reloadSkills', () => {
    it('invalidates cache', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => String(p) === '.skills');
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/reload-skill/SKILL.md'];
        }
        return [];
      });
      vi.mocked(readFile).mockResolvedValue(`---
name: reload_skill
description: Reload test
---
Content`);

      const { getSkills, reloadSkills, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      await getSkills('trace-1');
      reloadSkills();
      await getSkills('trace-2');

      // Should have called glob twice (once per getSkills after cache clear)
      expect(vi.mocked(glob)).toHaveBeenCalledTimes(2);
    });
  });

  describe('loadSkillsWithResult', () => {
    it('returns both skills and failures', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => String(p) === '.skills');
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return [
            '.skills/ok-skill/SKILL.md',
            '.skills/bad-skill/SKILL.md',
          ];
        }
        return [];
      });

      vi.mocked(readFile).mockImplementation(async (path) => {
        if (String(path).includes('ok-skill')) {
          return `---
name: ok_skill
description: Works
---
Content`;
        }
        return `---
invalid: yaml only
---
`;
      });

      const { loadSkillsWithResult, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const result = await loadSkillsWithResult('trace-id');

      expect(result.skills).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].path).toContain('bad-skill');
    });
  });

  // ============================================================================
  // METADATA-ONLY LOADING TESTS (Progressive Disclosure)
  // ============================================================================

  describe('loadSkillMetadata (metadata-only)', () => {
    it('returns empty array when .skills directory does not exist', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { loadSkillMetadata, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const metadata = await loadSkillMetadata('test-trace-id');

      expect(metadata).toEqual([]);
    });

    it('loads skill metadata without instructions', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => {
        if (String(p) === '.skills') return true;
        return false;
      });

      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/test-skill/SKILL.md'];
        }
        return [];
      });

      // Simulate a skill with long instructions that should NOT be loaded
      vi.mocked(readFile).mockResolvedValue(`---
name: test_skill
description: A test skill
version: 1.0.0
author: Test Author
tools:
  - name: test_tool
    description: A tool
    parameters:
      query:
        type: string
        required: true
---

# Long Instructions

This is a very long set of instructions that could be thousands of tokens.
In production, this would be 10-15KB of markdown that we want to defer
loading until the skill is actually invoked.

## Section 1
Lots of content here...

## Section 2
Even more content...`);

      const { loadSkillMetadata, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const metadata = await loadSkillMetadata('test-trace-id');

      expect(metadata).toHaveLength(1);
      expect(metadata[0].name).toBe('test_skill');
      expect(metadata[0].description).toBe('A test skill');
      expect(metadata[0].version).toBe('1.0.0');
      expect(metadata[0].author).toBe('Test Author');
      expect(metadata[0].filePath).toBe('.skills/test-skill/SKILL.md');
      expect(metadata[0].skillPath).toBe('.skills/test-skill');
      expect(metadata[0].tools).toHaveLength(1);
      expect(metadata[0].tools![0].name).toBe('test_tool');
      // CRITICAL: instructions should NOT be present
      expect('instructions' in metadata[0]).toBe(false);
    });

    it('discovers scripts in skill directory', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path === '.skills') return true;
        if (path.includes('scripts')) return true;
        if (path.includes('requirements.txt')) return true;
        return false;
      });

      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/script-skill/SKILL.md'];
        }
        if (String(pattern) === '*.py') {
          return ['run.py'];
        }
        return [];
      });

      vi.mocked(readFile).mockResolvedValue(`---
name: script_skill
description: Has scripts
---
Instructions`);

      const { loadSkillMetadata, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const metadata = await loadSkillMetadata('test-trace-id');

      expect(metadata).toHaveLength(1);
      expect(metadata[0].hasExecutableScripts).toBe(true);
      expect(metadata[0].scripts).toHaveLength(1);
      expect(metadata[0].scripts![0].name).toBe('run.py');
    });

    it('logs metadata loaded with traceId', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockImplementation((p) => String(p) === '.skills');
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/log-skill/SKILL.md'];
        }
        return [];
      });
      vi.mocked(readFile).mockResolvedValue(`---
name: log_skill
description: Test logging
---
Content`);

      const { loadSkillMetadata, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      await loadSkillMetadata('trace-456');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.metadata_loaded',
          traceId: 'trace-456',
          loaded: 1,
          failed: 0,
        })
      );
    });
  });

  describe('getSkillMetadata (caching)', () => {
    it('caches metadata after first load', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => String(p) === '.skills');
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/cache-skill/SKILL.md'];
        }
        return [];
      });
      vi.mocked(readFile).mockResolvedValue(`---
name: cache_skill
description: Cached
---
Content`);

      const { getSkillMetadata, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      // First call - should load
      const metadata1 = await getSkillMetadata('trace-1');
      expect(metadata1).toHaveLength(1);

      // Clear mocks to track second call
      vi.mocked(glob).mockClear();

      // Second call - should use cache (glob should not be called)
      const metadata2 = await getSkillMetadata('trace-2');
      expect(metadata2).toHaveLength(1);
      expect(vi.mocked(glob)).not.toHaveBeenCalled();
    });
  });

  describe('reloadSkillMetadata', () => {
    it('invalidates metadata cache', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => String(p) === '.skills');
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('SKILL.md')) {
          return ['.skills/reload-skill/SKILL.md'];
        }
        return [];
      });
      vi.mocked(readFile).mockResolvedValue(`---
name: reload_skill
description: Reload
---
Content`);

      const { getSkillMetadata, reloadSkillMetadata, _resetCacheForTests } =
        await import('./loader.js');
      _resetCacheForTests();

      await getSkillMetadata('trace-1');

      vi.mocked(glob).mockClear();

      reloadSkillMetadata();
      await getSkillMetadata('trace-2');

      // Should have called glob again after reload
      expect(vi.mocked(glob)).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // ON-DEMAND INSTRUCTION LOADING TESTS
  // ============================================================================

  describe('loadSkillInstructions (on-demand)', () => {
    it('loads full skill content including instructions', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path === '.skills/deep-research/SKILL.md') return true;
        return false;
      });

      vi.mocked(glob).mockResolvedValue([]);

      vi.mocked(readFile).mockResolvedValue(`---
name: deep_research
description: Research skill
version: 2.0.0
---

# Deep Research Instructions

When conducting research:
1. Gather sources
2. Analyze data
3. Synthesize findings

This is the full instruction content that should ONLY be loaded on-demand.`);

      const { loadSkillInstructions, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const skill = await loadSkillInstructions('.skills/deep-research', 'trace-ondemand');

      expect(skill).not.toBeNull();
      expect(skill!.name).toBe('deep_research');
      expect(skill!.description).toBe('Research skill');
      expect(skill!.version).toBe('2.0.0');
      // CRITICAL: instructions should be loaded
      expect(skill!.instructions).toContain('Deep Research Instructions');
      expect(skill!.instructions).toContain('Gather sources');
    });

    it('returns null when skill does not exist', async () => {
      const { existsSync } = await import('fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockReturnValue(false);

      const { loadSkillInstructions, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      const skill = await loadSkillInstructions('.skills/nonexistent', 'trace-missing');

      expect(skill).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.instructions_not_found',
          traceId: 'trace-missing',
        })
      );
    });

    it('logs instruction load with traceId', async () => {
      const { existsSync } = await import('fs');
      const { glob } = await import('glob');
      const { readFile } = await import('fs/promises');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(existsSync).mockImplementation((p) =>
        String(p) === '.skills/logged-skill/SKILL.md'
      );
      vi.mocked(glob).mockResolvedValue([]);
      vi.mocked(readFile).mockResolvedValue(`---
name: logged_skill
description: Logged
---
Instructions here`);

      const { loadSkillInstructions, _resetCacheForTests } = await import('./loader.js');
      _resetCacheForTests();

      await loadSkillInstructions('.skills/logged-skill', 'trace-log');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'skills.instructions_loaded',
          traceId: 'trace-log',
          skillName: 'logged_skill',
        })
      );
    });
  });
});

