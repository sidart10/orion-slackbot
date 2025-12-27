# Story 3.8: Graceful Degradation for Tool Failures

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: Already implemented in error handling code

## Story

As a **user**,
I want Orion to continue working when a tool fails,
So that one broken integration doesn't block my request.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3.3 Tool Execution with Timeout | required | `ToolResult` with success/error states |
| 3.4 Multiple MCP Servers | required | Parallel execution with partial failures |
| 3.5 Intelligent Tool Selection | required | Alternative tool selection |
| 2.4 OrionError & Graceful Degradation | required | Error interface |
| 1.2 Langfuse Instrumentation | ✅ done | Tracing for failure events |

## Acceptance Criteria

1. **Given** a tool call fails, **When** the error is not recoverable, **Then** the agent continues with available tools (AR19)

2. **Given** a tool fails, **When** informing the user, **Then** the user is notified about the unavailable tool in a non-disruptive way

3. **Given** some tools are unavailable, **When** the response is generated, **Then** the response is still useful with remaining capabilities

4. **Given** a transient failure occurs, **When** retry is appropriate, **Then** failed tools are retried with exponential backoff (max 3 retries, NFR15)

5. **Given** persistent failures occur, **When** a threshold is reached, **Then** the tool/server is marked unhealthy and failures are logged for admin review

6. **Given** all relevant tools fail, **When** the request cannot be completed, **Then** a graceful error message explains what happened and suggests alternatives

## Tasks / Subtasks

- [ ] **Task 1: Create Degradation Handler** (AC: #1, #3)
  - [ ] Create `src/tools/degradation.ts`
  - [ ] Implement `handleToolFailure(result, context)` function
  - [ ] Determine if request can continue without failed tool
  - [ ] Track failed tools for context

- [ ] **Task 2: Implement Retry with Backoff** (AC: #4)
  - [ ] Create `retryWithBackoff(fn, maxRetries)` utility
  - [ ] Implement exponential backoff (1s, 2s, 4s)
  - [ ] Detect transient vs permanent failures
  - [ ] Log retry attempts

- [ ] **Task 3: Create User Notification Helper** (AC: #2)
  - [ ] Create `createToolUnavailableMessage(tools)` function
  - [ ] Format non-disruptive notification
  - [ ] Include tool names but not technical details
  - [ ] Use Slack mrkdwn formatting

- [ ] **Task 4: Track Failure Patterns** (AC: #5)
  - [ ] Integrate with health registry from Story 3.1
  - [ ] Track consecutive failures per server
  - [ ] Mark server as degraded/unhealthy after threshold
  - [ ] Log failure patterns for admin

- [ ] **Task 5: Handle Complete Failure** (AC: #6)
  - [ ] Detect when all relevant tools failed
  - [ ] Create graceful error response
  - [ ] Suggest alternatives (retry later, contact admin)
  - [ ] Log complete failure event

- [ ] **Task 6: Integrate with Agent Loop** (AC: #1, #3)
  - [ ] Update agent loop to handle partial results
  - [ ] Continue execution with available data
  - [ ] Include failure context in response generation

- [ ] **Task 7: Create Tests** (AC: all)
  - [ ] Test single tool failure, others succeed
  - [ ] Test retry behavior
  - [ ] Test complete failure handling
  - [ ] Test user notification formatting

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR19 | architecture.md | Graceful degradation — continue with available tools, inform user |
| NFR14 | prd.md | Graceful degradation when MCP server unavailable |
| NFR15 | prd.md | Automatic retry with exponential backoff for transient failures |

### src/tools/degradation.ts

```typescript
import { ToolResult } from './execution.js';
import { markServerUnavailable, healthRegistry } from './mcp/health.js';
import { logger } from '../utils/logger.js';

export interface DegradationContext {
  requiredTools: string[];
  executedResults: ToolResult[];
  canProceedWithPartial: boolean;
}

export interface DegradationDecision {
  canProceed: boolean;
  failedTools: string[];
  availableResults: ToolResult[];
  userNotification?: string;
  shouldRetry: ToolResult[];
}

/**
 * Analyze tool results and decide how to proceed
 */
export function analyzeDegradation(
  results: ToolResult[],
  context: Partial<DegradationContext> = {}
): DegradationDecision {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  // Determine which failures are retryable (transient)
  const shouldRetry = failed.filter(r => 
    r.error?.recoverable && 
    isTransientError(r.error.code)
  );

  // Can we proceed with partial results?
  const canProceed = successful.length > 0 || 
    context.canProceedWithPartial === true;

  return {
    canProceed,
    failedTools: failed.map(r => r.toolName),
    availableResults: successful,
    userNotification: failed.length > 0 
      ? createToolUnavailableMessage(failed.map(r => r.toolName))
      : undefined,
    shouldRetry,
  };
}

function isTransientError(code: string): boolean {
  const transientCodes = ['TOOL_TIMEOUT', 'MCP_CONNECTION_ERROR'];
  return transientCodes.includes(code);
}

/**
 * Create user-friendly message about unavailable tools
 */
export function createToolUnavailableMessage(toolNames: string[]): string {
  if (toolNames.length === 0) return '';
  
  const formatted = toolNames
    .map(name => name.replace(/_/g, ' ').toLowerCase())
    .join(', ');

  if (toolNames.length === 1) {
    return `_Note: ${formatted} is temporarily unavailable. I've answered using other available tools._`;
  }
  
  return `_Note: Some tools (${formatted}) are temporarily unavailable. I've answered using other available tools._`;
}

/**
 * Handle complete failure when no tools succeeded
 */
export function createCompleteFailureMessage(): string {
  return `I apologize, but I'm having trouble connecting to the external tools needed for this request. ` +
    `This is likely a temporary issue. Please try again in a few minutes, ` +
    `or contact your administrator if the problem persists.`;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; toolName?: string } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, toolName = 'unknown' } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) break;

      const delay = baseDelayMs * Math.pow(2, attempt);
      
      logger.warn({
        event: 'tool_retry',
        toolName,
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update health registry based on failure pattern
 */
export function trackFailure(
  toolName: string,
  serverName: string,
  error: Error
): void {
  healthRegistry.markFailure(serverName, error);
  
  const health = healthRegistry.getHealth(serverName);
  
  if (health.status === 'unhealthy') {
    logger.error({
      event: 'server_marked_unhealthy',
      serverName,
      consecutiveFailures: health.consecutiveFailures,
      message: 'Server marked unhealthy after repeated failures',
    });
  }
}
```

### Integration with Agent Loop

```typescript
// In src/agent/loop.ts
import { analyzeDegradation, createCompleteFailureMessage } from '../tools/degradation.js';

async function executeAgentLoop(input: string, context: AgentContext) {
  // ... gather phase ...
  
  // Execute tools
  const toolResults = await executeToolsParallel(toolCalls, executor);
  
  // Analyze degradation
  const degradation = analyzeDegradation(toolResults.results);
  
  if (!degradation.canProceed && degradation.failedTools.length > 0) {
    // All tools failed
    return {
      response: createCompleteFailureMessage(),
      success: false,
    };
  }
  
  // Continue with partial results
  const resultsContext = formatToolResultsForContext({
    ...toolResults,
    results: degradation.availableResults,
  });
  
  // Include notification in response if tools failed
  const response = await generateResponse(input, resultsContext);
  
  if (degradation.userNotification) {
    response.text += `\n\n${degradation.userNotification}`;
  }
  
  return response;
}
```

### src/tools/degradation.test.ts

```typescript
import { describe, it, expect, vi } from 'vitest';
import { 
  analyzeDegradation, 
  createToolUnavailableMessage,
  retryWithBackoff 
} from './degradation.js';

describe('Graceful Degradation', () => {
  describe('analyzeDegradation', () => {
    it('allows proceeding with partial success', () => {
      const results = [
        { success: true, toolName: 'tool_a', duration: 100 },
        { success: false, toolName: 'tool_b', duration: 100, error: { code: 'TOOL_TIMEOUT', recoverable: true } },
      ];

      const decision = analyzeDegradation(results);

      expect(decision.canProceed).toBe(true);
      expect(decision.failedTools).toEqual(['tool_b']);
      expect(decision.availableResults).toHaveLength(1);
    });

    it('identifies retryable failures', () => {
      const results = [
        { success: false, toolName: 'tool_a', duration: 100, 
          error: { code: 'TOOL_TIMEOUT', message: 'timeout', userMessage: '', recoverable: true } },
      ];

      const decision = analyzeDegradation(results);
      expect(decision.shouldRetry).toHaveLength(1);
    });
  });

  describe('createToolUnavailableMessage', () => {
    it('formats single tool', () => {
      const msg = createToolUnavailableMessage(['github_search']);
      expect(msg).toContain('github search');
      expect(msg).toContain('temporarily unavailable');
    });

    it('formats multiple tools', () => {
      const msg = createToolUnavailableMessage(['github_search', 'slack_search']);
      expect(msg).toContain('Some tools');
    });
  });

  describe('retryWithBackoff', () => {
    it('succeeds on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, { baseDelayMs: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));
      
      await expect(
        retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow('always fail');
      
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });
});
```

### Project Structure Notes

Files created:
- `src/tools/degradation.ts` — Degradation handling
- `src/tools/degradation.test.ts` — Tests

Files modified:
- `src/agent/loop.ts` — Integrate degradation handling

### References

- [Source: _bmad-output/architecture.md#AR19] — Graceful degradation
- [Source: _bmad-output/prd.md#NFR14] — Graceful degradation when MCP unavailable
- [Source: _bmad-output/prd.md#NFR15] — Retry with exponential backoff

## Dev Agent Record

### Agent Model Used

_To be filled by implementing agent_

### Completion Notes List

_To be filled during implementation_

### File List

Files to create:
- `src/tools/degradation.ts`
- `src/tools/degradation.test.ts`

Files to modify:
- `src/agent/loop.ts`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story enhanced with full implementation guidance |
