# Story 7.4: Response Completion Indicators

## Story

**As a** Slack user  
**I want** to see a visual indicator (✅) on my original message when Orion has finished responding  
**So that** I can quickly scan threads and know which questions have been answered

## Status

| Field | Value |
|-------|-------|
| Status | ready-for-dev |
| Epic | 7 - Slack Polish |
| Priority | P2 |
| Estimate | 1 point |
| Dependencies | None (uses existing reaction infrastructure) |

## Background

Currently, Orion adds 👀 when it receives a message and removes it when done. Users have no persistent indication that a question was answered.

In busy threads or channels, users want to:
- Scan and see which messages got responses
- Know at a glance if their question is still pending or answered

## Acceptance Criteria

### AC1: Add Checkmark on Response Completion
- [ ] Add ✅ (`white_check_mark`) reaction to user's original message when response is complete
- [ ] Applies to both @mentions (app-mention handler) and DMs (user-message handler)
- [ ] Reaction added AFTER streaming completes and feedback block is posted

### AC2: Reaction Lifecycle
- [ ] 👀 added on message receipt (existing behavior)
- [ ] 👀 removed on completion (existing behavior)
- [ ] ✅ added on successful completion (NEW)
- [ ] No ✅ on error (error message is posted instead)

### AC3: Error Resilience
- [ ] If reaction.add fails (e.g., already reacted), log and continue
- [ ] Never throw/crash on reaction failures
- [ ] Log at debug level for successful reactions, warn for failures

## Technical Design

### 1. App Mention Handler

Location: `src/slack/handlers/app-mention.ts` — after 👀 removal (~line 439)

```typescript
// Remove 👀 reaction after successful response (existing)
try {
  await client.reactions.remove({
    channel: channelId,
    timestamp: mentionEvent.ts,
    name: 'eyes',
  });
} catch {
  // Ignore if already removed
}

// Add ✅ on successful completion (NEW)
try {
  await client.reactions.add({
    channel: channelId,
    timestamp: mentionEvent.ts,
    name: 'white_check_mark',
  });
  logger.debug({
    event: 'completion_reaction_added',
    traceId: trace.id,
  });
} catch (reactionError) {
  logger.warn({
    event: 'completion_reaction_failed',
    error: reactionError instanceof Error ? reactionError.message : String(reactionError),
    traceId: trace.id,
  });
}
```

**Error path (lines 476-495):** Do NOT add ✅ — error message is posted instead.

### 2. User Message Handler (Assistant API)

Location: `src/slack/handlers/user-message.ts` — after 👀 removal (~line 656)

```typescript
// Remove eyes emoji after responding (existing)
try {
  await client.reactions.remove({
    channel: channelId,
    timestamp: message.ts,
    name: 'eyes',
  });
} catch {
  // Ignore if already removed
}

// Add ✅ on successful completion (NEW)
try {
  await client.reactions.add({
    channel: channelId,
    timestamp: message.ts,
    name: 'white_check_mark',
  });
  logger.debug({
    event: 'completion_reaction_added',
    traceId: trace.id,
  });
} catch (reactionError) {
  logger.warn({
    event: 'completion_reaction_failed',
    error: reactionError instanceof Error ? reactionError.message : String(reactionError),
    traceId: trace.id,
  });
}
```

**Error path (lines 675-723):** Do NOT add ✅ — user receives error message instead.

**Note:** The user-message handler currently does not remove 👀 on error (unlike app-mention). This is an existing inconsistency outside scope of this story.

## Out of Scope

- Customizable reaction emoji (hardcoded ✅)
- Removing ✅ if user edits message (too complex)
- Different reactions for different response types

## Test Cases

### Unit Tests

**File:** `src/slack/handlers/app-mention.test.ts`

1. **Successful completion adds ✅** → Mock `client.reactions.add` called with `'white_check_mark'`
2. **Error path skips ✅** → On catch block, `reactions.add('white_check_mark')` not called
3. **Reaction failure doesn't throw** → Mock rejection, verify no exception propagates

**File:** `src/slack/handlers/user-message.test.ts`

4. **Successful completion adds ✅** → Mock `client.reactions.add` called with `'white_check_mark'`
5. **Error path skips ✅** → On catch block, `reactions.add('white_check_mark')` not called
6. **Reaction failure doesn't throw** → Mock rejection, verify no exception propagates

### Integration Tests

**File:** `tests/integration/slack-reactions.test.ts` (optional)

1. **E2E: @mention flow** → Verify 👀 → streaming → 👀 removed → ✅ added
2. **E2E: DM flow** → Verify ✅ added after response

## Definition of Done

- [ ] App mention handler adds ✅ on completion
- [ ] User message handler adds ✅ on completion  
- [ ] Error paths do NOT add ✅
- [ ] All reaction failures are gracefully handled
- [ ] Unit tests pass
- [ ] Manual verification in Slack shows ✅ on answered messages

