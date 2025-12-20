# Story 5.3: Parallel Subagent Execution

Status: ready-for-dev

## Story

As a **user**,
I want research to happen in parallel,
So that complex tasks complete faster.

## Acceptance Criteria

1. **Given** multiple subagents are needed, **When** they can execute independently, **Then** subagents run in parallel via `Promise.all()` (AR10)

2. **Given** subagents complete, **When** results are returned, **Then** results are collected as subagents complete

3. **Given** a subagent fails, **When** others are running, **Then** failures in one subagent don't block others

4. **Given** concurrency limits, **When** many subagents needed, **Then** maximum 3 subagents execute concurrently (NFR5) - *Handled via `p-limit` in Story 5.1*

5. **Given** tracing is active, **When** parallel execution occurs, **Then** parallel execution is visible in Langfuse traces

## Tasks / Subtasks

- [ ] **Task 1: Create Parallel Executor** (AC: #1, #3)
  - [ ] Create `src/agent/subagents/parallel.ts`
  - [ ] Implement `executeSubagentsParallel(configs[]): Promise<SubagentResult[]>`
  - [ ] Map configs to `spawnSubagent` calls
  - [ ] Use `Promise.allSettled()` to wait for all results (AC: #3)
  - [ ] *Note: Concurrency throttling is already handled inside `spawnSubagent` via `p-limit` (Story 5.1)*

- [ ] **Task 2: Implement Progressive Results Collection** (AC: #2)
  - [ ] Add `onProgress` callback support to `executeSubagentsParallel`
  - [ ] Emit events as individual promises resolve

- [ ] **Task 3: Result Normalization & Error Handling** (AC: #3)
  - [ ] Process `Promise.allSettled` results
  - [ ] Convert rejected promises into `SubagentResult` objects with `OrionError`
  - [ ] Ensure consistent return type `SubagentResult[]`

- [ ] **Task 4: Parallel Tracing** (AC: #5)
  - [ ] Create parent span for parallel execution
  - [ ] Verify child spans are created by `spawnSubagent`

- [ ] **Task 5: Verification Tests** (AC: all)
  - [ ] Test: Parallel execution works
  - [ ] Test: One failure doesn't fail the batch
  - [ ] Test: Progress callbacks fire correctly

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR10 | architecture.md | Parallel subagent execution via `Promise.all()` (or `allSettled`) |
| NFR5 | prd.md | Maximum 3 concurrent subagents per request (handled by `spawnSubagent`) |
| AR11 | architecture.md | ALL executions traced in Langfuse |

### Implementation Strategy

**Simplification**: Since `spawnSubagent` (from Story 5.1) already uses `p-limit` internally to enforce the concurrency limit (NFR5), this story focuses purely on the **parallel invocation pattern**. We do NOT need to implement complex batching logic here.

### src/agent/subagents/parallel.ts

```typescript
import { createOrionError, ErrorCode } from '../../utils/errors.js';
import { spawnSubagent } from './spawn.js';
import { createSpan } from '../../observability/tracing.js';
import type { SubagentConfig, SubagentResult } from './types.js';

export interface ParallelExecutionOptions {
  onProgress?: (result: SubagentResult) => void;
  parentTrace?: { id: string };
  fullThreadContext?: string;
}

export async function executeSubagentsParallel(
  configs: SubagentConfig[],
  options: ParallelExecutionOptions = {}
): Promise<SubagentResult[]> {
  const parentSpan = createSpan(options.parentTrace, {
    name: 'parallel-subagent-execution',
    input: { count: configs.length, subagents: configs.map(c => c.name) }
  });

  // simply map to promises - spawnSubagent handles concurrency limits internally
  const promises = configs.map(async (config) => {
    try {
      const result = await spawnSubagent(config, parentSpan, options.fullThreadContext);
      options.onProgress?.(result);
      return result;
    } catch (error) {
      // Should be caught inside spawnSubagent, but double safety
      const errorResult: SubagentResult = {
        success: false,
        subagent: config.name,
        task: config.task,
        error: createOrionError(
           ErrorCode.UNKNOWN_ERROR,
           error instanceof Error ? error.message : String(error),
           { recoverable: false }
        ),
        metrics: { durationMs: 0, tokensUsed: { input: 0, output: 0 } }
      };
      options.onProgress?.(errorResult);
      return errorResult;
    }
  });

  // Wait for all to settle
  // Since we catch errors above, Promise.all would technically work, 
  // but allSettled conveys intent better if we removed the try/catch wrapper.
  // With the wrapper above, we effectively simulate allSettled returning values.
  const results = await Promise.all(promises);

  parentSpan.end({
    output: { 
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    }
  });

  return results;
}
```

### Reference: Claude Agent SDK Guide

> "Subagents are useful for two main reasons. First, they enable parallelization: you can spin up multiple subagents to work on different tasks simultaneously."

This implementation aligns directly with the guide by enabling parallel subagent spawning while relying on the SDK (and our wrapper) to manage the mechanics.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `src/agent/subagents/parallel.ts`
- `src/agent/subagents/parallel.test.ts`

Files to modify:
- `src/agent/subagents/index.ts`
