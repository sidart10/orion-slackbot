/**
 * Tool Configuration for Orion Agent
 *
 * Defines tool schemas for Anthropic's tool_use capability.
 * MCP tools are discovered and cached via the unified registry (Story 3.2).
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see Story 3.2 - Tool Discovery & Registration
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { ToolResult } from '../utils/tool-result.js';
import { isRetryable } from '../utils/tool-result.js';
import { toolRegistry } from '../tools/registry.js';
import { discoverAllTools } from '../tools/mcp/discovery.js';

/**
 * Tool definition type matching Anthropic's Tool schema.
 */
export type ToolDefinition = Anthropic.Tool;

/**
 * Get tool definitions for the Orion agent.
 *
 * Returns merged static tools + discovered MCP tools in Anthropic tool format.
 *
 * @returns Array of tool definitions (static + MCP)
 */
export function getToolDefinitions(): ToolDefinition[] {
  return toolRegistry.getToolsForClaude();
}

/**
 * Best-effort refresh of MCP tools (lazy + TTL).
 *
 * Never throws; returns ToolResult.
 */
export async function refreshMcpTools(traceId?: string): Promise<ToolResult<{ registered: number }>> {
  return discoverAllTools(traceId);
}

/**
 * Rube MCP server configuration.
 * Used when spawning the MCP server process in Story 3.1.
 */
export const rubeMcpConfig = {
  /** Command to spawn MCP server */
  command: 'npx',
  /** Command arguments */
  args: ['-y', '@composio/mcp', 'start'],
  /** Description for logging */
  description: '500+ app integrations via Composio',
} as const;

export type { ToolResult };
export { isRetryable };

