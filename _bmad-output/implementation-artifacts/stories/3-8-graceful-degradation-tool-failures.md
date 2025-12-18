# Story 3.8: Graceful Degradation for Tool Failures

Status: ready-for-dev

## Story

As a **user**,
I want Orion to continue working when a tool fails,
So that one broken integration doesn't block my request.

## Acceptance Criteria

1. **Given** a tool call fails, **When** the error is not recoverable, **Then** the agent continues with available tools (AR19)

2. **Given** a tool fails, **When** informing the user, **Then** the user is informed about the unavailable tool

3. **Given** tools are unavailable, **When** the response is generated, **Then** the response is still useful with remaining capabilities

4. **Given** a transient failure occurs, **When** retry is attempted, **Then** failed tools are retried with exponential backoff (NFR15)

5. **Given** persistent failures occur, **When** monitoring is active, **Then** persistent failures are logged for admin review

## Tasks / Subtasks

- [ ] **Task 1: Implement Failure Detection** (AC: #1)
  - [ ] Catch tool execution errors
  - [ ] Classify error type (transient/permanent)
  - [ ] Mark tool as temporarily unavailable

- [ ] **Task 2: Continue with Available Tools** (AC: #1, #3)
  - [ ] Remove failed tool from available list
  - [ ] Continue agent loop
  - [ ] Generate response with remaining tools

- [ ] **Task 3: Inform User** (AC: #2)
  - [ ] Add note about unavailable tool
  - [ ] Suggest alternatives if available
  - [ ] Keep response useful

- [ ] **Task 4: Implement Retry Logic** (AC: #4)
  - [ ] Use exponential backoff
  - [ ] Max 3 retries per tool
  - [ ] Reset after success

- [ ] **Task 5: Log Persistent Failures** (AC: #5)
  - [ ] Track failure count per tool
  - [ ] Alert on persistent failures
  - [ ] Log for admin review

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Simulate tool failure
  - [ ] Verify request continues
  - [ ] Check user notification
  - [ ] Verify retry behavior

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR19 | architecture.md | Graceful degradation when tools fail |
| NFR15 | prd.md | Exponential backoff for transient failures |

### Degradation Flow

```
Tool Execution
    │
    ▼
[Error?] ─── No ──▶ [Continue]
    │
   Yes
    │
    ▼
[Transient?] ─── Yes ──▶ [Retry with Backoff]
    │                          │
   No                    [Max Retries?]
    │                      │       │
    ▼                     No      Yes
[Mark Unavailable]        │       │
    │                     ▼       ▼
    ▼               [Retry]  [Mark Unavailable]
[Continue with                   │
 Other Tools]  ◀─────────────────┘
```

### User Notification Template

```typescript
function createToolUnavailableMessage(toolName: string): string {
  return `_Note: ${toolName} is temporarily unavailable. ` +
    `I've answered using other available tools._`;
}
```

### References

- [Source: _bmad-output/epics.md#Story 3.8] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Don't let one broken tool block the entire request
- User should still get a useful response
- Consider circuit breaker pattern for persistent failures

### File List

Files to modify:
- `src/tools/executor.ts` (add degradation)
- `src/agent/loop.ts` (handle failures)

