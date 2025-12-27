/**
 * MCP HTTP Streamable Transport Client
 *
 * Generic MCP client that connects to any MCP-compatible server using
 * JSON-RPC over HTTP (MCP HTTP Streamable Transport).
 *
 * Features:
 * - Lazy connection (no startup connect)
 * - Bearer token authentication
 * - Configurable timeouts (5s connection, 30s request)
 * - Never throws from public APIs - returns ToolResult<T>
 * - Structured logging with traceId
 * - Langfuse spans when trace is provided
 *
 * @see Story 3.1 - Generic MCP Client
 * @see AC#1 - MCP HTTP Streamable Transport (JSON-RPC over HTTP)
 * @see AC#4 - callTool() returns ToolResult<McpContent> and never throws
 * @see AC#5 - Error handling with ToolErrorCode and retryable
 * @see AC#6 - Concurrent operations are safe
 * @see AC#7 - Structured logs with traceId, Langfuse spans
 */

import type {
  McpClientConfig,
  McpClientState,
  McpTool,
  McpContent,
  McpToolsListResult,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from './types.js';
import type { ToolResult } from '../../utils/tool-result.js';
import { isRetryable } from '../../utils/tool-result.js';
import { logger } from '../../utils/logger.js';
import type { TraceWrapper } from '../../observability/tracing.js';

/** Default connection timeout per project-context.md */
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;

/** Default request timeout */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * MCP Client for HTTP Streamable Transport
 *
 * @example
 * const client = new McpClient('my-server', {
 *   url: 'https://mcp.example.com',
 *   bearerToken: 'secret',
 * });
 *
 * const tools = await client.listTools();
 * if (tools.success) {
 *   console.log(tools.data);
 * }
 */
export class McpClient {
  private readonly serverName: string;
  private readonly config: Required<McpClientConfig>;
  private state: McpClientState = {};
  private requestId = 0;

  constructor(serverName: string, config: McpClientConfig) {
    this.serverName = serverName;
    this.config = {
      url: config.url,
      bearerToken: config.bearerToken ?? '',
      requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      // Note: connectionTimeoutMs is stored for future use but not separately enforced.
      // For HTTP Streamable Transport, each request is independent (no persistent connection).
      // The requestTimeoutMs covers the entire request including TCP connect.
      // Connection failures (ECONNREFUSED, DNS) fail immediately without waiting for timeout.
      connectionTimeoutMs: config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    };
  }

  /**
   * List available tools from the MCP server.
   *
   * @param traceId - Optional trace ID for structured logging
   * @param trace - Optional Langfuse trace for span creation
   * @returns ToolResult<McpTool[]> - never throws
   *
   * @see AC#2 - Returns ToolResult<McpTool[]> with name, description, inputSchema
   */
  async listTools(traceId?: string, trace?: TraceWrapper): Promise<ToolResult<McpTool[]>> {
    const startTime = Date.now();
    const span = trace?.startSpan('mcp.tools.list', {
      input: { serverName: this.serverName },
    });

    logger.info({
      event: 'mcp.tools.list.started',
      serverName: this.serverName,
      traceId,
    });

    try {
      const response = await this.sendRequest<McpToolsListResult>(
        'tools/list',
        {},
        traceId
      );

      if (!response.success) {
        this.updateErrorState(response.error.message);
        span?.update({ output: { success: false, error: response.error.code } });
        span?.end();
        return response;
      }

      const tools = response.data.tools ?? [];
      const durationMs = Date.now() - startTime;

      this.updateSuccessState(durationMs);

      logger.info({
        event: 'mcp.tools.list.success',
        serverName: this.serverName,
        toolCount: tools.length,
        durationMs,
        traceId,
      });

      span?.update({
        output: { success: true, toolCount: tools.length, durationMs },
      });
      span?.end();

      return { success: true, data: tools };
    } catch (error) {
      // This catch should never be reached since sendRequest handles all errors,
      // but we include it for safety
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      this.updateErrorState(errorMessage);

      logger.error({
        event: 'mcp.tools.list.failed',
        serverName: this.serverName,
        error: errorMessage,
        durationMs,
        traceId,
      });

      span?.update({ output: { success: false, error: errorMessage, durationMs } });
      span?.end();

      return {
        success: false,
        error: {
          code: 'TOOL_UNAVAILABLE',
          message: errorMessage,
          retryable: isRetryable(error),
        },
      };
    }
  }

  /**
   * Call a tool on the MCP server.
   *
   * @param toolName - Name of the tool to call
   * @param args - Tool arguments
   * @param traceId - Optional trace ID for structured logging
   * @param trace - Optional Langfuse trace for span creation
   * @returns ToolResult<McpContent> - never throws
   *
   * @see AC#4 - Returns ToolResult<McpContent> and never throws
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    traceId?: string,
    trace?: TraceWrapper,
    signal?: AbortSignal
  ): Promise<ToolResult<McpContent>> {
    const startTime = Date.now();
    const span = trace?.startSpan('mcp.call', {
      input: {
        serverName: this.serverName,
        toolName,
        argsKeys: Object.keys(args),
      },
    });

    logger.info({
      event: 'mcp.call.started',
      serverName: this.serverName,
      toolName,
      traceId,
    });

    try {
      const response = await this.sendRequest<McpContent>(
        'tools/call',
        { name: toolName, arguments: args },
        traceId,
        signal
      );

      if (!response.success) {
        this.updateErrorState(response.error.message);
        span?.update({
          output: { success: false, error: response.error.code },
        });
        span?.end();
        return response;
      }

      const durationMs = Date.now() - startTime;
      this.updateSuccessState(durationMs);

      logger.info({
        event: 'mcp.call.success',
        serverName: this.serverName,
        toolName,
        contentBlocks: response.data.content?.length ?? 0,
        durationMs,
        traceId,
      });

      span?.update({
        output: {
          success: true,
          contentBlocks: response.data.content?.length ?? 0,
          durationMs,
        },
      });
      span?.end();

      return response;
    } catch (error) {
      // Safety catch - sendRequest handles all errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      this.updateErrorState(errorMessage);

      logger.error({
        event: 'mcp.call.failed',
        serverName: this.serverName,
        toolName,
        error: errorMessage,
        durationMs,
        traceId,
      });

      span?.update({ output: { success: false, error: errorMessage, durationMs } });
      span?.end();

      return {
        success: false,
        error: {
          code: 'TOOL_UNAVAILABLE',
          message: errorMessage,
          retryable: isRetryable(error),
        },
      };
    }
  }

  /**
   * Get current client state for debugging/health checks.
   *
   * @see AC#7 - Lightweight state for debugging
   */
  getState(): McpClientState {
    return { ...this.state };
  }

  /**
   * Get the server name this client is connected to.
   */
  getServerName(): string {
    return this.serverName;
  }

  /**
   * Send a JSON-RPC request to the MCP server.
   *
   * @param method - MCP method (e.g., 'tools/list', 'tools/call')
   * @param params - Method parameters
   * @param traceId - Optional trace ID for logging
   * @returns ToolResult<T> - never throws
   */
  private async sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    traceId?: string,
    signal?: AbortSignal
  ): Promise<ToolResult<T>> {
    const requestId = ++this.requestId;

    const request: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    }

    // Create abort controller for timeout + upstream cancellation propagation.
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeoutMs);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);

      if (!response.ok) {
        const isServerError = response.status >= 500;
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `HTTP ${response.status}: ${response.statusText}`,
            retryable: isServerError || response.status === 429,
          },
        };
      }

      let jsonResponse: McpJsonRpcResponse<T>;
      try {
        jsonResponse = (await response.json()) as McpJsonRpcResponse<T>;
      } catch {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: 'Invalid JSON response from MCP server',
            retryable: false,
          },
        };
      }

      // Check for JSON-RPC error
      if (jsonResponse.error) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `${jsonResponse.error.message} (code: ${jsonResponse.error.code})`,
            retryable: false,
          },
        };
      }

      if (jsonResponse.result === undefined) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: 'MCP response missing result field',
            retryable: false,
          },
        };
      }

      return { success: true, data: jsonResponse.result };
    } catch (error) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout =
        error instanceof Error &&
        (error.name === 'AbortError' || errorMessage.includes('abort'));
      const isNetworkError =
        errorMessage.toLowerCase().includes('econnrefused') ||
        errorMessage.toLowerCase().includes('econnreset') ||
        errorMessage.toLowerCase().includes('network') ||
        errorMessage.toLowerCase().includes('dns');

      if (isTimeout) {
        logger.warn({
          event: 'mcp.request.timeout',
          serverName: this.serverName,
          method,
          timeoutMs: this.config.requestTimeoutMs,
          traceId,
        });

        return {
          success: false,
          error: {
            code: 'TOOL_UNAVAILABLE',
            message: `MCP request timeout after ${this.config.requestTimeoutMs}ms`,
            retryable: true,
          },
        };
      }

      return {
        success: false,
        error: {
          code: isNetworkError ? 'TOOL_UNAVAILABLE' : 'TOOL_EXECUTION_FAILED',
          message: errorMessage,
          retryable: isNetworkError || isRetryable(error),
        },
      };
    }
  }

  private updateSuccessState(latencyMs: number): void {
    this.state = {
      ...this.state,
      lastSuccessAt: new Date(),
      lastLatencyMs: latencyMs,
    };
  }

  private updateErrorState(error: string): void {
    this.state = {
      ...this.state,
      lastError: error,
      lastErrorAt: new Date(),
    };
  }
}

