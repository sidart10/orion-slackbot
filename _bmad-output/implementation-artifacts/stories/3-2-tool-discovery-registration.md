# Story 3.2: Tool Discovery & Registration
Status: done

## Story

As an **agent**,
I want tools from enabled MCP servers discovered and registered into a unified tool registry,
so that I can select the right tool for each task without knowing which server provides it.

## Acceptance Criteria

1. **Given** multiple MCP servers configured, **When** the system starts, **Then** enabled servers are registered but **NOT** connected (lazy connection).
2. **Given** the first tool call to a server, **When** tools are needed, **Then** discovery runs and tools are cached (**5 min TTL**).
3. **Given** discovered tools, **When** Claude needs tools, **Then** `getToolDefinitions()` returns merged **static** tools + **MCP** tools in Anthropic tool format.
4. **Given** a tool call from Claude, **When** the tool name contains a `server__` prefix, **Then** the tool call can be routed to the correct MCP server (routing implementation completed in Story 3.3; parsing + mapping defined here).
5. **Given** an MCP server becomes unavailable, **When** discovery fails, **Then** cached tools remain available; discovery returns a `ToolResult<T>` failure (no throws).
6. **Given** a platform admin, **When** they disable an MCP server, **Then** its tools are removed from registry on next refresh.
7. **Given** any tool operation in this story, **When** it fails, **Then** it returns `ToolResult<T>` with an appropriate error code (no throws).

## Tasks / Subtasks

- [x] **Task 0: Align Error Codes with Current Repo Reality** (AC: #5, #7)
  - [x] Use the **existing** `ToolErrorCode` union from `src/utils/tool-result.ts`:
    - `TOOL_NOT_IMPLEMENTED`, `TOOL_INVALID_INPUT`, `TOOL_UNAVAILABLE`, `TOOL_EXECUTION_FAILED`
  - [x] Do **NOT** invent new error codes in implementation without updating that union first (keeps compiler/type-level enforcement honest)
  - [x] Map MCP-specific conditions to existing codes (until Story 3.3 expands as needed):
    - Discovery/connectivity failures → `TOOL_UNAVAILABLE`
    - Tool name parsing / invalid config → `TOOL_INVALID_INPUT`
    - Unexpected exceptions → `TOOL_EXECUTION_FAILED`

- [x] **Task 1: Define Tool Naming + Prefix Rules** (AC: #3, #4)
  - [x] Adopt tool naming: static tools are `snake_case`; MCP tools are exposed to Claude as: `{{serverName}}__{{toolName}}`
  - [x] Ensure `serverName` itself is `snake_case` and stable (used as registry key + prefix)
  - [x] Define conflict policy:
    - [x] If MCP tool name conflicts with a static tool name, **exclude** the MCP tool from registration
    - [x] If two MCP servers expose same tool name, keep both (distinct prefixes) unless prefixes collide

- [x] **Task 2: Create Unified Tool Registry** (AC: #1, #3, #6)
  - [x] Create `src/tools/registry.ts` (new directory per architecture)
  - [x] Define `RegisteredTool` structure:
    - `claudeTool: Anthropic.Tool`
    - `serverName: string | null` (null means static)
    - `originalName: string` (unprefixed)
  - [x] Implement registry APIs:
    - [x] `registerStaticTool(name, handler, toolDefinition)`
    - [x] `registerMcpTools(serverName, tools[])`
    - [x] `removeServerTools(serverName)`
    - [x] `getToolsForClaude(): Anthropic.Tool[]` (static + MCP)
    - [x] `getMcpTool(toolName: string): RegisteredTool | undefined`
    - [x] `isDiscoveryStale(serverName): boolean` (TTL check)

- [x] **Task 3: Add MCP Server Configuration + Enable/Disable** (AC: #1, #6)
  - [x] Create `src/config/mcp-servers.ts` that returns server configs:
    - `name`, `url`, `enabled`, optional auth, and per-server timeout config
  - [x] Drive enable/disable via env vars (MVP):
    - `RUBE_MCP_ENABLED=false` disables the server
  - [x] Define the env var surface explicitly (MVP):
    - `RUBE_MCP_URL` (base URL for MCP HTTP streamable transport endpoint)
    - `RUBE_API_KEY` (bearer token for server auth, if required)
    - `RUBE_MCP_ENABLED` (feature flag)
  - [x] On refresh: remove disabled servers' tools from registry

- [x] **Task 4: Implement Lazy Discovery with TTL** (AC: #2, #5)
  - [x] Create `src/tools/mcp/discovery.ts`
  - [x] Implement `discoverAllTools(traceId): Promise<ToolResult<{ registered: number }>>`
  - [x] Discover tools in parallel with `Promise.allSettled()` across enabled servers
  - [x] Cache per-server discovery timestamp; TTL = 5 minutes
  - [x] MCP protocol assumptions (do not drift):
    - [x] Discovery uses MCP 1.0 method `tools/list` (via `src/tools/mcp/client.ts`)
    - [x] Tool schemas are converted into Anthropic `Tool` definitions (via `src/tools/mcp/schema-converter.ts`)
  - [x] On discovery error:
    - [x] keep existing cached tools for that server
    - [x] return `{ success: false, error: ... }` (no throws)

- [x] **Task 5: Bridge into Current Agent Entry Points** (AC: #3)
  - [x] Update `src/agent/tools.ts` to become a thin adapter:
    - `getToolDefinitions()` delegates to `toolRegistry.getToolsForClaude()`
    - maintain current export types (`ToolDefinition`, `ToolResult`, `isRetryable`)
  - [x] Ensure `src/agent/orion.ts` continues to call `getToolDefinitions()` and passes them to `anthropic.messages.create()`

- [x] **Task 6: Validation / Verification (Unit tests)** (AC: #2, #3, #5, #6)
  - [x] Add unit tests for:
    - [x] TTL behavior (stale vs fresh)
    - [x] tool prefixing + conflict filtering (static tool name collision)
    - [x] multi-server merge results (stable order, deterministic output)
    - [x] disable server removes tools
    - [x] discovery failure retains cached tools and returns ToolResult failure

## Dev Notes

### Scope / Boundaries

- **This story owns**: discovery + registry + caching + naming + enable/disable integration.
- **Story 3.3 owns**: executing routed tools (`tools/call`) and returning real tool results to Claude.

### Repo Reality Check (do not drift)

- **Agent tool definitions are currently sourced from** `src/agent/tools.ts` via `getToolDefinitions()` (currently returns `[]`).
- **ToolResult<T> is canonical today** and lives at `src/utils/tool-result.ts`.
- **Logging** uses `src/utils/logger.ts` and must include `traceId` where available.
- **ESM imports must use `.js` extensions** for all relative imports.

### Dependency & Continuity (learn from 3.1 + current code)

- **Dependency: Story 3.1 (Generic MCP Client)** ✅ COMPLETED  
  Story 3.1 implemented the MCP client (`src/tools/mcp/client.ts`) that provides:
  - list tools via `tools/list` (MCP 1.0)
  - call tools via `tools/call` (used in Story 3.3)
  
  The client files are co-located in `src/tools/mcp/` alongside discovery.

  **Inherited constraints (source of truth):**
  - Lazy connection (connect on first use, not at startup)  
    Source: `_bmad-output/project-context.md` (“Lazy connection: don't connect until first tool call”)
  - Connection timeout: **5s max**  
    Source: `_bmad-output/project-context.md` (“Connection timeout: 5s max”)
  - Never throw from tool-layer code paths; always return `ToolResult<T>`  
    Source: `_bmad-output/project-context.md` + `src/utils/tool-result.ts`

- **Compatibility guardrail: current agent loop stubs tool execution**  
  `src/agent/orion.ts` currently emits `tool_result` blocks as **JSON string** content (stubbed “TOOL_NOT_IMPLEMENTED”).  
  **Do not change** the Anthropic message shape or `tool_use_id`/`tool_result` pairing semantics while implementing discovery/registry; Story 3.3 will replace the stub with real execution.

### MCP Protocol Assumptions (explicit)

- Version: **MCP 1.0**
- Discovery: `tools/list`
- Tool execution (Story 3.3): `tools/call`
- Tool name exposure to Claude: `server__tool` (prefixing is *Orion-internal*, not an MCP requirement)

### Architecture Requirements (MANDATORY)

| Requirement | Source | Notes |
|------------|--------|------|
| FR27 | `_bmad-output/prd.md` | Tools from multiple MCP servers merged into unified registry |
| FR28 | `_bmad-output/prd.md` | Claude receives full tool list (static + MCP) |
| FR29 | `_bmad-output/prd.md` | Admin can enable/disable MCP servers (config-driven) |
| Lazy connection | `_bmad-output/project-context.md` | “Don’t connect until first tool call” |
| ToolResult<T> | `src/utils/tool-result.ts` + `_bmad-output/project-context.md` | No throws from tool handlers |
| traceId in logs | `_bmad-output/project-context.md` + `src/utils/logger.ts` | Add `traceId` everywhere possible |

### File Locations (target state after this story)

Create new tool-layer structure **without breaking the current agent entry points**:

```
src/
├── agent/
│   └── tools.ts                 # Adapter: returns registry.getToolsForClaude()
├── config/
│   └── mcp-servers.ts           # Enabled servers + URLs + auth (env-driven)
└── tools/
    ├── registry.ts              # Unified registry (static + MCP)
    └── mcp/
        ├── discovery.ts         # Multi-server discovery + TTL caching
        └── types.ts             # MCP tool schema types (minimal for discovery)
```

Notes:
- `src/tools/` does not exist yet in the repo — **create it** and keep `src/agent/tools.ts` as the stable adapter.
- Any new filenames must be `kebab-case.ts` (repo lint rule).

### Data Structures (recommended)

- **Static tool registration**
  - Map of `staticName -> { handler, claudeTool }`
- **MCP tool registry**
  - Map of `prefixedToolName (server__name) -> { serverName, originalName, claudeTool }`
- **Discovery cache**
  - Map of `serverName -> { lastDiscoveryMs, toolCount }`

### Tool Name Parsing

Implement a single, unambiguous parser (used by discovery + later routing):

- A tool is **MCP-routed** iff it contains `__` with a non-empty prefix: `server__tool`
- Parsing should return:
  - `serverName` = substring before `__`
  - `toolName` = substring after `__` (unprefixed MCP tool name)

Edge cases:
- Reject malformed names like `__tool` or `server__` as invalid MCP tools.
- Do not treat names with multiple `__` specially; split on the first occurrence only.

### Error Handling (MANDATORY)

All tool-layer APIs must return `ToolResult<T>` and never throw:

- **Discovery errors**: `{ success: false, error: { code: 'TOOL_UNAVAILABLE' | 'TOOL_EXECUTION_FAILED', ... } }`
- **Invalid config / invalid tool name**: `{ success: false, error: { code: 'TOOL_INVALID_INPUT', retryable: false, ... } }`

Use `isRetryable(e)` from `src/utils/tool-result.ts` to set `retryable`.

### Observability

Log the following events with `traceId` when available:

- `tools.discovery.started` (serverCount)
- `tools.discovery.server.success` (serverName, toolCount)
- `tools.discovery.server.failed` (serverName, errorMessage)
- `tools.registry.updated` (staticCount, mcpCount)
- `tools.registry.server.removed` (serverName, removedCount)

### Testing Notes

- Unit tests should be co-located with code:
  - `src/tools/registry.test.ts`
  - `src/tools/mcp/discovery.test.ts`
  - `src/agent/tools.test.ts` updated to assert tools are passed through

Mock strategies:
- Stub MCP “tools/list” responses without running an actual server (Story 3.1 covers real client wiring).
- Validate deterministic output ordering for `getToolsForClaude()` (sort by `name`).

### References (optional, but reduces ambiguity)

- MCP 1.0 specification: `https://spec.modelcontextprotocol.io/`
- MCP HTTP streamable transport: `https://spec.modelcontextprotocol.io/specification/transport/http/`
- Anthropic tool use docs: `https://docs.anthropic.com/claude/docs/tool-use`

## Project Context Reference

- **ESM imports**: always `./file.js` for relative imports.  
  Source: `_bmad-output/project-context.md#ESM Import Extension (MANDATORY)`
- **Slack mrkdwn**: only for Slack responses; story docs can use markdown.  
  Source: `_bmad-output/project-context.md#Slack mrkdwn Reference`
- **No PII in logs**: log Slack IDs, not message content.  
  Source: `_bmad-output/project-context.md#Logging`

## Dev Agent Record

### Agent Model Used

Claude (Cursor)

### Debug Log References

- `pnpm test` (2025-12-23)

### Completion Notes List

- Ultimate context refresh applied for repo-accurate file paths and current ToolResult<T> implementation
- ✅ Task 0: Implemented discovery error-code mapping (invalid config → `TOOL_INVALID_INPUT`, discovery/connectivity → `TOOL_UNAVAILABLE`, unexpected → `TOOL_EXECUTION_FAILED`) with unit tests
- ✅ Task 1: Added MCP tool name parser + conflict policy (static name collisions exclude MCP tool) with unit tests
- ✅ Task 2: Added unified tool registry (static + MCP) with deterministic output ordering
- ✅ Task 3: Added env-driven MCP server config + disable-removes-tools-on-refresh behavior with unit tests
- ✅ Task 4: Added lazy MCP discovery with per-server 5m TTL caching + failure-retains-cache behavior (unit tests)
- ✅ Task 5: Wired agent entry points to refresh MCP tools (lazy+TTL) and pass registry tools into Anthropic calls (tests updated)
- ✅ Task 6: Added unit tests for TTL, prefix/conflict policy, stable ordering, disable-removal, and failure-retains-cache

### File List

- `_bmad-output/implementation-artifacts/stories/3-2-tool-discovery-registration.md`
- `_bmad-output/sprint-status.yaml`
- `src/config/mcp-servers.ts`
- `src/tools/registry.ts`
- `src/tools/registry.test.ts`
- `src/tools/mcp/discovery.ts`
- `src/tools/mcp/discovery.test.ts`
- `src/tools/mcp/client.ts` (Story 3.1 - MCP HTTP client)
- `src/tools/mcp/client.test.ts`
- `src/tools/mcp/schema-converter.ts` (MCP → Anthropic tool format)
- `src/tools/mcp/schema-converter.test.ts`
- `src/tools/mcp/types.ts`
- `src/tools/mcp/health.ts`
- `src/tools/mcp/health.test.ts`
- `src/tools/mcp/config.ts`
- `src/tools/mcp/config.test.ts`
- `src/tools/mcp/index.ts`
- `src/agent/tools.ts`
- `src/agent/tools.test.ts`
- `src/agent/loop.ts`
- `src/agent/loop.test.ts`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-23 | Regenerated story: aligned file paths to actual repo (`src/agent/tools.ts`, `src/utils/tool-result.ts`), clarified boundaries vs Story 3.3, and made enable/disable + TTL rules explicit |
| 2025-12-23 | Task 0 complete: added discovery scaffolding + tests enforcing existing `ToolErrorCode` mappings |
| 2025-12-23 | Task 1 complete: MCP tool prefix parsing + conflict filtering + deterministic ordering tests |
| 2025-12-23 | Task 2 complete: unified tool registry APIs implemented (static + MCP) |
| 2025-12-23 | Task 3 complete: env-driven server enable/disable + registry removal on refresh |
| 2025-12-23 | Task 4 complete: lazy discovery + TTL caching + tests |
| 2025-12-23 | Task 5 complete: agent tools adapter + loop refresh wiring |
| 2025-12-23 | Code review: Fixed parent task checkboxes (Tasks 1-6), updated File List with all MCP files, clarified 3.1 dependency as complete |


