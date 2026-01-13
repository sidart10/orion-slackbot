# Story 8.6: Tool Search Bug Fix - Add tool_search_tool_bm25

Status: in-progress

## Story

As a **Slack user**,
I want Orion to correctly enable Tool Search so that MCP tools are discoverable,
so that I can use audience-manager, msci-reports, and other MCP tools without falling back to legacy sandbox.

## Background

### Root Cause

Story 8.2 implemented `defer_loading: true` on MCP tools but **forgot to add the `tool_search_tool_bm25` built-in tool** that Claude needs to discover deferred tools.

**SDK Evidence:**
```typescript
// From node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts
export interface BetaToolSearchToolBm2520251119 {
    name: 'tool_search_tool_bm25';
    type: 'tool_search_tool_bm25_20251119' | 'tool_search_tool_bm25';
    // ...
}
```

This is a **distinct built-in tool** that must be explicitly added to the tools array - it is NOT automatically provided by the API.

### Current Behavior (Broken)

```
User: "Find audience data for NFL using audience-manager"
Claude: "I don't currently see an 'audience manager MCP' tool available in my toolkit"
→ Falls back to Orion Sandbox (legacy GKE)
```

### Expected Behavior (After Fix)

```
User: "Find audience data for NFL using audience-manager"
Claude: [calls tool_search_tool_bm25 to discover deferred tools]
Claude: [calls audience-manager__search with query]
→ Returns actual data from MCP server
```

## Acceptance Criteria

### AC1: tool_search_tool Added to Tools Array
**Given** tool search is enabled (`toolSearchEnabled = true`) and deferred tools exist (`deferredToolCount > 0`),
**When** the agent loop constructs the tools array,
**Then** `tool_search_tool_bm25` is included with type `tool_search_tool_bm25_20251119`.

### AC2: Tool Search Correctly Disabled
**Given** tool search is disabled (`TOOL_SEARCH_ENABLED=false`) or no deferred tools exist,
**When** the agent loop constructs the tools array,
**Then** `tool_search_tool_bm25` is NOT included.

### AC3: MCP Tools Discoverable
**Given** MCP servers are configured (audience-manager, msci-reports, etc.),
**When** a user asks Claude to use an MCP tool,
**Then** Claude can discover the tool via tool_search and execute it successfully.

### AC4: Observability
**Given** tool_search_tool is added to the tools array,
**When** the agent loop logs tool search configuration,
**Then** the log includes `toolSearchToolIncluded: true`.

### AC5: Backwards Compatibility
**Given** existing tests for tool search and tool execution,
**When** the fix is applied,
**Then** all existing tests continue to pass.

## Tasks / Subtasks

### Task 1: Add tool_search_tool to Agent Loop (AC: #1, #2, #4)

**File:** `src/agent/loop.ts` (lines 669-673)

- [x] **1.1** Add `toolSearchTool` constant with correct type
- [x] **1.2** Conditionally include based on `deferredToolCount > 0 && toolSearchEnabled`
- [x] **1.3** Add to tools array after memoryTool (insert after line 672)
- [x] **1.4** Update log event to include `toolSearchToolIncluded`

**Exact Insertion Point:**
```typescript
// Current line 672:
...(memoryTool ? [memoryTool as unknown as Anthropic.Tool] : []),
// INSERT AFTER LINE 672:
...(toolSearchTool ? [toolSearchTool as unknown as Anthropic.Tool] : []),
```

**Implementation:**
```typescript
// Story 8.6: Add tool_search_tool when deferred tools exist
// This built-in tool allows Claude to discover tools with defer_loading: true
const toolSearchTool = deferredToolCount > 0 && toolSearchEnabled ? {
  type: 'tool_search_tool_bm25_20251119' as const,
  name: 'tool_search_tool_bm25',
} : null;

const tools = [
  ...registryTools,
  codeExecutionTool as unknown as Anthropic.Tool,
  ...(memoryTool ? [memoryTool as unknown as Anthropic.Tool] : []),
  ...(toolSearchTool ? [toolSearchTool as unknown as Anthropic.Tool] : []),
];
```

### Lesson from Story 8.2

`defer_loading: true` annotates tools for deferred discovery, but Claude needs the `tool_search_tool_bm25` built-in tool to perform discovery. The API does NOT auto-inject this tool - it must be explicitly added like `code_execution` or `memory`.

### Task 2: Add Unit Tests (AC: #1, #2, #4, #5)

**File:** `src/agent/loop.test.ts`

- [x] **2.1** Test: tool_search_tool included when deferredToolCount > 0 && enabled
- [x] **2.2** Test: tool_search_tool NOT included when disabled
- [x] **2.3** Test: tool_search_tool NOT included when deferredToolCount = 0
- [x] **2.4** Test: tool_search_tool NOT included when model doesn't support tool search (Code Review Fix)
- [x] **2.5** Test: logs toolSearchToolIncluded: true in tool_search.config event (AC#4, Code Review Fix)
- [x] **2.6** Test: logs toolSearchToolIncluded: false when disabled (AC#4, Code Review Fix)

### Task 3: Update Documentation (AC: all)

**File:** `_bmad-output/project-context.md` (lines 672-761, Tool Search section)

- [x] **3.1** Update line 707 "How It Works" to include: "Claude uses `tool_search_tool_bm25` to discover relevant deferred tools" (Already documented)
- [x] **3.2** Add to PTC Common Pitfalls table (line 649-656): "Missing tool_search_tool | Add `tool_search_tool_bm25` to tools array when deferred tools exist"

### Task 4: Manual Verification (AC: #3)

- [ ] **4.1** Start Orion with `TOOL_SEARCH_ENABLED=true` (default)
- [ ] **4.2** Ask Claude to use audience-manager MCP tool
- [ ] **4.3** Verify Claude discovers and executes the tool (not fallback to sandbox)

## Dev Notes

### File Locations

| File | Purpose |
|------|---------|
| `src/agent/loop.ts` | Add tool_search_tool to tools array |
| `src/agent/loop.test.ts` | Add unit tests |
| `_bmad-output/project-context.md` | Update documentation |

### SDK Reference

```typescript
// Valid tool_search types from SDK
type: 'tool_search_tool_bm25_20251119' | 'tool_search_tool_bm25'
type: 'tool_search_tool_regex_20251119' | 'tool_search_tool_regex'
```

We use `tool_search_tool_bm25_20251119` (BM25 algorithm) as it's more suitable for keyword-based tool discovery.

### Git Commit Pattern

```
fix(agent): add tool_search_tool_bm25 for deferred tool discovery (Story 8.6)
```

### Estimated Effort

- **Complexity:** Low
- **Files Changed:** 3
- **Tests Added:** 3
- **Estimated Time:** 1-2 hours

## References

- [Sprint Change Proposal](../_bmad-output/sprint-change-proposal-2026-01-12-tool-search-bugfix.md)
- [Story 8.2 - Tool Search Implementation](./story-8-2-tool-search-tool.md)
- [Anthropic SDK Types](node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts)

## Dev Agent Record

### Implementation Plan

1. Added `willIncludeToolSearchTool` variable at line 630 (for logging)
2. Added `toolSearchTool` constant at lines 667-676 with conditional inclusion
3. Added `toolSearchTool` to tools array at line 689
4. Updated log event at line 640 with `toolSearchToolIncluded` field

### Completion Notes

- ✅ **AC#1 satisfied**: `tool_search_tool_bm25` is included when `deferredToolCount > 0 && toolSearchEnabled`
- ✅ **AC#2 satisfied**: Tool is excluded when disabled, no deferred tools, OR model doesn't support (4 tests)
- ⏳ **AC#3 pending**: Manual verification required before story can be marked done
- ✅ **AC#4 satisfied**: Log includes `toolSearchToolIncluded` (2 dedicated tests added)
- ✅ **AC#5 satisfied**: All 1805 tests pass (1802 existing + 3 original + 3 code review fixes)
- ✅ 6 unit tests in `describe('Story 8.6: tool_search_tool_bm25 inclusion')`
- ✅ Documentation updated in project-context.md Common Pitfalls table

### Code Review Fixes (2026-01-12)

| Issue | Severity | Fix |
|-------|----------|-----|
| Test isolation - config mutation without cleanup | MEDIUM | Added `afterEach` to restore config after each test |
| No test for model capability fallback | MEDIUM | Added test for `supportsToolSearch() = false` scenario |
| AC#4 (observability) had no dedicated test | LOW | Added 2 tests verifying `toolSearchToolIncluded` in logs |
| Config restore inconsistency | LOW | Fixed `coreTools` array to include 'summarize' |

**Mock additions for tests:**
- Added `supportsToolSearchMock` to hoisted block
- Added `vi.mock('./model-capabilities.js')` for controlling model capability

## File List

| File | Change |
|------|--------|
| `src/agent/loop.ts` | Added toolSearchTool constant and inclusion logic |
| `src/agent/loop.test.ts` | Added 6 unit tests (3 original + 3 code review fixes), afterEach cleanup, model-capabilities mock |
| `_bmad-output/project-context.md` | Added pitfall row for missing tool_search_tool |
| `_bmad-output/implementation-artifacts/stories/story-8-6-tool-search-bugfix.md` | Task checkboxes, status update, code review findings |

## Change Log

| Date | Change |
|------|--------|
| 2026-01-12 | Story created via Course Correction workflow |
| 2026-01-12 | Validation pass: Fixed checkbox status, added Story 8.2 lesson, added exact line references |
| 2026-01-12 | Implementation complete - Tasks 1-3 done, Task 4 (manual verification) pending |
| 2026-01-12 | Code review: Fixed 4 issues (2 MEDIUM, 2 LOW), added 3 tests, improved test isolation |
