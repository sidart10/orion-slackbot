# Story 8.6: Tool Search Bug Fix - Add tool_search_tool_bm25

Status: ready-for-dev

<!-- Note: P0 Bug fix for Story 8.2 implementation gap. Fix has been implemented; this story documents the change. -->

## Story

As a **platform operator**,
I want the `tool_search_tool_bm25` built-in tool to be explicitly added to the tools array when deferred tools exist,
So that Claude can discover and use MCP tools that have `defer_loading: true` enabled.

## Background

Story 8.2 implemented Anthropic's Tool Search feature by adding `defer_loading: true` to MCP tools. However, the implementation **missed adding the `tool_search_tool_bm25` built-in tool** that Claude needs to discover deferred tools.

**Result:** All MCP tools were invisible to Claude. When asked to use audience-manager or other MCP tools, Claude responded "I don't currently see an 'audience manager MCP' tool available in my toolkit" and fell back to the legacy Orion Sandbox.

**Root Cause:** The SDK documentation shows `tool_search_tool_bm25_20251119` is a required built-in tool that must be explicitly added to the tools array - it is NOT automatically provided by the API when deferred tools exist.

**Severity:** P0 - Critical. Blocks all MCP tool usage when Tool Search is enabled (default: `TOOL_SEARCH_ENABLED=true`)

## Acceptance Criteria

1. **Given** tool search is enabled AND deferred tools exist, **When** the agent loop builds the tools array, **Then** `tool_search_tool_bm25` is included with correct type and name

2. **Given** tool search is disabled OR no deferred tools exist, **When** the agent loop builds the tools array, **Then** `tool_search_tool_bm25` is NOT included (no unnecessary tool)

3. **Given** a model that does not support tool search, **When** the agent loop builds the tools array, **Then** `tool_search_tool_bm25` is NOT included (graceful fallback)

4. **Given** tool_search_tool_bm25 is included, **When** Claude receives `tool_search_tool_result` blocks, **Then** the agent loop handles them correctly (no execution needed - API handles)

## Tasks / Subtasks

- [x] **Task 1: Add tool_search_tool_bm25 to tools array** (AC: #1, #2, #3)
  - [x] Add conditional check for `willIncludeToolSearchTool`
  - [x] Create `toolSearchTool` object with correct type/name
  - [x] Add to tools array when condition is true
  - [x] Verify type assertion matches SDK expectations

- [x] **Task 2: Handle tool_search_tool_result blocks** (AC: #4)
  - [x] Update server block handling in agent loop
  - [x] Skip execution for `tool_search_tool_bm25` and `tool_search_tool_regex`
  - [x] Log tool search discovery events

- [x] **Task 3: Unit Tests** (AC: #1, #2, #3)
  - [x] Test: tool_search_tool_bm25 included when deferred tools exist and tool search enabled
  - [x] Test: tool_search_tool_bm25 excluded when tool search disabled
  - [x] Test: tool_search_tool_bm25 excluded when no deferred tools exist
  - [x] Test: tool_search_tool_bm25 excluded when model does not support tool search

- [x] **Task 4: Documentation** (AC: all)
  - [x] Update project-context.md with explicit note about tool_search_tool_bm25
  - [x] Update story 8.2 with known issue reference
  - [x] Create sprint change proposal for audit trail

## Dev Notes

### The Fix

The fix adds `tool_search_tool_bm25` to the tools array when:
1. Tool search is enabled (`config.toolSearch.enabled`)
2. Model supports tool search (`supportsToolSearch(model)`)
3. Deferred tools exist (`deferredToolCount > 0`)

**Code Location:** `src/agent/loop.ts` (lines 709-731)

```typescript
// Story 8.6: Add tool_search_tool_bm25 when deferred tools exist
// This built-in tool allows Claude to discover tools with defer_loading: true
// Without it, deferred tools are never discoverable (Story 8.2 implementation gap)
const toolSearchTool = willIncludeToolSearchTool
  ? {
      type: 'tool_search_tool_bm25_20251119' as const,
      name: 'tool_search_tool_bm25',
    }
  : null;

const tools = [
  ...registryTools,
  codeExecutionTool as unknown as Anthropic.Tool,
  ...(memoryTool ? [memoryTool as unknown as Anthropic.Tool] : []),
  ...(toolSearchTool ? [toolSearchTool as unknown as Anthropic.Tool] : []),
];
```

### SDK Type Definition

From `@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`:

```typescript
export interface BetaToolSearchToolBm2520251119 {
    name: 'tool_search_tool_bm25';
    type: 'tool_search_tool_bm25_20251119' | 'tool_search_tool_bm25';
}
```

### Tool Result Handling

The agent loop also handles `tool_search_tool_result` blocks correctly:

```typescript
// src/agent/loop.ts (line 1138)
if (serverBlock.name === 'tool_search_tool_bm25' || serverBlock.name === 'tool_search_tool_regex') {
  // Tool search results are handled by the API, we just log and continue
  logger.debug({
    event: 'agent.loop.tool_search_result',
    traceId,
    toolName: serverBlock.name,
  });
  continue;
}
```

### Architecture Compliance

| Requirement | Implementation |
|-------------|----------------|
| ESM imports | All imports use `.js` extension |
| Logging | Uses `logger.*` with traceId |
| Config | `config.toolSearch.enabled`, `willIncludeToolSearchTool` |
| Type Safety | SDK type definitions respected |

### File Structure

```
src/
  agent/
    loop.ts                # tool_search_tool_bm25 addition (lines 709-731)
    loop.test.ts           # Unit tests (lines 2726-2860)
    model-capabilities.ts  # supportsToolSearch() detection
  config/
    environment.ts         # TOOL_SEARCH_ENABLED, CORE_TOOLS
```

### Test Coverage

Unit tests in `src/agent/loop.test.ts` (describe block "Story 8.6: tool_search_tool_bm25 inclusion"):

| Test | Status | AC |
|------|--------|-----|
| includes tool_search_tool_bm25 when deferred tools exist and tool search enabled | PASS | #1 |
| excludes tool_search_tool_bm25 when tool search disabled | PASS | #2 |
| excludes tool_search_tool_bm25 when no deferred tools exist | PASS | #2 |
| excludes tool_search_tool_bm25 when model does not support tool search | PASS | #3 |

### Verification

Run the diagnostic script to verify tool search configuration:

```bash
pnpm exec tsx scripts/diagnose-tool-search.ts
```

Expected output when properly configured:
```
✓ tool_search_tool_bm25 WILL be included
```

### Project Context Reference

From `project-context.md`:
- **Tool Search section (line 770-860):** Documents how tool search works
- **Common Pitfalls (line 656):** Explicitly notes `tool_search_tool_bm25` must be added

**Key Insight:** The `tool_search_tool_bm25` must be explicitly added to the tools array - it is NOT automatically provided by the API when deferred tools exist.

### Dependencies

| Dependency | Purpose |
|------------|---------|
| Story 8.2 | Original tool search implementation (this fixes a gap) |
| `src/tools/registry.ts` | `defer_loading` annotation support |
| `src/agent/model-capabilities.ts` | `supportsToolSearch()` detection |
| `src/config/environment.ts` | `TOOL_SEARCH_ENABLED`, `CORE_TOOLS` config |

### References

- [Source: _bmad-output/sprint-change-proposal-2026-01-12-tool-search-bugfix.md] - Change proposal
- [Source: _bmad-output/epics.md#Story 8.6] - Story definition
- [Source: _bmad-output/project-context.md#Tool Search] - Implementation patterns
- [Source: src/agent/loop.ts#L709-731] - Fix implementation
- [Source: src/agent/loop.test.ts#L2726-2860] - Unit tests

## Dev Agent Record

### Agent Model Used

claude-opus-4-5-20250514 (Story creation)

### Debug Log References

- Sprint change proposal: `_bmad-output/sprint-change-proposal-2026-01-12-tool-search-bugfix.md`
- Validation report: `_bmad-output/implementation-artifacts/stories/validation-report-8-6-2026-01-12.md`

### Completion Notes List

- Fix implemented in `src/agent/loop.ts` (lines 709-731)
- Unit tests added in `src/agent/loop.test.ts` (lines 2726-2860)
- Tool result handling added (line 1138)
- Documentation updated in `project-context.md`
- Story 8.2 updated with known issue reference

### File List

Files created/modified:
- `src/agent/loop.ts` - tool_search_tool_bm25 addition and result handling
- `src/agent/loop.test.ts` - unit tests for AC verification
- `_bmad-output/project-context.md` - documentation update
- `_bmad-output/implementation-artifacts/stories/story-8-2-tool-search-tool.md` - known issue note
- `scripts/diagnose-tool-search.ts` - diagnostic script
