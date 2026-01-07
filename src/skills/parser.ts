/**
 * SKILL.md Parser
 *
 * Parses SKILL.md files following the Agent Skills open standard.
 * Validates required fields and tool naming conventions.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#2 - Skill name, description, instructions, and optional tools extracted
 * @see AC#5 - Tool names validated as snake_case
 */

import matter from 'gray-matter';
import type { Skill, SkillMetadata, SkillTool, SkillToolParameter } from './types.js';
import { TOOL_NAME_PATTERN } from './types.js';

/**
 * Parse a SKILL.md file into a Skill object.
 *
 * Validates:
 * - Required fields: name, description
 * - Tool names follow snake_case pattern
 *
 * @param content - Raw content of SKILL.md file
 * @param filePath - Path to the file (for debugging)
 * @returns Parsed Skill object
 * @throws Error if validation fails
 *
 * @see Story 6.1 AC#2 - Parse skill name, description, instructions, tools
 */
export function parseSkillMd(content: string, filePath: string): Skill {
  // Parse frontmatter
  const { data: frontmatter, content: instructions } = matter(content);

  // Validate required fields
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error('SKILL.md missing required field: name');
  }

  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    throw new Error('SKILL.md missing required field: description');
  }

  // Parse and validate tools if present
  const tools: SkillTool[] | undefined = frontmatter.tools?.map(
    (tool: Record<string, unknown>, index: number) => {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error(`Tool at index ${index} missing name`);
      }

      // Validate tool name is snake_case
      if (!TOOL_NAME_PATTERN.test(tool.name)) {
        throw new Error(
          `Tool name "${tool.name}" invalid. Must be snake_case (match ${TOOL_NAME_PATTERN})`
        );
      }

      // Parse parameters
      const parameters: Record<string, SkillToolParameter> = {};
      if (tool.parameters && typeof tool.parameters === 'object') {
        for (const [key, value] of Object.entries(
          tool.parameters as Record<string, unknown>
        )) {
          const param = value as Record<string, unknown>;
          parameters[key] = {
            type: (param.type as SkillToolParameter['type']) ?? 'string',
            description: String(param.description ?? ''),
            required: param.required === true,
            items: param.items as string | undefined,
            enum: param.enum as string[] | undefined,
          };
        }
      }

      return {
        name: tool.name,
        description: String(tool.description ?? ''),
        parameters,
      };
    }
  );

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    version: frontmatter.version as string | undefined,
    author: frontmatter.author as string | undefined,
    instructions: instructions.trim(),
    tools,
    filePath,
    scripts: undefined,
    hasExecutableScripts: false,
  };
}

/**
 * Parse a SKILL.md file into SkillMetadata (frontmatter only, no instructions).
 *
 * This is used for startup loading (progressive disclosure level 1).
 * Instructions are loaded on-demand when skill is invoked.
 *
 * Validates:
 * - Required fields: name, description
 * - Tool names follow snake_case pattern
 *
 * @param content - Raw content of SKILL.md file
 * @param filePath - Path to the file (for debugging)
 * @param skillPath - Directory path for on-demand instruction loading
 * @returns Parsed SkillMetadata object (no instructions)
 * @throws Error if validation fails
 *
 * @see Story 6.1 AC#2 - Metadata-only loading at startup
 */
export function parseSkillFrontmatterOnly(
  content: string,
  filePath: string,
  skillPath: string
): SkillMetadata {
  // Parse frontmatter (instructions are discarded)
  const { data: frontmatter } = matter(content);

  // Validate required fields
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error('SKILL.md missing required field: name');
  }

  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    throw new Error('SKILL.md missing required field: description');
  }

  // Parse and validate tools if present
  const tools: SkillTool[] | undefined = frontmatter.tools?.map(
    (tool: Record<string, unknown>, index: number) => {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error(`Tool at index ${index} missing name`);
      }

      // Validate tool name is snake_case
      if (!TOOL_NAME_PATTERN.test(tool.name)) {
        throw new Error(
          `Tool name "${tool.name}" invalid. Must be snake_case (match ${TOOL_NAME_PATTERN})`
        );
      }

      // Parse parameters
      const parameters: Record<string, SkillToolParameter> = {};
      if (tool.parameters && typeof tool.parameters === 'object') {
        for (const [key, value] of Object.entries(
          tool.parameters as Record<string, unknown>
        )) {
          const param = value as Record<string, unknown>;
          parameters[key] = {
            type: (param.type as SkillToolParameter['type']) ?? 'string',
            description: String(param.description ?? ''),
            required: param.required === true,
            items: param.items as string | undefined,
            enum: param.enum as string[] | undefined,
          };
        }
      }

      return {
        name: tool.name,
        description: String(tool.description ?? ''),
        parameters,
      };
    }
  );

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    version: frontmatter.version as string | undefined,
    author: frontmatter.author as string | undefined,
    tools,
    filePath,
    skillPath,
    scripts: undefined,
    hasExecutableScripts: false,
  };
}

