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
import { McpClient } from './mcp/client.js';
import { parseMcpToolName, toolRegistry } from './registry.js';

export async function executeToolCall(params: {
  toolName: string;
  toolUseId: string;
  args: Record<string, unknown>;
  traceId: string;
  signal: AbortSignal;
}): Promise<ToolResult<unknown>> {
  try {
    const mcp = parseMcpToolName(params.toolName);
    if (mcp) {
      const server = getMcpServerConfigs().find((s) => s.name === mcp.serverName);
      if (!server || !server.enabled || !server.url) {
        return {
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `Tool "${params.toolName}" is not available (server "${mcp.serverName}" not configured)`,
            retryable: false,
          },
        };
      }

      const client = new McpClient(server.name, {
        url: server.url,
        bearerToken: server.bearerToken,
        connectionTimeoutMs: server.connectionTimeoutMs,
        requestTimeoutMs: server.requestTimeoutMs,
      });

      const result = await client.callTool(
        mcp.toolName,
        params.args,
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

    const staticTool = toolRegistry.getStaticTool(params.toolName);
    if (staticTool) {
      try {
        const data = await staticTool.handler(params.args);
        return { success: true, data };
      } catch (e) {
        return { success: false, error: toToolError(e) };
      }
    }

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


