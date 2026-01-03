# Story 3.5: MCP Session Lifecycle

Status: done

## Story

As a **developer**,
I want the MCP client to implement the full MCP specification lifecycle handshake,
So that stateful MCP servers (Samba audience-manager, msci-reports) work correctly.

## Background

Story 3.1 marked session management "complete" but the implementation only captures session IDs from response headers — it does NOT perform the mandatory `initialize` → `notifications/initialized` handshake required by MCP specification 2025-06-18. Stateful servers reject requests with "Invalid request parameters" because no session was established.

**Reference:** `docs/mcp-enterprise-upgrade-proposal.md`

## Acceptance Criteria

### P0 — Initialization Handshake (Required)

1. **AC-L1:** **Given** a new MCP client, **When** the first `tools/list` or `callTool()` request is made, **Then** the client first sends an `initialize` request containing `protocolVersion`, `capabilities`, and `clientInfo`, waits for the response, and then sends a `notifications/initialized` notification before proceeding with the actual request. **The initialize request MUST use a 5s timeout** (not the default 30s request timeout) to fail fast.

2. **AC-L2:** **Given** the `initialize` response, **When** it includes an `Mcp-Session-Id` header, **Then** the client stores the session ID and includes it on ALL subsequent requests (already works).

3. **AC-L3:** **Given** an MCP server that does NOT return `Mcp-Session-Id` on initialize, **When** subsequent requests are made, **Then** the client proceeds without session headers (stateless server auto-detection).

4. **AC-L4:** **Given** any request after initialization, **When** the request is sent, **Then** the client includes the `MCP-Protocol-Version` header with the negotiated protocol version (e.g., `MCP-Protocol-Version: 2025-06-18`).

### P0 — Session State Machine (Required)

5. **AC-L5:** **Given** a client instance, **When** `getState()` is called, **Then** it includes a `sessionState` field with one of: `DISCONNECTED`, `INITIALIZING`, `CONNECTED`, or `FAILED`.

6. **AC-L6:** **Given** concurrent first calls to the same server, **When** multiple requests are made before initialization completes, **Then** all requests wait for the single initialization to complete (no duplicate handshakes).

### P0 — 404 Recovery (Required)

7. **AC-L7:** **Given** a 404 "session not found" response, **When** the client handles the error, **Then** it resets session state to `DISCONNECTED` and calls `ensureInitialized()` to perform the full handshake before retrying the request (not just clear the session ID).

### P1 — Retry with Exponential Backoff (High Value)

8. **AC-L8:** **Given** a transient failure (timeout, 5xx, network error), **When** an MCP tool call fails, **Then** the system retries up to 3 times (per `project-context.md` "Max retries per tool: 3") with exponential backoff before returning an error. **Retry MUST be enforced once at the tool execution wrapper layer** (`src/tools/executor.ts` → `withRetry`) — do NOT implement a second retry loop inside `McpClient`.
   
   **Implementation Note:** `withRetry` currently uses 1s, 2s, 4s delays (+ 30s for 429). If jitter is required, add it centrally in `src/tools/retry.ts` (backwards compatible) rather than adding MCP-specific retry logic.

9. **AC-L9:** **Given** a non-retryable failure (400, 401, 403), **When** an MCP request fails, **Then** the client returns a `ToolResult` with `retryable: false` and the system does NOT retry.

### P1 — Stateless Server Fallback (High Value)

10. **AC-L10:** **Given** an MCP server where `initialize` fails with HTTP 400, 404, or 405, **and** the error message contains "unknown method", "not found", or "not supported" (case-insensitive), **When** the client handles the error, **Then** it falls back to calling `tools/list` directly without handshake (stateless mode), logs a warning with `event: 'mcp.init.fallback_stateless'`, and marks the server as `isStateless: true` to skip handshake on future calls.

    **Note:** Exa MCP server is known to be stateless and may trigger this fallback. The fallback is automatic — no config flag needed.

### P2 — Graceful Shutdown (Nice-to-Have)

11. **AC-L11:** **Given** a process shutdown signal (SIGTERM), **When** the server is shutting down, **Then** the client sends an HTTP DELETE to the MCP endpoint with the session ID to explicitly terminate sessions (if session exists). Server may return 405 which is acceptable.

## Tasks / Subtasks

### Phase 1: Initialization Handshake (P0)

- [x] **Task 1: Implement `ensureInitialized()` Method** (AC: #L1, #L6)
  - [x] Add `SessionState` enum: `DISCONNECTED`, `INITIALIZING`, `CONNECTED`, `FAILED`
  - [x] Add `sessionState`, `initializationPromise`, `negotiatedVersion` private fields to `McpClient`
  - [x] Update `McpClientState` type to include: `sessionState`, `sessionId?`, `sessionEstablishedAt?`
  - [x] Implement mutex pattern: if initialization in progress, wait for existing promise
  - [x] Use **5s timeout** for `initialize` request (not 30s default) — fail fast
  - [x] Send `initialize` JSON-RPC request with:
    - `protocolVersion`: `"2025-06-18"` (or from config)
    - `capabilities`: `{ tools: {} }` (minimal client capabilities)
    - `clientInfo`: `{ name: "orion-slack-agent", version: "1.0.0" }`
  - [x] Handle `InitializeResult` response, capture session ID from headers
  - [x] **Store `negotiatedVersion`** from server response (may differ from requested version)
  - [x] Implement `sendNotification(method)` — one-way message, **no `id` field**, only check HTTP status (expect 202), **do NOT parse response body**
  - [x] Send `notifications/initialized` notification via `sendNotification()`
  - [x] Update `sessionState` to `CONNECTED` on success, `FAILED` on error

- [x] **Task 2: Integrate Handshake into Request Flow** (AC: #L1, #L4)
  - [x] Call `ensureInitialized()` at the start of `listTools()` and `callTool()`
  - [x] Add `MCP-Protocol-Version` header using `negotiatedVersion` (not hardcoded)
  - [x] Update `getState()` to include `sessionState`, `sessionId`, `sessionEstablishedAt` fields
  - [x] **Note:** `McpClientState` type change is additive (new optional fields). Existing consumers (`/health/mcp` endpoint, `manager.ts`) will continue to work. Update health endpoint display if desired.

- [x] **Task 3: Stateless Server Auto-Detection** (AC: #L3, #L10)
  - [x] If `initialize` response has no `Mcp-Session-Id`, mark server as stateless
  - [x] If `initialize` fails with 4xx "Unknown method", fallback to direct `tools/list` (stateless mode)
  - [x] Skip session header on subsequent requests for stateless servers
  - [x] Add `isStateless` boolean to client state
  - [x] Log warning when falling back to stateless mode

- [x] **Task 4: Fix 404 Recovery** (AC: #L7)
  - [x] On 404 "session not found", reset state to `DISCONNECTED`
  - [x] Call `ensureInitialized()` before retry (not just clear session ID)
  - [x] Preserve single-retry limit to prevent infinite loops

### Phase 2: Retry with Backoff (P1)

- [x] **Task 5: Add Retry Logic** (AC: #L8, #L9)
  - [x] **Do NOT implement a second retry loop inside `McpClient`** — tool-level retries are already enforced by `executeTool()` (`src/tools/executor.ts` → `withRetry`) and must remain the single retry policy to preserve "Max retries per tool: 3"
  - [x] Ensure MCP client surfaces transient failures as `ToolResult` with `retryable: true` (e.g., timeouts/network/5xx/429) so `executeTool()` can retry safely
  - [x] Ensure non-retryable failures (400/401/403) return `retryable: false` (no retries)
  - [x] If jitter is required, add it centrally in `src/tools/retry.ts` (backwards compatible); do not add MCP-specific retry logic

### Phase 3: Graceful Shutdown (P2 — Defer to post-MVP)

- [ ] **Task 6: HTTP DELETE on Shutdown** (AC: #L11)
  - [ ] Add `close()` method to `McpClient`
  - [ ] Send HTTP DELETE with `Mcp-Session-Id` header
  - [ ] Handle 405 gracefully (server doesn't support explicit termination)
  - [ ] Call from `McpClientManager` on SIGTERM

### Phase 4: Testing

- [x] **Task 7: Unit Tests** (AC: #L1-L11)
  - [x] Test: `sends initialize request before first tools/list`
  - [x] Test: `sends notifications/initialized after initialize response`
  - [x] Test: `uses negotiatedVersion from server in MCP-Protocol-Version header`
  - [x] Test: `concurrent first calls share single initialization`
  - [x] Test: `auto-detects stateless server (no session ID)`
  - [x] Test: `falls back to stateless on 4xx init rejection`
  - [x] Test: `404 recovery calls ensureInitialized before retry`
  - [x] Test: `retries transient failures with exponential backoff`
  - [x] Test: `does not retry non-retryable errors`
  - [x] Test: `getState() returns sessionState, sessionId, sessionEstablishedAt`
  - [x] **Update existing mocks**: session ID comes from `initialize` response, not `tools/list`

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| NFR17 | `_bmad-output/prd.md` | MCP HTTP streamable transport |
| NFR18 | `_bmad-output/prd.md` | Support MCP 1.0 protocol |
| Connection timeout | `_bmad-output/project-context.md` | 5s max |
| Retry pattern | `_bmad-output/project-context.md` | Max 3 retries per tool |

### MCP Specification References

**Lifecycle (2025-06-18):**
```
Client → initialize → Server → InitializeResult + Mcp-Session-Id header
Client → notifications/initialized → Server (202 Accepted, no body)
Client → tools/list → Server → tools response
```

**Initialize Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "tools": {} },
    "clientInfo": { "name": "orion-slack-agent", "version": "1.0.0" }
  }
}
```

**Notifications/Initialized (one-way notification, no id):**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

**Headers:**
- `Mcp-Session-Id`: Session identifier (from server, included on all subsequent requests)
- `MCP-Protocol-Version`: Protocol version (required on all requests after init)

### Implementation Pattern

```typescript
// State machine
enum SessionState {
  DISCONNECTED = 'DISCONNECTED',
  INITIALIZING = 'INITIALIZING', 
  CONNECTED = 'CONNECTED',
  FAILED = 'FAILED',
}

// In McpClient
private sessionState: SessionState = SessionState.DISCONNECTED;
private initializationPromise: Promise<void> | null = null;
private requestedVersion: string = '2025-06-18';
private negotiatedVersion: string = '2025-06-18';  // Set from server response
private sessionEstablishedAt?: Date;
private isStateless: boolean = false;

async ensureInitialized(): Promise<void> {
  if (this.sessionState === SessionState.CONNECTED) return;
  if (this.isStateless) return;  // Skip for known stateless servers
  
  // Mutex: if init in progress, wait for it
  if (this.initializationPromise) {
    return this.initializationPromise;
  }
  
  this.initializationPromise = this.doInitialize();
  try {
    await this.initializationPromise;
  } finally {
    this.initializationPromise = null;
  }
}

private async doInitialize(): Promise<void> {
  this.sessionState = SessionState.INITIALIZING;
  
  // 1. Send initialize request (5s timeout, fail fast)
  const initResult = await this.sendRequest<InitializeResult>('initialize', {
    protocolVersion: this.requestedVersion,
    capabilities: { tools: {} },
    clientInfo: { name: 'orion-slack-agent', version: '1.0.0' },
  }, undefined, undefined, 5000);  // 5s timeout
  
  if (!initResult.success) {
    // Fallback to stateless mode if server doesn't support initialize
    if (initResult.error.message.includes('Unknown method')) {
      logger.warn({ event: 'mcp.init.fallback_stateless', serverName: this.serverName });
      this.isStateless = true;
      this.sessionState = SessionState.CONNECTED;
      return;
    }
    this.sessionState = SessionState.FAILED;
    throw new Error(initResult.error.message);
  }
  
  // Store negotiated version from server
  // Note: If server returns older version, downgrade to server's version.
  // If server returns newer version, log warning and use our requested version.
  const serverVersion = initResult.data.protocolVersion;
  if (serverVersion && serverVersion !== this.requestedVersion) {
    logger.warn({ event: 'mcp.init.version_mismatch', serverName: this.serverName, requested: this.requestedVersion, server: serverVersion });
  }
  this.negotiatedVersion = serverVersion ?? this.requestedVersion;
  
  // 2. Send initialized notification (one-way, no response body expected)
  const notifyResult = await this.sendNotification('notifications/initialized');
  if (!notifyResult.success) {
    this.sessionState = SessionState.FAILED;
    throw new Error(notifyResult.error.message);
  }
  
  this.sessionState = SessionState.CONNECTED;
  this.sessionEstablishedAt = new Date();
}

// One-way notification - no id field, only check status, no body parsing
// Returns ToolResult<void> per project-context.md: "Never throw from tool handlers"
private async sendNotification(method: string): Promise<ToolResult<void>> {
  try {
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method }),  // No 'id' field
    });
    
    if (!response.ok && response.status !== 202) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: `Notification failed: ${response.status}`,
          retryable: response.status >= 500,
        },
      };
    }
    return { success: true, data: undefined };
  } catch (e) {
    return {
      success: false,
      error: {
        code: 'TOOL_UNAVAILABLE',
        message: e instanceof Error ? e.message : String(e),
        retryable: true,
      },
    };
  }
}
```

### Scope / Boundaries

- **This story owns**: MCP lifecycle handshake, session state machine, 404 recovery semantics, and correct retryability classification for the global tool execution retry wrapper
- **Story 3.1 owns**: Basic MCP client, session ID capture/send (already works)
- **Story 3.2 owns**: Multi-server discovery, client caching

### File Changes (target state)

| Action | Path |
|--------|------|
| Modified | `src/tools/mcp/client.ts` — Add `ensureInitialized()`, `sendNotification()`, state machine, protocol header, updated 404 recovery + stateless fallback |
| Modified | `src/tools/mcp/client.test.ts` — Add lifecycle tests, update existing session mocks |
| Modified | `src/tools/mcp/types.ts` — Add `SessionState`, `InitializeResult`, update `McpClientState` |

### Pre-Deployment Checklist

Before deploying this change:

1. **Test Exa with `initialize` request manually:**
   ```bash
   curl -X POST https://exa.mcp.example.com \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test"}}}'
   ```
   
2. **If Exa rejects `initialize`:**
   - The fallback (AC-L10) will activate automatically
   - Verify Exa tools still work in stateless mode
   
3. **Verify all three servers connect:**
   - `audience-manager`: Full handshake expected ✓
   - `msci-reports`: Full handshake expected ✓
   - `exa`: Stateless fallback acceptable ✓

## References

- [MCP Specification 2025-06-18 - Lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- [MCP Specification 2025-06-18 - Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- `docs/mcp-enterprise-upgrade-proposal.md` — Original analysis by Dev Agent

## Dev Agent Record

### Implementation Plan
Implemented MCP lifecycle handshake per specification 2025-06-18. Added `SessionState` enum and state machine to track initialization state. Implemented mutex pattern for concurrent initialization. Created `McpInitError` class to preserve retryability through throw/catch.

### Completion Notes
- Task 1-5: All implemented and tested
- Task 6 (Graceful Shutdown): Deferred per P2 priority
- Task 7: All tests pass (31 tests in client.test.ts, 145 tests in src/tools/)
- Added `setupMockWithInit()` test helper for handling init flow in mocks
- Pre-existing memory module test failures (gray-matter dep) unrelated to this story

### Code Review Fixes (2026-01-02)
- Fixed stateless fallback detection (AC-L10): require init failure to be HTTP 400/404/405 and match "unknown method" / "not supported" (avoid false positives on plain `HTTP 404: Not Found`)
- Fixed init mutex cleanup (AC-L6): `ensureInitialized()` now only clears `initializationPromise` if it still owns the promise (prevents clobbering a newer in-flight init)
- Added best-effort `traceId` propagation to MCP init + manager logs when available (per `_bmad-output/project-context.md`)
- Improved non-OK `sendRequest()` error messages to include response body text when available
- Tests updated/added:
  - Added regression test for init mutex cleanup
  - Added test to ensure no stateless fallback on init HTTP 500 even if body contains "not supported"
  - Fixed init invalid JSON test header mock to avoid treating `content-type` as session id
  - Verified passing: `pnpm test -- src/tools/mcp/client.test.ts src/tools/mcp/manager.test.ts src/tools/mcp/discovery.test.ts` (51 tests)

## File List

| Action | Path |
|--------|------|
| Modified | `src/tools/mcp/client.ts` — Added `ensureInitialized()`, `sendInitRequest()`, `sendNotification()`, `resetAndReinitialize()`, state machine, protocol header, stateless fallback, 404 recovery |
| Modified | `src/tools/mcp/types.ts` — Added `SessionState` enum, `McpInitializeResult` interface, updated `McpClientState` with session fields, fixed `McpJsonRpcRequest.id` to be optional for notifications |
| Modified | `src/tools/mcp/client.test.ts` — Added 10+ lifecycle tests, updated existing mocks to handle init flow |
| Modified | `src/tools/mcp/manager.ts` — Added optional `traceId` propagation for manager logs |
| Modified | `src/tools/mcp/discovery.ts` — Pass `traceId` into `McpClientManager.getClient()` for consistent logging |
| Modified | `src/tools/registry.ts` — Removed redundant validation from `parseMcpToolName()`, registry is now single source of truth |
| Modified | `src/tools/router.ts` — Refactored to use `getMcpTool()` instead of parsing + re-validating |
| Modified | `src/tools/router.test.ts` — Updated tests to register MCP tools before execution (matches real discovery flow) |

## Change Log

| Date | Change |
|------|--------|
| 2026-01-02 | Story created via Sprint Change Proposal (Course Correction) |
| 2026-01-02 | **Architect + PM Review:** Added AC-L10 (stateless fallback), 5s init timeout, `sendNotification()` spec, `negotiatedVersion`, updated `McpClientState` type, pre-deployment checklist, test mock update notes |
| 2026-01-02 | **SM Validation Review:** (1) Fixed `sendNotification()` to return `ToolResult<void>` per project-context anti-pattern; (2) Specified AC-L10 detection criteria (HTTP 400/404/405 + message patterns); (3) Added version mismatch handling for `negotiatedVersion`; (4) Clarified retries are enforced at tool execution wrapper layer (avoid double retry); (5) Added Exa-specific note to AC-L10; (6) Added consumer impact note for `McpClientState` type change |
| 2026-01-02 | **Dev Implementation:** Completed Tasks 1-5, 7. Task 6 (graceful shutdown) deferred. All 31 lifecycle tests pass. |
| 2026-01-02 | **Bugfix (Testing):** Fixed MCP tool routing — `parseMcpToolName` in `registry.ts` was re-validating server names at execution time, rejecting hyphens (e.g., `audience-manager`). Refactored router to use registry as single source of truth: if a tool is registered, it's valid. Removed redundant validation from `parseMcpToolName`. Router now uses `getMcpTool()` directly instead of parsing + re-validating. |

