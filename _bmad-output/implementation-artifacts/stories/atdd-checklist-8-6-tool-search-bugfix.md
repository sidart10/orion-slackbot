# ATDD Checklist: Story 8.6 - Tool Search Bug Fix

## Story Reference

**Story:** 8.6 - Tool Search Bug Fix - Add tool_search_tool_bm25
**Status:** ready-for-dev (fix implemented, documenting tests)
**Priority:** P0 - Critical Bug Fix

## Acceptance Criteria Summary

| AC# | Description |
|-----|-------------|
| AC1 | `tool_search_tool_bm25` included when tool search enabled AND deferred tools exist |
| AC2 | `tool_search_tool_bm25` excluded when tool search disabled OR no deferred tools |
| AC3 | `tool_search_tool_bm25` excluded when model does not support tool search |
| AC4 | Agent loop handles `tool_search_tool_result` blocks correctly |

---

## Test Scenarios

### AC#1: tool_search_tool_bm25 Inclusion (Happy Path)

#### Test 1.1: Includes tool_search_tool_bm25 when all conditions met
```
GIVEN:
  - Tool search is enabled (config.toolSearch.enabled = true)
  - Model supports tool search (supportsToolSearch(model) = true)
  - At least one tool has defer_loading: true
WHEN:
  - Agent loop builds the tools array
THEN:
  - tools array contains object with:
    - type: 'tool_search_tool_bm25_20251119'
    - name: 'tool_search_tool_bm25'
```
- [x] Unit test exists: `loop.test.ts` line 2750-2775

#### Test 1.2: Tool_search_tool_bm25 has correct SDK type definition
```
GIVEN:
  - Tool search conditions are met
WHEN:
  - Agent loop includes tool_search_tool_bm25
THEN:
  - Type matches SDK interface BetaToolSearchToolBm2520251119:
    - type: 'tool_search_tool_bm25_20251119' | 'tool_search_tool_bm25'
    - name: 'tool_search_tool_bm25' (literal)
```
- [x] Implementation verified: `loop.ts` lines 709-731

#### Test 1.3: tool_search_tool_bm25 position in tools array
```
GIVEN:
  - Tool search conditions are met
WHEN:
  - tools array is assembled
THEN:
  - tool_search_tool_bm25 is present (position not critical)
  - Other tools (registry, code_execution, memory) also present
```
- [x] Verified in implementation review

---

### AC#2: tool_search_tool_bm25 Exclusion Scenarios

#### Test 2.1: Excludes when tool search disabled in config
```
GIVEN:
  - config.toolSearch.enabled = false
  - Deferred tools exist
  - Model supports tool search
WHEN:
  - Agent loop builds tools array
THEN:
  - tools array does NOT contain tool_search_tool_bm25
  - No error thrown
```
- [x] Unit test exists: `loop.test.ts` line 2777-2804

#### Test 2.2: Excludes when no deferred tools exist
```
GIVEN:
  - config.toolSearch.enabled = true
  - Model supports tool search
  - No tools have defer_loading: true
WHEN:
  - Agent loop builds tools array
THEN:
  - tools array does NOT contain tool_search_tool_bm25
```
- [x] Unit test exists: `loop.test.ts` line 2806-2830

#### Test 2.3: Excludes with empty tools array
```
GIVEN:
  - config.toolSearch.enabled = true
  - Model supports tool search
  - getToolDefinitions() returns empty array
WHEN:
  - Agent loop builds tools array
THEN:
  - tools array does NOT contain tool_search_tool_bm25
  - deferredToolCount = 0
```
- [ ] **NEW TEST NEEDED**: Edge case for empty tool registry

---

### AC#3: Model Capability Fallback

#### Test 3.1: Excludes when model does not support tool search
```
GIVEN:
  - config.toolSearch.enabled = true
  - Deferred tools exist
  - Model is claude-3-5-sonnet-20241022 (no tool search support)
WHEN:
  - Agent loop builds tools array
THEN:
  - tools array does NOT contain tool_search_tool_bm25
  - supportsToolSearch(model) returns false
```
- [x] Unit test exists: `loop.test.ts` line 2832-2858

#### Test 3.2: Model capability detection - supported models
```
GIVEN:
  - Model is one of: claude-sonnet-4-*, claude-opus-4-*, claude-sonnet-4.5-*, claude-opus-4.5-*
WHEN:
  - supportsToolSearch(model) is called
THEN:
  - Returns true
```
- [x] Unit tests exist: `model-capabilities.test.ts` lines 15-45

#### Test 3.3: Model capability detection - unsupported models
```
GIVEN:
  - Model is one of: claude-3-*, claude-3-5-*, null, undefined, empty string
WHEN:
  - supportsToolSearch(model) is called
THEN:
  - Returns false
```
- [x] Unit tests exist: `model-capabilities.test.ts` lines 47-101

#### Test 3.4: Fallback logs warning when model unsupported
```
GIVEN:
  - config.toolSearch.enabled = true
  - Deferred tools exist
  - Model does not support tool search
WHEN:
  - Agent loop processes configuration
THEN:
  - logger.warn called with event: 'tool_search.fallback'
  - Reason includes model name
```
- [ ] **NEW TEST NEEDED**: Verify warning logged on fallback

---

### AC#4: tool_search_tool_result Block Handling

#### Test 4.1: Skips execution for tool_search_tool_bm25 results
```
GIVEN:
  - API returns server block with name: 'tool_search_tool_bm25'
  - Block type is tool_search_tool_result
WHEN:
  - Agent loop processes server blocks
THEN:
  - Does NOT attempt tool execution
  - Continues to next block
  - No error thrown
```
- [ ] **NEW TEST NEEDED**: Verify skip behavior for tool_search results

#### Test 4.2: Skips execution for tool_search_tool_regex results
```
GIVEN:
  - API returns server block with name: 'tool_search_tool_regex'
WHEN:
  - Agent loop processes server blocks
THEN:
  - Does NOT attempt tool execution
  - Continues processing
```
- [ ] **NEW TEST NEEDED**: Verify skip behavior for regex variant

#### Test 4.3: Logs tool search discovery events
```
GIVEN:
  - API returns tool_search_tool_result block
WHEN:
  - Agent loop encounters the block
THEN:
  - logger.debug called with:
    - event: 'agent.loop.tool_search_result'
    - traceId present
    - toolName: 'tool_search_tool_bm25' or 'tool_search_tool_regex'
```
- [ ] **NEW TEST NEEDED**: Verify observability logging

---

### Observability Tests

#### Test OBS.1: tool_search.config event includes toolSearchToolIncluded
```
GIVEN:
  - Tool search enabled with deferred tools
WHEN:
  - Agent loop starts
THEN:
  - logger.info called with:
    - event: 'tool_search.config'
    - toolSearchToolIncluded: true
```
- [x] Unit test exists: `loop.test.ts` line 2861-2884

#### Test OBS.2: tool_search.config logs toolSearchToolIncluded: false
```
GIVEN:
  - Tool search disabled
WHEN:
  - Agent loop starts
THEN:
  - logger.info called with:
    - event: 'tool_search.config'
    - toolSearchToolIncluded: false
```
- [x] Unit test exists: `loop.test.ts` line 2886-2899+

---

### Edge Cases

#### Test EDGE.1: Multiple deferred tools
```
GIVEN:
  - 10 MCP tools with defer_loading: true
  - 3 core tools without defer_loading
WHEN:
  - Agent loop builds tools array
THEN:
  - deferredToolCount = 10
  - tool_search_tool_bm25 included once (not per deferred tool)
```
- [ ] **NEW TEST NEEDED**: Verify single inclusion with multiple deferred tools

#### Test EDGE.2: Mixed defer_loading values
```
GIVEN:
  - Some tools have defer_loading: true
  - Some tools have defer_loading: false
  - Some tools have defer_loading: undefined
WHEN:
  - deferredToolCount is calculated
THEN:
  - Only counts tools with defer_loading: true
```
- [ ] **NEW TEST NEEDED**: Verify counting logic

#### Test EDGE.3: Boolean string coercion (safety check)
```
GIVEN:
  - Tool has defer_loading: 'true' (string instead of boolean)
WHEN:
  - deferredToolCount is calculated
THEN:
  - Does NOT count as deferred (strict boolean check)
```
- [ ] **NEW TEST NEEDED**: Type safety validation

#### Test EDGE.4: Null/undefined tool definitions
```
GIVEN:
  - getToolDefinitions returns array with null/undefined entries
WHEN:
  - Agent loop processes tools
THEN:
  - Gracefully handles nullish values
  - No crash
```
- [ ] **NEW TEST NEEDED**: Defensive coding validation

---

### Integration Tests

#### Test INT.1: End-to-end MCP tool discovery
```
GIVEN:
  - Real MCP connection (e.g., audience-manager)
  - Tool search enabled
  - Deferred tools configured
WHEN:
  - User asks to use audience-manager
THEN:
  - Claude uses tool_search_tool_bm25 to discover tools
  - Discovered tools can be called
  - No "tool not available" response
```
- [ ] **MANUAL TEST**: Requires live MCP connection

#### Test INT.2: Diagnostic script verification
```
GIVEN:
  - scripts/diagnose-tool-search.ts exists
WHEN:
  - Run: pnpm exec tsx scripts/diagnose-tool-search.ts
THEN:
  - Output shows:
    - tool_search_tool_bm25 WILL be included (or won't, based on config)
    - Deferred tool count
    - Model capability status
```
- [ ] **MANUAL TEST**: Diagnostic script verification

---

## Test File Locations

| Test Type | File | Line Range |
|-----------|------|------------|
| Unit - tool inclusion | `src/agent/loop.test.ts` | 2734-2899+ |
| Unit - model capabilities | `src/agent/model-capabilities.test.ts` | 1-127 |
| Diagnostic script | `scripts/diagnose-tool-search.ts` | N/A |

---

## Coverage Summary

| Category | Covered | New Needed | Total |
|----------|---------|------------|-------|
| AC#1 Happy Path | 3 | 0 | 3 |
| AC#2 Exclusions | 2 | 1 | 3 |
| AC#3 Model Fallback | 3 | 1 | 4 |
| AC#4 Result Handling | 0 | 3 | 3 |
| Observability | 2 | 0 | 2 |
| Edge Cases | 0 | 4 | 4 |
| Integration | 0 | 2 | 2 |
| **TOTAL** | **10** | **11** | **21** |

---

## Test Execution Commands

```bash
# Run all Story 8.6 unit tests
pnpm test src/agent/loop.test.ts -t "Story 8.6"

# Run model capability tests
pnpm test src/agent/model-capabilities.test.ts

# Run diagnostic script
pnpm exec tsx scripts/diagnose-tool-search.ts

# Run full agent test suite
pnpm test src/agent/
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| New tests fail due to mock setup | Medium | Low | Use existing mock patterns from loop.test.ts |
| Edge case tests reveal hidden bugs | Low | Medium | Fix bugs found during testing |
| Integration tests flaky with real MCP | Medium | Low | Mark as manual/smoke tests |

---

## Definition of Done

- [x] All existing unit tests pass
- [ ] New edge case tests implemented
- [ ] AC#4 result handling tests implemented
- [ ] All tests run in CI pipeline
- [ ] Test coverage > 80% for affected files
- [ ] Diagnostic script validated manually
