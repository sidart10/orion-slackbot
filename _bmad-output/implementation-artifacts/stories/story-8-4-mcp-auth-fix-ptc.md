# Story 8.4: MCP Auth Fix for PTC Integration

Status: done

<!-- Note: This story was implemented prior to story file creation. Story file created retroactively for documentation. -->

## Story

As a developer building skills that call MCP tools,
I want MCP authentication to work correctly via Programmatic Tool Calling (PTC),
so that skills can successfully invoke MCP tools regardless of their authentication type.

## Acceptance Criteria

1. **AC1:** MCP servers configured with `headers: {}` (no auth) successfully execute via PTC
   - Tools like `exa_search` work when called from within code execution container
   - Empty auth context is properly passed through `allowed_callers`

2. **AC2:** MCP servers with `authType: gcp_identity` successfully execute via PTC
   - GCP Identity token is retrieved and forwarded through `allowed_callers`
   - `audience-manager` and `msci-reports` tools work from code execution

3. **AC3:** Existing Bearer token auth (like Rube) continues to work via PTC
   - No regression in tools that were already working

4. **AC4:** Error messages for auth failures are clear and actionable
   - Failed auth attempts logged with specific error context
   - Langfuse traces include auth-related events

## Tasks / Subtasks

- [x] Task 1: Fix no-auth MCP servers (AC: #1)
  - [x] Subtask 1.1: Update `allowed_callers` generation to handle empty headers
  - [x] Subtask 1.2: Ensure `auth_context: {}` is explicitly passed for no-auth tools
  - [x] Subtask 1.3: Test `exa` MCP server via PTC

- [x] Task 2: Fix GCP Identity auth for MCP servers (AC: #2)
  - [x] Subtask 2.1: Implement GCP Identity token retrieval in PTC context
  - [x] Subtask 2.2: Pass identity token via `allowed_callers.auth_context.token`
  - [x] Subtask 2.3: Test `audience-manager` via PTC
  - [x] Subtask 2.4: Test `msci-reports` via PTC

- [x] Task 3: Verify Bearer token regression (AC: #3)
  - [x] Subtask 3.1: Test Rube MCP server via PTC
  - [x] Subtask 3.2: Confirm existing functionality unchanged

- [x] Task 4: Add observability (AC: #4)
  - [x] Subtask 4.1: Log auth type used for each MCP call
  - [x] Subtask 4.2: Add Langfuse events for auth-related operations

## Dev Notes

### Root Cause Analysis

The issue was that MCP tools invoked via PTC (`allowed_callers`) were failing due to improper auth context propagation:

1. **No-Auth Bug:** Tools configured with `headers: {}` in MCP server config were failing because empty auth wasn't being explicitly handled. The fix ensures `auth_context: {}` is explicitly passed.

2. **GCP Identity Bug:** Tools requiring GCP Identity tokens (`authType: gcp_identity`) weren't receiving the token because PTC auth context requires explicit bearer token format, not the identity token pattern used in direct MCP calls.

### Fix Pattern

```typescript
// Before (broken for no-auth)
allowed_callers: [{ tool_name: 'exa_search' }]

// After (fixed - explicit empty auth)
allowed_callers: [{
  tool_name: 'exa_search',
  auth_context: {},  // Explicit empty auth
}]

// For GCP Identity auth
allowed_callers: [{
  tool_name: 'audience_manager_search',
  auth_context: {
    type: 'bearer',
    token: await getGcpIdentityToken(),
  },
}]
```

### Affected MCP Servers

| Server | Auth Type | Status |
|--------|-----------|--------|
| `audience-manager` | GCP Identity | Fixed |
| `msci-reports` | GCP Identity | Fixed |
| `exa` | No auth | Fixed |
| `rube` | Bearer token | No change needed |

### Project Structure Notes

- Auth context building: `src/skills/container-builder.ts`
- MCP config: `src/tools/mcp/servers.ts`
- GCP token retrieval: Uses `google-auth-library` for identity tokens

### References

- [Source: _bmad-output/architecture.md#Epic 8 Repurposed: Anthropic API Enhancements]
- [Source: _bmad-output/epics.md#8.4 MCP Auth Fix for PTC Integration]
- [Source: project-context.md#PTC & Skills API]
- [Source: sprint-change-proposal-2025-01-09.md]

## Dev Agent Record

### Agent Model Used

claude-opus-4-20250514

### Debug Log References

- Cloud Run logs: MCP auth failures before fix
- Langfuse traces: tool.mcp.auth events

### Completion Notes List

- Story implemented as part of Epic 8 sprint (2026-01-09 to 2026-01-11)
- No separate story file was created during implementation
- Story file created retroactively 2026-01-12 for documentation completeness
- All acceptance criteria verified working in production

### File List

- `src/skills/container-builder.ts` - Updated to handle auth types
- `src/tools/mcp/servers.ts` - MCP server configurations
- `src/tools/mcp/auth.ts` - Auth context helpers
