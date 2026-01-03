# Story 2.9: Streaming Tool Input Accumulation

**Epic:** Epic 2 — Agent Loop & Anthropic Integration  
**Priority:** P1 (Critical for robustness)  
**Status:** done  
**Created:** 2025-12-31  
**Triggered By:** Course Correction Analysis — found gap in `input_json_delta` handling

---

## User Story

**As** the Orion agent processing complex requests,  
**I want** to correctly accumulate streamed tool inputs,  
**So that** tools receive complete input data even for very large payloads.

---

## Problem Statement

When Claude streams a tool call response, large inputs are sent incrementally via `input_json_delta` events. Our current implementation only captures the initial `input` from `content_block_start`, ignoring subsequent delta chunks.

### Current Behavior

```typescript
// src/agent/loop.ts - Lines 283-321
if (event.type === 'content_block_start') {
  if (event.content_block?.type === 'tool_use') {
    toolUsesThisCall.push({
      id: event.content_block.id,
      name: event.content_block.name,
      input: event.content_block.input,  // ← Only this is captured (may be empty {})
    });
  }
}

if (event.type === 'content_block_delta') {
  if (event.delta?.type === 'text_delta') {  // ← Only text handled
    attemptResponse += text;
  }
  continue;  // ← input_json_delta IGNORED
}
// NOTE: No content_block_stop handler exists
```

### Impact

| Scenario | Risk |
|----------|------|
| Large code blocks in tool input | Tool receives empty/partial code |
| Long text analysis requests | Truncated context |
| Complex structured data | Invalid JSON |
| Multi-step MCP workflows | Silent failures |

---

## Technical Design

### Anthropic Streaming Events (Tool Calls)

```
┌─────────────────────────────────────────────────────────────────┐
│ content_block_start                                              │
│   type: "tool_use"                                               │
│   id: "toolu_123"                                                │
│   name: "analyze_code"                                           │
│   input: {}  ← May be EMPTY for large inputs                    │
├─────────────────────────────────────────────────────────────────┤
│ content_block_delta (1..N times)                                 │
│   type: "input_json_delta"                                       │
│   partial_json: '{"code": "function foo() {'                    │
├─────────────────────────────────────────────────────────────────┤
│ content_block_delta                                              │
│   type: "input_json_delta"                                       │
│   partial_json: '  return bar;\n}"}'                            │
├─────────────────────────────────────────────────────────────────┤
│ content_block_stop                                               │
│   index: 0  ← Signal to finalize accumulated input              │
└─────────────────────────────────────────────────────────────────┘
```

### Solution: Accumulation Buffer

```typescript
// Type with index tracking for accumulation correlation
type StreamingToolUse = {
  id: string;
  name: string;
  input: unknown;
  _index: number;
};

// Track partial inputs per tool block
const toolInputBuffers = new Map<number, string>();  // index → accumulated JSON
const MAX_BUFFER_SIZE = 1024 * 1024;  // 1MB limit per tool input

// On content_block_start
if (event.content_block?.type === 'tool_use') {
  toolUsesThisCall.push({
    id: event.content_block.id,
    name: event.content_block.name,
    input: event.content_block.input,  // May be empty {} for large inputs
    _index: event.index,
  });
  toolInputBuffers.set(event.index, '');
}

// On content_block_delta
if (event.delta?.type === 'input_json_delta') {
  const buffer = toolInputBuffers.get(event.index) ?? '';
  const newBuffer = buffer + event.delta.partial_json;
  if (newBuffer.length > MAX_BUFFER_SIZE) {
    logger.error({ event: 'tool.input.too_large', index: event.index, traceId });
    toolInputBuffers.delete(event.index);  // Abandon accumulation
  } else {
    toolInputBuffers.set(event.index, newBuffer);
  }
}

// On content_block_stop — finalize accumulated input
// NOTE: Accumulated JSON takes precedence over initial input (Anthropic spec)
if (event.type === 'content_block_stop') {
  const accumulated = toolInputBuffers.get(event.index);
  if (accumulated && accumulated.length > 0) {
    const tool = toolUsesThisCall.find(t => t._index === event.index);
    if (tool) {
      try {
        tool.input = JSON.parse(accumulated);  // Overrides any initial input
      } catch (e) {
        logger.error({ event: 'tool.input.parse_failed', index: event.index, traceId });
      }
    }
    toolInputBuffers.delete(event.index);
  }
}
```

---

## Acceptance Criteria

### AC1: Small Inputs Still Work
- **Given** Claude returns a tool call with complete input in `content_block_start`
- **When** the streaming handler processes the event
- **Then** the tool receives the complete input immediately

### AC2: Large Inputs Accumulated
- **Given** Claude streams tool input via multiple `input_json_delta` events
- **When** `content_block_stop` is received
- **Then** all partial JSON chunks are concatenated and parsed
- **And** the tool receives the complete, valid input object

### AC3: Multiple Concurrent Tool Calls
- **Given** Claude returns 3 tool calls in one response, each with streamed inputs
- **When** delta events arrive interleaved
- **Then** each tool's input is accumulated independently (by index)

### AC4: Error Handling
- **Given** accumulated JSON is malformed
- **When** `JSON.parse()` fails
- **Then** error is logged with `traceId`
- **And** tool execution is skipped with clear error message

### AC5: Observability
- **Given** input accumulation occurs
- **When** `content_block_stop` finalizes the input
- **Then** log includes: tool name, accumulated bytes, parse success/failure

### AC6: Memory Safety (Buffer Size Limit)
- **Given** a tool input accumulates beyond 1MB
- **When** the next `input_json_delta` arrives
- **Then** accumulation stops and buffer is cleared
- **And** error is logged with `traceId` and index
- **And** tool execution proceeds with initial `input` (may be empty/partial)

---

## Test Cases

| Test | Scenario | Expected |
|------|----------|----------|
| `small_input_immediate` | Input fits in start event | Tool called immediately with input |
| `large_input_accumulated` | 5 delta chunks | All chunks joined, parsed, tool receives complete input |
| `concurrent_tools_isolated` | 3 tools streaming simultaneously | Each tool gets correct input |
| `malformed_json_handled` | Delta chunks form invalid JSON | Error logged, tool not called |
| `empty_delta_ignored` | Delta with empty `partial_json` | No crash, accumulation continues |
| `mixed_text_and_tool` | Text + tool in same response | Both handled correctly |
| `buffer_exceeds_limit` | Accumulated input > 1MB | Buffer cleared, error logged, tool uses initial input |
| `initial_input_overridden` | Start has partial input, deltas complete it | Accumulated JSON wins |

---

## Tasks / Subtasks

- [x] **Task 1: Add StreamingToolUse Type** (AC: #1, #2, #3)
  - [x] Define `StreamingToolUse` type with `_index` field in `src/agent/loop.ts`
  - [x] Update `toolUsesThisCall` array to use new type
  - [x] Capture `event.index` in `content_block_start` handler

- [x] **Task 2: Implement Accumulation Buffer** (AC: #2, #3, #6)
  - [x] Add `toolInputBuffers: Map<number, string>` for per-tool accumulation
  - [x] Add `MAX_BUFFER_SIZE = 1024 * 1024` (1MB limit)
  - [x] Initialize buffer on `content_block_start` for tool_use blocks

- [x] **Task 3: Handle input_json_delta Events** (AC: #2, #3, #6)
  - [x] Add `input_json_delta` case in `content_block_delta` handler
  - [x] Accumulate `event.delta.partial_json` to buffer by index
  - [x] Enforce buffer size limit; clear and log error if exceeded

- [x] **Task 4: Handle content_block_stop Finalization** (AC: #2, #4, #5)
  - [x] Add `content_block_stop` event handler
  - [x] Parse accumulated JSON and update tool input
  - [x] Handle JSON parse errors gracefully (log, skip tool)
  - [x] Clean up buffer after finalization

- [x] **Task 5: Observability** (AC: #5)
  - [x] Log accumulation metrics: tool name, bytes, success/failure
  - [x] Include `traceId` in all log entries
  - [x] Log buffer overflow events

- [x] **Task 6: Unit Tests** (AC: #1-6)
  - [x] `small_input_immediate` — input fits in start event
  - [x] `large_input_accumulated` — 5 delta chunks joined correctly
  - [x] `concurrent_tools_isolated` — 3 tools streaming simultaneously
  - [x] `malformed_json_handled` — parse error logged, tool skipped
  - [x] `empty_delta_ignored` — no crash on empty partial_json
  - [x] `mixed_text_and_tool` — text + tool in same response
  - [x] `buffer_exceeds_limit` — buffer cleared, error logged
  - [x] `initial_input_overridden` — accumulated JSON takes precedence

**Total Effort: ~4.5 hours**

---

## Dev Notes

### Implementation Notes

> ⚠️ **Error Handling Distinction:**
> - **Malformed JSON (AC4):** Tool execution is **skipped** — unsafe to proceed
> - **Buffer overflow (AC6):** Tool execution **proceeds** with initial input — best-effort fallback

### File Locations

| File | Changes |
|------|---------|
| `src/agent/loop.ts` | Add type, buffers, event handlers (lines ~283-321) |
| `src/agent/loop.test.ts` | Add 8 streaming accumulation test cases |

### Scope / Boundaries

- **This story owns:** Streaming input accumulation in the agent loop
- **Does NOT touch:** Tool execution, MCP client, verification logic

### Dependencies

- None — standalone fix to existing code

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Memory pressure from large buffers | Low | Set max buffer size, error if exceeded |
| Index mismatch bugs | Low | Defensive coding, clear logging |
| Breaking existing small-input flows | Low | Keep existing path, only add accumulation |

---

## Definition of Done

- [x] `StreamingToolUse` type with `_index` defined
- [x] `input_json_delta` events accumulated correctly
- [x] `content_block_stop` triggers finalization
- [x] Buffer size limit (1MB) enforced
- [x] All 8 test cases pass
- [x] No regression in existing tool call tests
- [x] Observability logs include accumulation metrics
- [x] Code reviewed for memory safety

---

## Dev Agent Record

### Implementation Plan

1. Add `StreamingToolUse` type with `_index` and `_skipExecution` fields
2. Add `MAX_BUFFER_SIZE` constant (1MB) for memory safety
3. Add `toolInputBuffers: Map<number, string>` per-call for accumulation
4. Modify `content_block_start` handler to capture `event.index` and init buffer
5. Add `input_json_delta` handling in `content_block_delta` with size limit enforcement
6. Add `content_block_stop` handler to finalize accumulated JSON and override initial input
7. Add `_skipExecution` flag for tools with parse failures
8. Modify tool execution to skip tools with parse failures and return error result
9. Add 8 comprehensive unit tests covering all ACs

### Completion Notes

**Implementation Summary:**
- Added `StreamingToolUse` type at line ~110 with `_index` for correlating events and `_skipExecution` for marking parse failures
- Added `MAX_BUFFER_SIZE = 1024 * 1024` (1MB) constant for memory safety
- Buffer initialized per tool_use in `content_block_start`, indexed by `event.index`
- `input_json_delta` events accumulate `partial_json` to buffer; buffer cleared if exceeds 1MB
- `content_block_stop` parses accumulated JSON, overrides initial input, logs metrics
- Parse failures mark `_skipExecution = true`; tool executor skips and returns error result
- All 8 test cases pass; no regressions in existing 11 agent loop tests (19 total pass)

**Key Design Decisions:**
- AC4 (malformed JSON) → Skip tool execution entirely (unsafe to proceed)
- AC6 (buffer overflow) → Fall back to initial input (best-effort, may be empty)
- Used type assertion for Anthropic event types (`as { index?: number }`) since SDK types don't expose `index` directly

### Code Review Fixes (2025-01-02)

**Issues Fixed:**
- **M1**: Added traceId and toolName assertions to `malformed_json_handled` and `buffer_exceeds_limit` tests
- **M2**: Added `accumulation_success_logged` test to verify success-path logging includes tool name, bytes, traceId
- **M3**: Changed type assertions to defensive checks (`typeof rawIndex === 'number'`) in all 3 index extraction locations
- **L1**: Added `text_block_stop_handled` test to verify content_block_stop for non-tool blocks is graceful
- **L3**: Added `tool.execution.skipped` log assertion in `malformed_json_handled` test

**Tests after review:** 21 passing (was 19)

---

## File List

| Action | Path |
|--------|------|
| Modified | `src/agent/loop.ts` — Added StreamingToolUse type, MAX_BUFFER_SIZE, accumulation buffers, input_json_delta handler, content_block_stop handler, skip execution logic |
| Modified | `src/agent/loop.test.ts` — Added 8 streaming accumulation test cases in new describe block |

---

## Change Log

| Date | Change |
|------|--------|
| 2025-12-31 | Story created during Course Correction workflow |
| 2025-01-02 | Added standard dev sections (Tasks/Subtasks, Dev Notes, Dev Agent Record, File List, Change Log) |
| 2025-01-02 | Implementation complete: All 6 tasks done, 8 tests pass, no regressions |
| 2025-01-02 | Code review: Fixed 3 MEDIUM + 2 LOW issues; added 2 tests; 21 tests now pass |

---

## References

- [Anthropic Streaming Events Documentation](https://docs.anthropic.com/en/api/streaming)
- Course Correction Analysis: `sprint-change-proposal-2025-12-31.md`
- Agent Loop: `src/agent/loop.ts` lines 283-321

