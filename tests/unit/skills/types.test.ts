/**
 * Types Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#5 - Tool names validated as snake_case
 * @see AC#2 - SkillMetadata type for metadata-only loading
 */

import { describe, it, expect } from 'vitest';
import { TOOL_NAME_PATTERN } from '@/skills/types.js';
import type { SkillMetadata, Skill } from '@/skills/types.js';

describe('SkillMetadata type', () => {
  it('has required fields for metadata-only loading', () => {
    // This is a compile-time check - if it compiles, the type is correct
    const metadata: SkillMetadata = {
      name: 'test_skill',
      description: 'A test skill',
      filePath: '.skills/test/SKILL.md',
      skillPath: '.skills/test',
      hasExecutableScripts: false,
    };

    expect(metadata.name).toBe('test_skill');
    expect(metadata.skillPath).toBeDefined();
  });

  it('does NOT include instructions field', () => {
    // Type-level enforcement: SkillMetadata should not have instructions
    // This is verified at compile time, but we document it here
    const metadata: SkillMetadata = {
      name: 'test_skill',
      description: 'A test skill',
      filePath: '.skills/test/SKILL.md',
      skillPath: '.skills/test',
      hasExecutableScripts: false,
    };

    // instructions should not exist on SkillMetadata
    expect('instructions' in metadata).toBe(false);
  });

  it('includes optional fields matching Skill interface', () => {
    const metadata: SkillMetadata = {
      name: 'test_skill',
      description: 'A test skill',
      version: '1.0.0',
      author: 'Test Author',
      tools: [{ name: 'tool_one', description: 'A tool', parameters: {} }],
      filePath: '.skills/test/SKILL.md',
      skillPath: '.skills/test',
      scripts: [{ name: 'script.py', path: '.skills/test/scripts/script.py' }],
      hasExecutableScripts: true,
    };

    expect(metadata.version).toBe('1.0.0');
    expect(metadata.author).toBe('Test Author');
    expect(metadata.tools).toHaveLength(1);
    expect(metadata.scripts).toHaveLength(1);
  });
});

describe('Skill type has instructions field', () => {
  it('includes instructions for full content loading', () => {
    const skill: Skill = {
      name: 'test_skill',
      description: 'A test skill',
      instructions: '# Full instructions here',
      filePath: '.skills/test/SKILL.md',
      hasExecutableScripts: false,
    };

    expect(skill.instructions).toBe('# Full instructions here');
  });
});

describe('TOOL_NAME_PATTERN', () => {
  it('matches valid snake_case names', () => {
    expect(TOOL_NAME_PATTERN.test('search')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('search_api')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('get_user_profile')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('oauth2_token')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('a1')).toBe(true);
  });

  it('rejects invalid names', () => {
    // PascalCase
    expect(TOOL_NAME_PATTERN.test('SearchApi')).toBe(false);
    // camelCase
    expect(TOOL_NAME_PATTERN.test('searchApi')).toBe(false);
    // kebab-case
    expect(TOOL_NAME_PATTERN.test('search-api')).toBe(false);
    // starts with number
    expect(TOOL_NAME_PATTERN.test('2fa_token')).toBe(false);
    // starts with underscore
    expect(TOOL_NAME_PATTERN.test('_private')).toBe(false);
    // uppercase
    expect(TOOL_NAME_PATTERN.test('SEARCH')).toBe(false);
    // empty
    expect(TOOL_NAME_PATTERN.test('')).toBe(false);
    // spaces
    expect(TOOL_NAME_PATTERN.test('search api')).toBe(false);
  });
});

