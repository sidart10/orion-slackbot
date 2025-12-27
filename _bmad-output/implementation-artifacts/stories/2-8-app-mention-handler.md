# Story 2.8: App Mention Handler for Channel Conversations

Status: in-progress

## Dependencies / Prerequisites

- Story 2.1 (Anthropic API Integration) - DONE
- Story 2.2 (Agent Loop Implementation) - DONE
- Story 1.5 (Response Streaming) - DONE
- Existing agent infrastructure: `runOrionAgent()`, streaming, tool calling

## Story

As a **user**,
I want to `@orion` in any Slack channel to ask questions and get responses,
So that I can use Orion's full capabilities (tool calling, streaming, context) without opening a DM.

## Acceptance Criteria

1. **Given** a user `@orion`s in a channel, **When** Orion receives the mention, **Then** Orion responds in a thread under the original message

2. **Given** an `@orion` message, **When** processing begins, **Then** Orion adds a 👀 reaction to acknowledge receipt (same as Assistant handler)

3. **Given** an `@orion` message, **When** Orion responds, **Then** the response streams in real-time using the same streaming infrastructure as Assistant threads

4. **Given** an existing thread, **When** a user replies with an explicit `@orion` mention, **Then** Orion responds with full thread context
   - **Out of scope (this story):** responding to thread replies *without* `@orion` (requires `message.channels` + strict loop-prevention)

5. **Given** the `app_mention` handler, **When** invoked, **Then** it uses the same `runOrionAgent()` with full tool calling capability (FR17)

6. **Given** an `@orion` message, **When** response completes, **Then** the 👀 reaction is removed (consistent with current Assistant handler behavior)

7. **Given** an `@orion` response is delivered in a channel thread, **When** the response completes, **Then** Orion posts Slack feedback buttons in the same thread and correlates feedback to the Langfuse trace (FR48, FR49)

## Tasks / Subtasks

- [x] **Task 1: Add `app_mention` Event Handler** (AC: #1, #2)
  - [x] Create `src/slack/handlers/app-mention.ts`
  - [x] Register handler in `src/index.ts` via `app.event('app_mention', handleAppMention)` after `app.assistant(assistant)`
  - [x] Extract message text (strip ONLY the leading `<@...>` mention prefix once; do NOT remove other mentions in the message)
  - [x] Add 👀 reaction on receipt
  - [x] Start Langfuse trace with `app_mention` metadata
  - [x] Initialize streaming within 500ms (NFR4): record/log `timeToStreamStart` like Assistant handler

- [x] **Task 2: Integrate with Agent Loop + Streaming** (AC: #3, #5)
  - [x] Call `runOrionAgent()` with same options as Assistant handler
  - [x] Stream response to thread using existing `createStreamer()` utility (`src/utils/streaming.ts`) like `src/slack/handlers/user-message.ts`
  - [x] Pass thread context via `fetchThreadHistory()` (`src/slack/thread-context.ts`)
  - [x] Ensure tool calling works (same infrastructure)

- [x] **Task 3: Thread Context for Follow-ups** (AC: #4)
  - [x] Support `@orion` mentions in existing threads via `app_mention` events that include `event.thread_ts`
  - [x] For thread mentions: fetch thread history via `fetchThreadHistory()` and pass to `runOrionAgent()`
  - [x] **Do NOT** register `message.channels` in this story (avoid bot-wide message ingestion / loops)

- [x] **Task 4: Completion UX** (AC: #6)
  - [x] Remove 👀 reaction on completion
  - [x] On failure: remove 👀 if present, and return a clear Slack message (avoid extra reactions unless standardized elsewhere)

- [x] **Task 5: Feedback Buttons Parity** (AC: #7)
  - [x] Post `feedbackBlock` as a follow-up message in the same thread (same pattern as Assistant handler)
  - [x] Include message metadata with `{ traceId }` and call `setTraceIdForMessage(feedbackMessage.ts, traceId)` for correlation (same as Assistant)

- [x] **Task 6: Subscribe to Events in Slack App Settings** (AC: all)
  - [x] Document: Ensure `app_mention` event is subscribed in Slack App → Event Subscriptions
  - [x] For Socket Mode: events are automatically received once subscribed

- [x] **Task 7: Unit Tests** (AC: all)
  - [x] Test handler extracts message text correctly (strips bot mention)
  - [x] Test handler calls `runOrionAgent()` with correct parameters
  - [x] Test reaction lifecycle (add 👀, remove 👀)
  - [x] Test thread detection logic
  - [x] Test feedback block message is posted and trace correlation is stored

- [ ] **Task 8: Manual Verification** (AC: all)
  - [ ] `@orion hello` in a channel → responds in thread
  - [ ] Follow-up in thread with `@orion` → Orion responds with context
  - [ ] Tool calling works in channel threads
  - [ ] Streaming works (progressive updates)
  - [ ] Feedback buttons appear under the response in the same thread

## Dev Notes

### Project Context Rules (BIBLE)

Before implementing, read and follow: `_bmad-output/project-context.md`
- ESM imports: always include `.js` in relative imports
- Slack formatting: use Slack mrkdwn (`*bold*`, `<url|text>`)
- Logging: include `traceId` on logs inside the handler
- Dependencies: do NOT add new runtime dependencies for this story — reuse existing utilities and patterns

### Architecture Decision

This handler runs **parallel** to the Assistant handlers — not replacing them:
- **Assistant** (`app.assistant()`): DMs and Slack AI Assistant threads
- **App Mention** (`app.event('app_mention')`): Channel `@orion` mentions

Both use the same core: `runOrionAgent()` → full tool calling, streaming, observability.

### Reference Implementation (Copy Patterns, Don’t Invent New Ones)

Use these existing implementations as the source of truth for patterns:
- Reactions lifecycle, streaming start, and `createStreamer()` usage: `src/slack/handlers/user-message.ts`
- Thread history fetch: `src/slack/thread-context.ts`
- Tracing helpers: `src/observability/tracing.ts`
- Feedback buttons + trace correlation: `src/slack/handlers/user-message.ts` (see `feedbackBlock` + `setTraceIdForMessage`)

### Message Text Extraction

Slack sends mentions as `<@U0928FBEH9C> hello` where `U0928FBEH9C` is the bot's user ID. 
Strip this prefix to get the actual user message.

```typescript
// IMPORTANT: Only strip the leading bot mention ONCE (no /g), so other mentions remain intact.
// app_mention events always start with the app mention: "<@BOTID> ..."
const messageText = event.text.replace(/^<@[A-Z0-9]+>\s*/, '').trim();
```

### Thread Reply Detection

```typescript
// New mention (start new thread)
if (!event.thread_ts) {
  // Reply in thread under this message
  await say({ text: response, thread_ts: event.ts });
}

// Reply in existing thread
if (event.thread_ts) {
  // Fetch thread history, continue conversation
  await say({ text: response, thread_ts: event.thread_ts });
}
```

### Event Subscription Requirements

In Slack App settings → Event Subscriptions → Subscribe to bot events:
- `app_mention` (required for this story)
- `message.channels` is intentionally **out of scope** here (requires strict gating + loop-prevention)

Also confirm existing bot token scopes required by current patterns:
- `chat:write` (post/update messages)
- `reactions:write` (👀 lifecycle)
- channel history scopes needed for `fetchThreadHistory()` (e.g., `channels:history` / `groups:history` depending on channel types)

### Requirements Mapping

| Requirement | Source | Implementation |
|-------------|--------|----------------|
| FR17 | prd.md | `app_mention` handler with full agent loop |
| NFR4 | prd.md | Streaming response within 500ms |
| NFR7 | prd.md | All requests validated via signing secret |
| FR48 | prd.md | Attach `feedback_buttons` to responses |
| FR49 | prd.md | Log feedback to Langfuse (trace-correlated) |

## File List

Files created:
- `src/slack/handlers/app-mention.ts` — App mention event handler with full agent loop
- `src/slack/handlers/app-mention.test.ts` — 14 unit tests covering all acceptance criteria

Files modified:
- `src/index.ts` — Registered `app_mention` handler after `app.assistant(assistant)`
- `src/index.test.ts` — Added `event` method to mock app for test compatibility

## Dev Agent Record

### Implementation Plan
- Followed patterns from `src/slack/handlers/user-message.ts` as reference implementation
- Used TDD approach: wrote 14 failing tests first, then implemented handler
- Implemented `extractMessageText()` helper for bot mention stripping
- Used existing infrastructure: `createStreamer()`, `fetchThreadHistory()`, `runOrionAgent()`

### Completion Notes
- ✅ Task 1-7 complete with all tests passing (260/260)
- Handler supports both new channel mentions and thread replies
- 👀 reaction lifecycle implemented (add on receipt, remove on completion/failure)
- Feedback buttons with trace correlation working
- Task 8 (manual verification) requires user testing

### Debug Log
- Initial test run: 14/14 tests pass for app-mention.test.ts
- Regression found: index.test.ts mock missing `event` method
- Fixed by adding `event: vi.fn()` to mockApp
- Final test run: 260/260 tests pass

## Change Log

- 2025-12-23 — Story created to address FR17 gap (channel @mentions not working)
- 2025-12-23 — Tasks 1-7 implemented: app_mention handler with full agent loop, streaming, thread context, feedback buttons, and 14 unit tests

