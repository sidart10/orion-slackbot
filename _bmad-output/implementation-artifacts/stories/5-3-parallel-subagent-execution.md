# Story 5.3: Parallel Subagent Execution

Status: ready-for-dev

## Story

As a **user**,
I want research to happen in parallel,
So that complex tasks complete faster.

## Acceptance Criteria

1. **Given** multiple subagents are needed, **When** they can execute independently, **Then** subagents run in parallel via Promise.all() (AR10)
2. **Given** parallel execution, **When** subagents complete, **Then** results are collected as subagents complete
3. **Given** a subagent fails, **When** others are running, **Then** failures in one subagent don't block others
4. **Given** concurrency limits, **When** many subagents needed, **Then** maximum 3 subagents execute concurrently (NFR5)
5. **Given** tracing is active, **When** parallel execution occurs, **Then** parallel execution is visible in Langfuse traces

## Tasks / Subtasks

- [ ] **Task 1: Implement Promise.all Pattern** (AC: #1)
  - [ ] Create `executeSubagentsParallel()`
  - [ ] Spawn subagents concurrently
  - [ ] Collect all results

- [ ] **Task 2: Collect Results Incrementally** (AC: #2)
  - [ ] Handle results as they arrive
  - [ ] Stream progress updates
  - [ ] Aggregate final results

- [ ] **Task 3: Handle Failures Gracefully** (AC: #3)
  - [ ] Use Promise.allSettled()
  - [ ] Continue on failure
  - [ ] Note failed subagents

- [ ] **Task 4: Enforce Concurrency Limit** (AC: #4)
  - [ ] Semaphore pattern
  - [ ] Queue excess work
  - [ ] Max 3 concurrent

- [ ] **Task 5: Parallel Tracing** (AC: #5)
  - [ ] Sibling spans for parallel
  - [ ] Show parallel execution
  - [ ] Track total time

## Dev Notes

### Parallel Execution Pattern

```typescript
async function executeSubagentsParallel(
  tasks: SubagentTask[]
): Promise<SubagentResult[]> {
  const MAX_CONCURRENT = 3;
  const results: SubagentResult[] = [];
  
  for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
    const batch = tasks.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map(t => spawnSubagent(t.agent, t.task, t.context))
    );
    results.push(...processSettledResults(batchResults));
  }
  
  return results;
}
```

### File List

Files to modify:
- `src/agent/subagents/index.ts`

