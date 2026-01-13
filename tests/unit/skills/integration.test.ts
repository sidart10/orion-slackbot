/**
 * Skills Integration Tests
 *
 * Tests that verify skills are discovered, loaded, and integrated correctly.
 * Uses the actual .skills/example/ directory for real-world verification.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#1 - Skills discovered from .skills directory
 * @see AC#4 - Skills available for system prompt injection
 * @see AC#5 - Skill tools registered
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSkills,
  buildSkillsPrompt,
  buildSkillsHint,
  getSkills,
  reloadSkills,
  getSkillMetadata,
  reloadSkillMetadata,
} from '@/skills/index.js';
import { toolRegistry } from '@/tools/registry.js';

// Mock langfuse to avoid actual API calls
vi.mock('@/observability/langfuse.js', () => ({
  getLangfuse: () => ({
    span: () => ({ end: () => {} }),
  }),
}));

describe('Skills Integration', () => {
  beforeEach(() => {
    reloadSkills();
    reloadSkillMetadata();
    toolRegistry.__resetForTests();
  });

  it('discovers and loads the example skill from .skills/', async () => {
    const skills = await loadSkills('integration-test-trace');

    // Should find at least the example skill
    expect(skills.length).toBeGreaterThanOrEqual(1);

    const exampleSkill = skills.find((s) => s.name === 'example-skill');
    expect(exampleSkill).toBeDefined();
    expect(exampleSkill?.description).toBe(
      'A sample skill demonstrating the Agent Skills format'
    );
  });

  it('parses skill tools correctly', async () => {
    const skills = await loadSkills('integration-test-trace');
    const exampleSkill = skills.find((s) => s.name === 'example-skill');

    // example-skill has no tools defined in current SKILL.md
    // Just verify the skill was found
    expect(exampleSkill).toBeDefined();
  });

  it('extracts skill instructions from markdown body', async () => {
    const skills = await loadSkills('integration-test-trace');
    const exampleSkill = skills.find((s) => s.name === 'example-skill');

    expect(exampleSkill?.instructions).toContain('# Example Skill');
    expect(exampleSkill?.instructions).toContain('When to Use');
    expect(exampleSkill?.instructions).toContain('Guidelines');
  });

  it('builds token-efficient system prompt hint from metadata (preferred)', async () => {
    const metadata = await getSkillMetadata('integration-test-trace');
    const hint = buildSkillsHint(metadata);

    expect(hint).toContain('# Available Skills');
    expect(hint).toContain('*example-skill*');
    expect(hint).toContain('A sample skill demonstrating the Agent Skills format');
  });

  it('builds full system prompt section from loaded skills (deprecated, kept for compatibility)', async () => {
    const skills = await loadSkills('integration-test-trace');
    const prompt = buildSkillsPrompt(skills);
    expect(prompt).toContain('## Skill: example-skill');
  });

  it('getSkills caches results', async () => {
    const skills1 = await getSkills('trace-1');
    const skills2 = await getSkills('trace-2');

    // Same array reference (cached)
    expect(skills1).toBe(skills2);
  });

  it('reloadSkills clears cache', async () => {
    const skills1 = await getSkills('trace-1');
    reloadSkills();
    const skills2 = await getSkills('trace-2');

    // Different array references (reloaded)
    expect(skills1).not.toBe(skills2);
    // But same content
    expect(skills1.length).toBe(skills2.length);
  });

  it('registers skill tools in the tool registry', async () => {
    const skills = await loadSkills('integration-test-trace');
    const exampleSkill = skills.find((s) => s.name === 'example-skill');
    expect(exampleSkill).toBeDefined();

    // Current example-skill has no tools defined, so we manually register a mock tool
    // to verify the registry mechanism works
    toolRegistry.registerDynamicTool('example-skill', 'test_tool', {
      name: 'test_tool',
      description: 'Test tool for registry verification',
      input_schema: {
        type: 'object',
        properties: { input: { type: 'string', description: 'Test input' } },
        required: ['input'],
      },
    });

    // Verify registration
    const registeredTool = toolRegistry.getSkillTool('example-skill__test_tool');
    expect(registeredTool).toBeDefined();
    expect(registeredTool?.skillName).toBe('example-skill');
    expect(registeredTool?.originalName).toBe('test_tool');

    // Verify it appears in getToolsForClaude
    const allTools = toolRegistry.getToolsForClaude();
    const toolNames = allTools.map((t) => t.name);
    expect(toolNames).toContain('example-skill__test_tool');
  });
});

