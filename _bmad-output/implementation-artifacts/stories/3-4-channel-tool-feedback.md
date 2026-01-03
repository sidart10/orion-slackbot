# Story 3.4: Channel @Mention Tool Feedback

Status: done

## Story

As a **user**,
I want to see what tools Orion is using when I `@orion` in a channel,
So that I understand what's happening during longer operations instead of seeing only "_Thinking..._".

## Context

Identified during 2025-12-31 course correction. The `app-mention.ts` handler currently shows static "_Thinking..._" messages while the `user-message.ts` handler shows dynamic tool status updates. This creates an inconsistent UX.

**Key Difference:** The `user-message.ts` handler uses Slack's Assistant API which provides a `setStatus` callback. The `app-mention.ts` handler is a regular event handler without this API — it must use `client.chat.update()` to update status messages directly.

See: `sprint-change-proposal-2025-12-31.md`

## Acceptance Criteria

1. **Given** an `@orion` mention in a channel, **When** Orion starts processing, **Then** the status message shows "Thinking..." initially.

2. **Given** Orion is executing a tool, **When** the tool execution starts, **Then** the status message updates to show the tool being used (e.g., "Calling tools...", "Searching the web...").

3. **Given** multiple tools are executed sequentially, **When** each tool starts, **Then** the status message updates to reflect the current tool.

4. **Given** tool execution completes, **When** Orion generates the response, **Then** the status returns to "Preparing response..." or similar.

5. **Given** the `setStatus` callback is passed to `runOrionAgent()`, **When** called, **Then** the app-mention handler updates the thread message via `client.chat.update()`.

## Tasks / Subtasks

- [x] **Task 1: Create Status Update Mechanism** (AC: #1, #5)
  - [x] Post initial "Thinking..." status message to thread after `streamer.start()`
  - [x] Store the status message `ts` for subsequent updates
  - [x] Create `updateStatusMessage()` helper that calls `client.chat.update()`
  - [x] Implement debouncing (300-500ms) to avoid Slack rate limits

- [x] **Task 2: Wire Status Callback to Agent** (AC: #2, #3, #4)
  - [x] Import `buildLoadingMessages` from `../status-messages.js`
  - [x] Update `setStatus` callback to call `updateStatusMessage()` with tool-specific text
  - [x] Pass `{ toolName }` to `buildLoadingMessages()` for context-aware messages

- [x] **Task 3: Cleanup Status Message** (AC: #4)
  - [x] Delete or update the status message once streaming completes
  - [x] Handle cleanup in error paths

- [x] **Task 4: Unit Tests** (AC: all)
  - [x] Test `client.chat.update()` is called with tool names
  - [x] Test debouncing prevents excessive API calls
  - [x] Test status message cleanup on success and error

## Dev Notes

### Why This Differs from user-message.ts

The `user-message.ts` handler uses Slack's **Assistant API** which provides a built-in `setStatus` callback:

```typescript
// user-message.ts receives setStatus from Slack
export const handleAssistantUserMessage: AssistantUserMessageMiddleware =
  async ({ message, say, setTitle, setStatus, client, context }) => {
    // setStatus is provided by Slack's Assistant API
    setStatus({ status: 'working...', loading_messages: [...] });
  };
```

The `app-mention.ts` handler is a **regular event handler** without this API:

```typescript
// app-mention.ts does NOT have setStatus
export async function handleAppMention({
  event,
  client,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_mention'>): Promise<void> {
  // Must use client.chat.update() instead
}
```

### Implementation Pattern

```typescript
// 1. Import the existing helper
import { buildLoadingMessages } from '../status-messages.js';

// 2. Post initial status message and store ts
const statusMsg = await client.chat.postMessage({
  channel: channelId,
  thread_ts: threadTs,
  text: 'Thinking...',
});
const statusTs = statusMsg.ts;

// 3. Create debounced update function
let lastStatusUpdate = 0;
const updateStatus = async (toolName?: string) => {
  const now = Date.now();
  if (now - lastStatusUpdate < 300) return; // Debounce 300ms
  lastStatusUpdate = now;
  
  const messages = buildLoadingMessages({ toolName });
  await client.chat.update({
    channel: channelId,
    ts: statusTs,
    text: messages[0], // First message is most relevant
  });
};

// 4. Pass to agent
const agentResponse = runOrionAgent(messageText, {
  // ...
  setStatus: ({ toolName }) => void updateStatus(toolName),
});

// 5. Delete status message after streaming completes
await client.chat.delete({ channel: channelId, ts: statusTs });
```

### Current State (to be replaced)

```typescript
setStatus: ({ toolName }) =>
  void logger.debug({
    event: 'agent_status_update',
    toolName,
    traceId: trace.id,
  }),
```

### Existing Helper (DO NOT recreate)

`buildLoadingMessages()` already exists at `src/slack/status-messages.ts`:

```typescript
export function buildLoadingMessages(params?: {
  toolName?: string | null;
}): string[] {
  const base = ['Gathering context…', 'Thinking…', 'Checking results…', 'Preparing response…'];
  const toolSpecific: Record<string, string> = {
    mcp_call: 'Calling tools…',
    memory: 'Checking memory…',
    web_search: 'Searching the web…',
  };
  // Returns tool-specific message first if applicable
}
```

### Priority

P2 — UX polish. Not blocking core functionality.

### Dependencies

- Story 2.8 (App Mention Handler) — DONE
- Story 3.3 (Tool Execution) — DONE

### Effort Estimate

~2-3 hours

## File List

| Action | Path |
|--------|------|
| Modified | `src/slack/handlers/app-mention.ts` |
| Modified | `src/slack/handlers/app-mention.test.ts` |
| Modified | `src/slack/status-messages.ts` |
| Modified | `src/slack/status-messages.test.ts` |

## Dev Agent Record

### Implementation Plan

Implemented dynamic tool status feedback for app-mention handler following the pattern outlined in Dev Notes:

1. Post initial "Thinking…" status message after `streamer.start()`
2. Store `statusMessageTs` for subsequent updates
3. Created `updateStatusMessage()` helper with 300ms debounce
4. Created `deleteStatusMessage()` helper for cleanup
5. Wired `setStatus` callback to `updateStatusMessage()` using existing `buildLoadingMessages()`
6. Added cleanup in both success and error paths

### Completion Notes

- All 4 tasks completed with comprehensive unit tests (5 new test cases)
- All 28 app-mention tests passing
- All 128 Slack module tests passing (no regressions)
- Pre-existing failures in memory module (gray-matter dependency issue) are unrelated to this story
- Implementation uses existing `buildLoadingMessages()` from `status-messages.ts` as specified

### Code Review Fixes (2025-01-02)

**Issue #1 (HIGH):** `buildLoadingMessages()` didn't match MCP tool names like `mcp_msci-reports_search_reports`.
- **Fix:** Added prefix matching: any tool starting with `mcp_` now returns "Calling tools…"
- **Files:** `status-messages.ts`, `status-messages.test.ts` (2 new tests)

**Issue #2 (MEDIUM):** Debounce test didn't verify timing properly.
- **Fix:** Updated test assertion to verify exactly 1 update call for synchronous setStatus calls.

**Issue #3 (MEDIUM):** `client.chat.delete` missing from shared test mock.
- **Fix:** Added to `createAppMentionEvent()` helper.

**Issue #4 (MEDIUM):** No test for status message post failure path.
- **Fix:** Added test case verifying handler continues when status post fails.

**Post-Review Test Count:** 33 tests passing (29 app-mention, 4 status-messages)

## Change Log

| Date | Change |
|------|--------|
| 2025-12-31 | Story created during course correction. Identified gap between app-mention and user-message handler UX. See: `sprint-change-proposal-2025-12-31.md` |
| 2025-01-02 | Revised: Corrected implementation approach. App-mention handler uses `client.chat.update()` not Slack's `setStatus` API. Removed incorrect Task 3 (buildLoadingMessages already exists). Updated dev notes with accurate implementation pattern. |
| 2025-01-02 | Implemented: All tasks completed. Added status message posting, debounced updates, cleanup, and 5 unit tests. All tests passing. |
| 2025-01-02 | Code Review: Fixed 4 issues (1 HIGH, 3 MEDIUM). Added MCP tool prefix matching, improved test mocks, added failure path test. 33 tests passing. Status → done. |
