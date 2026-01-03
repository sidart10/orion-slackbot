/**
 * Skills Module
 *
 * Provides skill loading, parsing, and system prompt integration.
 *
 * @see Story 6.1 - Agent Skills Loader
 */

// Types
export type { Skill, SkillTool, SkillToolParameter, SkillScript, SkillLoadResult } from './types.js';
export { TOOL_NAME_PATTERN } from './types.js';

// Loader
export { loadSkills, loadSkillsWithResult, getSkills, reloadSkills } from './loader.js';

// Parser
export { parseSkillMd } from './parser.js';

// Prompt Builder
export { buildSkillsPrompt } from './prompt-builder.js';

// Tool Handler
export { executeSkillTool, parseSkillToolName } from './tool-handler.js';
export type { SkillToolResult } from './tool-handler.js';

