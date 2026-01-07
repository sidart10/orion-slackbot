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
 * Models that support Programmatic Tool Calling (PTC).
 * PTC allows Claude to invoke tools from Python code in Anthropic's container.
 * @see Story 6.3 - Anthropic Managed PTC
 */
const PTC_SUPPORTED_MODELS = [
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-5-20250929',
  'claude-4-opus-20250514', // potential future model IDs
] as const;

/**
 * Check if the current model supports PTC.
 * Falls back to environment variable PTC_ENABLED for explicit control.
 */
export function isPtcEnabled(): boolean {
  // Explicit override via environment variable
  const ptcEnv = process.env.PTC_ENABLED;
  if (ptcEnv !== undefined) {
    return ptcEnv === 'true' || ptcEnv === '1';
  }

  // Check if current model supports PTC
  const model = process.env.ANTHROPIC_MODEL ?? '';
  return PTC_SUPPORTED_MODELS.some((supported) => model.includes(supported));
}

/**
 * Anthropic tool definition format
 * @see https://docs.anthropic.com/claude/docs/tool-use
 * @see Story 6.3 - Programmatic Tool Calling (PTC)
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  /**
   * Story 6.3: Specifies which callers can invoke this tool.
   * For PTC, set to ['code_execution_20250825'] to allow Claude to call
   * this tool from Python code in Anthropic's container.
   */
  allowed_callers?: string[];
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
 * @param serverDefaults - Optional default values that will be merged at runtime
 * @returns Anthropic tool definition
 *
 * @see AC#3 - Tool name exposed as {{serverName}}__{{toolName}}
 *
 * @example
 * const mcpTool = { name: 'search', description: 'Search web', inputSchema: {...} };
 * const claudeTool = mcpToolToClaude('brave', mcpTool);
 * // claudeTool.name === 'brave__search'
 */
export function mcpToolToClaude(
  serverName: string,
  tool: McpTool,
  serverDefaults?: Record<string, unknown>
): AnthropicTool {
  const name = `${serverName}__${tool.name}`;

  // Story 6.3: Enable PTC (Programmatic Tool Calling) - single caller mode
  // This allows Claude to invoke MCP tools from Python code in Anthropic's container
  // Only add allowed_callers when the model supports PTC (e.g., Opus 4.5)
  const result: AnthropicTool = {
    name,
    ...(isPtcEnabled() ? { allowed_callers: ['code_execution_20250825'] } : {}),
    input_schema: {
      type: 'object',
      properties: convertProperties(tool.inputSchema.properties ?? {}),
    },
  };

  // Build description with defaults info
  let description = tool.description ?? '';
  
  // Add default values info to help Claude understand what's pre-configured
  if (serverDefaults && Object.keys(serverDefaults).length > 0) {
    const defaultsList = Object.entries(serverDefaults)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(', ');
    description += `\n\nNote: The following defaults are pre-configured and will be used if not specified: ${defaultsList}`;
  }

  if (description) {
    result.description = description;
  }

  // Remove defaults from required list since they're pre-configured
  if (tool.inputSchema.required && tool.inputSchema.required.length > 0) {
    const defaultKeys = serverDefaults ? Object.keys(serverDefaults) : [];
    const stillRequired = tool.inputSchema.required.filter(
      (r) => !defaultKeys.includes(r)
    );
    if (stillRequired.length > 0) {
      result.input_schema.required = stillRequired;
    }
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

