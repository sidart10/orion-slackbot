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
 * Skills are loaded via container parameter in messages.create().
 *
 * Returns empty string if no skills loaded.
 * Used by Slack handlers when building the system prompt.
 *
 * @param skills - Array of skill metadata (no instructions)
 * @returns Formatted skills hint for system prompt (~100 tokens per skill)
 *
 * @see Story 6.1 AC#4 - Skills hint injected (not full content)
 * @see Story 6.3 - Skills loaded via container parameter
 * @see https://platform.claude.com/docs/en/build-with-claude/skills-guide
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

## How to Use Skills

Skills are mounted in the container at \`/skills/{skill_name}/\`. Use code_execution to read and use them.

### Reading a Skill
\`\`\`python
import os

# Skills are at /skills/{skill_name}/
skill_name = 'samba-slides'  # Use the exact skill name
skill_path = f'/skills/{skill_name}'

# List skill contents
if os.path.exists(skill_path):
    for item in os.listdir(skill_path):
        print(item)

# Read SKILL.md for instructions (REQUIRED before using)
with open(f'{skill_path}/SKILL.md', 'r') as f:
    print(f.read())
\`\`\`

### Skill Contents
Skills may include:
- \`SKILL.md\` - Instructions and usage guide (always read first)
- \`scripts/*.py\` - Implementation code to import/use
- \`assets/\` - Brand files, logos, fonts
- \`references/\` - Templates and examples

### Using Scripts
\`\`\`python
# Read script to understand the API
with open(f'{skill_path}/scripts/example.py', 'r') as f:
    print(f.read())

# Import and use (skill scripts are on PYTHONPATH)
import sys
sys.path.insert(0, f'{skill_path}/scripts')
from example import some_function
\`\`\`

**CRITICAL**: Always read SKILL.md first - it contains required instructions and guidelines.

**NOTE**: Do NOT use orion_sandbox for skills. orion_sandbox is ONLY for:
- webapp-testing (Playwright)
- web-artifacts-builder (local builds)
`;
}

