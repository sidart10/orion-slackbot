# Story 8.2: Tool Search Tool Integration

Status: ready-for-dev

## Story

As a **platform developer**,
I want **Orion to use Anthropic's Tool Search capability for on-demand tool discovery**,
so that **token usage is reduced when 100+ MCP tools are available and Claude discovers the right tools dynamically**.

## Context & Motivation

Currently, Orion passes ALL discovered MCP tools (potentially 100+) to every `messages.create()` call. Each tool definition consumes ~100-500 tokens in the context window. With Rube MCP alone providing 500+ tools, this creates significant token overhead.

Anthropic's **Tool Search** feature (part of `advanced-tool-use-2025-11-20` beta) allows marking tools with `defer_loading: true`. Claude then uses a built-in `tool_search` tool to discover relevant tools on-demand, rather than having all tools in context upfront.

**Key Benefits:**
- Token savings: 100+ tools at ~200 tokens each = 20k+ tokens saved per request
- Latency improvement: Smaller context = faster API calls
- Scalability: Can add unlimited MCP tools without context window pressure

**Prerequisites:**
- Beta header `advanced-tool-use-2025-11-20` is already in `config.anthropic.allBetas` (Story 6.3)
- Model must be Sonnet 4.5+ or Opus 4.5+ (current `claude-sonnet-4-20250514` qualifies)

## Acceptance Criteria

### AC1: Tool Definition Enhancement
- [ ] MCP tools from `toolRegistry.getToolsForClaude()` include `defer_loading: true` property
- [ ] Core tools (memory, code_execution) remain always-loaded (no `defer_loading`)
- [ ] Static tools registered via `registerStaticTool` remain always-loaded

### AC2: Tool Search Configuration
- [ ] New config option `TOOL_SEARCH_ENABLED` (default: `true`) controls feature
- [ ] When disabled, behavior reverts to current all-tools-in-context mode
- [ ] Config allows specifying which tools are "core" (always loaded)

### AC3: Tool Registry Enhancement
- [ ] `ToolRegistry.getToolsForClaude()` returns two categories:
  - Core tools (always in context): memory, code_execution, summarize
  - Deferred tools (discovered on-demand): all MCP and skill tools
- [ ] New method `getCoreTool(name)` for quick lookup of always-loaded tools

### AC4: Agent Loop Integration
- [ ] When `TOOL_SEARCH_ENABLED=true`, pass only core tools + deferred tool definitions
- [ ] Claude's `tool_search` tool is automatically available (Anthropic manages this)
- [ ] Tool execution continues to work for discovered tools via existing `executeTool` handler
- [ ] No code changes needed for tool execution path - Claude discovers, then calls tools normally

### AC5: Observability & Token Tracking
- [ ] Langfuse event `tool_search.discovery` logged when Claude uses tool search (per project naming: `{component}.{operation}`)
- [ ] Langfuse metric `tool_search.tokens_saved` estimates token savings
- [ ] Log which tools were discovered vs. always loaded per request

### AC6: Graceful Degradation
- [ ] If model doesn't support tool search, fall back to all-tools-in-context
- [ ] Log warning when fallback occurs
- [ ] No user-facing errors from tool search configuration

### AC7: Documentation & Testing
- [ ] Unit tests for tool registry changes (core vs deferred categorization)
- [ ] Integration test verifying tool search discovery flow
- [ ] Update `project-context.md` with tool search configuration

## Tasks / Subtasks

- [ ] Task 1: Tool Registry Enhancement (AC: 1, 3)
  - [ ] 1.1: Add `defer_loading` property to MCP tool schema conversion in `src/tools/mcp/schema-converter.ts`
  - [ ] 1.2: Add `getCoreTool()` method to `ToolRegistry` class
  - [ ] 1.3: Create `CORE_TOOL_NAMES` const array in `src/tools/registry.ts`
  - [ ] 1.4: Modify `getToolsForClaude()` to annotate non-core tools with `defer_loading: true`

- [ ] Task 2: Configuration (AC: 2)
  - [ ] 2.1: Add `TOOL_SEARCH_ENABLED` env var to `src/config/environment.ts` (default: `true`)
  - [ ] 2.2: Add `CORE_TOOLS` env var (comma-separated list) with default: `memory,code_execution,summarize`
  - [ ] 2.3: Document new config options in `.env.example`

- [ ] Task 3: Agent Loop Integration (AC: 4)
  - [ ] 3.1: Conditionally apply `defer_loading` based on config in `executeAgentLoop()`
  - [ ] 3.2: Ensure tool execution path handles tools discovered via tool_search
  - [ ] 3.3: Log when tool search is active vs. disabled

- [ ] Task 4: Observability (AC: 5)
  - [ ] 4.1: Add `tool_search.discovery` Langfuse event in agent loop (per project naming convention)
  - [ ] 4.2: Calculate and log token savings estimate: `deferredToolCount * 200` tokens
  - [ ] 4.3: Track discovered vs. always-loaded tools per request for debugging

- [ ] Task 5: Graceful Degradation (AC: 6)
  - [ ] 5.1: Detect model capability for tool search using explicit pattern matching:
    ```typescript
    // Models supporting tool search (Sonnet 4+, Opus 4+)
    const TOOL_SEARCH_MODELS = [/^claude-sonnet-4-/, /^claude-opus-4-/];
    function supportsToolSearch(model: string): boolean {
      return TOOL_SEARCH_MODELS.some(p => p.test(model));
    }
    ```
  - [ ] 5.2: Fall back to all-tools mode for unsupported models (claude-3-* patterns)
  - [ ] 5.3: Add warning log for fallback scenarios

- [ ] Task 6: Testing & Documentation (AC: 7)
  - [ ] 6.1: Unit tests for `ToolRegistry.getToolsForClaude()` with defer_loading
  - [ ] 6.2: Unit tests for config parsing and defaults
  - [ ] 6.3: Integration test for tool search flow (mock API response with tool_search)
  - [ ] 6.4: Update `project-context.md` with tool search section

## Dev Notes

### Anthropic Tool Search API

The Tool Search feature is part of the `advanced-tool-use-2025-11-20` beta (already enabled).

```typescript
// Tool definition with deferred loading
const mcpTool = {
  name: 'confluence__search_pages',
  description: 'Search Confluence documentation',
  defer_loading: true,  // Claude will discover this via tool_search
  input_schema: { ... },
};

// Core tools remain always-loaded (no defer_loading)
const memoryTool = {
  type: 'memory_20250818',
  name: 'memory',
  // NO defer_loading - always in context
};
```

### Core Tools (Always Loaded)

These tools should NEVER be deferred:
1. `memory` - Auto-context feature requires immediate availability
2. `code_execution` - PTC container lifecycle requires immediate availability
3. `summarize` - Conversation summarization (Story 7.6)

Optionally configurable via `CORE_TOOLS` env var.

### Model Requirements

Tool Search requires:
- `claude-sonnet-4-*` (4.5+)
- `claude-opus-4-*` (4.5+)

Older models (claude-3-*) do NOT support tool search.

### Tool Search Discovery Flow

1. Request includes core tools (always loaded) + deferred tools (with `defer_loading: true`)
2. Anthropic provides a built-in `tool_search` tool automatically when deferred tools exist
3. Claude calls `tool_search` to discover relevant tools from the deferred pool
4. Anthropic returns matching tool definitions to Claude
5. Claude calls those tools via normal `tool_use` blocks
6. Our `executeTool` handler processes them unchanged - NO code path changes needed

### Token Savings Estimation

```typescript
// Estimate: ~200 tokens per tool definition average
const deferredToolCount = tools.filter(t => t.defer_loading).length;
const estimatedTokenSavings = deferredToolCount * 200;
```

### Project Structure Notes

- **Modified Files:**
  - `src/config/environment.ts` - Add TOOL_SEARCH_ENABLED, CORE_TOOLS
  - `src/tools/registry.ts` - Add defer_loading, CORE_TOOL_NAMES, getCoreTool()
  - `src/tools/mcp/schema-converter.ts` - Add defer_loading to converted tools
  - `src/agent/loop.ts` - Conditional tool loading based on config
  - `src/agent/tools.ts` - Update getToolDefinitions() if needed

- **New Files:**
  - None required - enhancement to existing files

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Hardcode which tools are core | Use `CORE_TOOLS` config or `CORE_TOOL_NAMES` const |
| Apply defer_loading to all tools | Check `defer_loading: true` only for non-core tools |
| Fail if tool search not supported | Gracefully fall back to all-tools mode |
| Log all tool definitions | Log only counts and categories |

### Previous Story Context (Story 8.1)

Story 8.1 (Citations API) is a sibling story in Epic 8. Key coordination notes:
- Both stories modify `src/agent/loop.ts` - watch for merge conflicts
- Story 8.1 adds `documentCitations` to `AgentLoopResult` - this story should not break that type
- Beta header `advanced-tool-use-2025-11-20` is shared (already in `allBetas`)

### References

- [Source: _bmad-output/architecture.md#Epic 8 Repurposed (ADR-2026-01-09)]
- [Source: _bmad-output/epics.md#8.2 Tool Search Tool Integration]
- [Source: _bmad-output/project-context.md#Programmatic Tool Calling (PTC) & Skills API]
- [Source: story-8-1-anthropic-citations-api.md] - Sibling story in Epic 8
- [Anthropic Docs: Tool Search (beta)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-01-11 | Story validated: Added explicit model detection patterns (Task 5.1), tool search discovery flow, Story 8.1 coordination notes, Langfuse naming convention alignment, env var defaults |
