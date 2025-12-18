/**
 * Tool Configuration Module
 *
 * Configures MCP servers and allowed tools for the Orion agent.
 * MCP servers are lazily initialized by the Claude SDK.
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see AC#1 - Tool configuration for query()
 */

/**
 * MCP server configuration shape
 */
export interface McpServerConfig {
  /** Command to start the MCP server */
  command: string;
  /** Command arguments */
  args: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Tool configuration for the Orion agent
 */
export interface ToolConfig {
  /** MCP server configurations keyed by name */
  mcpServers: Record<string, McpServerConfig>;
  /** List of allowed tool names */
  allowedTools: string[];
}

/**
 * Tool configuration for Orion agent
 *
 * MCP servers are lazily initialized by the Claude SDK.
 * Tools are discovered at runtime via MCP protocol.
 */
export const toolConfig: ToolConfig = {
  mcpServers: {
    // Rube (Composio) for 500+ app integrations
    // TODO: Enable in Story 3.1 (MCP Client Infrastructure)
    // rube: {
    //   command: 'npx',
    //   args: ['-y', '@composio/mcp', 'start']
    // },
  },

  // Allowed tools for agent
  // Start minimal, expand as needed
  allowedTools: [
    'Read', // Read files
    'Write', // Write files
    'Bash', // Execute commands
    // 'mcp',    // MCP tools (enabled in Story 3.1)
    // 'Skill',  // Skills (enabled in Story 7.1)
  ],
};

/**
 * Get MCP server configuration by name
 *
 * @param name - Server name
 * @returns Server config or undefined if not found
 */
export function getMcpServer(name: string): McpServerConfig | undefined {
  return toolConfig.mcpServers[name];
}

/**
 * Check if a tool is allowed
 *
 * @param toolName - Name of the tool
 * @returns true if tool is in allowedTools list
 */
export function isToolAllowed(toolName: string): boolean {
  return toolConfig.allowedTools.includes(toolName);
}

