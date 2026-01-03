# Story 7.5: Fix Duplicate Response Bug

## Story

**As a** Slack user  
**I want** to see my response only once  
**So that** I don't see confusing duplicate content in threads

## Status

| Field | Value |
|-------|-------|
| Status | ✅ done |
| Epic | 7 - Slack Polish |
| Priority | P0 (Bug) |
| Estimate | 2 points |
| Dependencies | None |
| Completed | 2026-01-02 |

## Background

Users are seeing responses appear twice in Slack threads:

1. **First appearance**: Raw/unformatted response appears quickly
2. **Second appearance**: Same content streams in with proper formatting

Example from user report:
```
at around san franscico this weekend or any events happening?
4 replies

orion [first response - raw]
I'll help you find the best places to eat and events happening in San Francisco this weekend!
[...full content...]

orion [second response - streamed/formatted]  
I'll help you find the best places to eat and events happening in San Francisco this weekend!
[...same content with formatting...]
```

## Files to Investigate

| File | Purpose | Priority |
|------|---------|----------|
| `src/utils/streaming.ts` | ChatStream wrapper with debounce logic | 🔴 Primary |
| `src/slack/response-generator.ts` | Response streaming to Slack | 🔴 Primary |
| `src/slack/handlers/user-message.ts` | Message event handler | 🟡 Secondary |
| `src/slack/assistant.ts` | Slack Assistant API setup | 🟡 Secondary |

**Reference:** `@slack/bolt 4.6.0` — check Bolt 4.6.0 changelog for `chatStream` behavior changes.

## Streaming Constraints (Must Preserve)

From `project-context.md` — these rules MUST remain working after the fix:

| Constraint | Value | Source |
|------------|-------|--------|
| Debounce minimum | 250ms between Slack updates | NFR |
| First token latency | <500ms from message receipt | NFR4 |
| Heartbeat | Send if silent >10s | Streaming safety |

## Root Cause Hypotheses

| # | Hypothesis | Test | Likelihood |
|---|------------|------|------------|
| 1 | `chatStream.stop()` posts final message IN ADDITION to streaming updates | Add logging around `stop()` return value | High |
| 2 | `app_mention` or message event fires twice | Add traceId to first log, verify single trace per message | Medium |
| 3 | Code calls both `streamer.append()` AND `chat.postMessage()` with same content | Grep for `postMessage` calls with response content | Medium |

**Expected fix complexity:** <50 LOC once root cause identified.

## Root Cause (Identified 2026-01-02)

### Initial Hypothesis (Partial)
**Hypothesis #2 - Both handlers fire for the same message** was partially correct and addressed with event deduplication. However, this did NOT fix the duplicate content issue.

### Actual Root Cause (Identified 2026-01-02 - Code Review)

**The agent loop was accumulating text across tool iterations without resetting.**

In `src/agent/loop.ts`, the inner tool loop calls the LLM multiple times:
1. **Iteration 0**: LLM outputs "I'll search for information..." + `tool_use`
2. **Iteration 1**: LLM receives tool result, outputs "Based on my search, here's what I found..." (full response)

The bug: `attemptResponse` was NOT being reset between iterations. Both iterations' text was concatenated:
```
"I'll search for information...[iteration 0 text]" + "[iteration 1 full response]"
```

This caused the same content to appear twice in the final output - the "thinking" text from iteration 0, followed by the full response from iteration 1.

**Fix Applied:** Reset `attemptResponse = ''` at the start of each LLM iteration (line 283 of `loop.ts`). Only the FINAL iteration's text (after all tools complete) is now delivered.

## Acceptance Criteria

### AC1: Root Cause Identified
- [x] Debug logging added to identify exact source of duplication
- [x] Root cause documented in this story

### AC2: Single Response Delivery
- [x] User sees response exactly once
- [x] No duplicate messages in thread
- [x] Works for both @mentions and DMs

### AC3: Streaming Still Works
- [x] Response still streams in real-time (not delayed until complete)
- [x] Debouncing still works (250ms between updates)
- [x] Heartbeat still works for long operations

## Investigation Checklist

### 1. Add Debug Logging (with traceId)

```typescript
// src/utils/streaming.ts - start()
logger.debug({
  event: 'streaming.chatStream.start',
  traceId,
  channel: this.channel,
  threadTs: this.threadTs,
});

// src/utils/streaming.ts - append()
logger.debug({
  event: 'streaming.chatStream.append',
  traceId,
  contentLength: text.length,
  contentPreview: text.slice(0, 50),
});

// src/utils/streaming.ts - stop()
logger.debug({
  event: 'streaming.chatStream.stop_called',
  traceId,
  pendingContent: this.pendingContent.length,
  totalChars: this.totalChars,
});

const result = await this.streamer.stop();

logger.debug({
  event: 'streaming.chatStream.stop_returned',
  traceId,
  result: JSON.stringify(result).slice(0, 200),
});
```

### 2. Check for Multiple Event Handlers

```bash
# Verify only one handler registered per event type
grep -r "app.event('app_mention')" src/
grep -r "app.message" src/
grep -r "assistant.thread" src/
```

### 3. Review Slack Bolt 4.6.0 chatStream API

Check Slack docs and Bolt source for:
- Does `stop()` post a final message?
- Is there a `finalize()` vs `stop()` distinction?
- Any known issues with duplicate content?
- Compare behavior with `chat.update()` vs streaming append

## Potential Fixes

### Fix A: Suppress chatStream Final Message

If `chatStream.stop()` posts a final message:
- Check if there's a `silent: true` or `skipFinal: true` option
- Or delete the streaming message before `stop()` posts final
- Or use `chat.update()` to overwrite instead of append

### Fix B: Event Deduplication

If events fire twice:
```typescript
// At handler entry
const cacheKey = `${channel}:${messageTs}`;
if (processedMessages.has(cacheKey)) {
  logger.debug({ event: 'handler.duplicate_skipped', traceId, cacheKey });
  return;
}
processedMessages.set(cacheKey, Date.now());
```

### Fix C: Content Hashing (Fallback)

As a defensive safeguard:
```typescript
const contentHash = crypto.createHash('md5').update(content).digest('hex');
const hashKey = `${threadTs}:${contentHash}`;
if (recentHashes.has(hashKey)) {
  logger.warn({ event: 'streaming.duplicate_content_blocked', traceId, hashKey });
  return;
}
```

**Note:** Only use as fallback — adds ~1ms overhead per message.

## Test Cases

### Manual Testing

1. **@mention in channel** → Verify single response
2. **DM to Orion** → Verify single response
3. **Thread reply with @mention** → Verify single response
4. **Long tool-calling response** → Verify no duplication during streaming

### Automated Tests

**Test file:** `src/utils/streaming.test.ts` (co-located)

```typescript
describe('ChatStream', () => {
  it('should call append without triggering duplicate messages', async () => {
    const mockStreamer = createMockChatStream();
    const stream = new StreamingResponse(mockStreamer);
    
    await stream.append('Hello');
    await stream.append(' world');
    await stream.stop();
    
    // Verify no duplicate postMessage calls
    expect(mockStreamer.postMessage).not.toHaveBeenCalled();
  });

  it('should deduplicate rapid duplicate events', async () => {
    const handler = createMessageHandler();
    const event = createMockEvent({ ts: '123.456' });
    
    await Promise.all([
      handler(event),
      handler(event), // Duplicate
    ]);
    
    expect(processedCount).toBe(1);
  });
});
```

## Definition of Done

- [x] Root cause identified and documented
- [x] Fix implemented
- [x] No duplicate responses in any flow
- [x] Streaming constraints preserved (250ms debounce, <500ms first token, heartbeat)
- [x] Manual verification in Slack confirms fix (Sid verified 2026-01-02)
- [x] Regression tests added in `src/slack/event-dedup.test.ts`

## Notes

This is a **P0 bug** — it significantly impacts user experience and makes Orion appear broken/unreliable. Prioritize investigation and fix.

**Related patterns:**
- See `project-context.md` → Streaming Safety for constraints
- See `architecture.md` → Slack Response Format for Block Kit patterns

---

## Dev Agent Record

### Implementation Plan

1. Investigate root cause by analyzing handler flow and chatStream SDK behavior
2. Implement event deduplication cache to prevent both handlers from processing same message
3. Integrate deduplication into both app_mention and user-message handlers
4. Write comprehensive tests for deduplication logic
5. Verify streaming constraints preserved

### Debug Log

- Analyzed `node_modules/@slack/web-api/dist/chat-stream.js` - chatStream behavior
- Traced event flow through app_mention.ts and user-message.ts handlers
- Identified that both handlers can fire for same channel @mention
- Existing botUserId check in user-message.ts unreliable due to context availability

### Completion Notes

- Created `src/slack/event-dedup.ts` - LRU-style cache for deduplicating message events
- Integrated `isDuplicateEvent()` check at start of both handlers
- 11 tests added covering deduplication scenarios
- All 92 relevant tests pass (event-dedup, app-mention, user-message, streaming)
- Pre-existing memory module test failures unrelated (missing gray-matter dependency)

### Code Review Fixes (2026-01-02)

- **M2 Fixed:** Added `app-mention.test.ts` to File List (was modified but undocumented)
- **M3 Fixed:** Added optional `traceId` parameter to `isDuplicateEvent()` for log correlation
- **M4 Fixed:** Added 4 tests for cache cleanup: TTL expiration, partial cleanup, constants verification, traceId param
- **L2 Fixed:** Standardized log event naming to `event_dedup.skipped` in both handlers

### Root Cause Fix (2026-01-02 - Post-Review)

- **ACTUAL BUG:** `attemptResponse` in `loop.ts` was accumulating text across ALL tool loop iterations
- **Fix:** Reset `attemptResponse = ''` at start of each iteration (only final iteration text delivered)
- **Files Changed:** `src/agent/loop.ts` (line 283)

---

## File List

### Files Created

| File | Purpose |
|------|---------|
| `src/slack/event-dedup.ts` | Event deduplication cache with TTL, LRU cleanup, and optional traceId |
| `src/slack/event-dedup.test.ts` | 15 tests for deduplication logic including cache cleanup |

### Files Modified

| File | Change |
|------|--------|
| `src/slack/handlers/app-mention.ts` | Added isDuplicateEvent check at handler start; standardized log event naming |
| `src/slack/handlers/user-message.ts` | Added isDuplicateEvent check before legacy botUserId check; standardized log event naming |
| `src/slack/handlers/app-mention.test.ts` | Existing tests pass with dedup integration |
| `src/agent/loop.ts` | Reset attemptResponse at start of each tool loop iteration to prevent text accumulation |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-02 | Root cause identified: Both handlers fire for channel @mentions due to unreliable botUserId |
| 2026-01-02 | Implemented event deduplication cache (Fix B from story) |
| 2026-01-02 | Integrated dedup into app-mention.ts and user-message.ts handlers |
| 2026-01-02 | Added 11 tests, all 92 related tests pass |
| 2026-01-02 | Code review fixes: Added optional traceId param, cache cleanup tests, standardized log naming |
| 2026-01-02 | ACTUAL ROOT CAUSE FIX: Reset attemptResponse per iteration in loop.ts (text was accumulating across tool calls) |
| 2026-01-02 | ✅ VERIFIED WORKING: Manual verification passed, story complete |

---

## 📚 Learnings & Architectural Recommendations

### Key Findings

This bug required **3 separate fixes** across different layers:

| Layer | Issue | Fix |
|-------|-------|-----|
| **Event Layer** | Both `app_mention` and `assistant` handlers fire for channel @mentions | Event deduplication cache (`event-dedup.ts`) |
| **Agent Layer** | `attemptResponse` accumulated text across tool loop iterations | Reset per iteration in `loop.ts` |
| **SDK Layer** | Race condition - two `startStream` API calls before first returns | `flushInProgress` lock in `streaming.ts` |

### Root Cause Analysis

The **actual** root cause (SDK race condition) was only discoverable through debug logs. The code *looked* correct at every layer, but async timing caused duplicate API calls.

**Race Condition Mechanism:**
1. `sdk.append(1084 chars)` triggers async `startStream` API
2. Before API returns, `sdk.append(6 chars)` is called
3. SDK buffer grows to 1090 chars (≥256 threshold)
4. **Second** `startStream` call fires before first completes
5. Result: Two Slack messages with same content

### Recommendations for PM/Architect

#### 1. **Pattern: Async SDK Call Serialization** ⭐ HIGH
Add to architecture docs: When wrapping async SDK methods that have internal state (buffers, streams), use a lock pattern:
```typescript
private flushInProgress: Promise<void> | null = null;

async flush(): Promise<void> {
  if (this.flushInProgress) await this.flushInProgress;
  this.flushInProgress = this.doFlush();
  await this.flushInProgress;
  this.flushInProgress = null;
}
```

#### 2. **Pattern: Multi-Iteration LLM Loops** ⭐ HIGH
When running LLM in a tool loop, **reset accumulation buffers at start of each iteration**, not end:
```typescript
for (let i = 0; i < MAX_ITERATIONS; i++) {
  buffer = '';  // ✅ Reset HERE, not at end
  // ... LLM streaming ...
}
```
Otherwise, intermediate "thinking" text contaminates final output.

#### 3. **Anthropic API Compliance** ⭐ MEDIUM
When appending tool results to conversation, include BOTH text and tool_use blocks in assistant message:
```typescript
// ✅ Correct
{ role: 'assistant', content: [
  { type: 'text', text: thinkingText },
  { type: 'tool_use', id, name, input }
]}
```
Not just tool_use blocks. This helps Claude maintain context.

#### 4. **Debug-First Bug Fixing** ⭐ PROCESS
For complex streaming/async bugs, mandate "capture debug logs before implementing fix". This bug had 3 false hypotheses before the actual cause was found through logs.

### Testing Gaps Identified

| Gap | Mitigation Added |
|-----|------------------|
| No tests for SDK call serialization | Added 2 race condition tests in `streaming.test.ts` |
| No tests for cache TTL cleanup | Added 4 cleanup tests in `event-dedup.test.ts` |

### Future Considerations

1. **Heartbeat timer leak** in error paths (`streaming.ts`) - low priority but noted
2. Consider adding **SDK call tracing** (count/timing of actual API calls) for debugging
3. The `flushInProgress` pattern could be generalized into a utility
