# ATDD Checklist: 8-2-tool-search-tool

Story: Tool Search Tool Integration
Status: ready-for-dev

---

## AC1: Tool Definition Enhancement

MCP tools from `toolRegistry.getToolsForClaude()` include `defer_loading: true` property. Core tools (memory, code_execution) remain always-loaded. Static tools registered via `registerStaticTool` remain always-loaded.

### Happy Path
- [ ] Test: MCP tools receive defer_loading property
  - Given: Tool registry has registered MCP tools (e.g., `RUBE_SEARCH_TOOLS`, `confluence__search_pages`)
  - When: Calling `toolRegistry.getToolsForClaude()`
  - Then: MCP tools have `defer_loading: true` in their definition

- [ ] Test: Core tools do NOT have defer_loading property
  - Given: Tool registry with core tools (`memory`, `code_execution`, `summarize`)
  - When: Calling `toolRegistry.getToolsForClaude()`
  - Then: Core tools do NOT have `defer_loading` property (or it is explicitly `undefined`/absent)

- [ ] Test: Static tools do NOT have defer_loading property
  - Given: Static tools registered via `registerStaticTool()`
  - When: Calling `toolRegistry.getToolsForClaude()`
  - Then: Static tools do NOT have `defer_loading` property

### Edge Cases
- [ ] Test: Empty MCP tool list
  - Given: No MCP tools connected
  - When: Calling `toolRegistry.getToolsForClaude()`
  - Then: Returns only core tools, no error thrown

- [ ] Test: Tool with same name as core tool
  - Given: MCP provides a tool named `memory` (name collision)
  - When: Processing tools for Claude
  - Then: Core `memory` tool takes precedence (no `defer_loading`), MCP version is excluded or renamed

### Error Handling
- [ ] Test: Malformed tool definition from MCP
  - Given: MCP returns tool with missing required fields
  - When: Processing tools for Claude
  - Then: Tool is skipped with warning log, other tools processed normally

---

## AC2: Tool Search Configuration

New config option `TOOL_SEARCH_ENABLED` (default: `true`) controls feature. When disabled, behavior reverts to all-tools-in-context mode. Config allows specifying which tools are "core" (always loaded).

### Happy Path
- [ ] Test: TOOL_SEARCH_ENABLED defaults to true
  - Given: Environment without `TOOL_SEARCH_ENABLED` set
  - When: Config loads
  - Then: `config.toolSearch.enabled` is `true`

- [ ] Test: TOOL_SEARCH_ENABLED=false disables feature
  - Given: `TOOL_SEARCH_ENABLED=false` in environment
  - When: Config loads
  - Then: `config.toolSearch.enabled` is `false`

- [ ] Test: CORE_TOOLS configures always-loaded tools
  - Given: `CORE_TOOLS=memory,code_execution,summarize,custom_tool`
  - When: Config loads
  - Then: `config.toolSearch.coreTools` contains all four tool names

- [ ] Test: Default CORE_TOOLS value
  - Given: Environment without `CORE_TOOLS` set
  - When: Config loads
  - Then: `config.toolSearch.coreTools` defaults to `['memory', 'code_execution', 'summarize']`

### Edge Cases
- [ ] Test: CORE_TOOLS with extra whitespace
  - Given: `CORE_TOOLS= memory , code_execution , summarize `
  - When: Config loads
  - Then: Tools are trimmed, array contains `['memory', 'code_execution', 'summarize']`

- [ ] Test: CORE_TOOLS empty string
  - Given: `CORE_TOOLS=`
  - When: Config loads
  - Then: Falls back to default core tools, not empty array

- [ ] Test: TOOL_SEARCH_ENABLED with non-boolean value
  - Given: `TOOL_SEARCH_ENABLED=yes` or `TOOL_SEARCH_ENABLED=1`
  - When: Config loads
  - Then: Handles gracefully (treats as truthy or logs warning)

### Error Handling
- [ ] Test: Invalid CORE_TOOLS reference
  - Given: `CORE_TOOLS=memory,nonexistent_tool`
  - When: Getting tools for Claude
  - Then: Valid tools processed, nonexistent tool ignored with warning

---

## AC3: Tool Registry Enhancement

`ToolRegistry.getToolsForClaude()` returns two categories. New method `getCoreTool(name)` for quick lookup of always-loaded tools.

### Happy Path
- [ ] Test: getToolsForClaude returns core tools without defer_loading
  - Given: Registry with memory, code_execution, summarize, and MCP tools
  - When: Calling `getToolsForClaude()`
  - Then: Core tools in result have NO `defer_loading` property

- [ ] Test: getToolsForClaude returns MCP tools with defer_loading
  - Given: Registry with MCP tools
  - When: Calling `getToolsForClaude()`
  - Then: MCP tools have `defer_loading: true`

- [ ] Test: getCoreTool returns correct tool by name
  - Given: Core tool `memory` registered
  - When: Calling `getCoreTool('memory')`
  - Then: Returns the memory tool definition

- [ ] Test: getCoreTool returns undefined for non-core tool
  - Given: MCP tool `RUBE_SEARCH_TOOLS` registered (not core)
  - When: Calling `getCoreTool('RUBE_SEARCH_TOOLS')`
  - Then: Returns `undefined`

### Edge Cases
- [ ] Test: getCoreTool with case sensitivity
  - Given: Core tool `memory` registered
  - When: Calling `getCoreTool('MEMORY')` (uppercase)
  - Then: Returns `undefined` (case-sensitive matching)

- [ ] Test: Skills tools classification
  - Given: Skill tools registered in registry
  - When: Calling `getToolsForClaude()`
  - Then: Skill tools have `defer_loading: true` (not core)

### Error Handling
- [ ] Test: getCoreTool with null/undefined name
  - Given: Registry with core tools
  - When: Calling `getCoreTool(undefined)` or `getCoreTool(null)`
  - Then: Returns `undefined`, no exception thrown

---

## AC4: Agent Loop Integration

When `TOOL_SEARCH_ENABLED=true`, pass only core tools + deferred tool definitions. Claude's `tool_search` tool is automatically available. Tool execution continues to work for discovered tools.

### Happy Path
- [ ] Test: Agent loop includes deferred tools when enabled
  - Given: `TOOL_SEARCH_ENABLED=true` and 50 MCP tools
  - When: Agent loop calls `messages.create()`
  - Then: All 50 MCP tools have `defer_loading: true` in tools array

- [ ] Test: Tool execution works for discovered tools
  - Given: Claude discovers `RUBE_SEARCH_TOOLS` via tool_search
  - When: Claude returns `tool_use` block for `RUBE_SEARCH_TOOLS`
  - Then: `executeTool` handler processes it normally, returns tool result

- [ ] Test: Agent loop respects disabled tool search
  - Given: `TOOL_SEARCH_ENABLED=false`
  - When: Agent loop calls `messages.create()`
  - Then: No tools have `defer_loading` property (all in context)

- [ ] Test: Core tools always in context regardless of config
  - Given: `TOOL_SEARCH_ENABLED=true`
  - When: Agent loop calls `messages.create()`
  - Then: `memory`, `code_execution`, `summarize` have NO `defer_loading`

### Edge Cases
- [ ] Test: Empty deferred tools list
  - Given: Only core tools registered, no MCP tools
  - When: Agent loop calls `messages.create()`
  - Then: Only core tools passed, no errors

- [ ] Test: Large number of deferred tools
  - Given: 500+ MCP tools from Rube
  - When: Agent loop calls `messages.create()`
  - Then: All tools annotated with `defer_loading: true`, request succeeds

### Error Handling
- [ ] Test: Tool execution for unknown discovered tool
  - Given: Claude calls a tool that was discovered but not in registry
  - When: `executeTool` handler processes it
  - Then: Returns error result, does not throw exception

---

## AC5: Observability & Token Tracking

Langfuse event `tool_search.discovery` logged when Claude uses tool search. Langfuse metric `tool_search.tokens_saved` estimates token savings. Log which tools were discovered vs. always loaded per request.

### Happy Path
- [ ] Test: Langfuse event logged on tool search discovery
  - Given: Claude uses tool_search to discover tools
  - When: Agent loop processes the tool_search result
  - Then: Langfuse event `tool_search.discovery` is logged with discovered tool names

- [ ] Test: Token savings metric calculated correctly
  - Given: 100 MCP tools with `defer_loading: true`
  - When: Request completes
  - Then: `tool_search.tokens_saved` metric logged with value ~20000 (100 * 200)

- [ ] Test: Discovered vs always-loaded tools logged
  - Given: Request with 3 core tools and 50 deferred tools
  - When: Request completes
  - Then: Log entry shows `coreToolCount: 3`, `deferredToolCount: 50`, and any discovered tools

### Edge Cases
- [ ] Test: No tools discovered in request
  - Given: Claude answers without using tool_search
  - When: Request completes
  - Then: No `tool_search.discovery` event, but token savings still logged

- [ ] Test: Multiple tool_search calls in one request
  - Given: Claude calls tool_search multiple times
  - When: Agent loop processes each
  - Then: Each discovery logged separately, deduped in final summary

### Error Handling
- [ ] Test: Langfuse unavailable during logging
  - Given: Langfuse client fails to flush
  - When: Attempting to log tool_search event
  - Then: Error is logged, request continues without blocking

---

## AC6: Graceful Degradation

If model doesn't support tool search, fall back to all-tools-in-context. Log warning when fallback occurs. No user-facing errors from tool search configuration.

### Happy Path
- [ ] Test: Supported model uses tool search
  - Given: Model `claude-sonnet-4-20250514`
  - When: Checking `supportsToolSearch(model)`
  - Then: Returns `true`

- [ ] Test: Unsupported model falls back
  - Given: Model `claude-3-5-sonnet-20241022`
  - When: Getting tools for Claude
  - Then: No `defer_loading` on any tools (all in context)

- [ ] Test: Warning logged on fallback
  - Given: Model `claude-3-opus-20240229`
  - When: Agent loop starts
  - Then: Warning logged: "Tool search not supported by model, using all-tools-in-context"

### Edge Cases
- [ ] Test: Future Sonnet 4 model variants
  - Given: Model `claude-sonnet-4-20250801` (future version)
  - When: Checking `supportsToolSearch(model)`
  - Then: Returns `true` (matches pattern `/^claude-sonnet-4-/`)

- [ ] Test: Future Opus 4 model variants
  - Given: Model `claude-opus-4-20251201`
  - When: Checking `supportsToolSearch(model)`
  - Then: Returns `true` (matches pattern `/^claude-opus-4-/`)

- [ ] Test: Unknown model format
  - Given: Model `some-custom-model`
  - When: Checking `supportsToolSearch(model)`
  - Then: Returns `false`, falls back safely

### Error Handling
- [ ] Test: Null or undefined model
  - Given: Model is `undefined`
  - When: Checking `supportsToolSearch(model)`
  - Then: Returns `false`, no exception thrown

- [ ] Test: API error during tool search
  - Given: Anthropic API returns error during tool_search
  - When: Agent loop processes response
  - Then: Error handled gracefully, user informed, no crash

---

## AC7: Documentation & Testing

Unit tests for tool registry changes. Integration test verifying tool search discovery flow. Update `project-context.md` with tool search configuration.

### Happy Path
- [ ] Test: Unit tests exist for getToolsForClaude with defer_loading
  - Given: Test file `src/tools/registry.test.ts`
  - When: Running tests
  - Then: Tests verify core vs deferred tool categorization

- [ ] Test: Unit tests exist for config parsing
  - Given: Test file `src/config/environment.test.ts`
  - When: Running tests
  - Then: Tests verify TOOL_SEARCH_ENABLED and CORE_TOOLS parsing

- [ ] Test: Integration test for tool search flow
  - Given: Integration test with mocked Anthropic API
  - When: Running integration tests
  - Then: Test verifies full discovery flow: request with deferred tools -> Claude uses tool_search -> tool executed

- [ ] Test: project-context.md updated
  - Given: Documentation update task
  - When: Story complete
  - Then: project-context.md contains Tool Search section with config options

### Edge Cases
- [ ] Test: Test isolation with different configs
  - Given: Multiple tests with different TOOL_SEARCH_ENABLED values
  - When: Running tests in parallel
  - Then: Tests do not interfere with each other (proper mocking/reset)

---

## Integration Test Scenarios

### E2E: Full Tool Search Discovery Flow
- [ ] Test: User asks question requiring MCP tool
  - Given: User sends Slack message "Search GitHub for recent issues"
  - And: TOOL_SEARCH_ENABLED=true
  - And: GitHub MCP tool available as deferred
  - When: Agent processes message
  - Then:
    1. Request includes GitHub tool with `defer_loading: true`
    2. Claude uses built-in tool_search to discover GitHub tool
    3. Claude calls discovered GitHub tool
    4. Tool executes successfully
    5. Response returned to user
    6. Langfuse events logged for discovery and token savings

### E2E: Fallback for Unsupported Model
- [ ] Test: Request with claude-3 model
  - Given: Model set to `claude-3-5-sonnet-20241022`
  - And: TOOL_SEARCH_ENABLED=true
  - When: Agent processes request
  - Then:
    1. Warning logged about unsupported model
    2. All tools passed without `defer_loading`
    3. Request processes successfully
    4. User receives response (no errors)

### E2E: Config Toggle
- [ ] Test: Disable then enable tool search
  - Given: Initially TOOL_SEARCH_ENABLED=false
  - When: Request made, then config changed to true, then another request
  - Then:
    1. First request: no defer_loading on tools
    2. Second request: defer_loading on MCP tools
    3. Both requests succeed

---

## Coverage Summary

| AC | Happy Path | Edge Cases | Error Handling | Total |
|----|------------|------------|----------------|-------|
| AC1 | 3 | 2 | 1 | 6 |
| AC2 | 4 | 3 | 1 | 8 |
| AC3 | 4 | 2 | 1 | 7 |
| AC4 | 4 | 2 | 1 | 7 |
| AC5 | 3 | 2 | 1 | 6 |
| AC6 | 3 | 3 | 2 | 8 |
| AC7 | 4 | 1 | 0 | 5 |
| E2E | 3 | 0 | 0 | 3 |
| **Total** | **28** | **15** | **7** | **50** |

---

## Test File Locations (Recommended)

| Component | Test File |
|-----------|-----------|
| Tool Registry | `src/tools/registry.test.ts` |
| Schema Converter | `src/tools/mcp/schema-converter.test.ts` |
| Config | `src/config/environment.test.ts` |
| Agent Loop | `src/agent/loop.test.ts` |
| Model Detection | `src/agent/model-capabilities.test.ts` |
| Integration | `tests/integration/tool-search.test.ts` |

---

## Notes

- All tests should follow project patterns from `project-context.md`
- Use Vitest as test framework
- Mock Anthropic API responses for unit tests
- Integration tests should use test fixtures for consistent behavior
- Token savings calculation: `deferredToolCount * 200` (estimated average)
