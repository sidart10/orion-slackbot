/**
 * Skill Tool Handler
 *
 * Handles skill tool registration and execution.
 * - Registration: Takes skill metadata and registers tools with the registry
 * - Execution: Routes tool calls through the handler (placeholder until Story 6.2)
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#5 - Skill tools registered and executed
 */

import { logger } from '../utils/logger.js';
import { toolRegistry } from '../tools/registry.js';
import type { SkillMetadata } from './types.js';
import type { ToolResult } from '../utils/tool-result.js';
import { TOOL_NAME_PATTERN } from './types.js';

/**
 * Parse skill name from tool name.
 *
 * Tool names follow format: `skill_name__tool_name`
 *
 * @param toolName - Full tool name
 * @returns Parsed skill and tool names, or null if not a skill tool
 */
export function parseSkillToolName(
  toolName: string
): { skillName: string; localToolName: string } | null {
  const separatorIndex = toolName.indexOf('__');
  if (separatorIndex === -1) return null;

  const skillName = toolName.slice(0, separatorIndex);
  const localToolName = toolName.slice(separatorIndex + 2);

  if (!skillName || !localToolName) return null;

  return { skillName, localToolName };
}

/**
 * Execute a skill tool - NEVER throws, always returns ToolResult.
 *
 * Currently returns a placeholder since skill tool execution
 * requires GKE Sandbox integration (Story 6.2).
 *
 * @param toolName - Full tool name (skill_name__tool_name)
 * @param input - Tool input
 * @param traceId - Trace ID for logging
 * @returns Tool result
 *
 * @see Story 6.1 AC#5 - Tool execution routing
 * @see Story 6.2 - GKE Sandbox execution (future)
 */
/**
 * Register skill tools from metadata into the tool registry.
 *
 * This is called eagerly at startup after loading skill metadata.
 * Tools are registered with the naming convention: `{skillName}__{toolName}`
 *
 * @param skills - Array of skill metadata
 * @param traceId - Trace ID for logging
 * @returns Number of tools registered
 *
 * @see Story 6.1 AC#5 - Skill tools registered with snake_case names
 */
export function registerSkillTools(skills: SkillMetadata[], traceId: string): number {
  let registered = 0;

  for (const skill of skills) {
    if (!skill.tools || skill.tools.length === 0) {
      continue;
    }

    // Tool names must be snake_case and so must the skill tool prefix.
    // Skills without tools may use non-snake_case names (e.g., kebab-case) safely.
    if (!TOOL_NAME_PATTERN.test(skill.name)) {
      logger.warn({
        event: 'skills.tool.invalid_skill_name',
        traceId,
        skillName: skill.name,
        reason: `Skill name "${skill.name}" must be snake_case to register tools`,
      });
      continue;
    }

    for (const tool of skill.tools) {
      const fullName = `${skill.name}__${tool.name}`;

      // Check if already registered (conflict check)
      const existsBefore = toolRegistry.getSkillTool(fullName) !== undefined;
      if (existsBefore) {
        continue; // Skip duplicate
      }

      toolRegistry.registerDynamicTool(skill.name, tool.name, {
        name: tool.name,
        description: `[${skill.name}] ${tool.description}`,
        input_schema: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.items ? { items: { type: param.items } } : {}),
                ...(param.enum ? { enum: param.enum } : {}),
              },
            ])
          ),
          required: Object.entries(tool.parameters)
            .filter(([, param]) => param.required)
            .map(([key]) => key),
        },
      });

      // Check if registration succeeded
      const existsAfter = toolRegistry.getSkillTool(fullName) !== undefined;
      if (existsAfter) {
        registered++;
        logger.debug({
          event: 'skills.tool.registered',
          traceId,
          skillName: skill.name,
          toolName: tool.name,
          fullName,
        });
      } else {
        logger.warn({
          event: 'skills.tool.registration_failed',
          traceId,
          skillName: skill.name,
          toolName: tool.name,
          reason: 'Name conflict with existing tool',
        });
      }
    }
  }

  logger.info({
    event: 'skills.tools.registered',
    traceId,
    totalRegistered: registered,
    skillsWithTools: skills.filter((s) => s.tools && s.tools.length > 0).length,
  });

  return registered;
}

export async function executeSkillTool(
  toolName: string,
  input: unknown,
  traceId: string
): Promise<ToolResult<unknown>> {
  try {
    const parsed = parseSkillToolName(toolName);

    if (!parsed) {
      return {
        success: false,
        error: {
          code: 'TOOL_INVALID_INPUT',
          message: `Tool name "${toolName}" is not a valid skill tool format`,
          retryable: false,
        },
      };
    }

    const { skillName, localToolName } = parsed;

    logger.debug({
      event: 'skills.tool.execute',
      traceId,
      skillName,
      toolName: localToolName,
    });

    // Story 6.2 will implement actual execution via GKE Sandbox
    // For now, return TOOL_NOT_IMPLEMENTED per Story 6.1 Task 6
    return {
      success: false,
      error: {
        code: 'TOOL_NOT_IMPLEMENTED',
        message: `Skill tool "${localToolName}" from skill "${skillName}" requires GKE Sandbox (Story 6.2)`,
        retryable: false,
      },
    };
  } catch (e) {
    logger.error({
      event: 'skills.tool.error',
      traceId,
      toolName,
      error: e instanceof Error ? e.message : String(e),
    });

    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: e instanceof Error ? e.message : String(e),
        retryable: false,
      },
    };
  }
}

