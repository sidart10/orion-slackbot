# Story 3.3: Tool Execution & Error Handling

Status: done

## Story

As an **agent**,
I want robust tool execution with proper error handling, timeouts, and retries,
So that tool failures don't break the agent loop and users get helpful error messages.

## Acceptance Criteria

1. **Given** a tool call in the agent loop, **When** executed, **Then** the call has a configurable timeout (default 30s per NFR21)

2. **Given** a tool execution timeout, **When** 30s passes without response, **Then** `ToolResult<T>` is returned with `code: 'TOOL_EXECUTION_FAILED'`

3. **Given** a tool execution failure, **When** the error is transient (network, 5xx, timeout), **Then** retry with exponential backoff (1s, 2s, 4s; max 3 attempts per project-context.md)

4. **Given** a tool execution failure, **When** all retries exhausted, **Then** `ToolResult<T>` with error is returned (agent loop continues, no crash)

5. **Given** any tool execution, **When** complete, **Then** Langfuse spans capture: tool name, duration, success, attempts, traceId, and `ToolError.code` if failed

6. **Given** a tool that returns `isError: true`, **When** processed, **Then** Claude receives error as content (not thrown exception)

7. **Given** rate limit error (429), **When** detected, **Then** retry with longer backoff (30s) and log `code: 'RATE_LIMITED'`

## Current Repo Touchpoints (MUST USE)

These are the *actual* files and patterns in the repo today. This story MUST build on them (no parallel type systems, no invented APIs).

- **Agent loop + tool_use handling**: `src/agent/orion.ts`
  - Tool execution is currently stubbed (returns `TOOL_NOT_IMPLEMENTED` JSON).
- **Tool schemas**: `src/agent/tools.ts`
  - `getToolDefinitions()` currently returns `[]` (tools introduced by Epic 3).
- **Canonical ToolResult + ToolError**: `src/utils/tool-result.ts`
  - `ToolResult<T>` is the required return shape (never throw from tool execution path).
- **Langfuse**: `src/observability/langfuse.ts`
  - Use `getLangfuse()` then `trace(...).span(...)`.
- **Logging**: `src/utils/logger.ts`
  - Include `traceId` in logs when available.

## Tasks / Subtasks

### Task 0: Align Error Codes & ToolResult Types (BLOCKER)

- [x] Extend `ToolErrorCode` in `src/utils/tool-result.ts` to include codes used by Epic 3:
  - [x] `RATE_LIMITED`
  - [x] `MCP_CONNECTION_FAILED`
  - [x] (Optional) `TOOL_NOT_FOUND` (if router/registry needs it)
- [x] Do **not** introduce a second error-code system (`src/types/errors.ts`) unless you migrate all existing call sites.

### Task 1: Implement Timeout Wrapper w/ Abort Propagation (AC: #1, #2)

- [x] Create folder `src/tools/` (Epic 3 introduces this layer; it does not exist yet)
- [x] Create `src/tools/timeout.ts`
- [x] Implement `withTimeout(fn, timeoutMs)`:
  - [x] Uses `AbortController`
  - [x] Passes `AbortSignal` down into the underlying tool call
  - [x] Returns `ToolResult<T>` on timeout (no throw, no rejected promise leaking)

### Task 2: Implement Retry Logic (AC: #3, #4, #7)

- [x] Create `src/tools/retry.ts`
- [x] Implement `withRetry()` returning `ToolResult<T>` (executor must never throw)
- [x] Policy:
  - [x] Max **3 total attempts** (1 initial + up to 2 retries)
  - [x] Exponential backoff: 1s, 2s, 4s for transient failures
  - [x] 429: 30s backoff; code `RATE_LIMITED`
  - [x] No retries on 400/401/403/404

### Task 3: Implement Error Normalization (AC: #2, #6, #7)

- [x] Create `src/tools/errors.ts`
- [x] Convert unknown errors + MCP `{ isError: true }` into canonical `ToolError`:
  - [x] Timeout/abort → `TOOL_EXECUTION_FAILED` (retryable)
  - [x] 429/rate limit → `RATE_LIMITED` (retryable)
  - [x] MCP connection failures → `MCP_CONNECTION_FAILED` (retryable)
  - [x] Auth errors (401/403) → `TOOL_UNAVAILABLE` (not retryable)
- [x] Add `formatErrorForClaude()` (concise, actionable, token-efficient)

### Task 4: Observability Integration (AC: #5)

- [x] Use `getLangfuse()` from `src/observability/langfuse.ts`
- [x] Create a `tool.execute` span per tool call and include:
  - [x] tool name, durationMs, success, attempts
  - [x] traceId (store in metadata; also set `sessionId: traceId` on trace)
  - [x] error code/message when failed
- [x] Log retries as `tool.retry` with `traceId`

### Task 5: Create Tool Execution Wrapper (AC: all)

- [x] Create `src/tools/executor.ts`
- [x] Combine routing (Story 3.2 router) + timeout + retry + observability
- [x] Ensure tool_result content passed back to Claude is always a **string** (JSON stringify objects)
- [x] Never throw: catch everything and return `ToolResult<T>`

### Task 6: Wire Into Current Agent Loop (BLOCKER)

- [x] Update `src/agent/orion.ts`:
  - [x] Replace stubbed tool_result generation with real tool execution (via `executeTool(...)`)
  - [x] Ensure every tool_use block gets exactly one matching tool_result with same `tool_use_id`
  - [x] On tool failure: send error as content, continue loop

### Task 7: Verification

- [x] Timeout: aborts at 30s, returns ToolResult error (no throw)
- [x] Retry: retries transient failures, max 3 total attempts
- [x] Auth: NO retry on 401/403
- [x] 429: uses 30s backoff; returns `RATE_LIMITED` if exhausted
- [x] Langfuse: spans include tool, duration, attempts, success, traceId, and error code
- [x] Claude: receives error as tool_result content

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR39 | prd.md | System logs all tool executions and their results |
| NFR21 | prd.md | 30 second timeout per tool call |
| NFR15 | prd.md | Automatic retry with exponential backoff for transient failures |
| Max retries | project-context.md | 3 attempts per tool |
| ToolError.code | project-context.md | Use canonical `ToolErrorCode` union for tool errors (avoid parallel error-type systems) |
| ToolResult<T> | project-context.md | Never throw from tool execution path |

### File Locations

```
src/tools/               # NEW in Epic 3 (create this folder)
├── executor.ts          # Main execution wrapper
├── timeout.ts           # Timeout handling (AbortSignal propagation)
├── retry.ts             # Retry with backoff (ToolResult-returning)
└── errors.ts            # Error normalization + Claude formatting

src/utils/tool-result.ts # Canonical ToolResult + ToolError + ToolErrorCode (extend codes in Task 0)

src/agent/orion.ts       # Tool_use loop wiring point (Task 6)
```

### Error Codes

Update `src/utils/tool-result.ts` to include the Epic 3 codes referenced by this story (Task 0), so the project has **one** canonical ToolError code union.

### Tool Executor Implementation

```typescript
// src/tools/executor.ts
import { withTimeout } from './timeout.js';
import { withRetry } from './retry.js';
import { getLangfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import type { ToolResult, ToolError } from '../utils/tool-result.js';
import { formatErrorForClaude, toToolError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;  // NFR21
const DEFAULT_MAX_RETRIES = 3;      // project-context.md
const RATE_LIMIT_BACKOFF_MS = 30_000;

export interface ExecuteToolOptions {
  timeoutMs?: number;
  maxRetries?: number;
  traceId: string;
}

// Provided by Story 3.2 (router). Must accept AbortSignal for cancellation.
export type RouteToolCall = (input: {
  toolName: string;
  toolUseId: string;
  args: Record<string, unknown>;
  traceId: string;
  signal: AbortSignal;
}) => Promise<ToolResult<unknown>>;

/**
 * Execute a tool call with timeout, retry, and observability.
 * Always returns ToolResult<T> — never throws.
 * 
 * @see FR39 - Tool execution logging
 * @see NFR21 - 30s timeout
 */
export async function executeTool(
  toolName: string,
  toolUseId: string,
  args: Record<string, unknown>,
  routeToolCall: RouteToolCall,
  options: ExecuteToolOptions
): Promise<ToolResult<string>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = DEFAULT_MAX_RETRIES, traceId } = options;

  const lf = getLangfuse();
  const trace = lf?.trace({
    name: 'tool.execute',
    sessionId: traceId,
    input: { tool: toolName },
    metadata: { traceId, timeoutMs, maxRetries },
  });
  const span = trace?.span({
    name: 'tool.execute',
    input: { tool: toolName },
    metadata: { traceId },
  });

  const startTime = Date.now();
  let attempts = 0;

  let result: ToolResult<unknown>;
  try {
    result = await withRetry(async () => {
      attempts++;
      return await withTimeout(
        async (signal) =>
          routeToolCall({
            toolName,
            toolUseId,
            args,
            traceId,
            signal,
          }),
        {
          timeoutMs,
          onTimeout: () => ({
            success: false,
            error: {
              code: 'TOOL_EXECUTION_FAILED',
              message: `Timeout after ${timeoutMs}ms`,
              retryable: true,
            },
          }),
        }
      );
    }, {
      maxAttempts: maxRetries,
      getDelayMs: (err, attempt) => {
        if (err.code === 'RATE_LIMITED') return RATE_LIMIT_BACKOFF_MS;
        return 1000 * Math.pow(2, attempt - 1);
      },
      onRetry: (err, attempt, delayMs) => {
        logger.warn({
          event: 'tool.retry',
          traceId,
          tool: toolName,
          attempt,
          delayMs,
          code: err.code,
          error: err.message,
        });
      },
    });
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const err = toToolError(e);

    span?.end({ metadata: { durationMs, attempts, success: false, code: err.code } });

    logger.error({
      event: 'tool.execute.exhausted',
      traceId,
      tool: toolName,
      durationMs,
      attempts,
      code: err.code,
      error: err.message,
    });

    return { success: false, error: { ...err, message: formatErrorForClaude(toolName, err) } };
  }

  const durationMs = Date.now() - startTime;

  span?.end({ metadata: { durationMs, attempts, success: result.success } });

  logger.info({
    event: 'tool.execute.complete',
    traceId,
    tool: toolName,
    success: result.success,
    durationMs,
    attempts,
  });

  // Claude expects a string content for tool_result
  if (result.success) {
    const content =
      typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    return { success: true, data: content };
  }

  return {
    success: false,
    error: {
      ...result.error,
      message: formatErrorForClaude(toolName, result.error),
    },
  };
}
```

### Error Normalization & Claude Formatting

```typescript
// src/tools/errors.ts
import type { ToolError } from '../utils/tool-result.js';
import { isRetryable } from '../utils/tool-result.js';

export function toToolError(e: unknown): ToolError {
  const message = e instanceof Error ? e.message : String(e);
  const m = message.toLowerCase();

  if (m.includes('429') || m.includes('rate limit')) {
    return { code: 'RATE_LIMITED', message, retryable: true };
  }
  if (m.includes('timeout') || m.includes('aborted')) {
    return { code: 'TOOL_EXECUTION_FAILED', message: `Timeout: ${message}`, retryable: true };
  }
  if (m.includes('econnrefused') || m.includes('econnreset') || m.includes('network')) {
    return { code: 'MCP_CONNECTION_FAILED', message, retryable: true };
  }
  if (m.includes('401') || m.includes('403')) {
    return { code: 'TOOL_UNAVAILABLE', message: `Auth error: ${message}`, retryable: false };
  }
  if (m.includes('400') || m.includes('404')) {
    return { code: 'TOOL_INVALID_INPUT', message, retryable: false };
  }

  return { code: 'TOOL_EXECUTION_FAILED', message, retryable: isRetryable(e) };
}

export function formatErrorForClaude(toolName: string, error: ToolError): string {
  if (error.code === 'RATE_LIMITED') {
    return `The ${toolName} tool is rate limited right now. Please wait a bit and try again.`;
  }
  if (error.code === 'TOOL_INVALID_INPUT') {
    return `The ${toolName} tool request was invalid. Try rephrasing or providing required fields.`;
  }
  if (error.code === 'MCP_CONNECTION_FAILED') {
    return `I couldn't reach the ${toolName} tool service. Try again or use a different approach.`;
  }
  return `The ${toolName} tool failed. Try again or use a different approach.`;
}
```

### Timeout Wrapper

```typescript
// src/tools/timeout.ts
import type { ToolResult } from '../utils/tool-result.js';

/**
 * Wrap an async function with a timeout.
 * Returns ToolResult on timeout — never throws/rejects to caller.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<ToolResult<T>>,
  options: {
    timeoutMs: number;
    onTimeout: () => ToolResult<T>;
  }
): Promise<ToolResult<T>> {
  const controller = new AbortController();
  
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const result = await fn(controller.signal);
    if (controller.signal.aborted) return options.onTimeout();
    return result;
  } catch (e) {
    if (controller.signal.aborted) return options.onTimeout();
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
```

### Retry with Backoff

```typescript
// src/tools/retry.ts
import type { ToolResult, ToolError } from '../utils/tool-result.js';
import { toToolError } from './errors.js';

/**
 * Execute ToolResult-returning function with retry and configurable backoff.
 * 
 * @see NFR15 - Exponential backoff
 * @see project-context.md - Max 3 retries per tool
 */
export async function withRetry<T>(
  fn: () => Promise<ToolResult<T>>,
  options: {
    maxAttempts: number;
    getDelayMs: (err: ToolError, attempt: number) => number;
    onRetry?: (err: ToolError, attempt: number, delayMs: number) => void;
  }
): Promise<ToolResult<T>> {
  let last: ToolResult<T> | null = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      const result = await fn();
      last = result;

      if (result.success) return result;
      if (!result.error.retryable) return result;
      if (attempt === options.maxAttempts) return result;

      const delayMs = options.getDelayMs(result.error, attempt);
      options.onRetry?.(result.error, attempt, delayMs);
      await sleep(delayMs);
    } catch (e) {
      const err = toToolError(e);
      last = { success: false, error: err };
      if (!err.retryable) return last;
      if (attempt === options.maxAttempts) return last;

      const delayMs = options.getDelayMs(err, attempt);
      options.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  return last ?? {
    success: false,
    error: { code: 'TOOL_EXECUTION_FAILED', message: 'Unknown tool failure', retryable: true },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Integration with Agent Loop

```typescript
// In src/agent/orion.ts
import { executeTool } from '../tools/executor.js';
import { executeToolCall } from '../tools/router.js';

// When processing tool_use blocks:
for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await executeTool(
      block.name,
      block.id,
      block.input as Record<string, unknown>,
      executeToolCall,
      { traceId }
    );

    // Always provide content to Claude — success or error
    const content = result.success ? result.data : result.error.message;

    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: block.id, content }],
    });
  }
}
```

### Dependencies

- Story 3.1 (MCP Client) — Underlying execution
- Story 3.2 (Tool Registry) — Tool routing
- Story 1.2 (Langfuse) — Observability
- `src/utils/tool-result.ts` — canonical ToolResult + error codes

### Success Metrics (Langfuse Queries)

```
# Tool success rate
traces.name = "tool.execute" AND metadata.success = true

# Latency P95
traces.name = "tool.execute" | percentile(metadata.durationMs, 95)

# Errors by code
traces.name = "tool.execute" AND metadata.success = false
GROUP BY metadata.code

# Retry rate
traces.name = "tool.retry" | count()
```

### Testing Strategy

```typescript
// src/tools/executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTool } from './executor.js';
import * as router from './router.js';

describe('executeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('returns success on first attempt', async () => {
    vi.spyOn(router, 'executeToolCall').mockResolvedValue({
      success: true,
      data: 'result',
    });

    const promise = executeTool('test', 'id-1', {}, router.executeToolCall, { traceId: 'trace-1' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
  });

  it('retries on transient error', async () => {
    const mockFn = vi.spyOn(router, 'executeToolCall')
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'TOOL_EXECUTION_FAILED', message: '503 Service Unavailable', retryable: true },
      })
      .mockResolvedValueOnce({ success: true, data: 'ok' });

    const promise = executeTool('test', 'id-2', {}, router.executeToolCall, { traceId: 'trace-2' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 401', async () => {
    vi.spyOn(router, 'executeToolCall').mockResolvedValue({
      success: false,
      error: { code: 'TOOL_UNAVAILABLE', message: '401 Unauthorized', retryable: false },
    });

    const promise = executeTool('test', 'id-3', {}, router.executeToolCall, { traceId: 'trace-3' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.retryable).toBe(false);
    }
  });

  it('uses 30s backoff on rate limit', async () => {
    const mockFn = vi.spyOn(router, 'executeToolCall')
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'RATE_LIMITED', message: '429 Too Many Requests', retryable: true },
      })
      .mockResolvedValueOnce({ success: true, data: 'ok' });

    const promise = executeTool('test', 'id-4', {}, router.executeToolCall, { traceId: 'trace-4' });
    
    // Should wait 30s for rate limit
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;

    expect(result.success).toBe(true);
  });

  it('returns ToolResult with error code on exhausted retries', async () => {
    vi.spyOn(router, 'executeToolCall').mockResolvedValue({
      success: false,
      error: { code: 'MCP_CONNECTION_FAILED', message: 'Network error', retryable: true },
    });

    const promise = executeTool('test', 'id-5', {}, router.executeToolCall, {
      traceId: 'trace-5',
      maxRetries: 3,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MCP_CONNECTION_FAILED');
    }
  });
});
```

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 3 |
| 2025-12-23 | SM Revision: Aligned story to current repo touchpoints (Langfuse `getLangfuse().trace().span()`, canonical `src/utils/tool-result.ts`, real AbortSignal propagation, explicit wiring into `src/agent/orion.ts`) |
| 2025-12-24 | Dev: Completed Task 0-1 (extended ToolErrorCode, added timeout wrapper + tests); `pnpm test` passing |
| 2025-12-24 | Dev: Completed Task 2 (retry wrapper + tests); `pnpm test` passing |
| 2025-12-24 | Dev: Completed Task 3 (error normalization + Claude formatting + tests); `pnpm test` passing |
| 2025-12-24 | Dev: Completed Task 4 (tool observability helpers + retry logging); `pnpm test` passing |
| 2025-12-27 | Dev: Completed Task 5-7 (router + executor wiring into agent loop); `pnpm test` passing |
| 2025-12-27 | Code Review: Fixed M1 (added MCP content extraction tests), M2 (documented trace hierarchy), M3 (documented rate-limit redundancy); 699 tests passing |

## Dev Agent Record

### Implementation Notes

- Task 0: Extended `ToolErrorCode` in `src/utils/tool-result.ts` with Epic 3 codes (`RATE_LIMITED`, `MCP_CONNECTION_FAILED`, `TOOL_NOT_FOUND`).
- Task 1: Implemented `withTimeout()` in `src/tools/timeout.ts` using `AbortController` + a real timeout race, returning `ToolResult<T>` (never throws) and propagating `AbortSignal`.
- Task 2: Implemented `withRetry()` in `src/tools/retry.ts` with max 3 attempts, exponential backoff, 30s backoff for `RATE_LIMITED`, and no retries for 400/401/403/404.
- Task 3: Implemented `toToolError()` + `formatErrorForClaude()` in `src/tools/errors.ts` (timeout/abort, 429, MCP connectivity, auth).
- Task 4: Implemented tool observability helpers in `src/tools/observability.ts` (creates `tool.execute` trace/span + logs retries as `tool.retry`).
- Task 5: Added `src/tools/router.ts` and completed executor integration to route tools (static vs `server__tool` MCP), normalize MCP `{ isError: true }` payloads into canonical ToolResult error, and ensure Claude-facing tool_result content is string.
- Task 6: Wired tool execution into the agent entrypoint (`src/agent/orion.ts`) using `executeTool(...)` + `executeToolCall(...)`; updated agent loop tool callback signature to include `toolUseId` so every tool_use receives exactly one matching tool_result and failures are returned as content (no throw).
- (Regression fix) Fixed `src/observability/metrics.ts` to use `MAX_VERIFICATION_ATTEMPTS` so verification metrics tests pass.

### Test Notes

- Added `src/tools/timeout.test.ts` to verify:
  - timeout returns `TOOL_EXECUTION_FAILED` and aborts signal
  - fast path returns underlying `ToolResult`
  - thrown errors are converted to `ToolResult` (no throw)
- Added `src/tools/retry.test.ts` to verify retry policy (max attempts, backoff timing, 429 handling, and non-retry cases).
- Added `src/tools/errors.test.ts` to verify error normalization + Claude formatting.
- Added `src/tools/observability.test.ts` to validate `tool.execute` trace/span and `tool.retry` logging.
- Added `src/tools/router.test.ts` to validate routing behavior (unknown tools, MCP routing, MCP `{ isError: true }` normalization, static tool routing).
- Updated `src/agent/loop.test.ts` for the expanded tool executor callback params (`toolUseId`, `traceId`).

### Code Review Fixes (2025-12-27)

- **M1 (MCP content extraction test)**: Added 2 tests to `executor.test.ts` verifying `toClaudeToolContent()` extracts text from MCP `{ content: [...] }` payloads and falls back to JSON.stringify for non-text blocks.
- **M2 (Trace hierarchy documentation)**: Added module-level JSDoc to `observability.ts` explaining the current trace structure (independent traces linked by sessionId) and noting future improvement opportunity.
- **M3 (Rate-limit normalization documentation)**: Added JSDoc to `normalizeToolError()` in `executor.ts` explaining intentional redundancy in rate-limit detection for robustness.

## File List

Files created:
- `src/tools/timeout.ts`
- `src/tools/timeout.test.ts`
- `src/tools/retry.ts`
- `src/tools/retry.test.ts`
- `src/tools/errors.ts`
- `src/tools/errors.test.ts`
- `src/tools/observability.ts`
- `src/tools/observability.test.ts`
- `src/tools/router.ts`
- `src/tools/router.test.ts`

Files modified:
- `src/utils/tool-result.ts`
- `src/utils/tool-result.test.ts`
- `src/agent/loop.ts`
- `src/agent/loop.test.ts`
- `src/agent/orion.ts`
- `src/observability/metrics.ts`
- `src/tools/registry.ts`
- `src/tools/mcp/client.ts`
- `_bmad-output/sprint-status.yaml`
