/**
 * MCP tool discovery + TTL caching.
 *
 * Story 3.2: Tool Discovery & Registration
 *
 * Discovers `tools/list` across enabled servers and registers tools into the unified registry.
 * Never throws from public APIs; always returns ToolResult<T>.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { ToolResult } from '../../utils/tool-result.js';
import { isRetryable } from '../../utils/tool-result.js';
import { logger } from '../../utils/logger.js';
import { getMcpServerConfigs } from '../../config/mcp-servers.js';
import { toolRegistry } from '../registry.js';
import { McpClient } from './client.js';
import { mcpToolToClaude } from './schema-converter.js';

export async function discoverAllTools(
  traceId?: string
): Promise<ToolResult<{ registered: number }>> {
  const allServers = getMcpServerConfigs();

  logger.info({
    event: 'tools.discovery.started',
    serverCount: allServers.filter((s) => s.enabled).length,
    traceId,
  });

  // Remove tools for disabled servers on refresh (AC#6).
  for (const s of allServers) {
    if (!s.enabled) {
      const removed = toolRegistry.removeServerTools(s.name);
      if (removed > 0) {
        logger.info({
          event: 'tools.registry.server.removed',
          serverName: s.name,
          removedCount: removed,
          traceId,
        });
      }
    }
  }

  const servers = allServers.filter((s) => s.enabled);

  const discoveries = servers
    .filter((s) => toolRegistry.isDiscoveryStale(s.name))
    .map((s) => discoverServerTools(s, traceId));

  const results = await Promise.allSettled(discoveries);

  let registered = 0;
  let firstError: ToolResult<never>['error'] | null = null;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.success) {
        registered += r.value.data.registered;
      } else if (!firstError) {
        firstError = r.value.error;
      }
      continue;
    }

    if (!firstError) {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      firstError = {
        code: 'TOOL_EXECUTION_FAILED',
        message,
        retryable: isRetryable(r.reason),
      };
    }
  }

  if (firstError) {
    return { success: false, error: firstError };
  }

  return { success: true, data: { registered } };
}

async function discoverServerTools(
  server: ReturnType<typeof getMcpServerConfigs>[number],
  traceId?: string
): Promise<ToolResult<{ registered: number }>> {
  try {
    if (!server.url) {
      logger.error({
        event: 'tools.discovery.server.failed',
        serverName: server.name,
        errorMessage: 'Missing MCP server URL',
        traceId,
      });
      return {
        success: false,
        error: {
          code: 'TOOL_INVALID_INPUT',
          message: `Invalid MCP server config for "${server.name}": missing url`,
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

    const tools = await client.listTools(traceId);
    if (!tools.success) {
      logger.warn({
        event: 'tools.discovery.server.failed',
        serverName: server.name,
        errorMessage: tools.error.message,
        traceId,
      });
      return { success: false, error: tools.error };
    }

    const converted: Array<{ originalName: string; claudeTool: Anthropic.Tool }> = tools.data.map(
      (t) => ({
        originalName: t.name,
        claudeTool: mcpToolToClaude(server.name, t) as unknown as Anthropic.Tool,
      })
    );

    const registered = toolRegistry.registerMcpTools(server.name, converted);

    logger.info({
      event: 'tools.discovery.server.success',
      serverName: server.name,
      toolCount: registered,
      traceId,
    });

    return { success: true, data: { registered } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({
      event: 'tools.discovery.server.failed',
      serverName: server.name,
      errorMessage: message,
      traceId,
    });
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message,
        retryable: isRetryable(e),
      },
    };
  }
}


