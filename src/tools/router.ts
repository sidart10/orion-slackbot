/**
 * Tool routing for execution (static + skill + MCP).
 *
 * Story 3.3 depends on Story 3.2's registry naming:
 * - Static tools: `tool_name`
 * - Skill tools: `${skillName}__${toolName}` (Story 6.1)
 * - MCP tools: `${serverName}__${toolName}`
 *
 * Always returns ToolResult<T> — never throws.
 *
 * @see Story 3.3 - Tool Execution & Error Handling
 * @see Story 3.2 - Tool Discovery & Registration
 * @see Story 6.1 - Agent Skills Loader (skill tool routing)
 */

import type { ToolResult } from '../utils/tool-result.js';
import { getMcpServerConfigs } from '../config/mcp-servers.js';
import { toToolError } from './errors.js';
import { McpClientManager } from './mcp/manager.js';
import { toolRegistry } from './registry.js';
import { executeSkillTool } from '../skills/tool-handler.js';
import { logger } from '../utils/logger.js';

function isToolResult(value: unknown): value is ToolResult<unknown> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.success !== 'boolean') return false;
  if (v.success === true) return 'data' in v;
  return 'error' in v;
}

export async function executeToolCall(params: {
  toolName: string;
  toolUseId: string;
  args: Record<string, unknown>;
  traceId: string;
  signal: AbortSignal;
}): Promise<ToolResult<unknown>> {
  try {
    // 1. Check static tools first (highest priority)
    const staticTool = toolRegistry.getStaticTool(params.toolName);
    if (staticTool) {
      try {
        const maybe = await staticTool.handler(params.args);
        // Allow static handlers to return ToolResult directly (canonical shape),
        // otherwise wrap raw handler output in ToolResult.
        if (isToolResult(maybe)) return maybe;
        return { success: true, data: maybe };
      } catch (e) {
        return { success: false, error: toToolError(e) };
      }
    }

    // 2. Check skill tools (Story 6.1 AC#5)
    //    Skill tools use naming convention: skillName__toolName
    const skillTool = toolRegistry.getSkillTool(params.toolName);
    if (skillTool) {
      logger.debug({
        event: 'tools.router.skill_tool_matched',
        traceId: params.traceId,
        toolName: params.toolName,
        skillName: skillTool.skillName,
      });

      // Execute skill tool - returns ToolResult, never throws
      return await executeSkillTool(params.toolName, params.args, params.traceId);
    }

    // 3. Check MCP tools - the registry is the source of truth
    //    If it's registered, the name is valid. No re-parsing/validation needed.
    const mcpTool = toolRegistry.getMcpTool(params.toolName);
    if (mcpTool) {
      const server = getMcpServerConfigs().find((s) => s.name === mcpTool.serverName);
      if (!server || !server.enabled || !server.url) {
        return {
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `Tool "${params.toolName}" is not available (server "${mcpTool.serverName}" not configured)`,
            retryable: false,
          },
        };
      }

      // Get cached client from manager (maintains session state - AC-C2, AC-C9)
      const client = await McpClientManager.getInstance().getClient(server.name, {
        url: server.url,
        bearerToken: server.bearerToken,
        connectionTimeoutMs: server.connectionTimeoutMs,
        requestTimeoutMs: server.requestTimeoutMs,
        authType: server.authType,
      });

      // Merge server defaults with user-provided args (user args take precedence)
      let mergedArgs = server.defaults 
        ? { ...server.defaults, ...params.args }
        : params.args;

      // Log merged args for genmedia tools (debug)
      if (server.name.startsWith('genmedia')) {
        logger.debug({
          event: 'mcp.genmedia.args_merged',
          traceId: params.traceId,
          tool: mcpTool.originalName,
          server: server.name,
          hasDefaults: !!server.defaults,
          defaultKeys: server.defaults ? Object.keys(server.defaults) : [],
          userArgKeys: Object.keys(params.args),
        });
      }

      // Veo 3.1 only supports durations [4, 6, 8] - fix invalid values (both t2v and i2v)
      if ((mcpTool.originalName === 'veo_t2v' || mcpTool.originalName === 'veo_i2v') && mergedArgs.duration !== undefined) {
        const validDurations = [4, 6, 8];
        const dur = Number(mergedArgs.duration);
        if (!validDurations.includes(dur)) {
          // Round to nearest valid duration
          const closest = validDurations.reduce((a, b) => 
            Math.abs(b - dur) < Math.abs(a - dur) ? b : a
          );
          mergedArgs = { ...mergedArgs, duration: closest };
        }
      }

      const result = await client.callTool(
        mcpTool.originalName, // Use the original tool name (without server prefix)
        mergedArgs,
        params.traceId,
        undefined,
        params.signal
      );

      if (!result.success) return result;

      // MCP can return { isError: true, content: [...] } as a "successful" payload.
      // Normalize it to ToolResult error (AC#6).
      if (result.data && typeof result.data === 'object') {
        const maybe = result.data as { isError?: unknown };
        if (maybe.isError === true) {
          return { success: false, error: toToolError(result.data) };
        }
      }

      return { success: true, data: result.data };
    }

    // 4. Tool not found in any registry (static, skill, or MCP)
    return {
      success: false,
      error: {
        code: 'TOOL_NOT_FOUND',
        message: `Tool "${params.toolName}" is not registered`,
        retryable: false,
      },
    };
  } catch (e) {
    return { success: false, error: toToolError(e) };
  }
}


