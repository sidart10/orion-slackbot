# Story 5.2: Subagent Context Isolation

Status: ready-for-dev

## Story

As a **user**,
I want subagent results to be focused and relevant,
So that I don't get overwhelmed with unnecessary details.

## Acceptance Criteria

1. **Given** subagents are spawned for a task, **When** each subagent executes, **Then** it has an isolated context window (FR3)

2. **Given** context is passed, **When** subagent starts, **Then** only relevant context is passed to each subagent using a whitelist approach

3. **Given** subagents complete, **When** results are returned, **Then** subagent results are focused on their specific task

4. **Given** multiple subagents run, **When** context is managed, **Then** context isolation prevents cross-contamination

5. **Given** isolation is active, **When** memory is tracked, **Then** memory usage is optimized by isolation

## Tasks / Subtasks

- [ ] **Task 1: Create Context Extractor** (AC: #1, #2)
  - [ ] Create `src/agent/subagents/context-extractor.ts`
  - [ ] Implement `extractRelevantContext(fullContext, task)` function
  - [ ] Use simple token estimation (or robust tokenizer if available)
  - [ ] Implement whitelist-based context construction (explicitly allow keys)

- [ ] **Task 2: Create Context Isolation Wrapper** (AC: #1, #4)
  - [ ] Create `src/agent/subagents/isolation.ts`
  - [ ] Implement `createIsolatedContext(config)` function
  - [ ] Explicitly construct `SubagentContext` from allowed fields ONLY
  - [ ] Sanitize strings to remove potentially confusing markers (e.g. `[INTERNAL]`)

- [ ] **Task 3: Implement Result Filtering** (AC: #3)
  - [ ] Create `src/agent/subagents/result-filter.ts`
  - [ ] Implement `filterSubagentResult(result, originalTask)` function
  - [ ] Filter content based on relevance to task keywords
  - [ ] Preserve source citations

- [ ] **Task 4: Update Spawn Function** (AC: all)
  - [ ] Integrate context extraction into `spawnSubagent()`
  - [ ] Integrate result filtering before returning
  - [ ] Log isolation effectiveness

- [ ] **Task 5: Verification Tests** (AC: all)
  - [ ] Test: Whitelist approach prevents leakage
  - [ ] Test: Only relevant context extracted
  - [ ] Test: Result filtering works as expected

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR3 | prd.md | System spawns subagents with isolated context windows |
| FR4 | prd.md | System aggregates only relevant results from subagents |
| AR9 | architecture.md | Subagents spawned with isolated context |

### Context Extraction Strategy (Reference: Claude Agent SDK)

Based on the [Context Engineering](http://anthropic.com/news/context-management) principles referenced in the SDK docs:
> "Subagents use their own isolated context windows, and only send relevant information back to the orchestrator."

We will implement a **Whitelist Approach** for context construction:

```typescript
// src/agent/subagents/isolation.ts

export function createIsolatedContext(
  config: SubagentConfig,
  fullThreadContext?: string
): IsolationResult {
  // 1. Extract Relevant Text
  const relevantContext = fullThreadContext 
    ? extractRelevantContext(fullThreadContext, config.task).relevantContext 
    : config.context.relevantContext;

  // 2. Explicit Construction (Whitelist)
  // ONLY explicitly allowed fields are copied. No "delete forbidden keys".
  const isolatedContext: SubagentContext = {
    originalQuery: config.context.originalQuery, // Necessary for understanding intent
    relevantContext: relevantContext,            // The extracted relevant portion
    userId: config.context.userId,               // Needed for permissions/personalization
    instructions: config.context.instructions    // Specific subagent instructions
  };

  return { isolatedContext, ...metrics };
}
```

### src/agent/subagents/context-extractor.ts

```typescript
// Simple robust token estimation
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); 
}

// ... extraction logic using keyword matching as defined in original story ...
```

### src/agent/subagents/result-filter.ts

```typescript
// Filter result content based on task relevance
// ... implementation as defined in original story ...
```

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `src/agent/subagents/context-extractor.ts`
- `src/agent/subagents/context-extractor.test.ts`
- `src/agent/subagents/isolation.ts`
- `src/agent/subagents/isolation.test.ts`
- `src/agent/subagents/result-filter.ts`
- `src/agent/subagents/result-filter.test.ts`

Files to modify:
- `src/agent/subagents/spawn.ts`
- `src/agent/subagents/index.ts`
