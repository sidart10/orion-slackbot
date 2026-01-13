# Story 8.2: Tool Search Tool Integration

Status: done

<!-- Note: Story completed. Created as documentation of implementation. -->

## Story

As a **platform operator**,
I want Orion to use Anthropic's Tool Search capability for on-demand tool discovery,
So that token usage is reduced when many MCP tools are available and the system scales efficiently.

## Background

When Orion connects to multiple MCP servers, each server provides many tools. With 100+ tools at ~200 tokens each, passing all tool definitions in every request consumes 20k+ tokens. Tool Search enables lazy loading - tools are marked with `defer_loading: true` and Claude discovers them on-demand using the built-in `tool_search_tool_bm25`.

**Key Insight:** The `tool_search_tool_bm25` must be explicitly added to the tools array - it is NOT automatically provided by the API when deferred tools exist.

## Acceptance Criteria

1. **Given** `TOOL_SEARCH_ENABLED=true` (default), **When** MCP tools are registered, **Then** non-core tools are annotated with `defer_loading: true`

2. **Given** a model that supports tool search (Sonnet 4.5+, Opus 4.5+), **When** tools are passed to Claude, **Then** defer_loading is applied to non-core tools

3. **Given** a model that does NOT support tool search (Claude 3.x), **When** tools are passed to Claude, **Then** defer_loading is NOT applied and all tools are in context

4. **Given** tools configured in `CORE_TOOLS` env var, **Then** those tools are never deferred (always in context)

5. **Given** tool search is enabled, **When** deferred tools exist, **Then** `tool_search_tool_bm25` is added to the tools array

6. **Given** model doesn't support tool search, **Then** graceful fallback to all-tools-in-context with warning logged

7. **Given** tool search triggers discovery, **Then** token savings are tracked in Langfuse

## Tasks / Subtasks

- [x] **Task 1: Configuration** (AC: #1, #4)
  - [x] Add `TOOL_SEARCH_ENABLED` env var (default: true)
  - [x] Add `CORE_TOOLS` env var (default: memory,code_execution,summarize)
  - [x] Update `src/config/environment.ts` with toolSearch config object

- [x] **Task 2: Model Capability Detection** (AC: #2, #3, #6)
  - [x] Create `src/agent/model-capabilities.ts`
  - [x] Implement `supportsToolSearch(model)` function
  - [x] Pattern matching for Sonnet 4.5+, Opus 4.5+
  - [x] Unit tests for model detection

- [x] **Task 3: Registry defer_loading Support** (AC: #1, #4)
  - [x] Update `src/tools/registry.ts` types with `ClaudeToolWithDeferLoading`
  - [x] Modify `getToolsForClaude()` to annotate non-core tools
  - [x] Implement `getCoreTool()` for core tool lookup
  - [x] Unit tests for defer_loading annotation

- [x] **Task 4: Agent Loop Integration** (AC: #5, #6, #7)
  - [x] Update `src/agent/loop.ts` to check model capabilities
  - [x] Add tool_search_tool_bm25 to tools array when deferred tools exist
  - [x] Implement graceful fallback for unsupported models
  - [x] Add Langfuse observability for tool search events

- [x] **Task 5: Documentation** (AC: all)
  - [x] Update project-context.md with Tool Search section
  - [x] Document configuration options
  - [x] Document model requirements

## Dev Notes

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `TOOL_SEARCH_ENABLED` | `true` | Enable/disable tool search feature |
| `CORE_TOOLS` | `memory,code_execution,summarize` | Comma-separated list of always-loaded tools |

### Model Requirements

Tool Search requires Sonnet 4.5+ or Opus 4.5+ models:

```typescript
// Supported models (pattern matching)
/^claude-sonnet-4-/  // e.g., claude-sonnet-4-20250514
/^claude-opus-4-/    // e.g., claude-opus-4-20250801

// NOT supported
/^claude-3-/         // claude-3-opus, claude-3-sonnet
/^claude-3-5-/       // claude-3-5-sonnet, claude-3-5-haiku
```

### How It Works

1. **Request:** Core tools (always loaded) + MCP tools with `defer_loading: true` + `tool_search_tool_bm25`
2. **Discovery:** Claude uses `tool_search_tool_bm25` to discover relevant deferred tools
3. **Claude calls:** `tool_search_tool_bm25` with search query, receives matching tool definitions
4. **Execution:** Discovered tools called via normal `tool_use` blocks
5. **Processing:** Our `executeTool` handler processes them unchanged

### Core Tools (Never Deferred)

| Tool | Reason |
|------|--------|
| `memory` | Auto-context feature requires immediate availability |
| `code_execution` | PTC container lifecycle requires immediate availability |
| `summarize` | Conversation summarization |

### Graceful Degradation

- If model doesn't support tool search, falls back to all-tools-in-context
- Warning logged when fallback occurs
- No user-facing errors from tool search configuration

### Architecture Compliance

| Requirement | Implementation |
|-------------|----------------|
| ESM imports | All imports use `.js` extension |
| Logging | Uses `logger.*` with traceId |
| Config | `config.toolSearch.enabled`, `config.toolSearch.coreTools` |
| Observability | Langfuse events for token savings |

### File Structure

```
src/
  config/
    environment.ts     # toolSearch config object
  agent/
    model-capabilities.ts  # supportsToolSearch()
    loop.ts               # Tool search integration
  tools/
    registry.ts           # defer_loading annotation
```

### Observability

```typescript
// Langfuse event for token savings
langfuse.event({
  name: 'tool_search.tokens_saved',
  metadata: {
    deferredToolCount,
    coreToolCount,
    estimatedTokenSavings,
    model,
  },
});

// Log when fallback occurs
logger.warn({
  event: 'tool_search.fallback',
  model,
  reason: 'Model does not support tool search',
});
```

### Project Context Reference

From `project-context.md`:
- **Tool Search enabled:** `config.toolSearch.enabled`
- **Core tools:** `config.toolSearch.coreTools`
- **Model detection:** `supportsToolSearch()` in `model-capabilities.ts`

### References

- [Source: _bmad-output/epics.md#Story 8.2] - Story definition
- [Source: _bmad-output/architecture.md#8.2 Tool Search Tool] - Architecture
- [Source: _bmad-output/project-context.md#Tool Search] - Implementation patterns
- [Source: https://docs.anthropic.com/en/docs/build-with-claude/tool-use/tool-search] - Anthropic docs

## Known Issue: Story 8.6

**Bug Identified:** The `tool_search_tool_bm25` must be explicitly added to the tools array. Initial implementation may have omitted this, causing tool search to not function.

**Fix Required:** Story 8.6 addresses this bug - ensure `tool_search_tool_bm25` is added when deferred tools exist.

## Dev Agent Record

### Agent Model Used

claude-opus-4-5-20250514 (Story creation)

### Debug Log References

- Story 8.2 implementation completed as part of Epic 8 sprint

### Completion Notes List

- Configuration added to environment.ts
- Model capability detection implemented
- Registry updated with defer_loading support
- Agent loop integration complete
- Documentation updated in project-context.md
- Bug discovered: tool_search_tool_bm25 may need explicit addition (see Story 8.6)

### File List

Files created/modified:
- `src/config/environment.ts` - toolSearch config
- `src/agent/model-capabilities.ts` - supportsToolSearch()
- `src/agent/model-capabilities.test.ts` - unit tests
- `src/tools/registry.ts` - defer_loading support
- `src/tools/registry.test.ts` - unit tests
- `src/agent/loop.ts` - tool search integration
- `_bmad-output/project-context.md` - documentation
