/**
 * Prompt Builder Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#4 - Skill instructions available for system prompt injection
 */

import { describe, it, expect } from 'vitest';
import { buildSkillsPrompt } from './prompt-builder.js';
import type { Skill } from './types.js';

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

