/**
 * MCP (Model Context Protocol) Module
 *
 * Provides MCP client, configuration loading, health tracking, and schema conversion.
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 * @see Story 3.1 - Generic MCP Client
 */

// MCP Client (Story 3.1)
export { McpClient } from './client.js';

// Schema Conversion (Story 3.1)
export { mcpToolToClaude, parseClaudeToolName } from './schema-converter.js';
export type { AnthropicTool, AnthropicSchemaProperty } from './schema-converter.js';

// Config loading
export {
  loadMcpServersConfig,
  getMcpServersConfig,
  clearMcpConfigCache,
} from './config.js';

// Health tracking
export {
  markServerUnavailable,
  markServerAvailable,
  isServerAvailable,
  getAllServerHealth,
} from './health.js';

// Types
export type {
  // MCP Protocol types (Story 3.1)
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpJsonRpcError,
  McpTool,
  McpToolInputSchema,
  McpJsonSchemaProperty,
  McpToolsListResult,
  McpContentBlock,
  McpContent,
  McpClientConfig,
  McpClientState,
  // Server config types
  McpServerConfig,
  McpServerStdioConfig,
  McpServerHttpConfig,
  McpServerSseConfig,
  McpServersConfig,
  McpServerHealth,
  ClaudeSdkMcpConfig,
  ClaudeSdkMcpStdioConfig,
  ClaudeSdkMcpHttpConfig,
  ClaudeSdkMcpSseConfig,
} from './types.js';
