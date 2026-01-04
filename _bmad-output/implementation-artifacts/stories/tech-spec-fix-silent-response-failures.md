# Tech-Spec: Fix Silent Response Delivery Failures in Orion Agent

**Created:** 2026-01-04
**Status:** Completed
**Priority:** Critical
**Estimated Complexity:** Medium
**Completed:** 2026-01-04

## Overview

### Problem Statement

The Orion Slack agent experiences silent response delivery failures where:
- Tools execute successfully and return results (visible in "Sources:" sections)
- Backend logs show successful completion with no errors
- **No final answer text reaches users in Slack**

This creates a broken user experience where the agent appears to work (tools execute) but never provides the explanation or summary the user needs.

**User Impact:**
- Users see tool execution traces but no actual answer
- Appears as if the agent is non-functional despite working correctly
- No error messages or indication of what went wrong
- Requires users to retry or manually debug

### Solution

Fix two critical bugs working in combination:

1. **Agent Loop Response Preservation Bug** (src/agent/loop.ts)
   - Preserve final response text after successful tool execution
   - Use as fallback when verification fails
   - Prevents loss of working responses due to verification strictness

2. **Streaming Silent Failure Bug** (src/utils/streaming.ts)
   - Surface message delivery errors to handlers
   - Make handlers report failures to users
   - Eliminate silent error suppression

### Scope

**In Scope:**
- Fix agent loop response loss after tool execution
- Fix streaming error suppression
- Update handlers to detect and report delivery failures
- Update tests to cover failure scenarios
- Add monitoring for fallback activations

**Out of Scope:**
- Rewriting the verification system (preserve Story 7.5 behavior)
- Changing the streaming API architecture (maintain fire-and-forget pattern)
- Adding new features beyond fixing the bugs
- Performance optimizations

## Context for Development

### Current Verification Rules

The verification system (`src/agent/verify.ts`) currently checks for these issues:

1. **Empty Response** - Response text is empty or only whitespace
2. **Bold Formatting** - Uses Markdown `**bold**` instead of Slack `*bold*`
3. **Markdown Links** - Uses Markdown `[text](url)` instead of Slack `<url|text>`
4. **Blockquotes** - Uses Markdown `> quote` (not supported in Slack mrkdwn)

**Why This Matters for Fallback:**
- Claude may consistently use `**bold**` or `[links]()` after tool execution
- This means fallback activation rates of 10-15% are realistic, not a bug
- If rates are higher, consider updating system prompt to teach Slack formatting
- Alternative: Relax verification rules (but may allow poor formatting through)

### Codebase Patterns

**Agent Loop Architecture:**
- Verification retry loop (lines 524-1045 in loop.ts)
- Tool execution loop nested inside (lines 554-928)
- `attemptResponse` buffer accumulates LLM text output
- Story 7.5 added reset logic to prevent duplicate "thinking" text

**Streaming Infrastructure:**
- Fire-and-forget append() pattern (returns void, debounced 250ms)
- Handlers call append() synchronously, flush happens asynchronously
- stop() method finalizes and flushes pending content
- Errors currently logged but never propagated

**Test Infrastructure:**
- Vitest with mocks for Slack SDK
- Time manipulation with vi.useFakeTimers for debounce testing
- Comprehensive streaming.test.ts and loop.test.ts coverage

### Files to Reference

**Critical Implementation Files:**
1. `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/agent/loop.ts`
   - Lines 524-1045: Verification retry loop
   - Lines 554-928: Tool execution loop
   - Line 559: attemptResponse reset bug location
   - Lines 1024-1050: Verification result handling

2. `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/utils/streaming.ts`
   - Lines 210-248: appendWithRetry method (error suppression)
   - Lines 256-317: stop method (race condition)
   - Lines 27-30: StreamMetrics interface

3. `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/handlers/user-message.ts`
   - Line 565: streamer.stop() call site
   - Line 870: Error cleanup path

4. `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/handlers/app-mention.ts`
   - Line 402: streamer.stop() call site
   - Line 594: Error cleanup path

**Test Files:**
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/utils/streaming.test.ts`
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/agent/loop.test.ts`

**Context Documents:**
- `/Users/sid/.claude/plans/federated-hatching-pinwheel.md` - Full investigation findings
- `_bmad-output/implementation-artifacts/stories/1-4-assistant-class-thread-handling.md` - Thread handling story
- `_bmad-output/implementation-artifacts/stories/1-5-response-streaming.md` - Streaming story

### Technical Decisions

**Decision 1: Preserve Story 7.5 Reset Logic**
- Rationale: Story 7.5 correctly prevents duplicate "thinking" text from appearing
- Implementation: Keep the per-iteration reset, only add fallback mechanism
- Trade-off: Slightly more complex state tracking vs risk of regression

**Decision 2: Make stop() Throw on Failure**
- Rationale: Forces handlers to explicitly handle delivery failures
- Alternative Rejected: Return boolean flag (handlers might ignore it)
- Trade-off: Breaking change to streaming API vs guaranteed error visibility

**Decision 3: Fire-and-Forget append() Preserved**
- Rationale: Performance critical for streaming chunks without blocking
- Implementation: Accumulate errors internally, surface in stop()
- Trade-off: Delayed error detection vs handler performance

**Decision 4: Two-Phase Implementation**
- Rationale: Agent loop fix is lower risk and addresses most visible symptom
- Order: Phase 1 (loop fix) → Phase 2 (streaming fix)
- Trade-off: Longer timeline vs independent rollback capability

## Implementation Plan

### Phase 1: Agent Loop Response Preservation

**File:** `src/agent/loop.ts`

#### Task 1.1: Add State Tracking Variables
- **Location:** Line ~540 (inside verification loop)
- **Change:** Add `toolsExecutedSuccessfully = false` and `lastIterationResponse = ''`
- **Rationale:** Track whether tools ran and preserve final response

#### Task 1.2: Mark Tool Execution Success
- **Location:** Line ~751 (after tool count increment)
- **Change:** Set `toolsExecutedSuccessfully = true` after tools execute
- **Rationale:** Flag indicates tools completed successfully

#### Task 1.3: Preserve Response Before Reset
- **Location:** Line ~558 (before attemptResponse reset)
- **Change:** Capture `lastIterationResponse = attemptResponse` before reset
- **Rationale:** Save response from previous iteration as fallback

#### Task 1.4: Update After Each Iteration
- **Location:** Line ~732 (after iteration completes)
- **Change:** Update `lastIterationResponse` with current `attemptResponse` if non-empty
- **Rationale:** Keep fallback current with most recent response
- **Note:** This works with Task 1.3 to ensure we always have the latest good response:
  - Task 1.3 captures PREVIOUS iteration before reset
  - Task 1.4 captures CURRENT iteration after completion
  - Together they ensure we never lose the most recent non-empty response

#### Task 1.5: Implement Fallback Logic
- **Location:** Line ~1024 (after verification check)
- **Change:** If verification fails + tools succeeded + have fallback → use it
- **Code:**
```typescript
if (!verification.passed && toolsExecutedSuccessfully && lastIterationResponse.length > 0) {
  logger.warn({
    event: 'agent.verify.fallback_to_tool_response',
    verificationIssues: verification.issues.map((i) => i.code),
    originalLength: attemptResponse.length,
    fallbackLength: lastIterationResponse.length,
    traceId: context.traceId,
  });

  verification = { passed: true, issues: [], feedback: 'OK (fallback after tool execution)' };
  verifiedResponse = lastIterationResponse;
  break;
}
```

#### Task 1.6: Add Fallback Delivery Logging
- **Location:** Line ~1050 (where response is yielded)
- **Change:** Log when fallback response is delivered
- **Rationale:** Track fallback activation rate for monitoring

### Phase 2: Streaming Silent Failure Fix

**File:** `src/utils/streaming.ts`

#### Task 2.1: Add Error State Tracking
- **Location:** After line 96 (class properties)
- **Change:** Add `private deliveryError: Error | null = null`
- **Rationale:** Store first error encountered for stop() to check

#### Task 2.2: Capture Errors in appendWithRetry
- **Location:** Lines 240-248 (error catch block)
- **Change:** Store error: `if (!this.deliveryError) { this.deliveryError = error }`
- **Rationale:** Preserve first error, subsequent are likely cascading

#### Task 2.3: Enhance StreamMetrics Interface
- **Location:** Lines 27-30
- **Change:** Add `deliverySuccess: boolean` and `deliveryError?: string`
- **Rationale:** Handlers need to know if delivery succeeded

#### Task 2.4: Make stop() Throw on Failure
- **Location:** Lines 295-316 (stop method)
- **Changes:**
  1. Wrap `streamer.stop()` in try-catch
  2. Check `deliveryError` and include in metrics
  3. Throw if `!deliverySuccess` with clear error message
- **Rationale:** Forces handlers to handle failures explicitly

**Files:** `src/slack/handlers/user-message.ts` and `app-mention.ts`

#### Task 2.5: Add Handler Error Detection
- **Location:** Line 565 (user-message.ts), Line 402 (app-mention.ts)
- **Change:** Wrap `streamer.stop()` in try-catch, notify user on failure
- **Code:**
```typescript
let metrics;
try {
  metrics = await streamer.stop();
} catch (stopError) {
  logger.error({ event: 'stream_delivery_failed', ... });
  await say({
    text: '⚠️ *Message delivery failed*\n\nI generated a response but couldn\'t deliver it to Slack. Please try again.',
    thread_ts: threadTs,
  });
  throw stopError;
}
```

#### Task 2.6: Update Error Cleanup Paths
- **Location:** Line 870 (user-message.ts), Line 594 (app-mention.ts)
- **Change:** Replace `.catch(() => {})` with try-catch that logs but doesn't throw
- **Rationale:** In error path, log delivery failures without masking original error

### Testing Tasks

**File:** `src/utils/streaming.test.ts`

#### Task 3.1: Update Metrics Assertions
- Update all `expect(metrics)` to include `deliverySuccess: true`
- **Recommended:** Create a test helper function to avoid repetitive updates:
  ```typescript
  function expectedMetrics(overrides = {}): StreamMetrics {
    return {
      totalDuration: expect.any(Number),
      totalChars: expect.any(Number),
      deliverySuccess: true,
      ...overrides
    };
  }
  ```

#### Task 3.2: Add Delivery Failure Tests
- Test: append fails → stop() throws
- Test: SDK stop() fails → stop() throws
- Test: Verify error message format

**File:** `src/agent/loop.test.ts`

#### Task 3.3: Add Fallback Scenario Tests
- Test: tools succeed + verification fails → fallback delivered
- Test: no tools + verification fails → normal retry (no fallback)
- Test: tools succeed + empty response → no fallback

### Acceptance Criteria

#### AC1: Tools Execute, Response Delivered
- **Given:** Agent calls tools and they succeed
- **And:** Verification fails (formatting issues: bold **text**, markdown links [text](url), blockquotes, or empty response)
- **When:** Loop completes
- **Then:** Fallback response is delivered to user
- **And:** Log event `agent.verify.fallback_to_tool_response` is recorded

#### AC2: Streaming Error Surfaces
- **Given:** Slack API returns error during append
- **When:** Handler calls `streamer.stop()`
- **Then:** stop() throws with "Stream delivery failed: {error}"
- **And:** Handler catches and notifies user

#### AC3: User Notified of Delivery Failures
- **Given:** Stream delivery fails
- **When:** Handler catches stop() error
- **Then:** User sees "Message delivery failed" error in Slack
- **And:** Error is logged with full context

#### AC4: Story 7.5 Behavior Preserved
- **Given:** Multi-iteration tool loop with "thinking" text
- **When:** Final response is generated
- **Then:** Only final iteration text is delivered
- **And:** No duplicate "thinking" text appears

#### AC5: Metrics Updated
- **Given:** Any streaming session
- **When:** stop() completes
- **Then:** Metrics include `deliverySuccess` field
- **And:** If failed, includes `deliveryError` message

#### AC6: Fallback Rarely Activated
- **Given:** Production monitoring
- **When:** 100 tool-based requests complete
- **Then:** Fallback activation rate < 10%
- **And:** Alerts trigger if > 20%
- **Note:** Current verification rules check Slack formatting (bold, links, blockquotes). If Claude consistently uses wrong formatting after tool execution, higher fallback rates (10-15%) may be acceptable. Monitor by failure reason to identify if system prompt tuning is needed.

## Additional Context

### Dependencies

**No New Dependencies Required**
- Uses existing Slack SDK
- Uses existing Anthropic SDK
- Uses existing test infrastructure

**Risk Dependencies:**
- Story 7.5 implementation (must preserve behavior)
- Verification system (rules remain unchanged)
- Streaming SDK API (backward compatible changes)

### Testing Strategy

**Unit Tests:**
1. Streaming error accumulation and propagation
2. Agent loop fallback activation conditions
3. Handler error detection and user notification
4. Metrics interface backward compatibility

**Integration Tests:**
1. End-to-end: tool execution → verification failure → fallback delivery
2. End-to-end: streaming failure → user notification
3. Regression: Story 7.5 duplicate prevention still works

**Manual Testing:**
1. Trigger tool execution that produces response with formatting issues (e.g., **bold** or [markdown](links))
2. Mock Slack API errors to test delivery failure path
3. Verify user sees appropriate error messages
4. Confirm no silent failures in logs

**Test Coverage Goals:**
- streaming.ts: 90%+ coverage (up from current)
- loop.ts fallback paths: 100% coverage
- Handler error paths: 100% coverage

### Rollback Plan

**Phase 1 Rollback:**
- Revert loop.ts changes
- Remove new variables and fallback logic
- Restore original Story 7.5 behavior
- Risk: Low (self-contained changes)

**Phase 2 Rollback:**
- Revert streaming.ts changes
- Remove deliverySuccess from metrics (backward compatible)
- Revert handler try-catch blocks
- Risk: Medium (touches multiple handlers)

**Emergency Mitigation:**
- If fallback activates too frequently (>20%): Consider relaxing verification rules or updating system prompt to teach Slack formatting
- If delivery errors too noisy: Adjust error message or suppress in specific cases
- Monitor logs for `agent.verify.fallback_to_tool_response` and `stream_delivery_failed` rates
- Fallback rates of 10-15% are acceptable - only act if > 20% or if dominated by empty responses (indicates real bug)

### Monitoring & Observability

**Key Metrics to Track:**

1. **Fallback Activation Rate**
   - Event: `agent.verify.fallback_to_tool_response`
   - Target: < 10% of tool-based requests
   - Alert: > 20% indicates verification rules too strict or system prompt needs tuning
   - Track by failure reason (bold formatting, markdown links, blockquotes, empty) to identify patterns

2. **Delivery Failure Rate**
   - Event: `stream_delivery_failed`
   - Target: < 1% of all requests
   - Alert: > 5% indicates Slack API issues

3. **Verification Pass Rate After Tools**
   - Compare before/after deployment
   - Expected improvement: 75%+ → 90%+ (accounting for formatting issues)
   - Track by verification failure reason (most likely: bold **text** and markdown [links]())
   - If bold/link failures dominate, consider system prompt updates to teach Slack formatting

4. **User-Facing Error Messages**
   - Count: "Message delivery failed" sent to users
   - Target: < 10 per day
   - Alert: Spike indicates infrastructure issues

**Logging Enhancements:**
- All fallback activations logged at WARN level
- Delivery failures logged at ERROR level
- Include traceId for correlation
- Include verification issues that triggered fallback

### Notes

**Phase 2 Breaking Change:**
- Making `stop()` throw on failure is a breaking change to the streaming API
- Current consumers: Only internal handlers (user-message.ts, app-mention.ts)
- No external consumers exist, so no migration path needed
- All handler call sites will be updated in Phase 2

**Implementation Order Rationale:**
Phase 1 first because:
- Addresses most visible user symptom (missing responses)
- Lower risk (self-contained in loop.ts)
- Independent of streaming changes
- Can deploy and monitor before Phase 2

**Story 7.5 Context:**
- Original issue: Duplicate text like "I'll search... [tool executes] ...Based on results..."
- Fix: Reset attemptResponse per iteration to only show final text
- This spec preserves that fix while adding fallback for verification failures

**Alternative Approaches Considered:**

1. **Relax Verification Rules** - Rejected: Might allow poor responses through
2. **Retry Without Reset** - Rejected: Would reintroduce Story 7.5 bug
3. **Always Use Last Response** - Rejected: Bypasses verification entirely
4. **Make append() Return Promise** - Rejected: Too invasive, breaks fire-and-forget pattern

**Success Indicators:**
- User complaints about missing responses drop to zero
- Fallback logs appear in 10-15% of tool-based requests (acceptable rate given formatting rules)
- Delivery error visibility increases (failures no longer silent)
- No regression reports on duplicate text (Story 7.5 preserved)
- Fallback breakdown by reason shows mostly formatting issues (bold, links), not empty responses

---

## Implementation Checklist

### Before Starting
- [ ] Read full investigation in plan file: `/Users/sid/.claude/plans/federated-hatching-pinwheel.md`
- [ ] Review Story 7.5 implementation and rationale
- [ ] Understand verification system rules
- [ ] Set up test environment with Slack SDK mocks

### Phase 1: Agent Loop Fix
- [ ] Task 1.1: Add state tracking variables
- [ ] Task 1.2: Mark tool execution success
- [ ] Task 1.3: Preserve response before reset
- [ ] Task 1.4: Update after each iteration
- [ ] Task 1.5: Implement fallback logic
- [ ] Task 1.6: Add fallback logging
- [ ] Run loop.test.ts - all pass
- [ ] Manual test: Force verification failure after tools
- [ ] Deploy Phase 1
- [ ] Monitor fallback activation rate for 24h

### Phase 2: Streaming Fix
- [ ] Task 2.1: Add error state tracking
- [ ] Task 2.2: Capture errors in appendWithRetry
- [ ] Task 2.3: Enhance StreamMetrics interface
- [ ] Task 2.4: Make stop() throw on failure
- [ ] Task 2.5: Add handler error detection
- [ ] Task 2.6: Update error cleanup paths
- [ ] Task 3.1: Update test metrics assertions
- [ ] Task 3.2: Add delivery failure tests
- [ ] Run streaming.test.ts - all pass
- [ ] Manual test: Mock Slack API errors
- [ ] Deploy Phase 2
- [ ] Monitor delivery failure rate

### Post-Deployment
- [ ] Verify no Story 7.5 regression (no duplicate text)
- [ ] Confirm fallback rate < 5%
- [ ] Confirm delivery failures now visible
- [ ] Update runbooks with new error messages
- [ ] Document in architecture.md if needed
