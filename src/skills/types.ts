/**
 * Skill Types
 *
 * Type definitions for the Agent Skills system.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#2 - Skill name, description, instructions, tools extracted
 * @see AC#5 - Tool names validated as snake_case
 */

/** Tool name validation pattern (snake_case) */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Parameter definition for a skill tool.
 */
export interface SkillToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  items?: string; // For arrays
  enum?: string[]; // For enums
}

/**
 * Tool definition within a skill.
 */
export interface SkillTool {
  name: string;
  description: string;
  parameters: Record<string, SkillToolParameter>;
}

/**
 * Script file discovered in a skill's scripts/ directory.
 * @see Story 6.1 - GKE Sandbox integration (discovery only)
 */
export interface SkillScript {
  name: string; // e.g., "search_and_aggregate.py"
  path: string; // Full path for GKE execution
  requirements?: string; // Path to requirements.txt if present
}

/**
 * Parsed skill from a SKILL.md file.
 */
export interface Skill {
  name: string;
  description: string;
  version?: string;
  author?: string;
  instructions: string; // Markdown content after frontmatter
  tools?: SkillTool[];
  filePath: string; // For debugging/logging

  // GKE Sandbox integration (Story 6.1 catalogs, Story 6.2 executes)
  scripts?: SkillScript[]; // Discovered from scripts/ directory
  hasExecutableScripts: boolean;
}

/**
 * Result of skill loading operation.
 */
export interface SkillLoadResult {
  skills: Skill[];
  failures: Array<{ path: string; error: string }>;
}

