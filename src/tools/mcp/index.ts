/**
 * MCP (Model Context Protocol) Module
 *
 * Provides configuration loading and health tracking for MCP servers.
 * Claude Agent SDK handles tool discovery natively via mcpServers config.
 *
 * NOTE (2025-12-18): Discovery exports removed after course correction.
 * SDK handles tool discovery internally — no custom discovery layer needed.
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 * @see Story 3.1 - MCP Client Infrastructure
 */

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
