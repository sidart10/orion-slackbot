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
} from './index.js';
import { toolRegistry } from '../tools/registry.js';

// Mock langfuse to avoid actual API calls
vi.mock('../observability/langfuse.js', () => ({
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

    const exampleSkill = skills.find((s) => s.name === 'example_skill');
    expect(exampleSkill).toBeDefined();
    expect(exampleSkill?.description).toBe(
      'A sample skill demonstrating the Agent Skills format'
    );
    expect(exampleSkill?.version).toBe('1.0.0');
    expect(exampleSkill?.author).toBe('Orion Team');
  });

  it('parses skill tools correctly', async () => {
    const skills = await loadSkills('integration-test-trace');
    const exampleSkill = skills.find((s) => s.name === 'example_skill');

    expect(exampleSkill?.tools).toHaveLength(1);
    expect(exampleSkill?.tools?.[0].name).toBe('greet_user');
    expect(exampleSkill?.tools?.[0].description).toBe(
      'Generate a personalized greeting'
    );
    expect(exampleSkill?.tools?.[0].parameters.name).toBeDefined();
    expect(exampleSkill?.tools?.[0].parameters.name.required).toBe(true);
  });

  it('extracts skill instructions from markdown body', async () => {
    const skills = await loadSkills('integration-test-trace');
    const exampleSkill = skills.find((s) => s.name === 'example_skill');

    expect(exampleSkill?.instructions).toContain('# Example Skill');
    expect(exampleSkill?.instructions).toContain('When to Use');
    expect(exampleSkill?.instructions).toContain('Guidelines');
  });

  it('builds token-efficient system prompt hint from metadata (preferred)', async () => {
    const metadata = await getSkillMetadata('integration-test-trace');
    const hint = buildSkillsHint(metadata);

    expect(hint).toContain('# Available Skills');
    expect(hint).toContain('*example_skill*');
    expect(hint).toContain('A sample skill demonstrating the Agent Skills format');
    expect(hint).toContain('tools: greet_user');
  });

  it('builds full system prompt section from loaded skills (deprecated, kept for compatibility)', async () => {
    const skills = await loadSkills('integration-test-trace');
    const prompt = buildSkillsPrompt(skills);
    expect(prompt).toContain('## Skill: example_skill');
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
    const exampleSkill = skills.find((s) => s.name === 'example_skill');

    // Register the skill's tools
    if (exampleSkill?.tools) {
      for (const tool of exampleSkill.tools) {
        toolRegistry.registerDynamicTool(exampleSkill.name, tool.name, {
          name: tool.name,
          description: tool.description,
          input_schema: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(tool.parameters).map(([k, v]) => [
                k,
                { type: v.type, description: v.description },
              ])
            ),
            required: Object.entries(tool.parameters)
              .filter(([, v]) => v.required)
              .map(([k]) => k),
          },
        });
      }
    }

    // Verify registration
    const registeredTool = toolRegistry.getSkillTool('example_skill__greet_user');
    expect(registeredTool).toBeDefined();
    expect(registeredTool?.skillName).toBe('example_skill');
    expect(registeredTool?.originalName).toBe('greet_user');

    // Verify it appears in getToolsForClaude
    const allTools = toolRegistry.getToolsForClaude();
    const toolNames = allTools.map((t) => t.name);
    expect(toolNames).toContain('example_skill__greet_user');
  });
});

