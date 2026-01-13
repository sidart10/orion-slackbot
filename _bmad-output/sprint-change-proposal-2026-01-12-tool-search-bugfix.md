# Sprint Change Proposal: Tool Search Bug Fix

**Date:** 2026-01-12
**Author:** John (PM Agent)
**Status:** Proposed
**Triggered By:** Story 8.2 (Tool Search Tool Integration)

---

## Section 1: Issue Summary

### Problem Statement

Story 8.2 implemented Anthropic's Tool Search feature by adding `defer_loading: true` to MCP tools. However, the implementation **missed adding the `tool_search_tool_bm25` built-in tool** that Claude needs to discover deferred tools.

**Result:** All MCP tools are invisible to Claude. When asked to use audience-manager or other MCP tools, Claude responds "I don't currently see an 'audience manager MCP' tool available in my toolkit" and falls back to the legacy Orion Sandbox.

### Discovery Context

- **When:** 2026-01-12 during production testing
- **Evidence:** Slack screenshot showing Claude unable to find MCP tools
- **Root Cause:** SDK documentation shows `tool_search_tool_bm25_20251119` is a required built-in tool, not automatically provided

### Severity

**P0 - Critical:** Blocks all MCP tool usage when Tool Search is enabled (default: `TOOL_SEARCH_ENABLED=true`)

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Impact | Action |
|------|--------|--------|
| Epic 8 | Directly affected | Add Story 8.6 (bug fix) |
| Epic 6 | No impact | - |
| Epic 7 | No impact | - |

### Story Impact

| Story | Impact |
|-------|--------|
| 8.2 (Tool Search) | Bug discovered - missing tool_search_tool |
| 8.1, 8.3, 8.4, 8.5 | No impact |

### Artifact Conflicts

| Artifact | Conflict | Resolution |
|----------|----------|------------|
| project-context.md | Incorrect documentation | Update Tool Search section |
| epics.md | Missing story | Add Story 8.6 |
| sprint-status.yaml | Status tracking | Add 8-6 entry |

### Technical Impact

- **Code:** ~10 lines in `src/agent/loop.ts`
- **Infrastructure:** None
- **Deployment:** Standard deploy after fix

---

## Section 3: Recommended Approach

### Selected Path: Direct Adjustment

Add a bug fix story (8.6) to Epic 8. No rollback or MVP changes needed.

### Rationale

1. **Simple fix:** Add `tool_search_tool_bm25` to tools array when deferred tools exist
2. **Low risk:** Existing tool execution paths unchanged
3. **Low effort:** ~1-2 hours implementation + testing
4. **No architectural changes:** Just wiring up a missing built-in tool

### Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| Disable Tool Search | Loses token savings benefit (20k+ tokens/request) |
| Revert Story 8.2 | Unnecessary - fix is straightforward |

---

## Section 4: Detailed Change Proposals

### Change 1: src/agent/loop.ts

**Location:** Tool array construction (~line 669)

**Current Code:**
```typescript
const tools = [
  ...registryTools,
  codeExecutionTool as unknown as Anthropic.Tool,
  ...(memoryTool ? [memoryTool as unknown as Anthropic.Tool] : []),
];
```

**Proposed Code:**
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

### Change 2: project-context.md

**Section:** Tool Search → How It Works

**Update:** Clarify that `tool_search_tool_bm25` must be explicitly added (not automatic)

### Change 3: New Story 8.6

**File:** `_bmad-output/implementation-artifacts/stories/story-8-6-tool-search-bugfix.md`

---

## Section 5: Implementation Handoff

### Scope Classification: Minor

Direct implementation by development team.

### Deliverables

1. Code fix in `src/agent/loop.ts`
2. Unit test for tool_search_tool inclusion
3. Updated project-context.md documentation
4. Story file for 8.6

### Success Criteria

1. Claude can discover MCP tools when asked (audience-manager, msci-reports, etc.)
2. All existing tool search tests pass
3. New test verifies tool_search_tool_bm25 is included when deferred tools exist
4. Manual Slack testing confirms MCP tools work

### Handoff Recipients

| Role | Responsibility |
|------|----------------|
| **Developer (Dev Agent)** | Implement fix, write tests |
| **Scrum Master** | Update sprint-status.yaml |

---

## Approval

- [ ] User approval obtained
- [ ] Handoff responsibilities confirmed

---

## Appendix: SDK Evidence

From `node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`:

```typescript
export interface BetaToolSearchToolBm2520251119 {
    name: 'tool_search_tool_bm25';
    type: 'tool_search_tool_bm25_20251119' | 'tool_search_tool_bm25';
    // ...
}
```

The SDK defines this as a distinct tool type that must be added to the tools array, not automatically injected by the API.
