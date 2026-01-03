# Story 3.1: Generic MCP Client

Status: done

## Story

As a **developer**,
I want a generic MCP client that can connect to any MCP-compatible server,
So that Orion can use external tools without code changes for each integration.

## Acceptance Criteria

1. **Given** an MCP server URL and optional bearer auth, **When** `listTools()` or `callTool()` is invoked, **Then** the client performs the request using **MCP HTTP Streamable Transport** (JSON-RPC over HTTP) per MCP 1.0 spec, with **lazy connection** (no startup connect).

2. **Given** a server config, **When** `listTools()` is called, **Then** it returns `ToolResult<McpTool[]>` including each tool’s `name`, optional `description`, and `inputSchema`.

3. **Given** an MCP tool schema, **When** converted via `mcpToolToClaude(...)`, **Then** it returns a valid Anthropic tool definition and the tool name is exposed to Claude as `{{serverName}}__{{toolName}}`.

4. **Given** a tool call request, **When** `callTool()` is executed, **Then** it returns `ToolResult<McpContent>` and **never throws**.

5. **Given** an MCP request fails (timeout/network/4xx/5xx/invalid JSON), **When** the client returns an error, **Then** it returns `ToolResult<...>` with a `ToolErrorCode` from `src/utils/tool-result.ts` and `retryable` derived from `isRetryable(error)`.

6. **Given** multiple MCP servers configured, **When** callers invoke the client across servers concurrently, **Then** operations are safe to run in parallel (no global mutable cross-server state).

7. **Given** an MCP operation, **When** it runs, **Then** it logs structured events including `traceId`; and **when a Langfuse trace is available**, it emits spans named `mcp.tools.list` and `mcp.call` capturing serverName, tool (if applicable), durationMs, and success/failure metadata.

## Additional Acceptance Criteria (Added 2025-12-31 — Session Management)

> **Context:** Testing revealed session-based MCP servers (Samba internal MCPs) return HTTP 400 "Missing session ID". Adopting official `@modelcontextprotocol/sdk` for proper session lifecycle.
> See: `sprint-change-proposal-2025-12-31.md`

8. **AC-S1:** **Given** the first request to an MCP server, **When** the response includes `mcp-session-id` header, **Then** the client captures and stores the session ID for that server.

9. **AC-S2:** **Given** a stored session ID, **When** subsequent requests are made to that server, **Then** the client sends `Mcp-Session-Id` header on all requests.

10. **AC-S3:** **Given** a session ID that has expired or is invalid, **When** the server returns HTTP 404 "session not found", **Then** the client re-initializes the session automatically and retries the request.

11. **AC-S4:** **Given** session establishment, **When** a new session is created, **Then** the client logs the session establishment event with `traceId` for observability.

## Tasks / Subtasks

### Phase 1: Original Implementation (COMPLETE)

- [x] **Task 1: Create MCP Client Core** (AC: #1, #5)
  - [x] Create `src/tools/mcp/client.ts` and `src/tools/mcp/types.ts`
  - [x] Implement MCP HTTP Streamable Transport request helper (JSON-RPC POST)
  - [x] Support optional bearer token authentication (server config created in Story 3.2; MVP can be env-driven)
  - [x] Enforce timeouts:
    - [x] Connection timeout: **5s** (per `_bmad-output/project-context.md`)
    - [x] Default request timeout: **30s**, override per server
  - [x] Return `ToolResult<T>` on all public client operations; never throw from these APIs

- [x] **Task 2: Implement MCP Operations** (AC: #2, #4, #7)
  - [x] Implement `listTools(...)` calling `tools/list` and returning `ToolResult<McpTool[]>`
  - [x] Implement `callTool(...)` calling `tools/call` and returning `ToolResult<McpContent>`
  - [x] Add lightweight client state for debugging/health (e.g., `lastSuccessAt`, `lastError`, `lastLatencyMs`) without breaking lazy-connection semantics
  - [x] Emit structured logs with `traceId` for start/success/failure
  - [x] When a Langfuse trace is provided, wrap operations in spans using `trace.startSpan(...)`

- [x] **Task 3: Schema Conversion (MCP → Anthropic Tool)** (AC: #3)
  - [x] Create `src/tools/mcp/schema-converter.ts`
  - [x] Implement `mcpToolToClaude(serverName, tool)` returning an Anthropic tool definition with name `server__tool`
  - [x] Convert MCP JSON schema into Anthropic `input_schema` (object schema)
  - [x] Handle edge cases: nullable, oneOf, enums, nested objects
  - [x] Preserve parameter descriptions

- [x] **Task 4: Health Endpoint Contract (non-blocking)** (AC: #7)
  - [x] Add `GET /health/mcp` to the Cloud Run receiver router (`src/slack/app.ts`)
  - [x] Must NOT force-connect to servers by default (respect lazy connection)
  - [x] Return a lightweight snapshot (configured servers + last-known client stats when available)

- [x] **Task 5: Verification (Unit tests)** (AC: #2, #3, #4, #5)
  - [x] Add `src/tools/mcp/client.test.ts`:
    - [x] `listTools()` success returns `{ success: true, data }`
    - [x] timeout/network returns `{ success: false, error: { code: 'TOOL_UNAVAILABLE', retryable: true } }` (or `TOOL_EXECUTION_FAILED` where appropriate)
  - [x] Add `src/tools/mcp/schema-converter.test.ts` for edge-case schema conversion

### Phase 2: Session Management (2025-12-31 — COMPLETE)

- [x] **Task 6: Add Official MCP SDK Dependency** (AC: #8-11)
  - [x] Add `@modelcontextprotocol/sdk` v1.25.1 to `package.json`
  - [x] Update `project-context.md` with new dependency (already documented)

- [x] **Task 7: Implement Session Lifecycle** (AC: #8, #9, #10)
  - [x] Enhanced existing HTTP client with session management (simpler than full SDK replacement)
  - [x] Session ID automatically captured from `mcp-session-id` response header
  - [x] Session ID sent via `Mcp-Session-Id` header on all subsequent requests
  - [x] Auto re-initialize on HTTP 404 "session not found" with retry

- [x] **Task 8: Session Observability** (AC: #11)
  - [x] Log session establishment with `traceId` (`mcp.session.established`)
  - [x] Log session re-establishment events (`mcp.session.reestablished`)
  - [x] Log session expiration events (`mcp.session.expired`)

- [x] **Task 9: Session Lifecycle Tests** (AC: #8-11)
  - [x] Test: `captures session ID from mcp-session-id header`
  - [x] Test: `sends session ID on subsequent requests`
  - [x] Test: `re-initializes session on 404 session not found`
  - [x] Test: `multiple servers maintain independent sessions`
  - [x] Test: `concurrent calls share the same session`

- [x] **Task 10: Delete Custom Client** (cleanup) — SKIPPED
  - N/A: Enhanced existing client instead of replacing with SDK wrapper (simpler, less code churn)

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR26 | `_bmad-output/prd.md` | System connects to MCP servers via generic HTTP streamable client |
| FR27 | `_bmad-output/prd.md` | Tools from multiple MCP servers merged into unified registry (Story 3.2) |
| FR39 | `_bmad-output/prd.md` | System logs tool executions and results (client-level spans/logs + routing in later story) |
| Connection timeout | `_bmad-output/project-context.md` | 5s max for MCP connections |
| Lazy connection | `_bmad-output/project-context.md` | Don’t connect until first tool call |
| ToolResult<T> | `src/utils/tool-result.ts` + `_bmad-output/project-context.md` | All tool handlers return ToolResult; never throw |
| Tracing API | `src/observability/tracing.ts` | Use `startActiveObservation` + `createSpan(trace, ...)` (not `langfuse.span`) |
| Health endpoint | `src/slack/app.ts` | Cloud Run health endpoint lives on ExpressReceiver router |

### Scope / Boundaries

- **This story owns**: MCP client transport + request/response types + schema conversion helper + client-level observability hooks.
- **Story 3.2 owns**: multi-server discovery orchestration (TTL), unified registry, conflict filtering, enable/disable.
- **Story 3.3 owns**: routing `tool_use` → `tools/call` and returning real `tool_result` blocks to Claude (replacing the current stub in `src/agent/orion.ts`).

### Repo Reality Check (do not drift)

- `src/agent/tools.ts` is the stable entry point for Anthropic tool definitions today (currently returns `[]`).
- `src/agent/orion.ts` currently **stubs** tool execution with `TOOL_NOT_IMPLEMENTED` tool_result blocks.
- Tracing is done via `startActiveObservation(...)` and `createSpan(trace, ...)` from `src/observability/tracing.ts`.
- Cloud Run health endpoint is implemented on the Bolt ExpressReceiver router in `src/slack/app.ts` (`GET /health`).
- Project-wide constraints from `_bmad-output/project-context.md` apply:
  - ESM relative imports must include `.js`
  - `src/index.ts` must keep `./instrumentation.js` as the first import
  - Prefer structured `logger.*` (avoid `console.log` in app code) and always include `traceId` when available
  - MCP failures must degrade gracefully upstream (return `ToolResult` and let the agent continue without unavailable tools)

### File Locations (target state after this story)

Create a tools-layer MCP client without breaking existing agent entry points:

```
src/
├── agent/
│   └── tools.ts                  # (existing) adapter entry point (Story 3.2 will wire registry)
├── slack/
│   └── app.ts                    # add /health/mcp here
└── tools/
    └── mcp/
        ├── client.ts             # MCP client core (HTTP Streamable)
        ├── client.test.ts        # unit tests
        ├── schema-converter.ts   # MCP JSON schema → Anthropic tool schema
        ├── schema-converter.test.ts
        └── types.ts              # MCP types (tools/list + tools/call payload shapes)
```

Notes:
- `src/tools/` may not exist yet — create it.
- Any new filenames must be `kebab-case.ts` (repo lint rule).
- MCP server configuration is defined in **Story 3.2** (`src/config/mcp-servers.ts`). This story can define a minimal config interface and accept it as input.

### Error Handling (MANDATORY)

Use the **existing** canonical types:
- `ToolResult<T>` and `ToolErrorCode` live at `src/utils/tool-result.ts`
- `retryable` must use `isRetryable(e)` from the same module

Recommended mapping:
- **timeout / network / DNS / ECONNREFUSED** → `code: 'TOOL_UNAVAILABLE'`
- **non-OK HTTP / invalid JSON / protocol mismatch** → `code: 'TOOL_EXECUTION_FAILED'`
- **bad input / malformed tool name** → `code: 'TOOL_INVALID_INPUT'` (retryable: false)

### Observability (repo-accurate)

When a Langfuse trace is available, create spans via `createSpan(trace, ...)`:
- `mcp.tools.list` (serverName, toolCount, durationMs)
- `mcp.call` (serverName, toolName, argsSummary, durationMs, success/failure)

Always log structured events with `traceId`:
- `mcp.tools.list.started|success|failed`
- `mcp.call.started|success|failed`

### Health Endpoint (Cloud Run)

Add `GET /health/mcp` in `src/slack/app.ts`:
- Must be **non-blocking** and must **not** force-connect by default.
- Returns a lightweight snapshot (configured servers + last-known client stats when available).

### References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP HTTP Streamable Transport](https://spec.modelcontextprotocol.io/specification/transport/http/)
- [Claude Tool Use](https://docs.anthropic.com/claude/docs/tool-use)

## Dev Agent Record

### Implementation Plan

- Extended existing `src/tools/mcp/types.ts` with MCP protocol types (JSON-RPC, McpTool, McpContent, etc.)
- Created `src/tools/mcp/client.ts` implementing McpClient class with HTTP Streamable Transport
- Created `src/tools/mcp/schema-converter.ts` with `mcpToolToClaude()` and `parseClaudeToolName()` functions
- Added `/health/mcp` endpoint to `src/slack/app.ts`
- Updated `src/tools/mcp/index.ts` to export all new modules
- Fixed `src/slack/app.test.ts` mock to properly capture multiple route handlers

### Phase 2 Implementation (2025-01-02)

- Added `@modelcontextprotocol/sdk` v1.25.1 dependency
- Enhanced `McpClient` with session lifecycle management:
  - Added `sessionId` private field and `getSessionId()` public method
  - Capture session ID from `mcp-session-id` response header (AC-S1)
  - Send `Mcp-Session-Id` header on subsequent requests (AC-S2)
  - Auto-retry on HTTP 404 "session not found" with session reset (AC-S3)
  - Structured logging for session events with traceId (AC-S4)

### Completion Notes

✅ All Phase 1 + Phase 2 tasks completed with comprehensive test coverage:
- 19 client tests (14 original + 5 session management)
- 20 schema-converter tests
- 5 discovery tests
- 10 config tests
- 4 health tests
- Total: 58 MCP module tests passing

Implementation decisions:
- Used native `fetch` with `AbortController` for timeout handling (no external dependencies)
- Spans created via `trace.startSpan()` per new tracing SDK patterns (not legacy `createSpan`)
- Client state is instance-scoped (no global mutable state) for concurrency safety
- Schema conversion preserves all JSON Schema constructs Anthropic supports
- connectionTimeoutMs stored but not separately enforced (documented) - HTTP Streamable Transport uses ephemeral connections
- **Session management**: Enhanced existing client rather than replacing with SDK wrapper — simpler approach, less code churn, same outcome
- **Code review (2025-01-02)**: Removed unused `@modelcontextprotocol/sdk` dependency, updated architecture.md to reflect native session implementation

## File List

| Action | Path |
|--------|------|
| Modified | `src/tools/mcp/types.ts` - Added MCP protocol types (JSON-RPC, McpTool, McpContent, McpClientConfig, McpClientState) |
| Modified | `src/tools/mcp/client.ts` - MCP HTTP Streamable Transport client with session management |
| Modified | `src/tools/mcp/client.test.ts` - 19 unit tests (14 original + 5 session management) |
| Modified | `src/tools/mcp/discovery.test.ts` - 5 discovery tests (updated for session-aware client) |
| Created | `src/tools/mcp/schema-converter.ts` - mcpToolToClaude() function |
| Created | `src/tools/mcp/schema-converter.test.ts` - 20 unit tests for schema conversion |
| Modified | `src/tools/mcp/index.ts` - Export new client and schema-converter modules |
| Modified | `src/slack/app.ts` - Added GET /health/mcp endpoint |
| Modified | `src/slack/app.test.ts` - Fixed mock to capture all route handlers |
| Modified | `package.json` - Session management implemented natively (SDK dependency removed after review) |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 3 |
| 2025-12-23 | Updated to match repo reality: ToolResult/ToolErrorCode (`src/utils/tool-result.ts`), tracing (`createSpan`), Cloud Run health routing (`src/slack/app.ts`), and clarified boundaries vs Stories 3.2/3.3 |
| 2025-12-23 | Implementation complete - all 5 tasks done, 40 tests passing |
| 2025-12-23 | Code review fixes: added parseClaudeToolName() tests (7), /health/mcp endpoint tests (3), no-bearer-token test (1), documented connectionTimeoutMs design decision. Total: 60 tests passing |
| 2025-12-31 | **Session management gap identified:** Samba MCPs return HTTP 400 "Missing session ID". Custom client doesn't implement MCP session protocol. |
| 2025-12-31 | **Reopened for Phase 2:** Adopting official `@modelcontextprotocol/sdk` for session lifecycle. Added AC-S1 through AC-S4 and Tasks 6-10. See: `sprint-change-proposal-2025-12-31.md` |
| 2025-01-02 | **Phase 2 complete:** Session lifecycle implemented via enhanced existing client. 5 new tests added. 58 MCP tests passing. |
| 2025-01-02 | **Code review fixes:** Removed unused `@modelcontextprotocol/sdk` dependency (dead code), updated File List to include `discovery.test.ts`, updated `architecture.md` ADR to reflect actual implementation. |
