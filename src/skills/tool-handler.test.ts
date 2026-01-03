/**
 * Skill Tool Handler Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#5 - Skill tools executed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSkillToolName, executeSkillTool } from './tool-handler.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
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
    expect(result.error?.code).toBe('INVALID_SKILL_TOOL_NAME');
  });

  it('returns not implemented error for valid skill tools (pending Story 6.2)', async () => {
    const result = await executeSkillTool(
      'deep_research__search_api',
      { query: 'test' },
      'trace-123'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SKILL_EXECUTION_NOT_IMPLEMENTED');
    expect(result.error?.message).toContain('GKE Sandbox');
    expect(result.error?.message).toContain('deep_research');
  });

  it('never throws, returns error result on exception', async () => {
    // Even if internal logic throws, executeSkillTool should catch and return error
    const result = await executeSkillTool(
      'skill__tool',
      undefined,
      'trace-123'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

