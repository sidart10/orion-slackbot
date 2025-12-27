# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/3-1-generic-mcp-client.md`  
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`  
**Date:** `2025-12-23T02:50:17Z`

## Summary

- Overall: **4/9 passed (44%)**
- Critical Issues: **3**

## Section Results

### Critical Disaster Prevention (from checklist “CRITICAL MISTAKES TO PREVENT”)

Pass Rate: 2/8 (25%)

✓ PASS **Vague implementations — avoided (clear tasks + concrete patterns)**  
Evidence: Tasks are explicit and mapped to ACs (e.g., “Task 1… Task 6”) with concrete timeout values and return shapes.  
Evidence:
- `3-1-generic-mcp-client.md:L29-L36` “Task 1… lazy connection… Connection timeout: 5s… Return ToolResult<T>…”

✓ PASS **Not learning from past work — partially mitigated by explicit “project-context.md” rules**  
Evidence: The story cites authoritative patterns (ToolResult, lazy connect, 5s connection timeout).  
Evidence:
- `3-1-generic-mcp-client.md:L72-L82` Requirements table cites `project-context.md` for timeouts, lazy connect, ToolResult pattern.

⚠ PARTIAL **Breaking regressions — some guardrails, but missing repo-specific “do not touch” constraints**  
Evidence: It references project-context rules, but doesn’t explicitly call out the “instrumentation import order”, “ESM .js imports”, or existing placeholders that must remain intact.  
Evidence:
- `project-context.md:L15-L22` Calls out ESM `.js` imports and `index.ts` import order; story doesn’t repeat these as explicit “don’t break” constraints.

✗ FAIL **Wrong file locations — story contradicts current repo structure**  
Evidence: Story instructs creating `src/tools/mcp/*`, but repo already has MCP stubs under `src/agent/tools.ts` and tool execution stubs in `src/agent/orion.ts`.  
Evidence:
- `3-1-generic-mcp-client.md:L29-L33` Instructs creating `src/tools/mcp/client.ts` etc.
- `src/agent/tools.ts:L1-L35` Repo already declares Story 3.1 work in `getToolDefinitions()` (“MCP tools will be added dynamically in Story 3.1.”)

✗ FAIL **Wrong libraries / APIs — story’s example code does not match repo’s Langfuse and ToolResult patterns**  
Evidence: Story uses `langfuse.span(...)` (not present) and an `ErrorCode` union with codes not present in `ToolErrorCode`.  
Evidence:
- `3-1-generic-mcp-client.md:L143-L147` Uses `langfuse.span({ name: ... })` directly.
- `src/observability/tracing.ts:L218-L227` Repo’s intended usage: `createSpan(trace, { name, ... })` → `trace.span(...)`.
- `src/utils/tool-result.ts:L9-L13` Authoritative error codes don’t include `MCP_CONNECTION_FAILED`.

✗ FAIL **Reinventing wheels — story doesn’t direct implementation to extend existing MCP stubs**  
Evidence: Repo explicitly earmarks Story 3.1 work inside `src/agent/tools.ts` and currently stubs tool results in `src/agent/orion.ts`. Story’s task list doesn’t mention replacing these stubs or integrating there.  
Evidence:
- `src/agent/tools.ts:L1-L35` Central MCP stub for Story 3.1.
- `src/agent/orion.ts:L181-L194` Tool execution currently hard-stubs `TOOL_NOT_IMPLEMENTED`.

➖ N/A **Ignoring UX**  
Reason: Story is infrastructure/tooling; no user-facing UX requirements specified.

⚠ PARTIAL **Lying about completion — acceptance criteria are clear, but key “authoritative types” mismatch could enable incorrect “green”**  
Evidence: AC requires returning `{ code: 'MCP_CONNECTION_FAILED' }`, but that code doesn’t exist in current `ToolErrorCode`; implementers could “paper over” by inventing types.  
Evidence:
- `3-1-generic-mcp-client.md:L21-L22` Requires `MCP_CONNECTION_FAILED`, which conflicts with `ToolErrorCode` union.

### MCP Resilience Requirements (project-context)

Pass Rate: 2/3 (67%)

✓ PASS **Lazy connection required and explicitly called out**  
Evidence:  
Evidence:
- `project-context.md:L301-L306` Requires lazy connection.
- `3-1-generic-mcp-client.md:L59-L60` Includes “lazy connection” task explicitly.

✓ PASS **5s connection timeout required and called out**  
Evidence:  
Evidence:
- `project-context.md:L301-L305` Requires 5s connection timeout.
- `3-1-generic-mcp-client.md:L33-L34` Includes “Connection timeout: 5s”.

⚠ PARTIAL **Fallback behavior (“continue without unavailable tools, inform user”) not explicitly included**  
Evidence (missing): project-context requires fallback; story has general error return but no explicit “degrade gracefully” behavior.  
Evidence:
- `project-context.md:L303-L306` Requires fallback; story doesn’t explicitly state behavior beyond returning an error object.

### Type-Level Enforcement & ToolResult Contract

Pass Rate: 0/2 (0%)

✗ FAIL **Error code union mismatch**  
Evidence: story’s `MCP_CONNECTION_FAILED` isn’t in the authoritative `ToolErrorCode`.  
Evidence:
- `src/utils/tool-result.ts:L9-L13` Only: `TOOL_NOT_IMPLEMENTED`, `TOOL_INVALID_INPUT`, `TOOL_UNAVAILABLE`, `TOOL_EXECUTION_FAILED`.

✗ FAIL **Return type name mismatch (“ErrorCode” vs actual “ToolErrorCode”)**  
Evidence: Story imports/mentions `ErrorCode`, while repo exports `ToolErrorCode` via `ToolError`.  
Evidence:
- `3-1-generic-mcp-client.md:L104-L105` Mentions `ErrorCode` import that doesn’t align with current repo types.

## Failed Items

1. Wrong file locations (implementation guidance contradicts repo structure)
2. Wrong libraries / APIs (Langfuse + error codes)
3. Reinventing wheels (doesn’t instruct extending existing MCP stubs)

## Partial Items

1. Regression prevention (missing key repo constraints)
2. “No completion lies” (authoritative types mismatch could lead to false-green)
3. MCP fallback behavior not explicit

## Recommendations

1. Must Fix
   1. Update **File Locations** section to match actual repo placement (extend `src/agent/tools.ts` and add MCP client code under an agreed existing module path, not `src/tools/mcp/*`).
   2. Replace `MCP_CONNECTION_FAILED` with an **existing `ToolErrorCode`** (likely `TOOL_EXECUTION_FAILED`) or explicitly add a new code to `src/utils/tool-result.ts` (but then update project-context/type-level docs accordingly).
   3. Update observability guidance to use existing helpers (`startActiveObservation`/`createSpan`) rather than `langfuse.span(...)`.

2. Should Improve
   1. Add explicit fallback behavior: tool registry continues without a down MCP server, surfaces “tools unavailable” to the model via tool_result.
   2. Add explicit repo constraints to prevent regressions: ESM `.js` imports, `index.ts` import order, no global mutable state.

3. Consider
   1. Replace large in-story code blocks with smaller “canonical patterns + links to existing helpers” to reduce drift and keep Story 3.1 aligned with codebase evolution.


