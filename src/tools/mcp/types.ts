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
 * @see Story 3.1 - Generic MCP Client
 */

// ─────────────────────────────────────────────────────────────────────────────
// MCP Protocol Types (JSON-RPC over HTTP Streamable Transport)
// @see https://spec.modelcontextprotocol.io/specification/transport/http/
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MCP client session state for lifecycle tracking
 * @see Story 3.5 - AC-L5: Session state machine
 */
export enum SessionState {
  /** Not yet connected, no handshake performed */
  DISCONNECTED = 'DISCONNECTED',
  /** Initialization in progress (initialize request sent, waiting for response) */
  INITIALIZING = 'INITIALIZING',
  /** Session established, ready for tool calls */
  CONNECTED = 'CONNECTED',
  /** Initialization failed */
  FAILED = 'FAILED',
}

/**
 * MCP initialize response result
 * @see MCP Specification 2025-06-18 - Lifecycle
 */
export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

/**
 * MCP JSON-RPC request envelope
 */
export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number; // Optional for notifications
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response envelope
 */
export interface McpJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: McpJsonRpcError;
}

/**
 * MCP JSON-RPC error object
 */
export interface McpJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Tool definition from tools/list response
 * @see AC#2 - Returns McpTool[] including name, description, inputSchema
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: McpToolInputSchema;
}

/**
 * JSON Schema for tool input parameters
 */
export interface McpToolInputSchema {
  type: 'object';
  properties?: Record<string, McpJsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * JSON Schema property definition
 */
export interface McpJsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: McpJsonSchemaProperty;
  properties?: Record<string, McpJsonSchemaProperty>;
  required?: string[];
  oneOf?: McpJsonSchemaProperty[];
  anyOf?: McpJsonSchemaProperty[];
  allOf?: McpJsonSchemaProperty[];
  nullable?: boolean;
  default?: unknown;
  [key: string]: unknown;
}

/**
 * MCP tools/list response result
 */
export interface McpToolsListResult {
  tools: McpTool[];
}

/**
 * MCP content block in tools/call response
 */
export interface McpContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

/**
 * MCP tools/call response result
 * @see AC#4 - Returns ToolResult<McpContent>
 */
export interface McpContent {
  content: McpContentBlock[];
  isError?: boolean;
}

/**
 * MCP client connection configuration
 * @see AC#1 - MCP server URL and optional bearer auth
 */
export interface McpClientConfig {
  /** Server URL (required for HTTP transport) */
  url: string;
  /** Optional bearer token for authentication */
  bearerToken?: string;
  /** Request timeout in ms (default: 30000) */
  requestTimeoutMs?: number;
  /** Connection timeout in ms (default: 5000) */
  connectionTimeoutMs?: number;
}

/**
 * MCP client state for debugging/health
 * @see AC#7 - Lightweight state for debugging
 * @see Story 3.5 AC-L5 - Session state machine
 */
export interface McpClientState {
  lastSuccessAt?: Date;
  lastError?: string;
  lastErrorAt?: Date;
  lastLatencyMs?: number;
  /** Current session state (AC-L5) */
  sessionState?: SessionState;
  /** Session ID if established (AC-L2) */
  sessionId?: string;
  /** When session was established (AC-L5) */
  sessionEstablishedAt?: Date;
  /** True if server doesn't support initialize handshake (AC-L3, AC-L10) */
  isStateless?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Configuration Types
// ─────────────────────────────────────────────────────────────────────────────

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
  /** Default arguments to merge into tool calls */
  defaults?: Record<string, unknown>;
};

export type ClaudeSdkMcpSseConfig = {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
  /** Default arguments to merge into tool calls */
  defaults?: Record<string, unknown>;
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
