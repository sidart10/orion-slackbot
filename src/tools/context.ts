/**
 * Tool Context Management
 *
 * Generates minimal tool context summaries for the system prompt.
 * Per AR17: Minimal tools in context — agent discovers dynamically.
 *
 * NOTE (2025-12-18): Simplified after course correction.
 * Claude Agent SDK handles tool discovery natively via mcpServers config.
 * This module now provides a static summary — SDK discovers specifics on-demand.
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 * @see AR17 - Minimal tools in context
 */

import { getMcpServersConfig } from './mcp/config.js';

/**
 * Essential tool patterns that should always be mentioned in context
 * These are high-frequency tools that users commonly need
 */
export const ESSENTIAL_TOOL_PATTERNS = [
  'search',
  'github',
  'slack',
  'confluence',
  'jira',
  'calendar',
  'email',
  'gmail',
];

/**
 * Generate a minimal tool context summary for the system prompt
 *
 * Per AR17: Minimal tools in context. We provide a high-level summary
 * rather than detailed schemas. The agent discovers specifics on-demand
 * via Claude Agent SDK's native MCP integration.
 *
 * Target: Under 500 tokens to preserve context window
 *
 * @returns Context string describing available tools
 */
export function getToolContextSummary(): string {
  const servers = getMcpServersConfig();
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    return `You have access to external tools via MCP servers. Tools will be discovered when you attempt to use them.

Common tool categories include: ${ESSENTIAL_TOOL_PATTERNS.join(', ')}.`;
  }

  return `You have access to external tools via MCP:
${serverNames.map((name) => `• ${name}`).join('\n')}

When you need to perform actions like searching, creating issues, sending messages, or accessing external services, use the appropriate MCP tool. The SDK will discover available tools automatically.

Common tool categories include: ${ESSENTIAL_TOOL_PATTERNS.join(', ')}.`;
}

/**
 * ToolSchema type for compatibility
 * (Simplified - SDK handles actual schemas)
 */
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  server: string;
}

/**
 * Get detailed schema for a specific tool
 * NOTE: With SDK-native discovery, this returns undefined.
 * The SDK handles tool schemas internally.
 *
 * @param _toolName - Name of the tool to look up
 * @returns undefined (SDK handles tool schemas)
 */
export function getToolDetails(_toolName: string): ToolSchema | undefined {
  // SDK handles tool discovery and schemas natively
  return undefined;
}

/**
 * Search tools by keyword
 * NOTE: With SDK-native discovery, this returns empty array.
 * The SDK handles tool discovery internally.
 *
 * @param _keyword - Search term
 * @returns Empty array (SDK handles tool discovery)
 */
export function searchTools(_keyword: string): ToolSchema[] {
  // SDK handles tool discovery natively
  return [];
}
