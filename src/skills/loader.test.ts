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
});

