/**
 * Skill Tool Handler Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#5 - Skill tools registered and executed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSkillToolName, executeSkillTool, registerSkillTools } from './tool-handler.js';
import { toolRegistry } from '../tools/registry.js';
import type { SkillMetadata } from './types.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('parseSkillToolName', () => {
  it('parses valid skill tool name', () => {
    const result = parseSkillToolName('deep_research__search_api');

    expect(result).toEqual({
      skillName: 'deep_research',
      localToolName: 'search_api',
    });
  });

  it('handles tool names with multiple underscores', () => {
    const result = parseSkillToolName('my_skill__my_tool_v2');

    expect(result).toEqual({
      skillName: 'my_skill',
      localToolName: 'my_tool_v2',
    });
  });

  it('handles nested double underscores (splits on first)', () => {
    const result = parseSkillToolName('skill__tool__nested');

    expect(result).toEqual({
      skillName: 'skill',
      localToolName: 'tool__nested',
    });
  });

  it('returns null for non-skill tool names', () => {
    expect(parseSkillToolName('simple_tool')).toBeNull();
    expect(parseSkillToolName('tool')).toBeNull();
  });

  it('returns null for malformed names', () => {
    expect(parseSkillToolName('__tool')).toBeNull();
    expect(parseSkillToolName('skill__')).toBeNull();
    expect(parseSkillToolName('')).toBeNull();
  });
});

describe('executeSkillTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error for invalid tool name format', async () => {
    const result = await executeSkillTool('not_a_skill_tool', {}, 'trace-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_INVALID_INPUT');
    }
  });

  it('returns TOOL_NOT_IMPLEMENTED for valid skill tools (pending Story 6.2)', async () => {
    const result = await executeSkillTool(
      'deep_research__search_api',
      { query: 'test' },
      'trace-123'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_NOT_IMPLEMENTED');
      expect(result.error.message).toContain('GKE Sandbox');
      expect(result.error.message).toContain('deep_research');
    }
  });

  it('never throws, returns error result on exception', async () => {
    // Even if internal logic throws, executeSkillTool should catch and return error
    const result = await executeSkillTool(
      'skill__tool',
      undefined,
      'trace-123'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

describe('registerSkillTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry.__resetForTests();
  });

  it('registers tools from skill metadata', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'research_skill',
        description: 'Research skill',
        filePath: '.skills/research/SKILL.md',
        skillPath: '.skills/research',
        hasExecutableScripts: false,
        tools: [
          {
            name: 'search_api',
            description: 'Search API',
            parameters: {
              query: { type: 'string', description: 'Query', required: true },
            },
          },
        ],
      },
    ];

    const registered = registerSkillTools(skills, 'test-trace');

    expect(registered).toBe(1);

    const tool = toolRegistry.getSkillTool('research_skill__search_api');
    expect(tool).toBeDefined();
    expect(tool?.skillName).toBe('research_skill');
    expect(tool?.originalName).toBe('search_api');
  });

  it('registers multiple tools from multiple skills', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'skill_a',
        description: 'Skill A',
        filePath: '.skills/a/SKILL.md',
        skillPath: '.skills/a',
        hasExecutableScripts: false,
        tools: [
          { name: 'tool_1', description: 'Tool 1', parameters: {} },
          { name: 'tool_2', description: 'Tool 2', parameters: {} },
        ],
      },
      {
        name: 'skill_b',
        description: 'Skill B',
        filePath: '.skills/b/SKILL.md',
        skillPath: '.skills/b',
        hasExecutableScripts: false,
        tools: [{ name: 'tool_3', description: 'Tool 3', parameters: {} }],
      },
    ];

    const registered = registerSkillTools(skills, 'test-trace');

    expect(registered).toBe(3);
    expect(toolRegistry.getSkillTool('skill_a__tool_1')).toBeDefined();
    expect(toolRegistry.getSkillTool('skill_a__tool_2')).toBeDefined();
    expect(toolRegistry.getSkillTool('skill_b__tool_3')).toBeDefined();
  });

  it('skips skills without tools', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'no_tools_skill',
        description: 'No tools',
        filePath: '.skills/none/SKILL.md',
        skillPath: '.skills/none',
        hasExecutableScripts: false,
        tools: undefined,
      },
      {
        name: 'empty_tools_skill',
        description: 'Empty tools',
        filePath: '.skills/empty/SKILL.md',
        skillPath: '.skills/empty',
        hasExecutableScripts: false,
        tools: [],
      },
    ];

    const registered = registerSkillTools(skills, 'test-trace');

    expect(registered).toBe(0);
  });

  it('includes skill tools in getToolsForClaude', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'test_skill',
        description: 'Test skill',
        filePath: '.skills/test/SKILL.md',
        skillPath: '.skills/test',
        hasExecutableScripts: false,
        tools: [{ name: 'test_tool', description: 'Test tool', parameters: {} }],
      },
    ];

    registerSkillTools(skills, 'test-trace');

    const allTools = toolRegistry.getToolsForClaude();
    const toolNames = allTools.map((t) => t.name);
    expect(toolNames).toContain('test_skill__test_tool');
  });

  it('skips tool registration when skill name is not snake_case', () => {
    const skills: SkillMetadata[] = [
      {
        name: 'kebab-skill',
        description: 'Invalid for tool prefix',
        filePath: '.skills/kebab/SKILL.md',
        skillPath: '.skills/kebab',
        hasExecutableScripts: false,
        tools: [{ name: 'tool_one', description: 'Tool', parameters: {} }],
      },
    ];

    const registered = registerSkillTools(skills, 'test-trace');
    expect(registered).toBe(0);
    expect(toolRegistry.getSkillTool('kebab-skill__tool_one')).toBeUndefined();
  });
});

