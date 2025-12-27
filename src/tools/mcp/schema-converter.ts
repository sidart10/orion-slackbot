/**
 * MCP to Anthropic Schema Converter
 *
 * Converts MCP tool schemas to Anthropic tool definitions.
 *
 * @see Story 3.1 - Generic MCP Client
 * @see AC#3 - mcpToolToClaude() returns Anthropic tool with name server__tool
 */

import type { McpTool, McpJsonSchemaProperty } from './types.js';

/**
 * Anthropic tool definition format
 * @see https://docs.anthropic.com/claude/docs/tool-use
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties: Record<string, AnthropicSchemaProperty>;
    required?: string[];
  };
}

/**
 * Anthropic JSON Schema property (subset of JSON Schema)
 */
export interface AnthropicSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: AnthropicSchemaProperty;
  properties?: Record<string, AnthropicSchemaProperty>;
  required?: string[];
  oneOf?: AnthropicSchemaProperty[];
  anyOf?: AnthropicSchemaProperty[];
  allOf?: AnthropicSchemaProperty[];
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Convert an MCP tool to an Anthropic tool definition.
 *
 * The tool name is formatted as `serverName__toolName` to ensure uniqueness
 * across multiple MCP servers.
 *
 * @param serverName - Name of the MCP server
 * @param tool - MCP tool definition
 * @returns Anthropic tool definition
 *
 * @see AC#3 - Tool name exposed as {{serverName}}__{{toolName}}
 *
 * @example
 * const mcpTool = { name: 'search', description: 'Search web', inputSchema: {...} };
 * const claudeTool = mcpToolToClaude('brave', mcpTool);
 * // claudeTool.name === 'brave__search'
 */
export function mcpToolToClaude(serverName: string, tool: McpTool): AnthropicTool {
  const name = `${serverName}__${tool.name}`;

  const result: AnthropicTool = {
    name,
    input_schema: {
      type: 'object',
      properties: convertProperties(tool.inputSchema.properties ?? {}),
    },
  };

  if (tool.description) {
    result.description = tool.description;
  }

  if (tool.inputSchema.required && tool.inputSchema.required.length > 0) {
    result.input_schema.required = tool.inputSchema.required;
  }

  return result;
}

/**
 * Convert MCP JSON Schema properties to Anthropic format.
 *
 * Handles edge cases:
 * - nullable: converts to type or preserves for Anthropic
 * - oneOf/anyOf/allOf: preserved as-is
 * - nested objects: recursively converted
 * - arrays with items: items schema converted
 * - enums: preserved
 * - descriptions: preserved at all levels
 */
function convertProperties(
  properties: Record<string, McpJsonSchemaProperty>
): Record<string, AnthropicSchemaProperty> {
  const result: Record<string, AnthropicSchemaProperty> = {};

  for (const [key, prop] of Object.entries(properties)) {
    result[key] = convertProperty(prop);
  }

  return result;
}

/**
 * Convert a single MCP JSON Schema property to Anthropic format.
 */
function convertProperty(prop: McpJsonSchemaProperty): AnthropicSchemaProperty {
  const result: AnthropicSchemaProperty = {};

  // Handle type
  if (prop.type !== undefined) {
    result.type = prop.type;
  }

  // Handle description
  if (prop.description !== undefined) {
    result.description = prop.description;
  }

  // Handle enum
  if (prop.enum !== undefined) {
    result.enum = prop.enum;
  }

  // Handle default
  if (prop.default !== undefined) {
    result.default = prop.default;
  }

  // Handle nullable - Anthropic doesn't have explicit nullable,
  // but we preserve the type as-is since Claude handles it
  if (prop.nullable !== undefined) {
    // Keep the original type - Claude understands nullable context
    result.nullable = prop.nullable;
  }

  // Handle nested objects
  if (prop.properties !== undefined) {
    result.properties = convertProperties(prop.properties);
  }

  if (prop.required !== undefined) {
    result.required = prop.required;
  }

  // Handle arrays
  if (prop.items !== undefined) {
    result.items = convertProperty(prop.items);
  }

  // Handle oneOf
  if (prop.oneOf !== undefined) {
    result.oneOf = prop.oneOf.map(convertProperty);
  }

  // Handle anyOf
  if (prop.anyOf !== undefined) {
    result.anyOf = prop.anyOf.map(convertProperty);
  }

  // Handle allOf
  if (prop.allOf !== undefined) {
    result.allOf = prop.allOf.map(convertProperty);
  }

  return result;
}

/**
 * Parse a Claude tool name back to server and tool name.
 *
 * @param claudeToolName - Tool name in format server__tool
 * @returns Tuple of [serverName, toolName] or null if invalid format
 *
 * @example
 * parseClaudeToolName('brave__search') // ['brave', 'search']
 * parseClaudeToolName('invalid') // null
 */
export function parseClaudeToolName(
  claudeToolName: string
): [serverName: string, toolName: string] | null {
  const separatorIndex = claudeToolName.indexOf('__');
  if (separatorIndex === -1) {
    return null;
  }

  const serverName = claudeToolName.slice(0, separatorIndex);
  const toolName = claudeToolName.slice(separatorIndex + 2);

  if (!serverName || !toolName) {
    return null;
  }

  return [serverName, toolName];
}

