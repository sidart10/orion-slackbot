/**
 * Unified tool registry (static + MCP + dynamic skill tools).
 *
 * Story 3.2: Tool Discovery & Registration
 * Story 6.1: Agent Skills Loader - Dynamic Tool Registration
 * Story 8.2: Tool Search - defer_loading support
 *
 * Notes:
 * - Static tools have no server prefix (serverName = null)
 * - MCP tools are exposed to Claude as: `${serverName}__${toolName}`
 * - Skill tools are exposed as: `${skillName}__${toolName}` (registered dynamically)
 * - Core tools (memory, code_execution, summarize) are never deferred
 */

import type Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { config } from '../config/environment.js';

/**
 * Story 8.2: Extended tool definition with defer_loading support.
 * When defer_loading is true, Anthropic's tool search discovers the tool on-demand.
 */
export type ClaudeToolWithDeferLoading = Anthropic.Tool & {
  defer_loading?: boolean;
};

/**
 * Parse MCP-routed tool name.
 *
 * A tool is MCP-routed iff it contains `__` with a non-empty prefix: `server__tool`.
 * Split on the first occurrence only.
 *
 * NOTE: This function only parses - it does NOT validate.
 * Validation happens at registration time via the registry.
 * If a tool exists in the registry, it's valid. Period.
 */
export function parseMcpToolName(
  name: string
): { serverName: string; toolName: string } | null {
  const separatorIndex = name.indexOf('__');
  if (separatorIndex === -1) return null;

  const serverName = name.slice(0, separatorIndex);
  const toolName = name.slice(separatorIndex + 2);

  if (!serverName || !toolName) return null;

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

/**
 * Skill tool registered dynamically at runtime.
 * @see Story 6.1 - Agent Skills Loader
 */
export type RegisteredSkillTool = {
  claudeTool: Anthropic.Tool;
  skillName: string;
  originalName: string; // Tool name without skill prefix
};

type DiscoveryCacheEntry = { lastDiscoveryMs: number; toolCount: number };

const DISCOVERY_TTL_MS = 5 * 60 * 1000;

export class ToolRegistry {
  private readonly staticTools = new Map<string, RegisteredStaticTool>();
  private readonly mcpTools = new Map<string, RegisteredTool>();
  private readonly skillTools = new Map<string, RegisteredSkillTool>();
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

  /**
   * Get all tools formatted for Claude API.
   *
   * Story 8.2: When tool search is enabled and model supports it,
   * non-core tools are annotated with defer_loading: true for on-demand discovery.
   *
   * @param options - Optional configuration
   * @param options.enableDeferLoading - Override to force enable/disable defer_loading
   * @returns Array of Claude tool definitions, sorted by name
   */
  getToolsForClaude(options?: { enableDeferLoading?: boolean }): ClaudeToolWithDeferLoading[] {
    const coreToolNames = new Set(config.toolSearch.coreTools);

    // Determine if we should add defer_loading
    // Default: based on config, unless explicitly overridden
    const shouldDefer = options?.enableDeferLoading ?? config.toolSearch.enabled;

    // Static tools are always-loaded (no defer_loading)
    const staticTools = Array.from(this.staticTools.values()).map(
      (t) => t.claudeTool as ClaudeToolWithDeferLoading
    );

    // MCP tools get defer_loading unless they're in core tools list
    const mcpTools = Array.from(this.mcpTools.values()).map((t) => {
      const tool = t.claudeTool as ClaudeToolWithDeferLoading;
      // Check if tool name or original name matches a core tool
      const isCore = coreToolNames.has(tool.name) || coreToolNames.has(t.originalName);
      if (shouldDefer && !isCore) {
        return { ...tool, defer_loading: true };
      }
      return tool;
    });

    // Skill tools get defer_loading unless they're in core tools list
    const skillTools = Array.from(this.skillTools.values()).map((t) => {
      const tool = t.claudeTool as ClaudeToolWithDeferLoading;
      // Check if tool name or original name matches a core tool
      const isCore = coreToolNames.has(tool.name) || coreToolNames.has(t.originalName);
      if (shouldDefer && !isCore) {
        return { ...tool, defer_loading: true };
      }
      return tool;
    });

    return [...staticTools, ...mcpTools, ...skillTools].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  /**
   * Story 8.2: Get a core tool by name.
   *
   * Core tools are those configured in CORE_TOOLS (default: memory, code_execution, summarize).
   * These tools are always in context and never have defer_loading.
   *
   * @param name - Tool name to look up
   * @returns Tool definition if found and is a core tool, undefined otherwise
   */
  getCoreTool(name: string | undefined | null): ClaudeToolWithDeferLoading | undefined {
    if (!name) return undefined;

    const coreToolNames = new Set(config.toolSearch.coreTools);
    if (!coreToolNames.has(name)) return undefined;

    // Check static tools first (most core tools are static)
    const staticTool = this.staticTools.get(name);
    if (staticTool) {
      return staticTool.claudeTool as ClaudeToolWithDeferLoading;
    }

    // Check MCP tools (in case a core tool is provided by MCP)
    for (const [, mcpTool] of this.mcpTools) {
      if (mcpTool.claudeTool.name === name || mcpTool.originalName === name) {
        return mcpTool.claudeTool as ClaudeToolWithDeferLoading;
      }
    }

    // Check skill tools
    for (const [, skillTool] of this.skillTools) {
      if (skillTool.claudeTool.name === name || skillTool.originalName === name) {
        return skillTool.claudeTool as ClaudeToolWithDeferLoading;
      }
    }

    return undefined;
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

  /**
   * Register a dynamic skill tool at runtime.
   *
   * Unlike static tools, skill tools are discovered at startup and can be
   * reloaded when skills change.
   *
   * @param skillName - Name of the skill this tool belongs to
   * @param toolName - Original tool name (will be prefixed with skillName__)
   * @param toolDefinition - Claude tool definition
   *
   * @see Story 6.1 - Agent Skills Loader AC#5
   */
  registerDynamicTool(
    skillName: string,
    toolName: string,
    toolDefinition: Anthropic.Tool
  ): void {
    const fullName = `${skillName}__${toolName}`;

    // Check for conflicts with static tools
    if (this.staticTools.has(fullName)) {
      logger.warn({
        event: 'tools.registry.skill_tool_conflict',
        skillName,
        toolName: fullName,
        conflictsWith: 'static',
      });
      return;
    }

    // Check for conflicts with MCP tools
    if (this.mcpTools.has(fullName)) {
      logger.warn({
        event: 'tools.registry.skill_tool_conflict',
        skillName,
        toolName: fullName,
        conflictsWith: 'mcp',
      });
      return;
    }

    this.skillTools.set(fullName, {
      claudeTool: { ...toolDefinition, name: fullName },
      skillName,
      originalName: toolName,
    });

    logger.debug({
      event: 'tools.registry.skill_tool_registered',
      skillName,
      toolName: fullName,
    });
  }

  /**
   * Remove all tools for a specific skill.
   *
   * Call this before re-registering skill tools on reload.
   *
   * @param skillName - Name of the skill to remove tools for
   * @returns Number of tools removed
   */
  removeSkillTools(skillName: string): number {
    let removed = 0;
    for (const [key, tool] of this.skillTools.entries()) {
      if (tool.skillName === skillName) {
        this.skillTools.delete(key);
        removed += 1;
      }
    }

    if (removed > 0) {
      logger.debug({
        event: 'tools.registry.skill_tools_removed',
        skillName,
        removedCount: removed,
      });
    }

    return removed;
  }

  /**
   * Clear all skill tools.
   *
   * Call this before reloading all skills.
   */
  clearSkillTools(): void {
    const count = this.skillTools.size;
    this.skillTools.clear();

    if (count > 0) {
      logger.debug({
        event: 'tools.registry.skill_tools_cleared',
        removedCount: count,
      });
    }
  }

  /**
   * Get a registered skill tool.
   *
   * @param toolName - Full tool name (skillName__toolName)
   */
  getSkillTool(toolName: string): RegisteredSkillTool | undefined {
    return this.skillTools.get(toolName);
  }

  __resetForTests(): void {
    this.staticTools.clear();
    this.mcpTools.clear();
    this.skillTools.clear();
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


