/**
 * MCP Server Configuration Types
 * 
 * Defines the structure for MCP server configurations loaded from .orion/config.yaml
 * Supports all MCP transports per MCP 1.0+ spec:
 * - stdio: Local process communication (default)
 * - http: HTTP with streamable responses  
 * - sse: Server-Sent Events for streaming
 * 
 * @see https://modelcontextprotocol.io/docs/concepts/transports
 */

export interface McpServerConfigBase {
  enabled: boolean;
  description?: string;
}

export interface McpServerStdioConfig extends McpServerConfigBase {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerHttpConfig extends McpServerConfigBase {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface McpServerSseConfig extends McpServerConfigBase {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpServerStdioConfig | McpServerHttpConfig | McpServerSseConfig;

export interface McpServersConfig {
  mcp_servers: Record<string, McpServerConfig>;
}

/**
 * Claude SDK McpServerConfig format
 * These match the SDK's discriminated union types exactly.
 * 
 * For stdio: type is optional (defaults to 'stdio' in SDK)
 * For http/sse: type is required
 */
export type ClaudeSdkMcpStdioConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type ClaudeSdkMcpHttpConfig = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
};

export type ClaudeSdkMcpSseConfig = {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
};

export type ClaudeSdkMcpConfig = ClaudeSdkMcpStdioConfig | ClaudeSdkMcpHttpConfig | ClaudeSdkMcpSseConfig;

/**
 * MCP server health status
 */
export interface McpServerHealth {
  name: string;
  available: boolean;
  lastError?: string;
  lastErrorTime?: Date;
  failureCount: number;
}
