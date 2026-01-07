/**
 * Prompt Builder Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#4 - Skills hint injected (not full content)
 */

import { describe, it, expect } from 'vitest';
import { buildSkillsPrompt, buildSkillsHint } from './prompt-builder.js';
import type { Skill, SkillMetadata } from './types.js';

describe('buildSkillsPrompt', () => {
  it('returns empty string when no skills provided', () => {
    const result = buildSkillsPrompt([]);
    expect(result).toBe('');
  });

  it('formats single skill correctly', () => {
    const skills: Skill[] = [
      {
        name: 'research_skill',
        description: 'Conducts deep research',
        instructions: 'Use this for research tasks.',
        filePath: '/path/SKILL.md',
        hasExecutableScripts: false,
      },
    ];

    const result = buildSkillsPrompt(skills);

    expect(result).toContain('# Available Skills');
    expect(result).toContain('## Skill: research_skill');
    expect(result).toContain('Conducts deep research');
    expect(result).toContain('Use this for research tasks.');
  });

  it('formats multiple skills with separators', () => {
    const skills: Skill[] = [
      {
        name: 'skill_one',
        description: 'First skill',
        instructions: 'Instructions one',
        filePath: '/path/1/SKILL.md',
        hasExecutableScripts: false,
      },
      {
        name: 'skill_two',
        description: 'Second skill',
        instructions: 'Instructions two',
        filePath: '/path/2/SKILL.md',
        hasExecutableScripts: false,
      },
    ];

    const result = buildSkillsPrompt(skills);

    expect(result).toContain('## Skill: skill_one');
    expect(result).toContain('## Skill: skill_two');
    expect(result).toContain('---'); // Separator between skills
  });

  it('includes tool list when skill has tools', () => {
    const skills: Skill[] = [
      {
        name: 'tool_skill',
        description: 'Skill with tools',
        instructions: 'Use the tools',
        filePath: '/path/SKILL.md',
        hasExecutableScripts: false,
        tools: [
          {
            name: 'search_api',
            description: 'Search API',
            parameters: {},
          },
          {
            name: 'fetch_data',
            description: 'Fetch data',
            parameters: {},
          },
        ],
      },
    ];

    const result = buildSkillsPrompt(skills);

    expect(result).toContain('Available tools: search_api, fetch_data');
  });

  it('does not include tools section when no tools defined', () => {
    const skills: Skill[] = [
      {
        name: 'no_tools_skill',
        description: 'No tools',
        instructions: 'No tools here',
        filePath: '/path/SKILL.md',
        hasExecutableScripts: false,
        tools: undefined,
      },
    ];

    const result = buildSkillsPrompt(skills);

    expect(result).not.toContain('Available tools:');
  });

  it('handles empty tools array', () => {
    const skills: Skill[] = [
      {
        name: 'empty_tools',
        description: 'Empty tools array',
        instructions: 'Empty',
        filePath: '/path/SKILL.md',
        hasExecutableScripts: false,
        tools: [],
      },
    ];

    const result = buildSkillsPrompt(skills);

    expect(result).not.toContain('Available tools:');
  });
});

// ============================================================================
// BUILD SKILLS HINT TESTS (Token Efficient)
// ============================================================================

describe('buildSkillsHint (token efficient)', () => {
  it('returns empty string when no skills provided', () => {
    const result = buildSkillsHint([]);
    expect(result).toBe('');
  });

  it('formats skill metadata as hint (no instructions)', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'research_skill',
        description: 'Conducts deep research across multiple sources',
        filePath: '.skills/research/SKILL.md',
        skillPath: '.skills/research',
        hasExecutableScripts: false,
      },
    ];

    const result = buildSkillsHint(skills);

    expect(result).toContain('# Available Skills');
    expect(result).toContain('*research_skill*');
    expect(result).toContain('Conducts deep research across multiple sources');
    // Should NOT contain any instructions content
    expect(result).not.toContain('## Skill:');
    // Should contain on-demand loading instruction
    expect(result).toContain('execute_code');
    expect(result).toContain('skill_doc');
    expect(result).toContain('skill:{skill-name}');
  });

  it('includes tool names in hint', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'tool_skill',
        description: 'Skill with tools',
        filePath: '.skills/tool/SKILL.md',
        skillPath: '.skills/tool',
        hasExecutableScripts: false,
        tools: [
          { name: 'search_api', description: 'Search', parameters: {} },
          { name: 'fetch_data', description: 'Fetch', parameters: {} },
        ],
      },
    ];

    const result = buildSkillsHint(skills);

    expect(result).toContain('tools: search_api, fetch_data');
  });

  it('formats multiple skills as compact list', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'skill_one',
        description: 'First skill',
        filePath: '.skills/one/SKILL.md',
        skillPath: '.skills/one',
        hasExecutableScripts: false,
      },
      {
        name: 'skill_two',
        description: 'Second skill',
        filePath: '.skills/two/SKILL.md',
        skillPath: '.skills/two',
        hasExecutableScripts: false,
      },
    ];

    const result = buildSkillsHint(skills);

    expect(result).toContain('*skill_one*: First skill');
    expect(result).toContain('*skill_two*: Second skill');
    // Should be compact list format, not full sections
    expect(result).not.toContain('---');
  });

  it('does not include tools section when no tools defined', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'no_tools',
        description: 'No tools defined',
        filePath: '.skills/no-tools/SKILL.md',
        skillPath: '.skills/no-tools',
        hasExecutableScripts: false,
        tools: undefined,
      },
    ];

    const result = buildSkillsHint(skills);

    expect(result).not.toContain('tools:');
  });

  it('is significantly smaller than buildSkillsPrompt', () => {
    // Simulate a skill with large instructions
    const fullSkill: Skill = {
      name: 'big_skill',
      description: 'A skill with lots of content',
      instructions: 'A'.repeat(10000), // 10K character instructions
      filePath: '.skills/big/SKILL.md',
      hasExecutableScripts: false,
    };

    const metadata: SkillMetadata = {
      name: 'big_skill',
      description: 'A skill with lots of content',
      filePath: '.skills/big/SKILL.md',
      skillPath: '.skills/big',
      hasExecutableScripts: false,
    };

    const fullPrompt = buildSkillsPrompt([fullSkill]);
    const hint = buildSkillsHint([metadata]);

    // Hint should be at least 10x smaller than full prompt
    expect(hint.length).toBeLessThan(fullPrompt.length / 10);
    // Verify the ratio (should be around 100x smaller for this test)
    expect(fullPrompt.length / hint.length).toBeGreaterThan(10);
  });
});

