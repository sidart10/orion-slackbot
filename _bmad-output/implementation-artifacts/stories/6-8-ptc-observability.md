# Story 6.8: PTC Observability

Status: **done** ✅

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **platform operator**,
I want comprehensive observability into Programmatic Tool Calling (PTC) execution,
So that I can monitor performance, debug issues, and track cost savings from batched tool calls.

## Implementation Status

**This story is COMPLETE.** PTC observability was fully implemented as part of Stories 6.2, 6.3, and 6.7.

### What Was Implemented

| Component | Location | Status |
|-----------|----------|--------|
| Langfuse `ptc_execution_completed` event | `src/agent/loop.ts:967-983` | ✅ Done |
| Container lifecycle events | `src/agent/loop.ts:683-720, 841-864` | ✅ Done |
| PTC start logging (`ptc_code_execution_started`) | `src/agent/loop.ts:875-878` | ✅ Done |
| PTC completion logging (`ptc_code_execution_completed`) | `src/agent/loop.ts:941-948` | ✅ Done |
| Error tracking (`ptc_tool_timeout`, `ptc_container_expired`) | `src/agent/loop.ts:951-964` | ✅ Done |
| Token savings estimation | `src/agent/loop.ts:972` | ✅ Done |
| Tool call counting via `caller` field | `src/agent/loop.ts:898-902` | ✅ Done |
| Streaming UX ("Running multi-tool analysis…") | `src/slack/status-messages.ts:131-134` | ✅ Done |
| Unit tests for observability | `src/agent/loop.test.ts:1765-1895` | ✅ Done |

### Observability Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PTC OBSERVABILITY FLOW                          │
│                                                                     │
│  1. content_block_start (type: server_tool_use)                    │
│     └── LOG: ptc_code_execution_started                            │
│     └── SLACK: "Running multi-tool analysis…"                      │
│                                                                     │
│  2. content_block_start (type: tool_use + caller.type = PTC)       │
│     └── INCREMENT: ptcToolCallCount                                │
│                                                                     │
│  3. content_block_start (type: code_execution_tool_result)         │
│     ├── LOG: ptc_code_execution_completed                          │
│     │       └── returnCode, stdoutLength, stderrLength, fileCount  │
│     ├── ERROR CHECK:                                               │
│     │   ├── TimeoutError → LOG: ptc_tool_timeout (WARN)            │
│     │   └── container_expired → LOG: ptc_container_expired (ERROR) │
│     └── LANGFUSE EVENT: ptc_execution_completed                    │
│             └── toolCallCount, containerTimeMs, estimatedTokenSavings│
│                                                                     │
│  4. Container Lifecycle Events (Langfuse):                         │
│     ├── container_id_from_request (new container created)          │
│     ├── container_id_persisted (saved to lifecycle manager)        │
│     └── container_reused / container_new (on subsequent calls)     │
└─────────────────────────────────────────────────────────────────────┘
```

## Acceptance Criteria (All Met)

1. ✅ **Given** PTC execution starts, **When** the `server_tool_use` block is received, **Then** log `ptc_code_execution_started` event with serverToolUseId
   - *Implemented at loop.ts:875-878*

2. ✅ **Given** PTC executes multiple MCP tools, **When** each tool_use has `caller.type === 'code_execution_20250825'`, **Then** increment `ptcToolCallCount` for accurate metrics
   - *Implemented at loop.ts:898-902*

3. ✅ **Given** PTC completes successfully, **When** `code_execution_tool_result` block is received, **Then** log event with return_code, stdout/stderr lengths, and file count
   - *Implemented at loop.ts:941-948*

4. ✅ **Given** PTC completes with errors, **When** `return_code !== 0`, **Then** detect and log specific error types:
   - `TimeoutError` → `ptc_tool_timeout` (WARN level)
   - `container_expired` → `ptc_container_expired` (ERROR level)
   - *Implemented at loop.ts:951-964*

5. ✅ **Given** PTC completes with tool calls (`ptcToolCallCount > 0`), **When** emitting to Langfuse, **Then** include:
   - `toolCallCount` — number of MCP tools called via PTC
   - `containerTimeMs` — duration from container start to completion
   - `estimatedTokenSavings` — ~stdout.length / 4 (tokens not re-entered in context)
   - *Implemented at loop.ts:967-983*

6. ✅ **Given** container lifecycle events, **When** container is created, reused, or persisted, **Then** emit Langfuse events for debugging
   - *Implemented at loop.ts:683-720, 841-864*

7. ✅ **Given** PTC is in progress, **When** user sees Slack status, **Then** display "Running multi-tool analysis…" (contextual UX)
   - *Implemented in status-messages.ts:131-134*

8. ✅ **Given** all observability requirements, **When** running tests, **Then** full coverage exists for:
   - `ptc_container_expired` logging
   - `ptc_tool_timeout` logging
   - `ptc_execution_completed` Langfuse event
   - `estimatedTokenSavings` calculation
   - *Implemented at loop.test.ts:1765-1895*

## Tasks / Subtasks

- [x] Task 1 (AC: #1): Add `ptc_code_execution_started` logging
  - [x] Detect `server_tool_use` block type
  - [x] Log serverToolUseId for correlation

- [x] Task 2 (AC: #2): Add PTC tool call counting
  - [x] Check `caller.type === 'code_execution_20250825'` on tool_use blocks
  - [x] Increment counter for accurate metrics

- [x] Task 3 (AC: #3): Add `ptc_code_execution_completed` logging
  - [x] Log return_code, stdout/stderr lengths
  - [x] Log extracted file count

- [x] Task 4 (AC: #4): Add error detection and logging
  - [x] Detect `TimeoutError` in stderr
  - [x] Detect `container_expired` in stderr
  - [x] Log at appropriate levels (WARN/ERROR)

- [x] Task 5 (AC: #5): Add Langfuse `ptc_execution_completed` event
  - [x] Calculate containerTimeMs
  - [x] Calculate estimatedTokenSavings
  - [x] Include toolCallCount
  - [x] Only emit when ptcToolCallCount > 0

- [x] Task 6 (AC: #6): Add container lifecycle Langfuse events
  - [x] `container_id_from_request` event
  - [x] `container_id_persisted` event
  - [x] `container_reused` / `container_new` events

- [x] Task 7 (AC: #7): Add PTC streaming UX
  - [x] Return "Running multi-tool analysis…" for code_execution tool

- [x] Task 8 (AC: #8): Add unit tests
  - [x] Test container expiration logging
  - [x] Test timeout logging
  - [x] Test Langfuse event emission
  - [x] Test token savings estimation

## Dev Notes

### Key Implementation Details

**PTC Caller Detection (loop.ts:898-902):**
```typescript
const callerField = (event.content_block as unknown as { caller?: { type: string; id: string } })?.caller;
if (callerField?.type === PTC_CALLER_TYPE) {
  ptcToolCallCount++;
}
```

**Langfuse Event Emission (loop.ts:967-983):**
```typescript
const langfuseClient = getLangfuse();
if (langfuseClient?.event && ptcToolCallCount > 0) {
  const containerTimeMs = ptcContainerStartTime ? Date.now() - ptcContainerStartTime : 0;
  const estimatedTokenSavings = Math.floor((stdout?.length ?? 0) / 4);

  langfuseClient.event({
    name: 'ptc_execution_completed',
    metadata: {
      traceId: context.traceId,
      containerTimeMs,
      toolCallCount: ptcToolCallCount,
      estimatedTokenSavings,
    },
  });
}
```

**Streaming UX (status-messages.ts:131-134):**
```typescript
if (toolName === 'code_execution') {
  return ['Running multi-tool analysis…'];
}
```

### Project Structure Notes

- Observability logic integrated directly into `src/agent/loop.ts` (not separate file)
- Langfuse events use the singleton client from `src/observability/langfuse.ts`
- Status messages via `src/slack/status-messages.ts` (FR47 integration)
- All tests co-located in `src/agent/loop.test.ts`

### References

- [Source: src/agent/loop.ts#lines 860-990] — PTC handling and observability
- [Source: src/slack/status-messages.ts#lines 131-134] — PTC UX status
- [Source: src/agent/loop.test.ts#lines 1765-1895] — PTC unit tests
- [Source: _bmad-output/project-context.md] — Span naming: `{component}.{operation}`
- [Source: _bmad-output/architecture.md#Langfuse] — Observability patterns

### Langfuse Dashboard Usage

**Query PTC events:**
```
Events where name = 'ptc_execution_completed'
Group by: metadata.toolCallCount, metadata.containerTimeMs
```

**Track container lifecycle:**
```
Events where name in ['container_reused', 'container_new', 'container_id_from_request']
```

**Monitor errors:**
```
Traces containing event 'agent.loop.ptc_tool_timeout' OR 'agent.loop.ptc_container_expired'
```

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (story creation and validation)

### Debug Log References

N/A — Story validated as already complete from existing implementation.

### Completion Notes List

- 2026-01-07: Story created and validated as **done**
- All acceptance criteria already implemented in Stories 6.2, 6.3, and 6.7
- PTC observability shipped as part of broader PTC implementation (commit b85c48a, 975f6a5)
- No additional implementation required — this story documents existing functionality

### File List

- `src/agent/loop.ts` (existing — PTC observability at lines 860-990)
- `src/agent/loop.test.ts` (existing — PTC tests at lines 1765-1895)
- `src/slack/status-messages.ts` (existing — PTC UX at lines 131-134)
- `src/observability/langfuse.ts` (existing — Langfuse client singleton)
