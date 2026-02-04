---
root_span_id: 3e2cde2b-77f8-44a2-8d19-4edf237cc87b
turn_span_id: 02c8a103-05b6-4159-be7c-4ab1227da516
session_id: 3e2cde2b-77f8-44a2-8d19-4edf237cc87b
date: 2026-01-21T18:45:00Z
type: validation
status: VALIDATED
plan_file: thoughts/shared/plans/PLAN-dm-group-dm-support.md
validator: validate-agent
---

# Plan Validation: DM and Group DM Support

## Overall Status: VALIDATED

All tech choices are current best practices. Plan is ready for implementation with one advisory note about `message.app_home` events.

---

## Precedent Check (RAG-Judge)

**Verdict:** N/A (RAG-judge not available in this project)

No similar past work found in Artifact Index.

---

## Tech Choices Validated

### 1. Slack Bolt.js `app.message()` Handler

**Purpose:** Handle `message.im` and `message.mpim` events for DMs and group DMs
**Status:** VALID
**Findings:**
- `app.message()` is the official and recommended way to listen to messages in Bolt.js
- Filtering by `channel_type` (`'im'`, `'mpim'`) is the documented pattern
- `ignoreSelf()` middleware (enabled by default) prevents bot responding to own messages
- Message subtypes should be filtered to avoid handling edits/deletions
- Per [Bolt.js docs](https://docs.slack.dev/tools/bolt-js/concepts/message-listening/), the `message()` listener accepts an optional pattern parameter and filters by `channel_type`

**Recommendation:** Keep as-is
**Sources:**
- [Slack Bolt.js Message Listening](https://docs.slack.dev/tools/bolt-js/concepts/message-listening/)
- [Bolt.js GitHub Issue #601](https://github.com/slackapi/bolt-js/issues/601)
- [Bolt.js GitHub Issue #2323](https://github.com/slackapi/bolt-js/issues/2323)

---

### 2. `channel_type` Filtering

**Purpose:** Distinguish DMs (`'im'`), group DMs (`'mpim'`), channels (`'channel'`), private channels (`'group'`)
**Status:** VALID
**Findings:**
- `channel_type` is the official field in message events
- Values `'im'` and `'mpim'` are correctly identified in the plan
- This is the documented pattern in Slack's Events API
- Per [message.mpim docs](https://docs.slack.dev/reference/events/message.mpim/): "Differentiate multi-party direct messages from other message events by looking for the event's `channel_type` field set to 'mpim'"

**Recommendation:** Keep as-is
**Sources:**
- [message.im event docs](https://docs.slack.dev/reference/events/message.im/)
- [message.mpim event docs](https://docs.slack.dev/reference/events/message.mpim/)

---

### 3. `conversations.history` API for DMs

**Purpose:** Fetch DM conversation history (flat, not threaded)
**Status:** VALID
**Findings:**
- `conversations.history` is correct for fetching parent messages in DMs
- Returns only parent messages, not thread replies (correct for DMs which don't thread by default)
- For threaded contexts, `conversations.replies` should be used
- Bot tokens can use this method for DMs and group DMs
- Rate limit note: As of May 2025, Tier 3 for Marketplace/internal apps

**Recommendation:** Keep as-is. The plan correctly distinguishes when to use `conversations.history` (DMs) vs `conversations.replies` (threads).
**Sources:**
- [conversations.history docs](https://docs.slack.dev/reference/methods/conversations.history/)
- [conversations.replies docs](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Retrieving messages guide](https://docs.slack.dev/messaging/retrieving-messages/)

---

### 4. Event Deduplication Pattern

**Purpose:** Prevent double-processing of events using handler-specific IDs
**Status:** VALID
**Findings:**
- Standard practice in event-driven systems
- Using handler IDs (`'dm'`, `'group_dm'`, `'app_mention'`) is a good pattern
- Plan already has `isDuplicateEvent()` in codebase
- This also helps when Assistant and message handlers both receive events

**Recommendation:** Keep as-is
**Sources:** Standard software engineering pattern

---

### 5. OAuth Scopes: `im:write` and `mpim:write`

**Purpose:** Allow bot to respond in DMs and group DMs
**Status:** VALID
**Findings:**
- `im:write` is required for "Send messages as your slack app" in DMs
- `mpim:write` is required to "Start group direct messages with people"
- Both are available for Bot token type
- Plan correctly identifies these as missing from current manifest
- `chat:write` (already present) is needed for actually sending messages

**Recommendation:** Keep as-is. These scopes are required and plan addresses adding them.
**Sources:**
- [mpim:write scope docs](https://docs.slack.dev/reference/scopes/mpim.write/)
- [Slack scopes reference](https://docs.slack.dev/reference/scopes/)

---

### 6. `app_home.messages_tab_enabled` Manifest Setting

**Purpose:** Enable the Messages tab in App Home for DM routing
**Status:** VALID (with advisory)
**Findings:**
- `messages_tab_enabled: true` is required for users to message the bot via App Home
- This is the correct manifest structure:
  ```yaml
  features:
    app_home:
      messages_tab_enabled: true
      messages_tab_read_only_enabled: false
  ```

**Advisory Note:**
- With `messages_tab_enabled`, messages from App Home trigger `message.app_home` events, NOT `message.im`
- Standard DMs (outside App Home) trigger `message.im`
- The plan should consider subscribing to BOTH `message.im` AND `message.app_home` events for complete coverage

**Recommendation:** KEEP the manifest change. CONSIDER adding `message.app_home` event subscription alongside `message.im` to capture all DM-like interactions.
**Sources:**
- [App manifest reference](https://docs.slack.dev/reference/app-manifest/)
- [message.app_home event docs](https://docs.slack.dev/reference/events/message.app_home/)

---

### 7. Incremental Extraction Approach

**Purpose:** Safely extract shared logic from 730-line `app-mention.ts`
**Status:** VALID
**Findings:**
- Interface-first design is low risk
- Creating thin wrapper before full refactor is sound
- Plan correctly identifies the risk and proposes mitigation

**Recommendation:** Keep as-is. Follow the incremental approach.

---

### 8. Feature Flag `ENABLE_DM_SUPPORT`

**Purpose:** Toggle DM support for quick rollback
**Status:** VALID
**Findings:**
- Good defensive practice for new features
- Allows quick disable without code changes

**Recommendation:** Keep.

---

## Summary

### Validated (Safe to Proceed):
- Bolt.js `app.message()` handler pattern ✓
- `channel_type` filtering (`'im'`, `'mpim'`) ✓
- `conversations.history` for DM context ✓
- Event deduplication with handler IDs ✓
- OAuth scopes `im:write`, `mpim:write` ✓
- `messages_tab_enabled` manifest setting ✓
- Incremental extraction approach ✓
- Feature flag for rollback ✓

### Needs Review:
- **message.app_home subscription** - Consider adding this event type alongside `message.im` for complete App Home coverage (advisory, not blocking)

### Must Change:
None

---

## Recommendations

1. **Consider subscribing to `message.app_home` event** in addition to `message.im`. When users message the bot via the App Home Messages tab, the event type is `message.app_home`, not `message.im`. For complete DM coverage:
   - `message.im` - Standard 1:1 DMs
   - `message.app_home` - Messages via App Home Messages tab
   - `message.mpim` - Group DMs

2. **Rate limit awareness**: `conversations.history` has Tier 3 rate limits. Document this for future reference when scaling.

3. **Handler coexistence**: The Assistant API and message handlers can coexist. The plan correctly notes this:
   > "These are PARALLEL paths, not competing. Both can be registered. Event deduplication prevents double-processing."

---

## For Implementation

1. **Task 0 (Manifest)** is correctly flagged as PREREQUISITE - scopes must be added before DM handlers will work
2. The incremental approach in Task 1 is sound - interface first, then wrapper, then full extraction
3. Bot message filtering (`message.bot_id`) and subtype filtering are both correctly specified
4. Test all paths after implementation:
   - DM the bot user directly (message.im)
   - Message via App Home sidebar (may be message.app_home)
   - Group DM with bot (message.mpim)
   - Channel @mention (app_mention - regression test)

---

## Sources

- [Slack Bolt.js Message Listening](https://docs.slack.dev/tools/bolt-js/concepts/message-listening/)
- [message.im event docs](https://docs.slack.dev/reference/events/message.im/)
- [message.mpim event docs](https://docs.slack.dev/reference/events/message.mpim/)
- [message.app_home event docs](https://docs.slack.dev/reference/events/message.app_home/)
- [conversations.history docs](https://docs.slack.dev/reference/methods/conversations.history/)
- [conversations.replies docs](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Slack scopes reference](https://docs.slack.dev/reference/scopes/)
- [App manifest reference](https://docs.slack.dev/reference/app-manifest/)
- [Bolt.js GitHub](https://github.com/slackapi/bolt-js)
