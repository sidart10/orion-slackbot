# Plan: DM and Group DM Support

## Goal

Enable Orion to respond to direct messages (DMs) and group DMs, not just channel @mentions and Slack Assistant API threads.

Currently:
- ✅ Channel @mentions work via `app.event('app_mention')`
- ✅ Slack Assistant threads work via `app.assistant()`
- ❌ Regular DMs (DMing the bot directly) don't work
- ❌ Group DMs (multi-person DMs with the bot) don't work

## Technical Choices

- **Approach**: Create a unified message handler that covers DMs, group DMs, AND can be reused by channel mentions
- **Event filtering**: Use `message.channel_type` to distinguish `'im'` (DM), `'mpim'` (group DM), `'channel'`, `'group'`
- **Code reuse**: Extract common handler logic from `app-mention.ts` into a shared core, then create thin adapters
- **Conversation history**: Use existing `fetchConversationHistory()` for DMs (uses `conversations.history`), keep `fetchThreadHistory()` for threaded contexts

## Current State Analysis

The existing `handleAppMention` in `src/slack/handlers/app-mention.ts` (730 lines) has all the necessary logic:
- Event deduplication
- Streaming setup within 500ms
- Status updates
- Thread/conversation history
- File ingestion
- System prompt + skills injection
- Agent execution with `runOrionAgent()`
- Response streaming with Slack mrkdwn formatting
- References, feedback, reactions
- Error handling and cleanup

This logic is identical for DMs/group DMs except:
1. No @mention stripping needed
2. DMs don't thread by default (use `conversations.history` not `conversations.replies`)
3. Different trace naming

### Key Files:

- `src/slack/handlers/app-mention.ts` - Current channel handler (730 lines)
- `src/slack/thread-context.ts` - `fetchThreadHistory()` for threaded contexts
- `src/slack/conversation-history.ts` - `fetchConversationHistory()` for flat contexts
- `src/index.ts` - Handler registration
- `src/slack/event-dedup.ts` - Event deduplication

## Tasks

### Task 0: Update Slack Manifest (PREREQUISITE - Do First)

**CRITICAL**: The current manifest is missing required scopes and features. Without these, DM events won't be received.

- [ ] Add `im:write` to bot scopes (required to respond in DMs)
- [ ] Add `mpim:write` to bot scopes (required to respond in group DMs)
- [ ] Add `features.app_home` section with `messages_tab_enabled: true`
- [ ] Verify actual Slack app scopes in Slack admin console match manifest doc
- [ ] Reinstall app to workspace after scope changes (OAuth scopes require reinstall)

**Required manifest additions:**
```yaml
features:
  bot_user:
    display_name: orion
    always_online: true
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false

oauth_config:
  scopes:
    bot:
      # ... existing scopes ...
      - im:write       # NEW
      - mpim:write     # NEW
```

**Files to modify:**
- `docs/orion-slack-manifest.md`

---

### Task 1: Create Shared Message Handler Core (Incremental Approach)

Extract common message handling logic using an incremental, low-risk approach.

**Phase 1: Interface Design (Low Risk)**
- [ ] Create `src/slack/handlers/message-core.ts` with `MessageContext` interface only
- [ ] Define all fields needed: channelId, messageTs, userId, text, threadTs, isThread, channelType, files, client, context
- [ ] Get interface reviewed before proceeding

**Phase 2: Thin Wrapper (Medium Risk)**
- [ ] Create `handleMessage(context: MessageContext)` that wraps existing logic
- [ ] Start by duplicating relevant parts from `handleAppMention` (don't refactor yet)
- [ ] Focus on: streaming, status, history fetch, agent execution, response, cleanup
- [ ] Make thread vs flat history configurable via `isThread` flag

**Phase 3: Verify with DM Handlers First**
- [ ] Create DM handler (Task 2) using the wrapper
- [ ] Test that DMs work before touching app-mention.ts
- [ ] Only refactor app-mention.ts (Task 4) AFTER DM handlers are verified

**Files to create:**
- `src/slack/handlers/message-core.ts`

**Risk mitigation**: If extraction proves too complex, fallback is to duplicate code in DM handlers and refactor later. Working DMs > clean code.

### Task 2: Create DM Handler

Create a thin adapter that handles `message.im` events.

- [ ] Create `src/slack/handlers/direct-message.ts`
- [ ] Filter for `channel_type === 'im'`
- [ ] Skip bot messages (`message.bot_id`) to prevent loops
- [ ] Skip message subtypes (edits, deletions)
- [ ] Use `isDuplicateEvent()` with handler ID `'dm'`
- [ ] Normalize event to `MessageContext` and call `handleMessage()`
- [ ] Use `conversations.history` for context (DMs don't thread)

**Files to create:**
- `src/slack/handlers/direct-message.ts`

### Task 3: Create Group DM Handler

Create a thin adapter that handles `message.mpim` events.

- [ ] Create `src/slack/handlers/group-dm.ts`
- [ ] Filter for `channel_type === 'mpim'`
- [ ] Skip bot messages and subtypes
- [ ] Use `isDuplicateEvent()` with handler ID `'group_dm'`
- [ ] Normalize event to `MessageContext` and call `handleMessage()`
- [ ] Use `conversations.history` for context (group DMs don't thread by default)

**Files to create:**
- `src/slack/handlers/group-dm.ts`

### Task 4: Refactor App Mention Handler

Update the existing handler to use the shared core.

- [ ] Update `src/slack/handlers/app-mention.ts` to use `handleMessage()`
- [ ] Keep `extractMessageText()` for @mention stripping
- [ ] Keep thread-based history (different from DMs)
- [ ] Maintain backward compatibility

**Files to modify:**
- `src/slack/handlers/app-mention.ts`

### Task 5: Register Handlers in Entry Point

Add the new handlers to `src/index.ts`.

- [ ] Import `handleDirectMessage` and `handleGroupDm`
- [ ] Register `app.message()` handler with DM filter (`channel_type === 'im'`)
- [ ] Register `app.message()` handler with group DM filter (`channel_type === 'mpim'`)
- [ ] Add feature flag check: `if (config.enableDmSupport) { ... }`
- [ ] Add config entry: `ENABLE_DM_SUPPORT` env var (default: true)

**Handler Registration Order Clarification:**
- Assistant API (`app.assistant()`) handles: threadStarted, threadContextChanged, userMessage in Assistant thread context
- Message handlers (`app.message()`) handle: raw `message.im` and `message.mpim` events
- These are PARALLEL paths, not competing. Both can be registered. Event deduplication prevents double-processing.

**Files to modify:**
- `src/index.ts`
- `src/config/environment.ts` (add ENABLE_DM_SUPPORT)

### Task 6: Add Conversation History Helper

Create a simple wrapper to fetch DM conversation history for the agent.

- [ ] Add `fetchDmHistory()` function to `src/slack/thread-context.ts` or create new file
- [ ] Use `conversations.history` API
- [ ] Convert to Anthropic message format
- [ ] Limit by token count and message count

**Files to modify:**
- `src/slack/thread-context.ts` (or create `src/slack/dm-context.ts`)

### Task 7: Add Tests

Add unit tests for the new handlers.

- [ ] Create `src/slack/handlers/direct-message.test.ts`
- [ ] Create `src/slack/handlers/group-dm.test.ts`
- [ ] Test event filtering (channel_type)
- [ ] Test bot message filtering
- [ ] Test deduplication
- [ ] Mock `runOrionAgent()` and `createStreamer()`

**Files to create:**
- `tests/unit/slack/handlers/direct-message.test.ts`
- `tests/unit/slack/handlers/group-dm.test.ts`

### Task 8: Update Manifest Documentation

Update the Slack manifest docs to document DM support.

- [ ] Add notes about native DM handling vs Assistant API
- [ ] Document the `message.im` and `message.mpim` event subscriptions

## Success Criteria

### Automated Verification:
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (new tests included)
- [ ] `npm run typecheck` passes

### Manual Verification:
- [ ] Send DM to Orion bot → Bot responds
- [ ] Send message in group DM with Orion → Bot responds
- [ ] Send @orion in channel → Bot responds (regression test)
- [ ] Bot doesn't respond to its own messages (no loops)
- [ ] Bot doesn't respond to message edits
- [ ] Conversation history is included in DM context
- [ ] File attachments work in DMs

## Out of Scope

- Changing the Slack Assistant API behavior (keep as-is)
- Adding @mention requirement for group DMs (respond to all messages like regular DMs)
- Different system prompts for DMs vs channels (use same `orion.md`)
- Thread support in DMs (Slack DMs don't thread by default)

## Risks (Pre-Mortem)

### Tigers (Verified Risks):

1. **Missing OAuth scopes in manifest** (HIGH) ✅ MITIGATED
   - **Issue**: Manifest has `im:read`, `im:history`, `mpim:history` but missing `im:write` and `mpim:write`
   - **Impact**: Bot cannot respond in DMs without write scopes
   - **Mitigation**: Task 0 added - update manifest and reinstall app BEFORE any code changes
   - **Verification**: `docs/orion-slack-manifest.md:25-44` - verified missing scopes

2. **Missing `app_home.messages_tab_enabled` in manifest** (HIGH) ✅ MITIGATED
   - **Issue**: Manifest only has `bot_user` under features, no `app_home` section
   - **Impact**: Messages Tab won't be enabled, DMs may not route to handlers
   - **Mitigation**: Task 0 added - add `app_home` section to manifest
   - **Verification**: `docs/orion-slack-manifest.md:5-8` - only bot_user exists

3. **Assistant API vs Message Handler ambiguity** (HIGH) ✅ CLARIFIED
   - **Issue**: Plan was unclear about whether DMs go through Assistant API or raw message handlers
   - **Clarification**: Slack Assistant class handles DMs in Assistant thread context (threadStarted/userMessage events). For regular DMs outside Assistant threads, we need `message.im` handlers. Both paths can coexist:
     - Assistant API: DMs initiated from "Orion" in Apps sidebar → threadStarted → userMessage
     - Message handlers: DMs to Orion bot user directly → message.im event
   - **Implementation**: Register message handlers for `message.im` and `message.mpim` events. These run parallel to (not instead of) Assistant API.
   - **Test**: Verify both paths work - Assistant threads AND direct DMs

4. **730-line extraction risk** (MEDIUM) ⚠️ MITIGATED
   - **Issue**: Extracting shared core from `app-mention.ts` is high-risk refactoring
   - **Mitigation**: Use incremental approach:
     1. First: Create `MessageContext` interface (type-only) - get reviewed
     2. Then: Create thin wrapper calling existing `handleAppMention` internals
     3. Then: Add DM/Group DM handlers using wrapper
     4. Later (optional): Full extraction for code cleanliness
   - **Verification**: Task 1 updated to reflect incremental approach

### Paper Tigers (Looks scary but OK):
- **Rate limiting with high DM volume** (LOW) - Same rate limit handling already exists
- **Bot responding to own messages** - Plan addresses with `bot_id` filtering
- **Message subtype handling** - Plan addresses with subtype filtering

### Elephants (Uncomfortable Truths):
1. **Duplicate paths for DMs**: Assistant API and message handlers create parallel logic. Document which events trigger which handlers.
2. **No feature flag**: Consider adding env var to disable DM support if issues arise post-deployment.
3. **Integration tests missing**: Plan only has unit tests. Add manual verification checklist.

### Checklist Gaps (Added to Tasks):
- [ ] **Rollback strategy**: Document how to disable DM support if issues arise (remove handler registration or add env var)
- [ ] **Feature flag**: Add `ENABLE_DM_SUPPORT=true` env var to toggle DM handlers

---

## Pre-Mortem Run
- **Date**: 2026-01-21
- **Mode**: deep
- **Tigers**: 4 (3 HIGH mitigated, 1 MEDIUM mitigated)
- **Elephants**: 3
- **Result**: All HIGH severity tigers addressed with mitigations
