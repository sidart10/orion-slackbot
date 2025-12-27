# Story 2.5: Thread Context & History

Status: done

## Dependencies / Prerequisites

- Slack AI App is wired via the **Assistant** surface (`app.assistant(assistant)`) and the handler entrypoint is `src/slack/handlers/user-message.ts`.
- Thread context utilities already exist in `src/slack/thread-context.ts` and include tests in `src/slack/thread-context.test.ts`.
- “Project bible” rules apply: `_bmad-output/project-context.md` (Slack mrkdwn rules, ESM `.js` imports, no PII in logs, include `traceId` in logs).

## Story

As a **user**,
I want Orion to remember what we discussed earlier in the thread,
So that I don't have to repeat context.

## Acceptance Criteria

1. **Given** a conversation is happening in a Slack thread, **When** the user sends a follow-up message, **Then** thread history is fetched from Slack API

2. **Given** thread history is fetched, **When** context is prepared, **Then** the full thread context is passed to Claude

3. **Given** thread context is available, **When** Orion responds, **Then** Orion references previous messages appropriately

4. **Given** a conversation is in progress, **When** context is managed, **Then** thread context is maintained correctly (FR15)

5. **Given** a user contacts Orion in either a channel thread or a DM thread, **When** messages are handled, **Then** both contexts work (FR17)

## Tasks / Subtasks

- [x] **Task 1: Confirm + Use Existing Thread History Fetcher (No Reinvention)** (AC: #1, #2)
  - [x] Use the existing `fetchThreadHistory()` in `src/slack/thread-context.ts` (do not create a second module)
  - [x] Confirm it uses `conversations.replies`, supports pagination, and bounds context size (token/char budget)
  - [x] Ensure all thread-history logs include `traceId` (pass through from handler)

- [x] **Task 2: Ensure Thread History Is Passed to Claude via Message History** (AC: #2, #3, #4)
  - [x] Continue passing thread history as Anthropic message history (`AgentContext.threadHistory`) rather than injecting an ad-hoc "context block"
  - [x] Filter out non-text / empty messages so Claude doesn't get noise
  - [x] Keep history limits explicit and safe:
    - [x] limit recent messages (e.g., last 20–50)
    - [x] enforce a max token/char budget (prevent context overflow)

- [x] **Task 3: Clarify "References Previous Messages Appropriately" Contract** (AC: #3)
  - [x] Ensure the system prompt (loaded via `loadAgentPrompt('orion')`) makes it explicit that:
    - [x] The assistant may reference prior thread messages
    - [x] It must not hallucinate prior user statements
    - [x] It should be brief when referencing history (no long quotes unless asked)

- [x] **Task 4: DM vs Channel Behavior (Assistant-First)** (AC: #5)
  - [x] Validate Orion works in:
    - [x] a channel thread (Assistant thread)
    - [x] a DM thread (Assistant thread)
  - [x] If product requirements require classic Bolt `app_mention` / `message` handling *outside* the Assistant surface, split that into a separate story (do not mix two integration surfaces without a clear contract).

- [x] **Task 5: Testing & Verification** (AC: all)
  - [x] Unit tests:
    - [x] `fetchThreadHistory()` pagination + token bounding behavior (extend existing tests)
    - [x] "no PII logged" constraints (assert logs include `traceId` and no raw message bodies in error logs)
    - [x] Empty/missing text messages filtered from history
  - [x] Handler wiring tests:
    - [x] Verify the Assistant `userMessage` handler fetches history and passes it to `runOrionAgent` as `threadHistory`
  - [ ] Manual verification (out of scope for automated review):
    - [ ] Send multi-message conversation
    - [ ] Verify Orion references previous messages
    - [ ] Verify behavior in both channel thread + DM thread

## Dev Notes

### Epics Requirements Summary (Keep Scope Tight)

- Objective: Maintain correct thread context for follow-up questions (FR15) so users don’t repeat themselves.
- Boundaries:
  - This story is **Assistant-first** (Slack AI App surface). Avoid classic event handlers unless explicitly required.
  - Thread history should be bounded to prevent context overflow and latency blowups.
- Dependencies:
  - Thread history fetch should be best-effort; failures should degrade gracefully (empty history).
  - All observability must include `traceId` and avoid PII in logs.

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR15 | prd.md | System maintains conversation context within Slack threads |
| FR17 | prd.md | System responds to @mentions and direct messages |
| AR29 | architecture.md | Slack API fetch for thread context (stateless Cloud Run) |

### Current Repo Reality (Authoritative)

Thread history + integration are already present in the repo:

- Thread history util: `src/slack/thread-context.ts`
- Assistant handler uses it + passes history to agent: `src/slack/handlers/user-message.ts`
- Agent consumes history as Anthropic message history: `src/agent/orion.ts`

This story’s work is to ensure the behavior is correct, bounded, traceable, and aligned with the project rules (no duplicate modules, no wrong handler surface).

### Critical “Bible” Constraints (Validated Against)

Reference: `_bmad-output/project-context.md`

- ESM relative imports MUST use `.js`
- Slack formatting is mrkdwn (`*bold*`, `<url|text>`) — not Markdown
- No PII in logs; include `traceId` in every log entry

### References

- [Source: _bmad-output/epics.md#Story 2.5] — Original story
- [Source: Slack API - conversations.replies](https://api.slack.com/methods/conversations.replies)
- [Source: Slack Bolt - AI Apps / Assistant](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/)

### Previous Story Intelligence

From Story 2-2 (Agent Loop):
- Thread context passed via `AgentContext.threadHistory`

From Story 1-5 (Response Streaming):
- Streaming works within thread context

From Story 1-1 (Slack App):
- Slack Bolt app instance available at `src/slack/app.ts`

## Senior Developer Review (AI)

_Reviewer: Sid on 2025-12-23_

**Outcome:** Approved (after fixes)

### Findings Fixed

- **Channel thread follow-ups were skipped** in `src/slack/handlers/user-message.ts` due to DM-only gating. Fixed by handling channel follow-ups and deduping leading bot mentions (handled by `app_mention`).
- **History bounds were not explicit** (previous defaults effectively allowed very large `maxTokens`). Fixed by enforcing explicit defaults (`keepLastN=50`, `maxTokens=4000`).
- **Token-budget behavior could drop the wrong message** in `fetchThreadHistory()`. Fixed by trimming within a rolling “recent messages” window and excluding the current message only after pagination completes.
- **PII in logs** (human-readable channel/user names). Fixed by removing names from logs/trace metadata in the Assistant handler.

### Verification

- `pnpm test` passes (450 passed, 2 skipped)

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Implementation Plan

- Task 1: Added `traceId` parameter to `FetchThreadHistoryParams` interface and included it in all log statements
- Task 2: Verified existing implementation already passes thread history correctly to `runOrionAgent`
- Task 3: Created `.orion/agents/orion.md` with comprehensive system prompt including thread context guidelines
- Task 4: Ensure Assistant handler supports channel-thread follow-ups while avoiding duplicate responses when `app_mention` is also triggered
- Task 5: Extended tests with traceId verification and handler wiring tests

### Completion Notes List

- ✅ Thread history fetcher now includes `traceId` in all logs for observability
- ✅ Thread history passed as Anthropic message history and filtered for empty text; bounded by `keepLastN=50` + `maxTokens=4000`
- ✅ Created `.orion/agents/orion.md` with explicit guidance on referencing thread history
- ✅ Assistant handler supports DM + channel threads; channel messages with leading bot mention are skipped to avoid duplicates (handled by `app_mention`)
- ✅ Tests updated/added for: channel-thread follow-ups, bot-mention dedupe, keepLastN + token budget trimming
- Manual verification pending (requires user testing)

### Debug Log

- `pnpm test` passes (450 passed, 2 skipped)

### File List

Files modified:
- `.orion/agents/orion.md` — Added thread context guidelines section
- `src/slack/thread-context.ts` — Added `keepLastN` + token-budget trimming while keeping most recent messages; `traceId` stays in logs
- `src/slack/thread-context.test.ts` — Added tests for keepLastN + token budget trimming behavior
- `src/slack/handlers/user-message.ts` — Handle channel-thread follow-ups; avoid duplicates for leading bot mentions; tightened history bounds + removed PII from logs
- `src/slack/handlers/user-message.test.ts` — Updated expectations + added channel follow-up / dedupe tests

Note: `src/slack/handlers/app-mention.ts` changes belong to Story 2-8 scope.

## Change Log

- 2025-12-23 — Code Review Fixes (AI): Fixed channel-thread follow-ups being skipped in Assistant handler, made history bounds explicit (keepLastN + maxTokens), corrected token-budget behavior in `fetchThreadHistory`, removed PII (names) from logs, and updated tests
- 2025-12-23 — Code Review Fixes: Fixed File List accuracy (orion.md modified not created, removed app-mention.ts from scope), added empty text filtering test, clarified manual verification as out-of-scope for automated review
- 2025-12-23 — Story implementation: Added traceId to thread context logs, created .orion/agents/orion.md with history guidance, added 4 new tests for observability and handler wiring

