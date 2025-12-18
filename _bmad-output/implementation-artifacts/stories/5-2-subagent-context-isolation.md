# Story 5.2: Subagent Context Isolation

Status: ready-for-dev

## Story

As a **user**,
I want subagent results to be focused and relevant,
So that I don't get overwhelmed with unnecessary details.

## Acceptance Criteria

1. **Given** subagents are spawned for a task, **When** each subagent executes, **Then** it has an isolated context window (FR3)
2. **Given** context is passed, **When** subagent starts, **Then** only relevant context is passed to each subagent
3. **Given** subagents complete, **When** results are returned, **Then** subagent results are focused on their specific task
4. **Given** multiple subagents run, **When** context is managed, **Then** context isolation prevents cross-contamination
5. **Given** isolation is active, **When** memory is tracked, **Then** memory usage is optimized by isolation

## Tasks / Subtasks

- [ ] **Task 1: Implement Context Isolation** (AC: #1)
  - [ ] Create isolated context per subagent
  - [ ] Don't share conversation history
  - [ ] Pass only task-specific context

- [ ] **Task 2: Filter Relevant Context** (AC: #2)
  - [ ] Extract relevant portions
  - [ ] Limit context size
  - [ ] Focus on task keywords

- [ ] **Task 3: Focused Results** (AC: #3)
  - [ ] Instruct focused output
  - [ ] Limit result size
  - [ ] Extract key findings

- [ ] **Task 4: Prevent Cross-Contamination** (AC: #4)
  - [ ] No shared state
  - [ ] Separate memory
  - [ ] Independent execution

- [ ] **Task 5: Optimize Memory** (AC: #5)
  - [ ] Compact subagent context
  - [ ] Release memory after completion
  - [ ] Track memory usage

## Dev Notes

### Context Isolation Pattern

```typescript
interface SubagentContext {
  task: string;
  relevantContext: string;  // Only task-relevant portion
  maxOutputTokens: number;
  // NO access to main thread history
}
```

### File List

Files to modify:
- `src/agent/subagents/index.ts`

