# Story 3.6: Tool Execution Logging

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: Langfuse already captures tool executions via SDK instrumentation

## Story

As a **platform admin**,
I want to see all tool executions and their results,
So that I can debug issues and audit tool usage.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3.3 Tool Execution with Timeout | required | `executeToolWithTimeout()` function to wrap |
| 3.4 Multiple MCP Servers | required | Server metadata for tool attribution |
| 1.2 Langfuse Instrumentation | ✅ done | `startActiveObservation` for tracing |

## Acceptance Criteria

1. **Given** tools are being executed, **When** a tool call completes (success or failure), **Then** the execution is logged via Langfuse (FR39)

2. **Given** logging is active, **When** logs are reviewed, **Then** logs include: tool name, arguments (sanitized), result summary, duration, success/failure status

3. **Given** traces are created, **When** viewing in Langfuse, **Then** tool execution spans are visible as child spans under the agent execution

4. **Given** a tool fails, **When** the failure is logged, **Then** error details include: error code, message, and stack trace (in debug mode)

5. **Given** structured logging is required, **When** logs are written, **Then** structured JSON logging format is used per AR12

6. **Given** sensitive data exists in arguments, **When** logging, **Then** sensitive fields are redacted (passwords, tokens, keys)

## Tasks / Subtasks

- [ ] **Task 1: Create Tool Execution Logger** (AC: #1, #2, #5)
  - [ ] Create `src/observability/tool-logger.ts`
  - [ ] Define `ToolExecutionLogEntry` interface
  - [ ] Implement `logToolExecution(execution: ToolExecution)` function
  - [ ] Use structured JSON format per AR12

- [ ] **Task 2: Create Langfuse Tool Spans** (AC: #3)
  - [ ] Create child span for each tool execution
  - [ ] Nest under parent agent execution span
  - [ ] Include tool metadata in span attributes
  - [ ] Set span status based on success/failure

- [ ] **Task 3: Implement Success Logging** (AC: #2)
  - [ ] Log: tool name, server, duration
  - [ ] Log: sanitized arguments
  - [ ] Log: result summary (truncated if large)
  - [ ] Include trace ID for correlation

- [ ] **Task 4: Implement Failure Logging** (AC: #4)
  - [ ] Log: error code, message
  - [ ] Include stack trace in debug mode only
  - [ ] Log: timeout duration if timeout
  - [ ] Log: retry count if retried

- [ ] **Task 5: Implement Argument Sanitization** (AC: #6)
  - [ ] Create `sanitizeArguments(args)` function
  - [ ] Redact fields matching sensitive patterns
  - [ ] Truncate large string values
  - [ ] Handle nested objects recursively

- [ ] **Task 6: Integrate with Tool Executor** (AC: all)
  - [ ] Update `executeToolWithTimeout` to call logger
  - [ ] Pass execution context (parent trace, server)
  - [ ] Ensure logging doesn't block execution

- [ ] **Task 7: Create Log Analysis Helpers** (AC: #2)
  - [ ] Create `getToolExecutionStats(timeRange)` function
  - [ ] Compute: success rate, average duration, error distribution
  - [ ] Support filtering by tool name, server

- [ ] **Task 8: Create Tests** (AC: all)
  - [ ] Create `src/observability/tool-logger.test.ts`
  - [ ] Test success logging
  - [ ] Test failure logging
  - [ ] Test argument sanitization
  - [ ] Test structured format compliance

- [ ] **Task 9: Verification** (AC: all)
  - [ ] Execute tool via Orion
  - [ ] Check Langfuse for tool span
  - [ ] Verify all fields logged correctly
  - [ ] Test with tool failure, verify error logged

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR39 | prd.md | System logs all tool executions and their results |
| AR12 | architecture.md | Structured JSON logging for all log statements |
| AR11 | architecture.md | All handlers wrapped in Langfuse traces |

### Logging Format per AR12

```typescript
interface LogEntry {
  timestamp: string;        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;            // snake_case event name
  traceId?: string;         // Langfuse trace ID
  userId?: string;          // Slack user ID
  duration?: number;        // Milliseconds
  [key: string]: unknown;   // Additional context
}
```

### src/observability/tool-logger.ts

```typescript
import { startActiveObservation, getActiveTrace } from '@langfuse/tracing';
import { logger } from '../utils/logger.js';

/**
 * Tool execution details for logging
 */
export interface ToolExecutionDetails {
  toolName: string;
  serverName: string;
  arguments: Record<string, unknown>;
  startTime: Date;
  endTime: Date;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Structured log entry for tool execution (per AR12)
 */
export interface ToolExecutionLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: 'tool_execution';
  traceId?: string;
  userId?: string;
  duration: number;
  tool: {
    name: string;
    server: string;
    arguments: Record<string, unknown>;
  };
  result: {
    success: boolean;
    output?: unknown;
    error?: {
      code: string;
      message: string;
    };
  };
}

/**
 * Sensitive field patterns for redaction
 */
const SENSITIVE_PATTERNS = [
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'credential',
  'api_key',
  'apikey',
  'bearer',
  'private',
];

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_RESULT_SIZE = 2000;

/**
 * Log a tool execution with structured format
 */
export function logToolExecution(
  details: ToolExecutionDetails,
  options: { userId?: string; debug?: boolean } = {}
): void {
  const duration = details.endTime.getTime() - details.startTime.getTime();
  const sanitizedArgs = sanitizeArguments(details.arguments);
  const resultSummary = summarizeResult(details.result);

  const entry: ToolExecutionLogEntry = {
    timestamp: details.endTime.toISOString(),
    level: details.success ? 'info' : 'error',
    event: 'tool_execution',
    traceId: getActiveTraceId(),
    userId: options.userId,
    duration,
    tool: {
      name: details.toolName,
      server: details.serverName,
      arguments: sanitizedArgs,
    },
    result: {
      success: details.success,
      output: details.success ? resultSummary : undefined,
      error: details.error ? {
        code: details.error.code,
        message: details.error.message,
      } : undefined,
    },
  };

  // Log using structured logger
  if (details.success) {
    logger.info(entry);
  } else {
    logger.error({
      ...entry,
      // Include stack trace only in debug mode
      ...(options.debug && details.error?.stack && {
        stack: details.error.stack,
      }),
    });
  }
}

/**
 * Create a Langfuse span for tool execution
 * 
 * Returns a function to end the span with results
 */
export function createToolExecutionSpan(
  toolName: string,
  serverName: string,
  sanitizedArgs: Record<string, unknown>
): (result: { success: boolean; output?: unknown; error?: unknown }) => void {
  const spanId = `tool-${toolName}-${Date.now()}`;
  const startTime = Date.now();

  // Start span (this will be a child of the current trace)
  startActiveObservation(spanId, async (span) => {
    span.update({
      name: `tool:${toolName}`,
      metadata: {
        toolName,
        serverName,
        arguments: sanitizedArgs,
      },
    });
  });

  // Return function to end span
  return (result) => {
    const duration = Date.now() - startTime;
    
    startActiveObservation(spanId, async (span) => {
      span.update({
        output: result.success ? summarizeResult(result.output) : undefined,
        level: result.success ? 'DEFAULT' : 'ERROR',
        statusMessage: result.success 
          ? `Completed in ${duration}ms` 
          : `Failed: ${result.error}`,
      });
    });
  };
}

/**
 * Sanitize arguments by redacting sensitive fields
 */
export function sanitizeArguments(
  args: Record<string, unknown>,
  depth: number = 0
): Record<string, unknown> {
  if (depth > 5) return { _truncated: 'Max depth exceeded' };

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key matches sensitive patterns
    if (SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern))) {
      sanitized[key] = REDACTED;
      continue;
    }

    // Handle different value types
    if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] = value.length > MAX_STRING_LENGTH 
        ? value.substring(0, MAX_STRING_LENGTH) + '...[truncated]'
        : value;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeArguments(value as Record<string, unknown>, depth + 1);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.length > 10 
        ? [...value.slice(0, 10), `...[${value.length - 10} more]`]
        : value;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Summarize result for logging (truncate if large)
 */
function summarizeResult(result: unknown): unknown {
  if (result === null || result === undefined) return result;

  const serialized = JSON.stringify(result);
  
  if (serialized.length <= MAX_RESULT_SIZE) {
    return result;
  }

  // Summarize large results
  if (Array.isArray(result)) {
    return {
      _type: 'array',
      _count: result.length,
      _preview: result.slice(0, 3),
      _truncated: true,
    };
  }

  if (typeof result === 'object') {
    const keys = Object.keys(result);
    const preview: Record<string, unknown> = {};
    let size = 0;
    
    for (const key of keys.slice(0, 5)) {
      const val = (result as Record<string, unknown>)[key];
      const valSize = JSON.stringify(val).length;
      if (size + valSize < MAX_RESULT_SIZE / 2) {
        preview[key] = val;
        size += valSize;
      } else {
        preview[key] = '[truncated]';
      }
    }

    return {
      _type: 'object',
      _keyCount: keys.length,
      _preview: preview,
      _truncated: keys.length > 5,
    };
  }

  if (typeof result === 'string') {
    return result.substring(0, MAX_RESULT_SIZE) + '...[truncated]';
  }

  return result;
}

/**
 * Get current trace ID from Langfuse context
 */
function getActiveTraceId(): string | undefined {
  try {
    const trace = getActiveTrace();
    return trace?.id;
  } catch {
    return undefined;
  }
}

/**
 * Compute tool execution statistics for a time range
 */
export interface ToolExecutionStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDuration: number;
  errorDistribution: Record<string, number>;
  byTool: Record<string, {
    count: number;
    successRate: number;
    avgDuration: number;
  }>;
}

// Note: Actual stats computation would query Langfuse API
// This is a placeholder for the interface
export async function getToolExecutionStats(
  _timeRangeHours: number = 24
): Promise<ToolExecutionStats> {
  // In production, query Langfuse for traces with event='tool_execution'
  // Aggregate and compute stats
  
  return {
    totalExecutions: 0,
    successCount: 0,
    failureCount: 0,
    successRate: 0,
    averageDuration: 0,
    errorDistribution: {},
    byTool: {},
  };
}
```

### src/observability/tool-logger.test.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  logToolExecution, 
  sanitizeArguments,
  type ToolExecutionDetails 
} from './tool-logger.js';
import { logger } from '../utils/logger.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Tool Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logToolExecution', () => {
    const baseDetails: ToolExecutionDetails = {
      toolName: 'github_search',
      serverName: 'github',
      arguments: { query: 'test' },
      startTime: new Date('2025-01-01T00:00:00Z'),
      endTime: new Date('2025-01-01T00:00:01Z'),
      success: true,
      result: { items: [1, 2, 3] },
    };

    it('logs successful execution with info level', () => {
      logToolExecution(baseDetails);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool_execution',
          level: 'info',
          duration: 1000,
          tool: expect.objectContaining({
            name: 'github_search',
            server: 'github',
          }),
          result: expect.objectContaining({
            success: true,
          }),
        })
      );
    });

    it('logs failed execution with error level', () => {
      const failedDetails: ToolExecutionDetails = {
        ...baseDetails,
        success: false,
        result: undefined,
        error: {
          code: 'TOOL_TIMEOUT',
          message: 'Tool timed out after 30000ms',
        },
      };

      logToolExecution(failedDetails);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          result: expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              code: 'TOOL_TIMEOUT',
            }),
          }),
        })
      );
    });

    it('includes stack trace only in debug mode', () => {
      const failedDetails: ToolExecutionDetails = {
        ...baseDetails,
        success: false,
        error: {
          code: 'TOOL_FAILED',
          message: 'Failed',
          stack: 'Error: Failed\n    at test.ts:10',
        },
      };

      // Without debug mode
      logToolExecution(failedDetails);
      expect(logger.error).toHaveBeenCalledWith(
        expect.not.objectContaining({ stack: expect.any(String) })
      );

      // With debug mode
      vi.clearAllMocks();
      logToolExecution(failedDetails, { debug: true });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ stack: expect.any(String) })
      );
    });
  });

  describe('sanitizeArguments', () => {
    it('redacts password fields', () => {
      const args = { username: 'john', password: 'secret123' };
      const result = sanitizeArguments(args);

      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
    });

    it('redacts token and api_key fields', () => {
      const args = { 
        token: 'abc123', 
        api_key: 'xyz789',
        apiKey: 'def456',
      };
      const result = sanitizeArguments(args);

      expect(result.token).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('truncates long strings', () => {
      const longString = 'a'.repeat(1000);
      const args = { content: longString };
      const result = sanitizeArguments(args);

      expect(result.content).toContain('[truncated]');
      expect((result.content as string).length).toBeLessThan(600);
    });

    it('handles nested objects', () => {
      const args = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
          },
        },
      };
      const result = sanitizeArguments(args);

      expect((result.user as any).name).toBe('John');
      expect((result.user as any).credentials.password).toBe('[REDACTED]');
    });

    it('truncates large arrays', () => {
      const args = { items: Array(20).fill(1) };
      const result = sanitizeArguments(args);

      expect((result.items as any[]).length).toBe(11); // 10 + truncation message
      expect((result.items as any[])[10]).toContain('more');
    });
  });
});
```

### Integration with Tool Executor

```typescript
// In src/tools/execution.ts - add logging

import { logToolExecution, sanitizeArguments, createToolExecutionSpan } from '../observability/tool-logger.js';

export async function executeToolWithTimeout<T>(
  toolName: string,
  executor: () => Promise<T>,
  options: { timeout?: number; serverName?: string; sanitizedArgs?: Record<string, unknown> } = {}
): Promise<ToolResult<T>> {
  const startTime = new Date();
  const sanitizedArgs = options.sanitizedArgs ?? {};
  
  // Create span for this execution
  const endSpan = createToolExecutionSpan(toolName, options.serverName ?? 'unknown', sanitizedArgs);

  try {
    const data = await withTimeout(executor(), options.timeout ?? TOOL_TIMEOUT_MS, toolName);
    const endTime = new Date();

    // Log success
    logToolExecution({
      toolName,
      serverName: options.serverName ?? 'unknown',
      arguments: sanitizedArgs,
      startTime,
      endTime,
      success: true,
      result: data,
    });

    endSpan({ success: true, output: data });

    return { success: true, toolName, data, duration: endTime.getTime() - startTime.getTime() };
  } catch (error) {
    const endTime = new Date();
    const orionError = /* ... error handling ... */;

    // Log failure
    logToolExecution({
      toolName,
      serverName: options.serverName ?? 'unknown',
      arguments: sanitizedArgs,
      startTime,
      endTime,
      success: false,
      error: {
        code: orionError.code,
        message: orionError.message,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    endSpan({ success: false, error: orionError.message });

    return { success: false, toolName, error: orionError, duration: endTime.getTime() - startTime.getTime() };
  }
}
```

### Project Structure Notes

Files created:
- `src/observability/tool-logger.ts` — Tool execution logging
- `src/observability/tool-logger.test.ts` — Tests

Files modified:
- `src/tools/execution.ts` — Integrate logging

### References

- [Source: _bmad-output/prd.md#FR39] — System logs all tool executions
- [Source: _bmad-output/architecture.md#AR12] — Structured JSON logging
- [Source: _bmad-output/architecture.md#AR11] — Langfuse trace wrapping

## Dev Agent Record

### Agent Model Used

_To be filled by implementing agent_

### Completion Notes List

_To be filled during implementation_

### Debug Log

_To be filled during implementation_

### File List

Files to create:
- `src/observability/tool-logger.ts`
- `src/observability/tool-logger.test.ts`

Files to modify:
- `src/tools/execution.ts`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story enhanced with full implementation guidance |
