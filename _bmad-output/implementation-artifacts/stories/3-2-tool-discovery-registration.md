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

## Additional Acceptance Criteria (Added 2025-12-31 — Client Caching)

> **Context:** MCP clients should be cached per server to maintain session state. Creating new clients per call breaks session persistence.
> See: `sprint-change-proposal-2025-12-31.md`

8. **AC-C1:** **Given** multiple tool calls to the same MCP server, **When** the `McpClientManager` is used, **Then** it returns the same cached SDK Client instance (not a new client per call).

9. **AC-C2:** **Given** tool calls to the same server within a session, **When** executed, **Then** all calls reuse the cached client and maintain session state.

10. **AC-C3:** **Given** tool calls to different MCP servers, **When** executed, **Then** each server maintains its own independent session (no cross-server session bleeding).

11. **AC-C4:** **Given** concurrent tool calls to the same server, **When** executed via `Promise.all()`, **Then** they do not race on session initialization (mutex/lock on init).

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

### Phase 2: Client Caching (2025-12-31 — COMPLETE)

- [x] **Task 7: Create McpClientManager Singleton** (AC: #8, #9)
  - [x] Create `src/tools/mcp/manager.ts`
  - [x] Implement singleton pattern (one manager per process)
  - [x] Cache SDK Client instances per server name
  - [x] Lazy initialization on first call to each server

- [x] **Task 8: Implement Concurrency Safety** (AC: #11)
  - [x] Add mutex/lock for session initialization
  - [x] Prevent race conditions on concurrent first calls
  - [x] Ensure only one initialize request per server

- [x] **Task 9: Update Discovery to Use Manager** (AC: #8, #10)
  - [x] Update `src/tools/mcp/discovery.ts` to get clients from manager
  - [x] Ensure each server has independent session
  - [x] Remove per-call client instantiation

- [x] **Task 10: Update Router to Use Manager** (AC: #9)
  - [x] Update `src/tools/router.ts` to get clients from manager
  - [x] Ensure tool calls reuse cached clients

- [x] **Task 11: Client Caching Tests** (AC: #8-11)
  - [x] Test: `same_client_returned_for_same_server`
  - [x] Test: `different_clients_for_different_servers`
  - [x] Test: `concurrent_calls_no_race_condition`
  - [x] Test: `lazy_initialization_on_first_call`

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

Tool-layer structure **without breaking the current agent entry points**:

```
src/
├── agent/
│   └── tools.ts                 # Adapter: returns registry.getToolsForClaude()
├── config/
│   └── mcp-servers.ts           # Enabled servers + URLs + auth (env-driven)
└── tools/
    ├── registry.ts              # Unified registry (static + MCP)
    ├── router.ts                # Tool routing (static + MCP dispatch)
    ├── errors.ts                # Error normalization (toToolError)
    └── mcp/
        ├── discovery.ts         # Multi-server discovery + TTL caching
        ├── client.ts            # MCP HTTP client (Story 3.1)
        ├── schema-converter.ts  # MCP → Anthropic tool format
        └── types.ts             # MCP tool schema types
```

Notes:
- `src/tools/` created in Phase 1 — contains registry, router, MCP clients, and supporting modules.
- `src/agent/tools.ts` remains the stable adapter for agent loop.
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
- ✅ Task 7: Created `McpClientManager` singleton with client caching per server name, lazy initialization
- ✅ Task 8: Implemented concurrency safety via `pendingInit` Map (mutex pattern prevents race on concurrent first calls)
- ✅ Task 9: Updated `discovery.ts` to use `McpClientManager.getInstance().getClient()` instead of `new McpClient()`
- ✅ Task 10: Updated `router.ts` to use `McpClientManager.getInstance().getClient()` instead of `new McpClient()`
- ✅ Task 11: Added 14 unit tests for client caching (AC-C1 through AC-C4), plus integration test in router.test.ts verifying reuse

### File List

- `_bmad-output/implementation-artifacts/stories/3-2-tool-discovery-registration.md`
- `_bmad-output/sprint-status.yaml`
- `src/config/mcp-servers.ts`
- `src/tools/registry.ts`
- `src/tools/registry.test.ts`
- `src/tools/router.ts` (Tool routing, uses registry for lookup)
- `src/tools/router.test.ts`
- `src/tools/errors.ts` (Error normalization)
- `src/tools/errors.test.ts`
- `src/tools/mcp/discovery.ts`
- `src/tools/mcp/discovery.test.ts`
- `src/tools/mcp/client.ts` (Story 3.1 - MCP HTTP client)
- `src/tools/mcp/client.test.ts`
- `src/tools/mcp/manager.ts` (NEW - McpClientManager singleton for client caching)
- `src/tools/mcp/manager.test.ts` (NEW - 13 tests for client caching AC-C1 through AC-C4)
- `src/tools/mcp/schema-converter.ts` (MCP → Anthropic tool format)
- `src/tools/mcp/schema-converter.test.ts`
- `src/tools/mcp/types.ts`
- `src/tools/mcp/health.ts`
- `src/tools/mcp/health.test.ts`
- `src/tools/mcp/config.ts`
- `src/tools/mcp/config.test.ts`
- `src/tools/mcp/index.ts` (UPDATED - exports McpClientManager)
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
| 2025-12-31 | **Client caching gap identified:** Creating new MCP client per call breaks session persistence. Need `McpClientManager` singleton to cache clients per server. |
| 2025-12-31 | **Reopened for Phase 2:** Added AC-C1 through AC-C4 and Tasks 7-11 for client caching. See: `sprint-change-proposal-2025-12-31.md` |
| 2026-01-02 | **SM validation:** Phase 1 verified complete. Updated File List (added router.ts, errors.ts). Updated Dev Notes to reflect current state. Phase 2 tasks correctly scoped. |
| 2026-01-02 | **Phase 2 complete:** Tasks 7-11 implemented. McpClientManager singleton caches clients per server. Discovery + router updated to use manager. 14 unit tests pass. All 133 tools tests pass. |
| 2026-01-02 | **Code Review:** Fixed test count (14 not 13). Staged untracked manager.ts files. Noted M2 as future improvement (config URL validation on cached client). Story ready for done. |


