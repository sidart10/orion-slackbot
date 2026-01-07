/**
 * Skill runtime wiring: ensure skill tools are registered for the current process.
 *
 * Goal:
 * - Skill metadata is loaded lazily (cached) (Story 6.1).
 * - Skill tools are registered into the unified tool registry BEFORE the agent builds tool definitions.
 *
 * This is intentionally best-effort: failures should not crash the agent.
 */

import type { ToolResult } from '../utils/tool-result.js';
import { logger } from '../utils/logger.js';
import { getSkillMetadata } from './loader.js';
import { registerSkillTools } from './tool-handler.js';

let skillToolsRegistered = false;

export async function ensureSkillToolsRegistered(
  traceId: string
): Promise<ToolResult<{ registered: number }>> {
  if (skillToolsRegistered) {
    return { success: true, data: { registered: 0 } };
  }

  try {
    const metadata = await getSkillMetadata(traceId);
    const registered = registerSkillTools(metadata, traceId);
    skillToolsRegistered = true;
    return { success: true, data: { registered } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({
      event: 'skills.tools.ensure_failed',
      traceId,
      error: message,
    });
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message,
        retryable: false,
      },
    };
  }
}

/** @internal */
export function __resetSkillToolsRegistrationForTests(): void {
  skillToolsRegistered = false;
}


