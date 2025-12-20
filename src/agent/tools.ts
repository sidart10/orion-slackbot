import { getMcpServersConfig } from '../tools/mcp/config.js';
import type { ClaudeSdkMcpConfig } from '../tools/mcp/types.js';

/**
 * Tool configuration for Claude Agent SDK
 * 
 * MCP servers are loaded from .orion/config.yaml (lazy initialization per AR14)
 * Only enabled servers are included in the config
 */
export interface ToolConfig {
  mcpServers: Record<string, ClaudeSdkMcpConfig>;
  allowedTools: string[];
}

/**
 * Get the complete tool configuration for query() options
 * Includes MCP servers and allowed tool types
 */
export function getToolConfig(): ToolConfig {
  return {
    mcpServers: getMcpServersConfig(),
    allowedTools: [
      'mcp',     // MCP tool calls
      'Read',    // File reading for agentic search
      'Bash',    // Bash for agentic search
      'Grep',    // Grep for searching
      'Glob',    // File discovery
      'Write',   // Write files (Keeping this from original config as it seems useful for agent)
    ],
  };
}
