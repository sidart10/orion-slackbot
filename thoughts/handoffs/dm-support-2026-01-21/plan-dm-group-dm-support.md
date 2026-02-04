---
root_span_id: c9067e6b-66ec-49c3-92f4-bd6e26cb8509
turn_span_id: 8b58cbbd-1c46-453b-86d3-33b33a277956
session_id: c9067e6b-66ec-49c3-92f4-bd6e26cb8509
date: 2026-01-21T00:00:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-dm-group-dm-support.md
---

# Plan Handoff: DM and Group DM Support

## Summary

Created a plan to enable Orion to respond to direct messages and group DMs. The bot currently only works in channels (@mentions) and Slack Assistant threads, but not regular DMs.

## Plan Created

`thoughts/shared/plans/PLAN-dm-group-dm-support.md`

## Key Technical Decisions

- **Shared core approach**: Extract common handler logic from `app-mention.ts` into `message-core.ts` to avoid 3 copies of ~700 lines
- **Use existing APIs**: Leverage `fetchConversationHistory()` for DMs, `fetchThreadHistory()` for channels
- **Event filtering**: Use `message.channel_type` to distinguish DM (`im`), group DM (`mpim`), channels

## Task Overview

1. **Create Shared Message Handler Core** - Extract common logic to `message-core.ts`
2. **Create DM Handler** - Thin adapter for `message.im` events
3. **Create Group DM Handler** - Thin adapter for `message.mpim` events
4. **Refactor App Mention Handler** - Use shared core
5. **Register Handlers** - Add to `index.ts`
6. **Add Conversation History Helper** - For DM context
7. **Add Tests** - Unit tests for new handlers
8. **Update Docs** - Manifest documentation

## Research Findings

- `src/slack/handlers/app-mention.ts:88` - Full 730-line handler with all required logic ✓ VERIFIED
- `src/slack/conversation-history.ts:56` - `fetchConversationHistory()` already exists for `conversations.history` ✓ VERIFIED
- `src/slack/event-dedup.ts` - Deduplication supports custom handler IDs ✓ VERIFIED
- `src/index.ts:62-66` - Current handler registration pattern ✓ VERIFIED

## Assumptions Made

- User has confirmed `im:write` and `mpim:write` scopes are already configured in Slack app - verify in Slack app settings before testing
- Assistant API and native DM handlers can coexist - may need to adjust registration order if they conflict
- Group DMs should respond to ALL messages (like regular DMs), not require @mention

## For Next Steps

- User should review plan at: `thoughts/shared/plans/PLAN-dm-group-dm-support.md`
- After approval, run `/implement_plan` with the plan path
- Before implementing, verify Slack app has correct OAuth scopes in app settings (not just manifest)
