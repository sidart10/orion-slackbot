# ATDD Checklist: 8-2-tool-search-tool

**Story:** Tool Search Tool Integration
**Epic:** 8 - Platform Hardening
**Status:** Test Design Complete

---

## AC1: MCP Tools Annotated with defer_loading When Enabled

> **Given** `TOOL_SEARCH_ENABLED=true` (default), **When** MCP tools are registered, **Then** non-core tools are annotated with `defer_loading: true`

### Happy Path
- [x] Test: MCP tools receive defer_loading: true when tool search enabled
  - Given: Tool search enabled in config (`TOOL_SEARCH_ENABLED=true`)
  - When: MCP tools are registered via `registerMcpTools()`
  - Then: Tools returned by `getToolsForClaude()` have `defer_loading: true`
  - File: `src/tools/registry.test.ts` - "MCP tools receive defer_loading: true when tool search enabled"

- [x] Test: Skill tools receive defer_loading: true
  - Given: Tool search enabled
  - When: Skill tools registered via `registerDynamicTool()`
  - Then: Skill tools have `defer_loading: true` in output
  - File: `src/tools/registry.test.ts` - "skill tools receive defer_loading: true"

### Edge Cases
- [x] Test: Empty MCP tool list returns only core tools without error
  - Given: No MCP tools registered, only static core tools
  - When: `getToolsForClaude()` called
  - Then: Returns core tools without defer_loading, no errors
  - File: `src/tools/registry.test.ts` - "empty MCP tool list returns only core tools without error"

- [x] Test: Large number of MCP tools (100+) all get defer_loading
  - Given: 150 MCP tools registered
  - When: `getToolsForClaude()` called
  - Then: All 150 have `defer_loading: true`
  - File: `src/tools/registry.test.ts` - "handles large number of MCP tools"

### Error Handling
- [ ] Test: Invalid MCP tool registration does not break defer_loading
  - Given: Some MCP tools fail registration (name conflicts)
  - When: `getToolsForClaude()` called
  - Then: Valid tools still have defer_loading applied correctly

---

## AC2: defer_loading Applied for Supported Models

> **Given** a model that supports tool search (Sonnet 4.5+, Opus 4.5+), **When** tools are passed to Claude, **Then** defer_loading is applied to non-core tools

### Happy Path
- [x] Test: Sonnet 4 models enable defer_loading
  - Given: Model is `claude-sonnet-4-20250514`
  - When: `supportsToolSearch()` called
  - Then: Returns true
  - File: `src/agent/model-capabilities.test.ts` - "returns true for claude-sonnet-4-20250514"

- [x] Test: Opus 4 models enable defer_loading
  - Given: Model is `claude-opus-4-20250801`
  - When: `supportsToolSearch()` called
  - Then: Returns true
  - File: `src/agent/model-capabilities.test.ts` - "returns true for claude-opus-4-20250801"

- [x] Test: Future Sonnet 4.5 variants supported
  - Given: Model is `claude-sonnet-4.5-20251201`
  - When: `supportsToolSearch()` called
  - Then: Returns true
  - File: `src/agent/model-capabilities.test.ts` - "returns true for claude-sonnet-4.5-* variants"

- [x] Test: Future Opus 4.5 variants supported
  - Given: Model is `claude-opus-4.5-20260101`
  - When: `supportsToolSearch()` called
  - Then: Returns true
  - File: `src/agent/model-capabilities.test.ts` - "returns true for claude-opus-4.5-* variants"

### Edge Cases
- [x] Test: Model name with extra characters does not match
  - Given: Model is `my-claude-sonnet-4-custom` (prefixed)
  - When: `supportsToolSearch()` called
  - Then: Returns false (pattern requires start of string)
  - File: `src/agent/model-capabilities.test.ts` - "handles model name with extra characters safely"

---

## AC3: defer_loading NOT Applied for Unsupported Models

> **Given** a model that does NOT support tool search (Claude 3.x), **When** tools are passed to Claude, **Then** defer_loading is NOT applied and all tools are in context

### Happy Path
- [x] Test: Claude 3.5 Sonnet returns false
  - Given: Model is `claude-3-5-sonnet-20241022`
  - When: `supportsToolSearch()` called
  - Then: Returns false
  - File: `src/agent/model-capabilities.test.ts` - "returns false for claude-3-5-sonnet-20241022"

- [x] Test: Claude 3 Opus returns false
  - Given: Model is `claude-3-opus-20240229`
  - When: `supportsToolSearch()` called
  - Then: Returns false
  - File: `src/agent/model-capabilities.test.ts` - "returns false for claude-3-opus-20240229"

- [x] Test: Claude 3.5 Haiku returns false
  - Given: Model is `claude-3-5-haiku-20241022`
  - When: `supportsToolSearch()` called
  - Then: Returns false
  - File: `src/agent/model-capabilities.test.ts` - "returns false for claude-3-5-haiku-20241022"

- [x] Test: defer_loading disabled when override is false
  - Given: `enableDeferLoading: false` passed to registry
  - When: `getToolsForClaude({ enableDeferLoading: false })` called
  - Then: No tools have `defer_loading` property
  - File: `src/tools/registry.test.ts` - "disables defer_loading when override is false"

### Edge Cases
- [x] Test: Unknown model format returns false
  - Given: Model is `gpt-4` or `some-custom-model`
  - When: `supportsToolSearch()` called
  - Then: Returns false (safe default)
  - File: `src/agent/model-capabilities.test.ts` - "returns false for unknown model format"

---

## AC4: Core Tools Never Deferred

> **Given** tools configured in `CORE_TOOLS` env var, **Then** those tools are never deferred (always in context)

### Happy Path
- [x] Test: Static tools do NOT have defer_loading property
  - Given: Static tool registered (e.g., `memory`)
  - When: `getToolsForClaude()` called
  - Then: Static tool has `defer_loading: undefined`
  - File: `src/tools/registry.test.ts` - "static tools do NOT have defer_loading property"

- [x] Test: Core tools never get defer_loading even when enabled
  - Given: `memory` and `code_execution` registered as static tools
  - When: `getToolsForClaude({ enableDeferLoading: true })` called
  - Then: Core tools have `defer_loading: undefined`
  - File: `src/tools/registry.test.ts` - "core tools never get defer_loading even when enabled"

- [x] Test: getCoreTool returns core tool by name
  - Given: `memory` tool registered as static
  - When: `getCoreTool('memory')` called
  - Then: Returns the memory tool definition
  - File: `src/tools/registry.test.ts` - "returns core tool by name"

### Edge Cases
- [x] Test: getCoreTool returns undefined for non-core tool
  - Given: MCP tool `rube__RUBE_SEARCH_TOOLS` registered
  - When: `getCoreTool('rube__RUBE_SEARCH_TOOLS')` called
  - Then: Returns undefined
  - File: `src/tools/registry.test.ts` - "returns undefined for non-core tool"

- [x] Test: getCoreTool is case-sensitive
  - Given: `memory` tool registered (lowercase)
  - When: `getCoreTool('MEMORY')` or `getCoreTool('Memory')` called
  - Then: Returns undefined (exact match required)
  - File: `src/tools/registry.test.ts` - "is case-sensitive for tool name matching"

- [x] Test: getCoreTool handles null/undefined gracefully
  - Given: No tool name provided
  - When: `getCoreTool(null)` or `getCoreTool(undefined)` called
  - Then: Returns undefined, no error
  - File: `src/tools/registry.test.ts` - "returns undefined for null/undefined name"

### Error Handling
- [x] Test: Mixed core and non-core tools categorized correctly
  - Given: Core tool `memory`, non-core static `custom_static`, MCP tool `rube__search`
  - When: `getToolsForClaude()` called
  - Then: Static tools have no defer_loading, MCP tool has `defer_loading: true`
  - File: `src/tools/registry.test.ts` - "mixed core and non-core tools are categorized correctly"

---

## AC5: tool_search_tool_bm25 Added When Deferred Tools Exist

> **Given** tool search is enabled, **When** deferred tools exist, **Then** `tool_search_tool_bm25` is added to the tools array

### Happy Path
- [x] Test: tool_search_tool_bm25 included when deferred tools exist
  - Given: Tool search enabled, model supports it, MCP tools with defer_loading exist
  - When: Agent loop executes and calls Claude API
  - Then: Tools array includes `{ type: 'tool_search_tool_bm25_20251119', name: 'tool_search_tool_bm25' }`
  - File: `src/agent/loop.test.ts` - "includes tool_search_tool_bm25 when deferred tools exist and tool search enabled (AC#1)"

### Edge Cases
- [x] Test: tool_search_tool_bm25 excluded when tool search disabled
  - Given: `TOOL_SEARCH_ENABLED=false` in config
  - When: Agent loop executes
  - Then: Tools array does NOT include tool_search_tool_bm25
  - File: `src/agent/loop.test.ts` - "excludes tool_search_tool_bm25 when tool search disabled (AC#2)"

- [x] Test: tool_search_tool_bm25 excluded when no deferred tools
  - Given: Tool search enabled but only core tools (no defer_loading)
  - When: Agent loop executes
  - Then: Tools array does NOT include tool_search_tool_bm25
  - File: `src/agent/loop.test.ts` - "excludes tool_search_tool_bm25 when no deferred tools exist (AC#2)"

### Error Handling
- [ ] Test: Graceful handling if tool_search_tool_bm25 initialization fails
  - Given: Tool search should be included but API rejects the format
  - When: Claude API returns error about tool_search
  - Then: System logs warning and retries without tool search

---

## AC6: Graceful Fallback for Unsupported Models

> **Given** model doesn't support tool search, **Then** graceful fallback to all-tools-in-context with warning logged

### Happy Path
- [x] Test: tool_search_tool_bm25 excluded when model unsupported
  - Given: Tool search enabled but model is Claude 3.x
  - When: Agent loop executes with unsupported model
  - Then: Tools array does NOT include tool_search_tool_bm25, all tools in context
  - File: `src/agent/loop.test.ts` - "excludes tool_search_tool_bm25 when model does not support tool search (AC#2)"

- [x] Test: getModelCapabilities returns toolSearch: false for 3.x
  - Given: Model is `claude-3-5-sonnet-20241022`
  - When: `getModelCapabilities()` called
  - Then: Returns `{ toolSearch: false, ptc: false }`
  - File: `src/agent/model-capabilities.test.ts` - "returns toolSearch: false for Claude 3.x models"

### Edge Cases
- [x] Test: Null/undefined model handled gracefully
  - Given: Model is null or undefined
  - When: `supportsToolSearch(null)` or `getModelCapabilities(null)` called
  - Then: Returns false / `{ toolSearch: false }` without error
  - File: `src/agent/model-capabilities.test.ts` - "returns false for null model", "handles null/undefined model gracefully"

- [x] Test: Empty string model handled gracefully
  - Given: Model is empty string `""`
  - When: `supportsToolSearch('')` called
  - Then: Returns false without error
  - File: `src/agent/model-capabilities.test.ts` - "returns false for empty string"

### Error Handling
- [ ] Test: Warning logged when fallback occurs
  - Given: Tool search enabled but model doesn't support it
  - When: Agent loop prepares tools
  - Then: Logger emits warning with event `tool_search.fallback`

---

## AC7: Token Savings Tracked in Langfuse

> **Given** tool search triggers discovery, **Then** token savings are tracked in Langfuse

### Happy Path
- [ ] Test: Langfuse event emitted for token savings
  - Given: Tool search enabled, deferred tools exist
  - When: Tools prepared for Claude API call
  - Then: Langfuse event `tool_search.tokens_saved` emitted with metadata

### Edge Cases
- [ ] Test: Token savings calculated correctly
  - Given: 100 MCP tools at ~200 tokens each
  - When: Token savings event emitted
  - Then: `estimatedTokenSavings` approximately 20,000 tokens

- [ ] Test: No event emitted when tool search disabled
  - Given: Tool search disabled
  - When: Agent loop executes
  - Then: No `tool_search.tokens_saved` event

### Error Handling
- [ ] Test: Langfuse failure does not break agent loop
  - Given: Langfuse client throws error
  - When: Token savings event attempted
  - Then: Error logged but agent loop continues

---

## Integration Tests

### Configuration Integration
- [ ] Test: TOOL_SEARCH_ENABLED env var parsed correctly
  - Given: `TOOL_SEARCH_ENABLED=false` in environment
  - When: Config loaded
  - Then: `config.toolSearch.enabled` is false

- [ ] Test: CORE_TOOLS env var parsed as array
  - Given: `CORE_TOOLS=memory,summarize,custom_tool` in environment
  - When: Config loaded
  - Then: `config.toolSearch.coreTools` is `['memory', 'summarize', 'custom_tool']`

### End-to-End Flow
- [ ] Test: Full tool search flow with mock Claude API
  - Given: Tool search enabled, supported model, MCP tools registered
  - When: User sends message triggering tool use
  - Then: Claude discovers deferred tool via tool_search_tool_bm25 and executes it

---

## Coverage Summary

| AC | Happy Path | Edge Cases | Error Handling | Status |
|----|------------|------------|----------------|--------|
| AC1 | 2/2 | 2/2 | 0/1 | Mostly Complete |
| AC2 | 4/4 | 1/1 | - | Complete |
| AC3 | 4/4 | 1/1 | - | Complete |
| AC4 | 3/3 | 3/3 | 1/1 | Complete |
| AC5 | 1/1 | 2/2 | 0/1 | Mostly Complete |
| AC6 | 2/2 | 2/2 | 0/1 | Mostly Complete |
| AC7 | 0/1 | 0/2 | 0/1 | Not Implemented |

**Overall:** 22/24 unit tests implemented, 0/2 integration tests implemented

---

## Test Files

| File | Purpose |
|------|---------|
| `src/agent/model-capabilities.test.ts` | Model capability detection (AC2, AC3, AC6) |
| `src/tools/registry.test.ts` | defer_loading and core tool logic (AC1, AC4) |
| `src/agent/loop.test.ts` | tool_search_tool_bm25 inclusion (AC5, AC6) |
| `src/config/environment.test.ts` | Configuration parsing (integration) |

---

## References

- Story: `_bmad-output/implementation-artifacts/stories/story-8-2-tool-search-tool.md`
- Architecture: `_bmad-output/architecture.md#8.2 Tool Search Tool`
- Anthropic Docs: https://docs.anthropic.com/en/docs/build-with-claude/tool-use/tool-search
- Bug Fix: Story 8.6 addresses tool_search_tool_bm25 explicit addition requirement
