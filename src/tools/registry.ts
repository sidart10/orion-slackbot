/**
 * Unified tool registry (static + MCP).
 *
 * Story 3.2: Tool Discovery & Registration
 *
 * Notes:
 * - Static tools have no server prefix (serverName = null)
 * - MCP tools are exposed to Claude as: `${serverName}__${toolName}`
 */

import type Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

export function isSnakeCase(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

/**
 * Parse MCP-routed tool name.
 *
 * A tool is MCP-routed iff it contains `__` with a non-empty prefix: `server__tool`.
 * Split on the first occurrence only.
 */
export function parseMcpToolName(
  name: string
): { serverName: string; toolName: string } | null {
  const separatorIndex = name.indexOf('__');
  if (separatorIndex === -1) return null;

  const serverName = name.slice(0, separatorIndex);
  const toolName = name.slice(separatorIndex + 2);

  if (!serverName || !toolName) return null;
  if (!isSnakeCase(serverName)) return null;

  return { serverName, toolName };
}

export type RegisteredTool = {
  claudeTool: Anthropic.Tool;
  serverName: string | null;
  originalName: string;
};

export type RegisteredStaticTool = {
  claudeTool: Anthropic.Tool;
  // Handler is reserved for Story 3.3 routing/execution.
  handler: (input: unknown) => Promise<unknown>;
};

type DiscoveryCacheEntry = { lastDiscoveryMs: number; toolCount: number };

const DISCOVERY_TTL_MS = 5 * 60 * 1000;

export class ToolRegistry {
  private readonly staticTools = new Map<string, RegisteredStaticTool>();
  private readonly mcpTools = new Map<string, RegisteredTool>();
  private readonly discoveryCache = new Map<string, DiscoveryCacheEntry>();

  registerStaticTool(
    name: string,
    handler: (input: unknown) => Promise<unknown>,
    toolDefinition: Anthropic.Tool
  ): void {
    this.staticTools.set(name, { handler, claudeTool: toolDefinition });
    logger.info({
      event: 'tools.registry.updated',
      staticCount: this.staticTools.size,
      mcpCount: this.mcpTools.size,
    });
  }

  registerMcpTools(
    serverName: string,
    tools: Array<{ originalName: string; claudeTool: Anthropic.Tool }>
  ): number {
    // Replace server tools on each successful discovery.
    const removed = this.removeServerTools(serverName);

    let registered = 0;
    for (const t of tools) {
      if (this.staticTools.has(t.originalName)) {
        logger.warn({
          event: 'tools.registry.mcp_tool_conflict',
          serverName,
          toolName: t.originalName,
        });
        continue;
      }
      this.mcpTools.set(t.claudeTool.name, {
        serverName,
        originalName: t.originalName,
        claudeTool: t.claudeTool,
      });
      registered += 1;
    }

    this.discoveryCache.set(serverName, { lastDiscoveryMs: Date.now(), toolCount: registered });

    if (removed > 0) {
      logger.info({
        event: 'tools.registry.server.removed',
        serverName,
        removedCount: removed,
      });
    }

    logger.info({
      event: 'tools.registry.updated',
      staticCount: this.staticTools.size,
      mcpCount: this.mcpTools.size,
    });

    return registered;
  }

  removeServerTools(serverName: string): number {
    let removed = 0;
    for (const [key, tool] of this.mcpTools.entries()) {
      if (tool.serverName === serverName) {
        this.mcpTools.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  getToolsForClaude(): Anthropic.Tool[] {
    const staticTools = Array.from(this.staticTools.values()).map((t) => t.claudeTool);
    const mcpTools = Array.from(this.mcpTools.values()).map((t) => t.claudeTool);
    return [...staticTools, ...mcpTools].sort((a, b) => a.name.localeCompare(b.name));
  }

  getStaticTool(toolName: string): RegisteredStaticTool | undefined {
    return this.staticTools.get(toolName);
  }

  getMcpTool(toolName: string): RegisteredTool | undefined {
    return this.mcpTools.get(toolName);
  }

  isDiscoveryStale(serverName: string): boolean {
    const entry = this.discoveryCache.get(serverName);
    if (!entry) return true;
    return Date.now() - entry.lastDiscoveryMs > DISCOVERY_TTL_MS;
  }

  __resetForTests(): void {
    this.staticTools.clear();
    this.mcpTools.clear();
    this.discoveryCache.clear();
  }

  __setDiscoveryTimestampForTests(serverName: string, lastDiscoveryMs: number): void {
    const existingToolCount =
      this.discoveryCache.get(serverName)?.toolCount ??
      Array.from(this.mcpTools.values()).filter((t) => t.serverName === serverName).length;
    this.discoveryCache.set(serverName, { lastDiscoveryMs, toolCount: existingToolCount });
  }
}

export const toolRegistry = new ToolRegistry();


