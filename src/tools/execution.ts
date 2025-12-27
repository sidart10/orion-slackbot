/**
 * Tool Execution Module
 *
 * Provides tool execution with timeout handling, graceful degradation,
 * and parallel execution support for MCP tools.
 *
 * Key features:
 * - 30 second timeout per tool call (NFR19)
 * - TOOL_TIMEOUT error with recoverable flag
 * - Graceful degradation — continues with other tools
 * - Parallel execution with Promise.all
 * - Langfuse tracing for observability
 *
 * @see Story 3.3 - Tool Execution with Timeout
 * @see AC#1 - 30 second timeout per tool call
 * @see AC#2 - OrionError with TOOL_TIMEOUT code
 * @see AC#3 - Graceful degradation for tool failures
 * @see AC#4 - Langfuse tracing with tool name, duration, success/failure
 * @see AC#5 - Result validation and passing to agent
 * @see AC#6 - Parallel execution with individual timeout handling
 */

import { createOrionError, ErrorCode, type OrionError, isOrionError } from '../utils/errors.js';
import { markServerUnavailable } from './mcp/health.js';
import { logger } from '../utils/logger.js';
import { createSpan } from '../observability/tracing.js';
import type { LangfuseTrace } from '../observability/langfuse.js';

/**
 * Default timeout for tool execution (30 seconds per NFR19)
 */
export const TOOL_TIMEOUT_MS = 30_000;

/**
 * Result of a tool execution
 *
 * @see AC#5 - Result includes success/error states, tool name, duration
 */
export interface ToolResult<T = unknown> {
  /** Whether the execution succeeded */
  success: boolean;
  /** Name of the tool that was executed */
  toolName: string;
  /** Result data if successful */
  data?: T;
  /** Error if failed */
  error?: OrionError;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Tool call specification for parallel execution
 *
 * @see AC#6 - Independent tool calls can execute in parallel
 */
export interface ToolCall {
  /** Name of the tool to execute */
  toolName: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, unknown>;
  /** Optional MCP server name for tracking */
  serverName?: string;
}

/**
 * Options for tool execution
 */
export interface ExecuteToolOptions {
  /** Custom timeout in milliseconds (default: TOOL_TIMEOUT_MS) */
  timeout?: number;
  /** MCP server name for health tracking */
  serverName?: string;
  /** Sanitized arguments for logging (sensitive data removed) */
  sanitizedArgs?: Record<string, unknown>;
  /** Parent Langfuse trace for observability */
  parentTrace?: LangfuseTrace;
}

/**
 * Execute a promise with a tool-specific timeout
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param toolName - Name of the tool for error messages
 * @returns The resolved value
 * @throws OrionError with code TOOL_TIMEOUT if timeout exceeded
 *
 * @see AC#1 - 30 second timeout per tool call
 * @see AC#2 - OrionError with TOOL_TIMEOUT, user-friendly message, recoverable: true
 */
export async function withToolTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        createOrionError(
          ErrorCode.TOOL_TIMEOUT,
          `Tool "${toolName}" exceeded ${timeoutMs}ms timeout`,
          {
            userMessage: `The tool "${toolName}" took too long to respond. Please try again.`,
            recoverable: true,
            metadata: { toolName, timeout: timeoutMs },
          }
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Execute a tool with timeout and tracing
 *
 * Returns a ToolResult with either data or error, never throws.
 * This enables graceful degradation per AR19.
 *
 * @param toolName - Name of the tool
 * @param executor - Function that executes the tool
 * @param options - Execution options
 * @returns ToolResult with success/error status
 *
 * @see AC#3 - Graceful degradation — continue with available tools
 * @see AC#4 - Traced in Langfuse with tool name, duration, success/failure
 * @see AC#5 - Result validated and passed to agent
 */
export async function executeToolWithTimeout<T>(
  toolName: string,
  executor: () => Promise<T>,
  options: ExecuteToolOptions = {}
): Promise<ToolResult<T>> {
  const timeout = options.timeout ?? TOOL_TIMEOUT_MS;
  const startTime = Date.now();

  // Create Langfuse span if parent trace provided
  const span = options.parentTrace
    ? createSpan(options.parentTrace, {
        name: `tool-execution-${toolName}`,
        input: {
          toolName,
          timeout,
          serverName: options.serverName,
          arguments: options.sanitizedArgs,
        },
        metadata: {
          toolName,
          timeout,
          serverName: options.serverName,
        },
      })
    : null;

  try {
    const data = await withToolTimeout(executor(), timeout, toolName);
    const duration = Date.now() - startTime;

    // End span with success
    if (span) {
      span.end({
        output: { success: true, duration },
      });
    }

    logger.info({
      event: 'tool_execution_success',
      toolName,
      duration,
      serverName: options.serverName,
    });

    return {
      success: true,
      toolName,
      data,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Convert to OrionError if not already
    // Use TOOL_FAILED for generic errors, preserve TOOL_TIMEOUT for actual timeouts
    const orionError = isOrionError(error)
      ? error
      : createOrionError(
          ErrorCode.TOOL_FAILED,
          `Tool "${toolName}" failed: ${error instanceof Error ? error.message : String(error)}`,
          {
            userMessage: `Unable to complete "${toolName}". Continuing with other tools.`,
            recoverable: true,
            cause: error instanceof Error ? error : undefined,
          }
        );

    // End span with error
    if (span) {
      span.end({
        output: {
          success: false,
          error: orionError.code,
          duration,
        },
      });
    }

    logger.error({
      event: 'tool_execution_failed',
      toolName,
      duration,
      errorCode: orionError.code,
      errorMessage: orionError.message,
      serverName: options.serverName,
    });

    // Mark server as having issues if this was a timeout
    if (options.serverName && orionError.code === ErrorCode.TOOL_TIMEOUT) {
      markServerUnavailable(options.serverName, new Error(orionError.message));
    }

    return {
      success: false,
      toolName,
      error: orionError,
      duration,
    };
  }
}

/**
 * Execute multiple tool calls in parallel with individual timeouts
 *
 * Uses Promise.all to ensure all calls complete (success or failure).
 * Supports graceful degradation — failed tools don't block successful ones.
 *
 * @param calls - Array of tool calls to execute
 * @param executors - Map of tool name to executor function
 * @param timeout - Timeout in milliseconds (default: TOOL_TIMEOUT_MS)
 * @param parentTrace - Optional parent Langfuse trace
 * @returns Array of ToolResults
 *
 * @see AC#6 - Parallel execution with individual timeout handling
 */
export async function executeToolsInParallel(
  calls: ToolCall[],
  executors: Map<string, () => Promise<unknown>>,
  timeout: number = TOOL_TIMEOUT_MS,
  parentTrace?: LangfuseTrace
): Promise<ToolResult[]> {
  const executions = calls.map((call) => {
    const executor = executors.get(call.toolName);

    if (!executor) {
      // Return immediate error for missing executor
      return Promise.resolve<ToolResult>({
        success: false,
        toolName: call.toolName,
        error: createOrionError(
          ErrorCode.TOOL_FAILED,
          `Tool executor not found for "${call.toolName}"`,
          {
            userMessage: `Tool "${call.toolName}" is not available.`,
            recoverable: false,
          }
        ),
        duration: 0,
      });
    }

    return executeToolWithTimeout(call.toolName, executor, {
      timeout,
      serverName: call.serverName,
      sanitizedArgs: sanitizeArguments(call.arguments),
      parentTrace,
    });
  });

  return Promise.all(executions);
}

/**
 * Sanitize tool arguments for logging (remove sensitive data)
 *
 * @param args - Raw arguments object
 * @returns Sanitized arguments safe for logging
 */
function sanitizeArguments(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential', 'api_key'];

  for (const [key, value] of Object.entries(args)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a user-friendly message for tool failure
 *
 * Used in agent responses when graceful degradation occurs.
 *
 * @param result - The failed tool result
 * @returns Human-readable failure message
 *
 * @see AC#3 - Graceful degradation messaging
 */
export function createToolFailureMessage(result: ToolResult): string {
  if (result.success) return '';

  if (result.error?.code === ErrorCode.TOOL_TIMEOUT) {
    return `I couldn't reach ${result.toolName} (timed out after ${result.duration}ms). `;
  }

  return `${result.toolName} is temporarily unavailable. `;
}

/**
 * Handle tool failure with graceful degradation
 *
 * Logs the error, updates health tracking, and returns user-friendly message.
 *
 * @param error - The error that occurred
 * @param toolName - Name of the tool that failed
 * @param serverName - Optional MCP server name
 * @returns User-friendly error message
 *
 * @see AC#3 - Graceful degradation — continue with available tools
 */
export function handleToolFailure(
  error: Error | OrionError,
  toolName: string,
  serverName?: string
): string {
  const orionError = isOrionError(error)
    ? error
    : createOrionError(
        ErrorCode.TOOL_FAILED,
        `Tool "${toolName}" failed: ${error.message}`,
        {
          userMessage: `Unable to complete "${toolName}".`,
          recoverable: true,
          cause: error,
        }
      );

  logger.error({
    event: 'tool_failure_handled',
    toolName,
    serverName,
    errorCode: orionError.code,
    errorMessage: orionError.message,
  });

  // Mark server as having issues
  if (serverName) {
    const errorForHealth: Error = isOrionError(error)
      ? error.cause ?? new Error(error.message)
      : error;
    markServerUnavailable(serverName, errorForHealth);
  }

  return orionError.userMessage;
}

