/**
 * Skills Module
 *
 * Provides skill loading, parsing, and system prompt integration.
 *
 * @see Story 6.1 - Agent Skills Loader
 */

// Types
export type {
  Skill,
  SkillMetadata,
  SkillTool,
  SkillToolParameter,
  SkillScript,
  SkillLoadResult,
  SkillMetadataLoadResult,
} from './types.js';
export { TOOL_NAME_PATTERN } from './types.js';

// Loader
export {
  loadSkills,
  loadSkillsWithResult,
  getSkills,
  reloadSkills,
  // Metadata-only loading (progressive disclosure)
  loadSkillMetadata,
  loadSkillMetadataWithResult,
  getSkillMetadata,
  reloadSkillMetadata,
  // On-demand instruction loading
  loadSkillInstructions,
} from './loader.js';

// Parser
export { parseSkillMd, parseSkillFrontmatterOnly } from './parser.js';

// Prompt Builder
export { buildSkillsPrompt, buildSkillsHint } from './prompt-builder.js';

// Tool Handler
export { executeSkillTool, parseSkillToolName, registerSkillTools } from './tool-handler.js';
// Note: executeSkillTool returns the canonical ToolResult type (see src/utils/tool-result.ts)

