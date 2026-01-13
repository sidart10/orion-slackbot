---
date: 2025-01-12T12:00:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-anthropic-prompt-caching.md
---

# Plan Handoff: Anthropic API Prompt Caching

## Summary

Created implementation plan for Anthropic's prompt caching feature to reduce API costs by up to 90% on cached tokens and latency by up to 85%. The implementation requires minimal changes to `src/agent/loop.ts`.

## Plan Created

`thoughts/shared/plans/PLAN-anthropic-prompt-caching.md`

## Key Technical Decisions

- **Cache Strategy**: Use `cache_control: { type: 'ephemeral' }` with default 5-minute TTL (free refresh on hits)
- **Cacheable Content**: Tools (most stable) → System prompt base (stable) → Dynamic context (NOT cached)
- **Implementation Approach**: Convert `system` from string to content block array, add cache_control to last tool
- **No Beta Header Needed**: Prompt caching is GA, no special headers required

## Task Overview

1. **Add Cache Control to Tools Array** - Add `cache_control` marker to last tool element
2. **Convert System Prompt to Content Block Array** - Separate base prompt (cached) from dynamic context (not cached)
3. **Update API Call** - Change `system: string` to `system: ContentBlock[]`
4. **Add Cache Performance Logging** - Log `cache_read_input_tokens` and `cache_creation_input_tokens`
5. **Update Tests** - Test new prompt format and cache metrics logging
6. **Add Configuration Toggle** (Optional) - `PROMPT_CACHING_ENABLED` env var

## Research Findings

- **Current API call** (`src/agent/loop.ts:993-1001`): Passes `system` as plain string, not cacheable
- **Tools array** (`src/agent/loop.ts:727-732`): Built without cache_control markers
- **System prompt construction** (`src/agent/loop.ts:753-756`): Concatenates base + context as string
- **Anthropic cache requirements**:
  - Minimum 1024 tokens for Claude Sonnet
  - Cache hierarchy: `tools` → `system` → `messages`
  - Cache hit = 10% of base input token price
  - Cache write = 125% of base input token price (still saves on 2nd+ request)

## Assumptions Made

- System prompt + tools exceeds 1024 token minimum for caching - VERIFY with actual token count
- SDK TypeScript types support `cache_control` on content blocks - may need type assertions
- Current model (claude-sonnet-4) supports prompt caching - confirmed in docs

## For Next Steps

- User should review plan at: `thoughts/shared/plans/PLAN-anthropic-prompt-caching.md`
- After approval, run `/implement_plan` with the plan path
- Estimated implementation: ~30-45 minutes for core tasks
- Test by sending 2 messages within 5 minutes and checking Langfuse for cache metrics
