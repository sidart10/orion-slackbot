/**
 * Skill Tool Handler
 *
 * Executes skill tools - NEVER throws, always returns ToolResult.
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#5 - Skill tools registered and executed
 */

import { logger } from '../utils/logger.js';

/**
 * Tool result type (matching project convention).
 */
export interface SkillToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

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
export async function executeSkillTool(
  toolName: string,
  input: unknown,
  traceId: string
): Promise<SkillToolResult<unknown>> {
  try {
    const parsed = parseSkillToolName(toolName);

    if (!parsed) {
      return {
        success: false,
        error: {
          code: 'INVALID_SKILL_TOOL_NAME',
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

    // TODO: Story 6.2 will implement actual execution via GKE Sandbox
    // For now, return a placeholder indicating skill tools are not yet executable
    return {
      success: false,
      error: {
        code: 'SKILL_EXECUTION_NOT_IMPLEMENTED',
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

