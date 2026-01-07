/**
 * Skills Prompt Builder
 *
 * Formats loaded skills for injection into the system prompt.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#4 - Skills hint injected (not full content)
 */

import type { Skill, SkillMetadata } from './types.js';

/**
 * Build system prompt section from loaded skills (FULL CONTENT).
 *
 * @deprecated Use buildSkillsHint() instead for token-efficient prompts.
 * This function is kept for backwards compatibility but should not be used
 * in production as it wastes tokens by injecting full SKILL.md content.
 *
 * Returns empty string if no skills loaded.
 *
 * @param skills - Array of loaded skills with full instructions
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

/**
 * Build system prompt hint from skill metadata (TOKEN EFFICIENT).
 *
 * This is the preferred function for system prompt injection.
 * Only includes name, description, and available tool names.
 * Full instructions are loaded on-demand when the skill is invoked.
 *
 * Returns empty string if no skills loaded.
 * Used by Slack handlers when building the system prompt.
 *
 * @param skills - Array of skill metadata (no instructions)
 * @returns Formatted skills hint for system prompt (~100 tokens per skill)
 *
 * @see Story 6.1 AC#4 - Skills hint injected (not full content)
 * @see Story 6.1 AC#9 - On-demand instruction loading
 */
export function buildSkillsHint(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return '';
  }

  const hints = skills.map((skill) => {
    const toolsList = skill.tools?.length
      ? ` (tools: ${skill.tools.map((t) => t.name).join(', ')})`
      : '';

    return `- *${skill.name}*: ${skill.description}${toolsList}`;
  });

  return `
# Available Skills

${hints.join('\n')}

When a task matches a skill, load its full instructions on-demand:
  orion_sandbox({ skill_doc: "skill:{skill-name}" })
`;
}

