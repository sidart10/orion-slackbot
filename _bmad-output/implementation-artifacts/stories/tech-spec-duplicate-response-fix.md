# Tech-Spec: Fix Duplicate Response on Tool Calls

**Created:** 2026-01-02
**Status:** ✅ Done — Verified Working 2026-01-02
**Priority:** P0 (Critical UX Bug)

## Overview

### Problem Statement

When Orion uses any tool (web search, MCP tools, etc.), the response appears **twice** within the same Slack message. Users see:

1. The full response appears first (seemingly instantly)
2. Then the same content streams in again character-by-character

This makes Orion appear broken and wastes users' time reading duplicate content.

### Solution

Identify and fix the root cause of duplicate content delivery. Based on investigation, the issue is likely in one of:

1. **Agent loop accumulation** — Text from multiple LLM iterations being concatenated
2. **Slack SDK behavior** — `chatStream` API sending content twice (start + stop)
3. **LLM output** — Claude generating duplicate content in a single response

### Scope

**In Scope:**
- Fix duplicate responses when tools are called
- Add debug logging to pinpoint root cause
- Verify fix works for all tool types (MCP tools, any future static tools)

**Out of Scope:**
- Source citation improvements (separate spec)
- Non-tool-related streaming issues (if any exist)

## Context for Development

### Codebase Patterns

**Agent Loop (`src/agent/loop.ts`):**
```typescript
// Tool iteration pattern
for (let iteration = 0; iteration < MAX_TOOL_LOOPS; iteration++) {
  attemptResponse = ''; // Reset per iteration (line 284)
  
  // Stream LLM response
  for await (const event of stream) {
    if (deltaEvent.delta?.type === 'text_delta') {
      attemptResponse += text; // Accumulate text
    }
  }
  
  // If tool_use, execute and loop; else break
}

// After loop: yield attemptResponse in chunks
```

**Streaming (`src/utils/streaming.ts`):**
```typescript
// SlackStreamer wraps Slack's chatStream
append(text: string): void {
  this.pendingContent += text;
  // Debounced flush to Slack
}

async stop(): Promise<StreamMetrics> {
  await this.flushPendingContent(); // Flush remaining
  await this.streamer.stop(); // SDK finalizes
}
```

**Slack SDK (`chat-stream.js`):**
```javascript
// SDK has internal buffer
append(args) {
  this.buffer += args.markdown_text;
  if (this.buffer.length >= 256) {
    await this.flushBuffer(); // Calls appendStream API
  }
}

stop() {
  // Sends stopStream with remaining buffer
  await this.client.chat.stopStream({ markdown_text: this.buffer });
}
```

### Files to Reference

| File | Lines | What to Check |
|------|-------|---------------|
| `src/agent/loop.ts` | 278-450 | Tool loop, text accumulation |
| `src/utils/streaming.ts` | 150-255 | append/stop logic |
| `src/slack/handlers/app-mention.ts` | 300-320 | Generator consumption |
| `src/slack/handlers/user-message.ts` | 430-455 | Generator consumption |

### Technical Decisions

1. **Debug-first approach** — Add targeted logging before attempting fixes
2. **Preserve streaming UX** — Fix must not break real-time streaming feel
3. **Maintain verification** — Response verification must still work

### Potential Bug Identified (Rubber Duck Analysis)

**Location:** `src/agent/loop.ts` lines 479-488

**Issue:** When appending the assistant message after a tool call, we only include `tool_use` blocks, NOT the text content that came before them:

```typescript
// CURRENT (potentially buggy):
attemptMessages.push({
  role: 'assistant',
  content: toolUsesThisCall.map((t) => ({
    type: 'tool_use',
    id: t.id,
    name: t.name,
    input: t.input,
  })),
});
```

**Expected per Anthropic API:**
```typescript
attemptMessages.push({
  role: 'assistant',
  content: [
    { type: 'text', text: attemptResponse }, // Include the text!
    ...toolUsesThisCall.map((t) => ({
      type: 'tool_use',
      id: t.id,
      name: t.name,
      input: t.input,
    })),
  ],
});
```

**Impact:** Claude may not remember what it said before the tool call, potentially causing it to regenerate similar/duplicate content in the next iteration.

**Confidence Level:** Medium — This is a code smell that violates Anthropic's conversation format, but may not be the direct cause of the exact duplicate symptom. Logs are required to confirm.

## Implementation Plan

### ⚠️ CRITICAL: Logs Required Before Fix

**We cannot be 100% confident in the fix without seeing actual debug logs.** The code has been traced through 7 levels and looks correct, but the exact source of duplication is not visible without runtime data.

### Tasks

- [x] **Task 0: PRIORITY — Capture debug logs** ⭐ ✅ DONE
  ```bash
  LOG_LEVEL=debug npm run dev
  ```
  Then in Slack: `@orion what's happening in tech news today?`
  
  **Look for these log events:**
  | Event | What to Check |
  |-------|---------------|
  | `agent.loop.reset_attempt_response` | What text is being discarded between iterations? |
  | `agent.loop.iteration_complete` | What does each LLM call produce? Is content already duplicated here? |
  | `agent.loop.yielding_response` | Is the final yield content duplicated? |
  | `stream_append_call` | Are we sending duplicate content to Slack? |
  
  **Share logs with these events to confirm root cause.**

- [x] **Task 1: Analyze logs and confirm root cause** ✅ DONE
  
  **Result:** Race condition in Slack SDK's chatStream. Two `startStream` calls made before first returns.

- [x] **Task 2: Fix the Anthropic API compliance issue** ✅ DONE
  
  **File:** `src/agent/loop.ts` lines 479-502
  
  **Change:** Now includes text blocks in assistant messages when tool_use is present.

- [x] **Task 3: Implement fix for race condition** ✅ DONE
  
  **File:** `src/utils/streaming.ts`
  
  **Change:** Added `flushInProgress` lock to serialize SDK calls:
  ```typescript
  // Lock to prevent concurrent SDK calls
  private flushInProgress: Promise<void> | null = null;
  
  // In flushPendingContent():
  if (this.flushInProgress) {
    await this.flushInProgress;  // Wait for previous flush
  }
  this.flushInProgress = this.appendWithRetry(content);
  await this.flushInProgress;
  this.flushInProgress = null;
  ```

- [ ] **Task 4: Remove/gate debug logging** (optional - keep for now)

- [x] **Task 5: Manual verification in Slack** ✅ *Sid verified 2026-01-02*
  - [x] Test @mention with tool call
  - [x] Test DM with tool call
  - [x] Test thread reply with tool call
  - [x] Verify single response in all cases

- [x] **Task 6: Code Review Fixes Applied** ✅ (2026-01-02 Barry review)
  - [x] H1: Fixed race condition in `stop()` - now awaits `flushInProgress` before checking `pendingContent`
  - [x] H2: Added 2 race condition tests to `streaming.test.ts` (24 total tests pass)
  - [x] L3: Added proper JSDoc to `flushInProgress` lock explaining the invariant

### Acceptance Criteria

- [x] **AC1:** When a tool is called, the response appears exactly once in Slack ✅
- [x] **AC2:** Response still streams in real-time (not delayed until complete) ✅
- [x] **AC3:** Works for both @mentions and DMs ✅
- [x] **AC4:** Works for all tool types (any MCP tool) ✅
- [x] **AC5:** Existing tests continue to pass ✅ *(24/24 streaming.test.ts + loop.test.ts pass)*
- [x] **AC6:** Race condition in stop() fully covered ✅ *(2 new tests added for H1 fix)*

## Additional Context

### Debug Logging Added

The following debug logs were added to help diagnose (already in codebase):

```typescript
// src/agent/loop.ts
'agent.loop.reset_attempt_response' // What's discarded between iterations
'agent.loop.iteration_complete'      // What each LLM call produced
'agent.loop.yielding_response'       // Final content before Slack delivery

// src/utils/streaming.ts  
'stream_append_call'                 // Every append to Slack stream
'stream_stop_flushing_pending'       // Content flushed before stop
'stream_stop_calling'                // Before SDK stop() called
```

### How to Test

```bash
# 1. Start with debug logging
LOG_LEVEL=debug npm run dev

# 2. In Slack, trigger a tool call:
@orion what's happening in tech news today?

# 3. Check terminal logs for the debug events listed above

# 4. Look for where duplicate content first appears
```

### Dependencies

- None (fix is internal)

### Testing Strategy

1. **Manual:** Verify in Slack that responses appear once
2. **Automated:** Existing streaming tests should still pass
3. **Regression:** Run full test suite to ensure no breakage

### Notes

- Story 7.5 attempted a fix (`attemptResponse = ''` reset) but it didn't solve the issue
- The Slack SDK's internal buffering may be a factor
- Consider logging the exact bytes sent to Slack APIs for full visibility

### Rubber Duck Debugging Findings (2026-01-02)

**7-Level Deep Code Trace Results:**

1. **Level 1-2 (Conceptual):** Duplication happens only with tool calls. Two LLM iterations occur.

2. **Level 3-4 (Code):** The reset at line 284 (`attemptResponse = ''`) correctly discards iteration 0's text. Agent loop is working correctly.

3. **Level 5-6 (SDK):** ⚠️ **RACE CONDITION DISCOVERED** in Slack SDK's async handling.

4. **Level 7 (Full Trace):** Debug logs confirmed agent loop yields content ONCE, but Slack receives it TWICE.

---

## 🔴 CONFIRMED ROOT CAUSE (Log Analysis 2026-01-02)

**The bug is a RACE CONDITION in the Slack SDK's `chatStream` implementation.**

### Evidence from Logs:

```
21:41:08.120 - stream_append_call (1084 chars) → SDK's startStream begins
21:41:08.175 - stream_stop_flushing_pending (6 chars) → SDK's append called
21:41:08.??? - SECOND startStream called (before first returns!)
```

Two `chat.startStream` API calls were made:
- First: `ts: 1767390068.251939` with 1084 chars
- Second: `ts: 1767390068.355159` with 1090 chars

**Result: TWO Slack messages created with the same content!**

### Race Condition Mechanism:

1. `sdk.append(1084)` triggers async `startStream` API call
2. Before API returns, `sdk.append(6)` is called
3. SDK's buffer grows to 1090 (1084 + 6)
4. Buffer >= 256, triggers SECOND `startStream` call
5. Both calls create separate messages

### Fix Applied:

Added `flushInProgress` lock to `SlackStreamer.flushPendingContent()` to serialize SDK calls:

```typescript
if (this.flushInProgress) {
  await this.flushInProgress;  // Wait for previous flush
}
this.flushInProgress = this.appendWithRetry(content);
await this.flushInProgress;
this.flushInProgress = null;
```

This ensures SDK API calls complete before starting new ones.

---

**Previously Identified Issue (also fixed):**
- Lines 479-488 in `loop.ts` now include text blocks in assistant messages for Anthropic API compliance

---

## Dev Agent Record (Barry Code Review 2026-01-02)

### Review Findings Summary

| Severity | Issue | Resolution |
|----------|-------|------------|
| 🔴 H1 | Race condition in `stop()` - didn't await `flushInProgress` | Fixed in `streaming.ts` |
| 🔴 H2 | No test coverage for race condition fix | Added 2 tests |
| 🟡 M1 | AC1-4 manual verification incomplete | Deferred to Task 5 |
| 🟡 M2 | Debug logs active in production | Deferred (gated by LOG_LEVEL) |
| 🟡 M3 | Git vs Story file list discrepancy | Acknowledged (unrelated changes) |
| 🟡 M4 | Heartbeat timer leak on error path | Not fixed (low priority) |
| 🟢 L3 | Missing JSDoc on critical lock | Fixed |

### File List

| File | Lines | Change |
|------|-------|--------|
| `src/utils/streaming.ts` | 83-95, 250-270 | H1: Await `flushInProgress` before SDK stop, L3: Added JSDoc |
| `src/utils/streaming.test.ts` | 390-465 | H2: Added 2 race condition tests (24 total pass) |
| `tech-spec-duplicate-response-fix.md` | Multiple | Updated status, tasks, ACs |

### Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-01-02 | Sid | ✅ Manual verification passed — Story complete |
| 2026-01-02 | Barry (AI Review) | Fixed H1 race condition in stop(), added H2 tests, added L3 JSDoc |
| 2026-01-02 | Dev | Initial implementation with flushInProgress lock |

### Test Results

```
streaming.test.ts: 24/24 passed ✅
app-mention.test.ts: 29/29 passed ✅  
loop.test.ts: 21/21 passed ✅
Total: 74/74 passed ✅
```

### Remaining Work

None — Story complete! 🎉

