/**
 * Skills Prompt Builder
 *
 * Formats loaded skills for injection into the system prompt.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#4 - Skill instructions available for system prompt injection
 */

import type { Skill } from './types.js';

/**
 * Build system prompt section from loaded skills.
 *
 * Returns empty string if no skills loaded.
 * Used by src/agent/context.ts when building system prompt.
 *
 * @param skills - Array of loaded skills
 * @returns Formatted skills section for system prompt
 *
 * @see Story 2.1 - Agent Loop (system prompt assembly)
 */
export function buildSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const skillSections = skills.map((skill) => {
    const toolsList = skill.tools?.length
      ? `\n\nAvailable tools: ${skill.tools.map((t) => t.name).join(', ')}`
      : '';

    return `## Skill: ${skill.name}

${skill.description}

${skill.instructions}${toolsList}`;
  });

  return `
# Available Skills

You have the following specialized skills available:

${skillSections.join('\n\n---\n\n')}
`;
}

