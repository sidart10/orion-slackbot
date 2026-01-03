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
  McpInitializeResult,
} from './types.js';
import { SessionState } from './types.js';
import type { ToolResult, ToolError } from '../../utils/tool-result.js';
import { isRetryable } from '../../utils/tool-result.js';
import { logger } from '../../utils/logger.js';
import type { TraceWrapper } from '../../observability/tracing.js';

/**
 * Custom error that preserves ToolError information through throw/catch.
 */
class McpInitError extends Error {
  public readonly toolError: ToolError;
  constructor(toolError: ToolError) {
    super(toolError.message);
    this.name = 'McpInitError';
    this.toolError = toolError;
  }
}

/** Default connection timeout per project-context.md */
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;

/** Default request timeout */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Timeout for initialize request - fail fast (AC-L1) */
const INIT_TIMEOUT_MS = 5000;

/** Requested MCP protocol version */
const REQUESTED_PROTOCOL_VERSION = '2025-06-18';

/** Client info for initialize request */
const CLIENT_INFO = { name: 'orion-slack-agent', version: '1.0.0' };

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
  private sessionId: string | null = null;

  // Session lifecycle state (Story 3.5)
  private sessionState: SessionState = SessionState.DISCONNECTED;
  private initializationPromise: Promise<void> | null = null;
  private negotiatedVersion: string = REQUESTED_PROTOCOL_VERSION;
  private sessionEstablishedAt: Date | null = null;
  private isStateless: boolean = false;

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
   * Get the current session ID for this server.
   * @returns Session ID if established, null otherwise
   * @see AC-S1 - Session ID captured from mcp-session-id header
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Ensure the MCP session is initialized before making requests.
   * Implements the full MCP lifecycle handshake:
   * 1. Send `initialize` request
   * 2. Wait for `InitializeResult` response
   * 3. Send `notifications/initialized` notification
   *
   * Uses mutex pattern to prevent duplicate handshakes from concurrent calls.
   *
   * @see Story 3.5 - AC-L1, AC-L6
   */
  async ensureInitialized(traceId?: string): Promise<ToolResult<void>> {
    // Already connected or stateless server
    if (this.sessionState === SessionState.CONNECTED) {
      return { success: true, data: undefined };
    }
    if (this.isStateless) {
      return { success: true, data: undefined };
    }

    // Mutex: if initialization in progress, wait for it
    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
        return { success: true, data: undefined };
      } catch {
        // Previous init failed, will retry below
      }
    }

    // Start initialization
    const initPromise = this.doInitialize(traceId);
    this.initializationPromise = initPromise;
    try {
      await initPromise;
      return { success: true, data: undefined };
    } catch (error) {
      // Preserve ToolError if available (from McpInitError)
      if (error instanceof McpInitError) {
        return { success: false, error: error.toolError };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: {
          code: 'MCP_CONNECTION_FAILED',
          message: errorMessage,
          retryable: isRetryable(error),
        },
      };
    } finally {
      // Only clear if this call still "owns" the current initialization promise.
      // Prevents clobbering a newer init started after an earlier failure.
      if (this.initializationPromise === initPromise) {
        this.initializationPromise = null;
      }
    }
  }

  /**
   * Perform the actual MCP handshake.
   * @see MCP Specification 2025-06-18 - Lifecycle
   */
  private async doInitialize(traceId?: string): Promise<void> {
    this.sessionState = SessionState.INITIALIZING;

    logger.info({
      event: 'mcp.init.started',
      serverName: this.serverName,
      traceId,
    });

    // 1. Send initialize request with 5s timeout (fail fast)
    const initResult = await this.sendInitRequest(traceId);

    if (!initResult.success) {
      // Check for stateless server fallback (AC-L10)
      if (this.shouldFallbackToStateless(initResult.error)) {
        logger.warn({
          event: 'mcp.init.fallback_stateless',
          serverName: this.serverName,
          reason: initResult.error.message,
          traceId,
        });
        this.isStateless = true;
        this.sessionState = SessionState.CONNECTED;
        return;
      }

      this.sessionState = SessionState.FAILED;
      // Throw McpInitError to preserve retryable flag
      throw new McpInitError(initResult.error);
    }

    // Store negotiated version from server response
    const serverVersion = initResult.data.protocolVersion;
    if (serverVersion && serverVersion !== REQUESTED_PROTOCOL_VERSION) {
      logger.warn({
        event: 'mcp.init.version_mismatch',
        serverName: this.serverName,
        requested: REQUESTED_PROTOCOL_VERSION,
        server: serverVersion,
        traceId,
      });
    }
    this.negotiatedVersion = serverVersion ?? REQUESTED_PROTOCOL_VERSION;

    // Check if server returned session ID - if not, mark as stateless
    if (!this.sessionId) {
      logger.info({
        event: 'mcp.init.no_session_id',
        serverName: this.serverName,
        traceId,
      });
      this.isStateless = true;
    }

    // 2. Send notifications/initialized (one-way, no id field)
    const notifyResult = await this.sendNotification('notifications/initialized', traceId);
    if (!notifyResult.success) {
      this.sessionState = SessionState.FAILED;
      throw new McpInitError(notifyResult.error);
    }

    this.sessionState = SessionState.CONNECTED;
    this.sessionEstablishedAt = new Date();

    logger.info({
      event: 'mcp.init.success',
      serverName: this.serverName,
      protocolVersion: this.negotiatedVersion,
      isStateless: this.isStateless,
      traceId,
    });
  }

  /**
   * Send the initialize JSON-RPC request.
   * Uses 5s timeout (AC-L1) to fail fast.
   */
  private async sendInitRequest(traceId?: string): Promise<ToolResult<McpInitializeResult>> {
    const requestId = ++this.requestId;
    const request: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'initialize',
      params: {
        protocolVersion: REQUESTED_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: CLIENT_INFO,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INIT_TIMEOUT_MS);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Capture session ID from response header
      const newSessionId = response.headers.get('mcp-session-id');
      if (newSessionId) {
        this.sessionId = newSessionId;
        logger.info({
          event: 'mcp.session.established',
          serverName: this.serverName,
          sessionId: newSessionId,
          traceId,
        });
      }

      if (!response.ok) {
        const bodyText = await response.text();
        return {
          success: false,
          error: {
            code: 'MCP_CONNECTION_FAILED',
            message: `HTTP ${response.status}: ${bodyText || response.statusText}`,
            retryable: response.status >= 500,
          },
        };
      }

      const bodyText = await response.text();
      let jsonResponse: McpJsonRpcResponse<McpInitializeResult>;
      try {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/event-stream') || bodyText.startsWith('event:')) {
          jsonResponse = this.parseSseResponse<McpInitializeResult>(bodyText);
        } else {
          jsonResponse = JSON.parse(bodyText) as McpJsonRpcResponse<McpInitializeResult>;
        }
      } catch {
        return {
          success: false,
          error: {
            code: 'MCP_CONNECTION_FAILED',
            message: 'Invalid JSON response from MCP server during initialize',
            retryable: false,
          },
        };
      }

      if (jsonResponse.error) {
        return {
          success: false,
          error: {
            code: 'MCP_CONNECTION_FAILED',
            message: `${jsonResponse.error.message} (code: ${jsonResponse.error.code})`,
            retryable: false,
          },
        };
      }

      if (!jsonResponse.result) {
        return {
          success: false,
          error: {
            code: 'MCP_CONNECTION_FAILED',
            message: 'MCP initialize response missing result',
            retryable: false,
          },
        };
      }

      return { success: true, data: jsonResponse.result };
    } catch (error) {
      clearTimeout(timeoutId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout =
        error instanceof Error &&
        (error.name === 'AbortError' || errorMessage.includes('abort'));

      if (isTimeout) {
        logger.warn({
          event: 'mcp.init.timeout',
          serverName: this.serverName,
          timeoutMs: INIT_TIMEOUT_MS,
          traceId,
        });
        return {
          success: false,
          error: {
            code: 'MCP_CONNECTION_FAILED',
            message: `MCP initialize timeout after ${INIT_TIMEOUT_MS}ms`,
            retryable: true,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'MCP_CONNECTION_FAILED',
          message: errorMessage,
          retryable: isRetryable(error),
        },
      };
    }
  }

  /**
   * Send a one-way notification (no id field, no response body expected).
   * @see MCP Specification - Notifications have no 'id' field
   */
  private async sendNotification(method: string, _traceId?: string): Promise<ToolResult<void>> {
    // Notifications have no 'id' field per JSON-RPC spec
    const request: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      method,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    }

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      // Notifications typically return 202 Accepted
      if (!response.ok && response.status !== 202) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Notification failed: ${response.status}`,
            retryable: response.status >= 500,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: {
          code: 'TOOL_UNAVAILABLE',
          message: errorMessage,
          retryable: true,
        },
      };
    }
  }

  /**
   * Check if error indicates a stateless server that doesn't support initialize.
   * @see AC-L10 - Stateless server fallback detection
   */
  private shouldFallbackToStateless(error: ToolError): boolean {
    const lower = error.message.toLowerCase();
    const status = this.parseHttpStatusCode(lower);
    if (status === null) return false;
    if (status !== 400 && status !== 404 && status !== 405) return false;

    // AC-L10: only fallback when initialize is explicitly unsupported.
    // Be conservative: plain "HTTP 404: Not Found" can also mean a misconfigured URL.
    if (lower.includes('unknown method')) return true;
    if (lower.includes('not supported')) return true;

    // Allow "not found" only when it's clearly about the initialize method.
    if (lower.includes('not found') && (lower.includes('method') || lower.includes('initialize'))) {
      return true;
    }

    return false;
  }

  /**
   * Reset session state and re-initialize.
   * Called on 404 "session not found" errors.
   * @see AC-L7 - 404 recovery
   */
  private async resetAndReinitialize(traceId?: string): Promise<ToolResult<void>> {
    logger.info({
      event: 'mcp.session.reset',
      serverName: this.serverName,
      oldSessionId: this.sessionId,
      traceId,
    });

    // Reset state
    this.sessionId = null;
    this.sessionState = SessionState.DISCONNECTED;
    this.sessionEstablishedAt = null;
    this.initializationPromise = null;

    // Re-initialize
    return this.ensureInitialized(traceId);
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

    // Ensure session is initialized before making request (AC-L1)
    const initResult = await this.ensureInitialized(traceId);
    if (!initResult.success) {
      span?.update({ output: { success: false, error: initResult.error.code } });
      span?.end();
      return initResult as ToolResult<McpTool[]>;
    }

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

    // Ensure session is initialized before making request (AC-L1)
    const initResult = await this.ensureInitialized(traceId);
    if (!initResult.success) {
      span?.update({ output: { success: false, error: initResult.error.code } });
      span?.end();
      return initResult as ToolResult<McpContent>;
    }

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
   * @see Story 3.5 AC-L5 - Session state machine
   */
  getState(): McpClientState {
    return {
      ...this.state,
      sessionState: this.sessionState,
      sessionId: this.sessionId ?? undefined,
      sessionEstablishedAt: this.sessionEstablishedAt ?? undefined,
      isStateless: this.isStateless,
    };
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
   * @param signal - Optional AbortSignal for cancellation
   * @param isRetry - Internal flag to prevent infinite retry loops
   * @returns ToolResult<T> - never throws
   */
  private async sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    traceId?: string,
    signal?: AbortSignal,
    isRetry = false
  ): Promise<ToolResult<T>> {
    const requestId = ++this.requestId;

    const request: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    // MCP HTTP Streamable Transport requires accepting both JSON and SSE
    // @see https://spec.modelcontextprotocol.io/specification/transport/http/
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    }

    // AC-S2: Send session ID on subsequent requests
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    // AC-L4: Include protocol version header after initialization
    if (this.sessionState === SessionState.CONNECTED) {
      headers['MCP-Protocol-Version'] = this.negotiatedVersion;
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

      // NOTE: response.text() can only be consumed once. If we read it for special-case
      // handling (e.g., 404 session expiry), reuse the captured value for error messages.
      let bodyTextForError: string | null = null;

      // AC-S1: Capture session ID from mcp-session-id header
      const newSessionId = response.headers.get('mcp-session-id');
      if (newSessionId && newSessionId !== this.sessionId) {
        const isReestablishment = this.sessionId !== null;
        this.sessionId = newSessionId;
        
        // AC-S4: Log session establishment
        logger.info({
          event: isReestablishment ? 'mcp.session.reestablished' : 'mcp.session.established',
          serverName: this.serverName,
          sessionId: newSessionId,
          traceId,
        });
      }

      // AC-L7: Handle 404 session not found - reset session state and re-initialize
      if (response.status === 404 && !isRetry) {
        bodyTextForError = await response.text();
        if (bodyTextForError.toLowerCase().includes('session')) {
          logger.info({
            event: 'mcp.session.expired',
            serverName: this.serverName,
            oldSessionId: this.sessionId,
            traceId,
          });
          
          // Reset session state and re-initialize (AC-L7)
          const reinitResult = await this.resetAndReinitialize(traceId);
          if (!reinitResult.success) {
            return reinitResult as ToolResult<T>;
          }
          
          // Retry the original request
          return this.sendRequest<T>(method, params, traceId, signal, true);
        }
      }

      if (!response.ok) {
        if (bodyTextForError === null) {
          bodyTextForError = await response.text();
        }

        // AC-L8, AC-L9: Classify retryability based on status code
        // 5xx, 429 = transient (retryable)
        // 400, 401, 403 = non-retryable
        const isServerError = response.status >= 500;
        const isRateLimited = response.status === 429;
        const isNonRetryable = [400, 401, 403].includes(response.status);
        
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `HTTP ${response.status}: ${bodyTextForError || response.statusText}`,
            retryable: (isServerError || isRateLimited) && !isNonRetryable,
          },
        };
      }

      let jsonResponse: McpJsonRpcResponse<T>;
      try {
        const contentType = response.headers.get('content-type') ?? '';
        const bodyText = await response.text();
        
        // Handle SSE response format (MCP HTTP Streamable Transport)
        // SSE format: "event: message\ndata: {...json...}"
        if (contentType.includes('text/event-stream') || bodyText.startsWith('event:')) {
          jsonResponse = this.parseSseResponse<T>(bodyText);
        } else {
          jsonResponse = JSON.parse(bodyText) as McpJsonRpcResponse<T>;
        }
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

  /**
   * Parse SSE (Server-Sent Events) response format.
   * MCP HTTP Streamable Transport may return SSE format:
   * "event: message\ndata: {...json...}\n\n"
   * 
   * @param body - Raw SSE response body
   * @returns Parsed JSON-RPC response
   */
  private parseSseResponse<T>(body: string): McpJsonRpcResponse<T> {
    const lines = body.split('\n');
    let jsonData: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        // Extract JSON from "data: {...}"
        jsonData = trimmed.slice(5).trim();
        break;
      }
    }

    if (!jsonData) {
      throw new Error('No data field found in SSE response');
    }

    return JSON.parse(jsonData) as McpJsonRpcResponse<T>;
  }

  private parseHttpStatusCode(messageLower: string): number | null {
    const match = messageLower.match(/\bhttp\s+(\d{3})\b/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
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

