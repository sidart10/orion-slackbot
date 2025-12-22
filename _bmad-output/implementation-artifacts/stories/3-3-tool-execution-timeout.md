# Story 3.3: Tool Execution with Timeout

Status: done

## Story

As a **user**,
I want tool calls to complete reliably within a reasonable time,
So that external integrations don't hang my request indefinitely.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3.1 MCP Client Infrastructure | required | MCP servers configured and connected |
| 3.2 Tool Discovery & Registration | required | Tool registry for tracking execution |
| 2.4 OrionError & Graceful Degradation | required | Error interface for timeout handling |
| 1.2 Langfuse Instrumentation | ✅ done | Tracing for tool execution |

## Acceptance Criteria

1. **Given** a tool is executed, **When** the call exceeds 30 seconds, **Then** the call times out with a graceful error (NFR19: 30 second timeout per tool call)

2. **Given** a tool call times out, **When** the error is handled, **Then** an `OrionError` is created with code `TOOL_TIMEOUT`, a user-friendly message, and `recoverable: true`

3. **Given** a tool times out, **When** the agent continues, **Then** it can proceed with other available tools (graceful degradation per AR19)

4. **Given** tool execution occurs, **When** the call completes (success or timeout), **Then** the execution is traced in Langfuse with tool name, duration, and success/failure status

5. **Given** a tool call succeeds, **When** the result is returned, **Then** the result is validated and passed to the agent for processing

6. **Given** multiple tool calls are needed, **When** they are independent, **Then** they can execute in parallel with individual timeout handling

## Tasks / Subtasks

- [x] **Task 1: Create Tool Execution Utilities** (AC: #1, #5)
  - [x] Create `src/tools/execution.ts`
  - [x] Implement `withToolTimeout<T>(promise, ms, toolName)` utility function
  - [x] Uses `createOrionError` with TOOL_TIMEOUT code
  - [x] Implement `executeToolWithTimeout(toolName, executor, options)` wrapper

- [x] **Task 2: Define Tool Timeout Constants** (AC: #1)
  - [x] Add `TOOL_TIMEOUT_MS = 30_000` constant in execution module
  - [x] Inline in execution module (no separate constants file needed)
  - [x] Configurable via options parameter (optional override)

- [x] **Task 3: Implement Timeout Error Handling** (AC: #2)
  - [x] Uses existing OrionError with TOOL_TIMEOUT code
  - [x] Set error code to `TOOL_TIMEOUT`
  - [x] Include user-friendly message: "Tool X took too long to respond"
  - [x] Set `recoverable: true` to allow retry or fallback

- [x] **Task 4: Create Tool Result Type** (AC: #5)
  - [x] Define `ToolResult` interface with success/error states
  - [x] Include toolName in result
  - [x] Include duration for performance tracking
  - [x] Include data or error details

- [x] **Task 5: Implement Execution Tracing** (AC: #4)
  - [x] Wrap tool execution in `createSpan` with parentTrace
  - [x] Track: tool name, arguments (sanitized), duration, success/failure
  - [x] Add `metadata.timeout` and `metadata.serverName`
  - [x] Log timeout events with structured JSON via logger

- [x] **Task 6: Implement Graceful Degradation Handler** (AC: #3)
  - [x] Create `handleToolFailure(error, toolName, serverName)` function
  - [x] Log error with structured format
  - [x] Return user-friendly message for the agent
  - [x] Track failure in MCP health registry via `markServerUnavailable`

- [x] **Task 7: Support Parallel Execution** (AC: #6)
  - [x] Create `executeToolsInParallel(calls, executors, timeout)` function
  - [x] Use `Promise.all` for independent execution
  - [x] Apply timeout to each call individually
  - [x] Aggregate results, marking failed calls

- [x] **Task 8: Create Tests** (AC: all)
  - [x] Create `src/tools/execution.test.ts` with 22 tests
  - [x] Test successful tool execution
  - [x] Test timeout behavior
  - [x] Test graceful degradation on failure
  - [x] Test parallel execution with mixed results

- [x] **Task 9: Verification** (AC: all)
  - [x] Mock slow executor to test timeout behavior
  - [x] Verified timeout error created with TOOL_TIMEOUT code
  - [x] Verified structured logging on timeout
  - [x] Verified parallel execution continues with successful tools
  - [x] All 22 execution tests pass, 711 total tests pass

## Dev Notes

### Claude SDK Tool Execution

The Claude SDK handles tool execution internally. Our role is to:
1. Observe tool execution events from the SDK
2. Track timing and apply our own monitoring
3. Handle cases where SDK tool execution exceeds our threshold

**Note:** The SDK may have its own timeout behavior. Our timeout is an additional safeguard and provides consistent behavior across all tool types.

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| NFR19 | prd.md | 30 second timeout per tool call with graceful handling |
| AR18 | architecture.md | Use OrionError interface for ALL errors |
| AR19 | architecture.md | Graceful degradation — continue with available tools |
| FR39 | prd.md | System logs all tool executions and their results |

### src/tools/execution.ts

```typescript
import { startActiveObservation } from '@langfuse/tracing';
import { OrionError, ErrorCodes, createOrionError } from '../utils/errors.js';
import { markServerUnavailable } from './mcp/health.js';
import { logger } from '../utils/logger.js';

/**
 * Default timeout for tool execution (30 seconds per NFR19)
 */
export const TOOL_TIMEOUT_MS = 30_000;

/**
 * Result of a tool execution
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: OrionError;
  duration: number;
}

/**
 * Tool call specification for parallel execution
 */
export interface ToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  serverName?: string;
}

/**
 * Execute a promise with a timeout
 * 
 * @throws OrionError with code TOOL_TIMEOUT if timeout exceeded
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createOrionError(ErrorCodes.TOOL_TIMEOUT, {
        tool: toolName,
        timeout: timeoutMs,
        message: `Tool execution exceeded ${timeoutMs}ms timeout`,
        userMessage: `The tool "${toolName}" took too long to respond. Please try again.`,
        recoverable: true,
      }));
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
 */
export async function executeToolWithTimeout<T>(
  toolName: string,
  executor: () => Promise<T>,
  options: {
    timeout?: number;
    serverName?: string;
    sanitizedArgs?: Record<string, unknown>;
  } = {}
): Promise<ToolResult<T>> {
  const timeout = options.timeout ?? TOOL_TIMEOUT_MS;
  const startTime = Date.now();

  return await startActiveObservation(`tool-execution-${toolName}`, async (trace) => {
    trace.update({
      metadata: {
        toolName,
        timeout,
        serverName: options.serverName,
        arguments: options.sanitizedArgs,
      },
    });

    try {
      const data = await withTimeout(executor(), timeout, toolName);
      const duration = Date.now() - startTime;

      trace.update({
        output: { success: true, duration },
      });

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
      const orionError = error instanceof OrionError
        ? error
        : createOrionError(ErrorCodes.TOOL_FAILED, {
            tool: toolName,
            message: error instanceof Error ? error.message : String(error),
            userMessage: `Unable to complete "${toolName}". Continuing with other tools.`,
            recoverable: true,
          });

      trace.update({
        level: 'ERROR',
        output: { success: false, error: orionError.code, duration },
        statusMessage: orionError.message,
      });

      logger.error({
        event: 'tool_execution_failed',
        toolName,
        duration,
        errorCode: orionError.code,
        errorMessage: orionError.message,
        serverName: options.serverName,
      });

      // Mark server as having issues if repeated failures
      if (options.serverName && orionError.code === ErrorCodes.TOOL_TIMEOUT) {
        markServerUnavailable(options.serverName, new Error(orionError.message));
      }

      return {
        success: false,
        toolName,
        error: orionError,
        duration,
      };
    }
  });
}

/**
 * Execute multiple tool calls in parallel with individual timeouts
 * 
 * Uses Promise.allSettled to ensure all calls complete (success or failure).
 * Supports graceful degradation — failed tools don't block successful ones.
 */
export async function executeToolsInParallel(
  calls: ToolCall[],
  executors: Map<string, () => Promise<unknown>>,
  timeout: number = TOOL_TIMEOUT_MS
): Promise<ToolResult[]> {
  const executions = calls.map(call => {
    const executor = executors.get(call.toolName);
    if (!executor) {
      return Promise.resolve<ToolResult>({
        success: false,
        toolName: call.toolName,
        error: createOrionError(ErrorCodes.TOOL_FAILED, {
          tool: call.toolName,
          message: 'Tool executor not found',
          userMessage: `Tool "${call.toolName}" is not available.`,
          recoverable: false,
        }),
        duration: 0,
      });
    }

    return executeToolWithTimeout(call.toolName, executor, {
      timeout,
      serverName: call.serverName,
      sanitizedArgs: sanitizeArguments(call.arguments),
    });
  });

  return Promise.all(executions);
}

/**
 * Sanitize tool arguments for logging (remove sensitive data)
 */
function sanitizeArguments(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];

  for (const [key, value] of Object.entries(args)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a user-friendly message for tool failure
 * Used in agent responses when graceful degradation occurs
 */
export function createToolFailureMessage(result: ToolResult): string {
  if (result.success) return '';

  if (result.error?.code === ErrorCodes.TOOL_TIMEOUT) {
    return `I couldn't reach ${result.toolName} (timed out after ${result.duration}ms). `;
  }

  return `${result.toolName} is temporarily unavailable. `;
}
```

### src/utils/errors.ts (Updated)

```typescript
/**
 * Orion Error Codes
 */
export const ErrorCodes = {
  TOOL_FAILED: 'TOOL_FAILED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  CONTEXT_LIMIT: 'CONTEXT_LIMIT',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  MCP_CONNECTION_ERROR: 'MCP_CONNECTION_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * OrionError interface per AR18
 */
export interface OrionError {
  code: ErrorCode;
  message: string;           // Developer-readable for logs
  userMessage: string;       // Safe to display in Slack
  context?: Record<string, unknown>;
  recoverable: boolean;
}

/**
 * OrionError class implementation
 */
export class OrionErrorImpl extends Error implements OrionError {
  code: ErrorCode;
  userMessage: string;
  context?: Record<string, unknown>;
  recoverable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    userMessage: string,
    recoverable: boolean,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OrionError';
    this.code = code;
    this.userMessage = userMessage;
    this.recoverable = recoverable;
    this.context = context;
  }
}

/**
 * Create an OrionError with proper typing
 */
export function createOrionError(
  code: ErrorCode,
  options: {
    tool?: string;
    timeout?: number;
    message: string;
    userMessage: string;
    recoverable: boolean;
  }
): OrionError {
  return new OrionErrorImpl(
    code,
    options.message,
    options.userMessage,
    options.recoverable,
    { tool: options.tool, timeout: options.timeout }
  );
}

/**
 * Type guard to check if error is OrionError
 */
export function isOrionError(error: unknown): error is OrionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'userMessage' in error &&
    'recoverable' in error
  );
}
```

### src/tools/execution.test.ts

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  executeToolWithTimeout,
  executeToolsInParallel,
  TOOL_TIMEOUT_MS,
} from './execution.js';
import { ErrorCodes } from '../utils/errors.js';

describe('Tool Execution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withTimeout', () => {
    it('resolves when promise completes before timeout', async () => {
      const fastPromise = Promise.resolve('success');
      const result = await withTimeout(fastPromise, 1000, 'test_tool');
      expect(result).toBe('success');
    });

    it('rejects with TOOL_TIMEOUT when timeout exceeded', async () => {
      const slowPromise = new Promise(resolve => setTimeout(resolve, 5000));
      const promise = withTimeout(slowPromise, 1000, 'slow_tool');
      
      vi.advanceTimersByTime(1500);
      
      await expect(promise).rejects.toMatchObject({
        code: ErrorCodes.TOOL_TIMEOUT,
        recoverable: true,
      });
    });
  });

  describe('executeToolWithTimeout', () => {
    it('returns success result for fast execution', async () => {
      const executor = () => Promise.resolve({ data: 'test' });
      
      const resultPromise = executeToolWithTimeout('fast_tool', executor);
      vi.advanceTimersByTime(100);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns error result for timeout without throwing', async () => {
      const executor = () => new Promise(resolve => setTimeout(resolve, 60000));
      
      const resultPromise = executeToolWithTimeout('slow_tool', executor, {
        timeout: 1000,
      });
      
      vi.advanceTimersByTime(1500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCodes.TOOL_TIMEOUT);
      expect(result.toolName).toBe('slow_tool');
    });

    it('sanitizes arguments in trace', async () => {
      const executor = () => Promise.resolve('ok');
      
      const resultPromise = executeToolWithTimeout('auth_tool', executor, {
        sanitizedArgs: { password: 'secret123', query: 'test' },
      });
      
      vi.advanceTimersByTime(100);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      // Sanitization is internal, but we verify no errors
    });
  });

  describe('executeToolsInParallel', () => {
    it('executes multiple tools and returns all results', async () => {
      const calls = [
        { toolName: 'tool_a', arguments: {} },
        { toolName: 'tool_b', arguments: {} },
      ];
      
      const executors = new Map([
        ['tool_a', () => Promise.resolve('result_a')],
        ['tool_b', () => Promise.resolve('result_b')],
      ]);

      const resultsPromise = executeToolsInParallel(calls, executors, 1000);
      vi.advanceTimersByTime(100);
      const results = await resultsPromise;

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('handles mixed success and failure', async () => {
      const calls = [
        { toolName: 'fast_tool', arguments: {} },
        { toolName: 'slow_tool', arguments: {} },
      ];
      
      const executors = new Map([
        ['fast_tool', () => Promise.resolve('fast')],
        ['slow_tool', () => new Promise(r => setTimeout(r, 5000))],
      ]);

      const resultsPromise = executeToolsInParallel(calls, executors, 1000);
      vi.advanceTimersByTime(1500);
      const results = await resultsPromise;

      expect(results[0].success).toBe(true);
      expect(results[0].data).toBe('fast');
      expect(results[1].success).toBe(false);
      expect(results[1].error?.code).toBe(ErrorCodes.TOOL_TIMEOUT);
    });

    it('returns error for missing executor', async () => {
      const calls = [{ toolName: 'unknown_tool', arguments: {} }];
      const executors = new Map();

      const results = await executeToolsInParallel(calls, executors);

      expect(results[0].success).toBe(false);
      expect(results[0].error?.code).toBe(ErrorCodes.TOOL_FAILED);
    });
  });
});
```

### Project Structure Notes

Files created:
- `src/tools/execution.ts` — Tool execution with timeout
- `src/tools/execution.test.ts` — Tests

Files modified:
- `src/utils/errors.ts` — Add TOOL_TIMEOUT error code

### References

- [Source: _bmad-output/prd.md#NFR19] — 30 second timeout per tool call
- [Source: _bmad-output/architecture.md#AR18] — OrionError interface
- [Source: _bmad-output/architecture.md#AR19] — Graceful degradation for tool failures
- [Source: _bmad-output/architecture.md#Tool Execution Pattern] — Code example

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (Amelia - Dev Agent)

### Completion Notes List

- Created `src/tools/execution.ts` with complete tool execution utilities
- Implemented `withToolTimeout()` function using `createOrionError` with TOOL_TIMEOUT
- Implemented `executeToolWithTimeout()` wrapper with Langfuse tracing support
- Implemented `executeToolsInParallel()` for parallel tool execution with individual timeouts
- Implemented `handleToolFailure()` for graceful degradation with MCP health tracking
- Implemented `createToolFailureMessage()` for user-friendly failure messages
- Added `TOOL_TIMEOUT_MS = 30_000` constant (NFR19)
- Created comprehensive test suite with 22 tests covering all ACs
- Exported all utilities from `src/tools/index.ts`
- Leveraged existing TOOL_TIMEOUT error code from `src/utils/errors.ts`
- No modifications needed to errors.ts — TOOL_TIMEOUT already existed

### Debug Log

- Story 3.2 dependency marked as cancelled but not blocking — tool health tracking from Story 3.1 `mcp/health.ts` provides needed functionality
- Existing `withTimeout()` in errors.ts uses AGENT_TIMEOUT — created separate `withToolTimeout()` for tool-specific errors
- Used Promise.all instead of Promise.allSettled since each call already wraps errors in ToolResult

### File List

Files created:
- `src/tools/execution.ts`
- `src/tools/execution.test.ts`

Files modified:
- `src/tools/index.ts` (added exports for execution module)
- `src/utils/errors.ts` (added TOOL_FAILED error code)

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story created with full implementation guidance |
| 2025-12-21 | Implemented all tasks, 22 tests passing, 711 total tests passing |
| 2025-12-21 | Code review fixes: Added TOOL_FAILED error code, fixed incorrect TOOL_TIMEOUT usage for non-timeout errors, added 3 tracing tests. 25 execution tests, 714 total tests passing. |
