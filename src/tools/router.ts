/**
 * Tool routing for execution (static + MCP).
 *
 * Story 3.3 depends on Story 3.2's registry naming:
 * - Static tools: `tool_name`
 * - MCP tools: `${serverName}__${toolName}`
 *
 * Always returns ToolResult<T> — never throws.
 *
 * @see Story 3.3 - Tool Execution & Error Handling
 * @see Story 3.2 - Tool Discovery & Registration
 */

import type { ToolResult } from '../utils/tool-result.js';
import { getMcpServerConfigs } from '../config/mcp-servers.js';
import { toToolError } from './errors.js';
import { McpClientManager } from './mcp/manager.js';
import { toolRegistry } from './registry.js';

export async function executeToolCall(params: {
  toolName: string;
  toolUseId: string;
  args: Record<string, unknown>;
  traceId: string;
  signal: AbortSignal;
}): Promise<ToolResult<unknown>> {
  try {
    // 1. Check static tools first
    const staticTool = toolRegistry.getStaticTool(params.toolName);
    if (staticTool) {
      try {
        const data = await staticTool.handler(params.args);
        return { success: true, data };
      } catch (e) {
        return { success: false, error: toToolError(e) };
      }
    }

    // 2. Check MCP tools - the registry is the source of truth
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
      });

      // Merge server defaults with user-provided args (user args take precedence)
      const mergedArgs = server.defaults 
        ? { ...server.defaults, ...params.args }
        : params.args;

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

    // 3. Tool not found in either registry
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


