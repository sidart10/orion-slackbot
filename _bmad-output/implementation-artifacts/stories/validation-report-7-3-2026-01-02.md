# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/7-3-contextual-tool-feedback.md`
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`
**Date:** 2026-01-02

## Summary

- **Overall: 19/24 items passed (79%)**
- **Critical Issues: 3**
- **Enhancement Opportunities: 3**

---

## Section Results

### Story Structure & Metadata
Pass Rate: 5/5 (100%)

✓ **Story format** — Proper "As a... I want... So that..." format (lines 5-7)
Evidence: `**As a** Slack user interacting with Orion / **I want** to see exactly what tools Orion is using / **So that** I understand what's happening`

✓ **Status field** — Correctly marked `ready-for-dev` (line 13)

✓ **Epic reference** — Epic 7 - Slack Polish (line 14)

✓ **Priority** — P1 (line 15)

✓ **Dependencies** — Lists 3.4 (Channel Tool Feedback) which is marked DONE (line 17)

---

### Acceptance Criteria
Pass Rate: 4/5 (80%)

✓ **AC1: Enhanced Status Messages with Tool Context** — Clear testable criteria (lines 31-34)
Evidence: Specifies `setStatus` callback includes `toolInput`, display format: "Using {ServerName} {ToolType} to {action} '{query}'..."

✓ **AC2: Query Extraction** — Well-defined with fallback (lines 36-39)
Evidence: "Extract query from common fields: `query`, `search_term`, `q`, `text`, `message`" with truncation and fallback

✓ **AC3: Server Name Humanization** — Concrete mapping provided (lines 41-47)
Evidence: Maps `composio → "Composio"`, `rube → "Rube"`, etc.

✓ **AC4: Multi-Tool Parallel Display** — Specific format (lines 49-52)
Evidence: "Using {Tool1} + {Tool2} + {Tool3}..." with example

⚠ **PARTIAL: AC5: Phase-Appropriate Messages** — Phases listed but missing `act` phase message
Evidence: Lines 54-59 list gather/tool/verify/final but `act` phase defaults to "Working on your request..." not explicitly shown
**Impact:** Minor — the default is acceptable, but should be explicit.

---

### Technical Design
Pass Rate: 4/7 (57%)

✓ **Type Expansion (Section 1)** — Shows exact TypeScript interface (lines 65-72)
Evidence: `setStatus?: (params: { phase: ...; toolInput?: Record<string, unknown>; allTools?: ... }) => void`

✓ **Agent Loop Integration (Section 2)** — Shows where to modify (lines 76-88)
Evidence: References `src/agent/loop.ts (around line 448)` with code snippet

✗ **FAIL: Line Number Accuracy** — Line 448 reference is outdated
Evidence: Current `loop.ts` shows setStatus call at line 448, but the context around it differs. Story should reference the pattern, not exact line numbers.
**Impact:** Developer confusion; line numbers shift with edits.
**Recommendation:** Reference by pattern ("in the tool execution block after `toolUsesThisCall` is populated") not line number.

⚠ **PARTIAL: buildLoadingMessages Enhancement (Section 3)** — Proposes new function but doesn't account for existing implementation
Evidence: Lines 93-141 show new implementation, but current `status-messages.ts` (40 lines) has simpler signature: `buildLoadingMessages(params?: { toolName?: string | null }): string[]`
**Impact:** Developer needs to understand this is a REPLACEMENT, not addition.
**Recommendation:** Show before/after or explicitly state "Replace existing function with..."

✗ **FAIL: Missing setStatus Phase Integration** — Technical design shows `phase` parameter in type but doesn't show how to USE phases in buildLoadingMessages
Evidence: AC5 mentions phase-specific messages, but `buildLoadingMessages` in Section 3 (lines 93-117) checks `phase !== 'tool'` — doesn't show integration with existing calling code in handlers.
**Impact:** Developer may not know how to pass phase from handlers.
**Recommendation:** Show handler integration example for phases.

✓ **Tool Name Parsing (Section 4)** — Good pattern with server name mapping (lines 144-187)
Evidence: `parseToolName()` splits on `__`, has `SERVER_NAMES` mapping, `inferActionVerb()` for action verbs.

✗ **FAIL: MCP Tool Name Format Assumption** — Assumes tools are named `serverName__toolName` but current MCP tools use `mcp_` prefix
Evidence: Story line 152-153: `const parts = fullName.split('__');` but current codebase (status-messages.ts line 31): `toolName.startsWith('mcp_')` indicates format is `mcp_servername_toolname` not `serverName__toolName`.
**Impact:** Tool name parsing will fail for all MCP tools.
**Recommendation:** Verify actual MCP tool naming format from existing code. Current format appears to be `mcp_{server}_{action}` (e.g., `mcp_msci-reports_search_reports`).

---

### Existing Code Reuse
Pass Rate: 2/3 (67%)

✓ **References existing file** — Correctly references `src/slack/status-messages.ts`

✗ **FAIL: Doesn't acknowledge current implementation** — Story proposes replacement without showing current state
Evidence: Current `buildLoadingMessages` is 40 lines with different logic (prefix matching for `mcp_` tools). Story proposes 50+ line replacement.
**Impact:** Developer doesn't know what to preserve vs replace.
**Recommendation:** Add "Current Implementation" section showing existing code to be replaced.

✓ **References dependency correctly** — Story 3.4 marked as dependency, and 3.4 is confirmed DONE with code review completed.

---

### Test Cases
Pass Rate: 2/2 (100%)

✓ **Unit tests defined** — 6 unit test cases (lines 199-206)
Evidence: Single tool with query, without query, multiple parallel, unknown server, long query truncation, phase-based

✓ **Integration tests defined** — 2 integration tests (lines 208-211)
Evidence: E2E web search shows query, E2E parallel tools show all

---

### Definition of Done
Pass Rate: 2/2 (100%)

✓ **DoD checklist present** — Lines 213-220 with checkbox items

✓ **Manual verification included** — "Manual verification in Slack shows improved messages"

---

## Failed Items

### 1. ✗ MCP Tool Name Format Assumption (CRITICAL)

**Issue:** Story assumes MCP tools use `serverName__toolName` format with double underscore.

**Actual Format:** Based on Story 3.4 code review notes (line 195): `mcp_msci-reports_search_reports` — format is `mcp_{server}_{action}` with single underscores.

**Impact:** `parseToolName()` splitting on `__` will fail for ALL MCP tools, returning the full name as `serverName`.

**Recommendation:** 
```typescript
// Correct format parsing:
function parseToolName(fullName: string): {...} {
  // Handle mcp_ prefix: mcp_servername_action
  if (fullName.startsWith('mcp_')) {
    const parts = fullName.substring(4).split('_'); // Remove 'mcp_'
    const serverName = parts[0] ?? 'Tool';
    const actionName = parts.slice(1).join('_');
    return {
      serverName: humanizeServerName(serverName),
      humanName: humanizeToolName(actionName),
      actionVerb: inferActionVerb(actionName),
    };
  }
  // ... existing logic for non-MCP tools
}
```

### 2. ✗ Line Number References (MEDIUM)

**Issue:** References `line 448` in loop.ts which shifts with edits.

**Impact:** Developer confusion when lines don't match.

**Recommendation:** Use pattern references: "In the tool execution block, after `toolUsesThisCall` is populated and before `attemptMessages.push()`".

### 3. ✗ Missing Current Implementation Acknowledgment (MEDIUM)

**Issue:** Doesn't show what exists today in `buildLoadingMessages()`.

**Impact:** Developer doesn't know this is a replacement or what logic to preserve.

**Recommendation:** Add section:
```markdown
### Current Implementation (to be replaced)
`src/slack/status-messages.ts` currently has a simpler implementation:
- Only accepts `toolName` parameter
- Uses prefix matching for `mcp_*` tools
- Returns generic messages array

This story REPLACES the existing function with enhanced version supporting:
- `toolInput` for query extraction
- `allTools` for parallel tool display
- `phase` for phase-specific messages
```

---

## Partial Items

### 1. ⚠ Phase Integration Not Shown

**Issue:** AC5 specifies phase messages but technical design doesn't show handler integration.

**Gap:** How do Slack handlers pass `phase` to buildLoadingMessages? Current handlers call `buildLoadingMessages({ toolName })` — need to show how `phase` gets there.

**Recommendation:** Add handler integration example showing how user-message.ts and app-mention.ts pass phase.

### 2. ⚠ buildLoadingMessages Signature Change

**Issue:** Changing function signature from `{ toolName }` to `{ phase, toolName, toolInput, allTools }` may break existing callers.

**Gap:** Story doesn't show how to update existing call sites in `app-mention.ts` (Story 3.4 implementation).

**Recommendation:** List all call sites and show migration:
- `src/slack/handlers/app-mention.ts` — line ~102
- `src/slack/handlers/user-message.ts` — (if applicable)

---

## Recommendations

### Must Fix (Before Development)

1. **Correct MCP tool name parsing logic** — Use actual format `mcp_{server}_{action}` not `server__tool`
2. **Remove line number references** — Use pattern descriptions instead
3. **Add current implementation section** — Show existing code being replaced

### Should Improve

1. **Show handler integration for phases** — How do handlers pass phase to buildLoadingMessages?
2. **List call sites to update** — Identify all places calling buildLoadingMessages
3. **Add migration notes for existing callers** — Story 3.4 implementation needs update

### Consider

1. **Add example output table at start** — The table at the end (lines 224-229) is excellent; consider duplicating earlier for context
2. **Add error handling for query extraction** — What if toolInput is malformed?

---

## LLM Dev Agent Optimization

### Token Efficiency Issues

1. **Verbose code comments** — TypeScript examples have explanatory comments that waste tokens
2. **Redundant examples** — AC examples repeat in technical design sections

### Clarity Issues

1. **MCP format ambiguity** — Critical path depends on correct format understanding
2. **Phase flow unclear** — When does phase='tool' get set vs phase='gather'?

### Recommended Optimizations

1. **Remove inline comments** — TypeScript is self-documenting
2. **Consolidate examples** — One example per concept, not repeated
3. **Add explicit format spec** — "MCP tools are named: `mcp_{server}_{action}` (e.g., `mcp_rube_RUBE_SEARCH_TOOLS`)"

---

## Verdict

**STORY REQUIRES REVISION** before development.

**Critical Fix Required:** MCP tool name format parsing is fundamentally incorrect and will break all tool feedback display.

**Estimated Revision Effort:** ~30 minutes to:
1. Fix `parseToolName()` logic for actual MCP format
2. Remove line number references
3. Add current implementation acknowledgment
4. Show handler integration for phases

