# Sprint Change Proposal: MCP Session Management

**Date:** 2025-12-31
**Author:** PM Agent (Course Correction Workflow)
**Status:** Pending Approval
**Triggered By:** Epic 3 Stories 3.1-3.3 testing failure with session-based MCP servers
**Related Proposal:** `sprint-change-proposal-2025-12-31-epic4-removal.md` (should be approved together)

---

## Executive Summary

Epic 3 (MCP & Tool Connectivity) is marked as "done" but has a critical implementation gap: **MCP session management is not implemented**. This prevents tool calling from working with session-based MCP servers (Samba internal MCPs). The fix requires adopting the official `@modelcontextprotocol/sdk` package and implementing a client manager for session lifecycle.

**Impact:** 2 days of focused work. No MVP scope reduction needed.

---

## ⚠️ Adversarial Review Response

This proposal has been reviewed for gaps. Clarifications:

| Issue Raised | Response |
|--------------|----------|
| Story 2.8 is Epic 2, not Epic 3 | **Removed from this proposal.** Tool feedback UX will be a separate Story 3.4 |
| `input_json_delta` unexplained | **Removed from scope.** Not related to MCP sessions; tracked separately |
| PRD subagent language | Architecture.md already updated; PRD update in Epic 4 removal proposal |
| Missing project-context.md update | **Added to action plan** |
| Stories marked done with gaps | **Added changelog entry** for Story 3.1 |
| ACs not written | **ACs written below** |
| Test plan vague | **Specific test cases added** |

---

## Problem Statement

### What's Broken

1. **Session-based MCP servers fail** — Return HTTP 400 "Missing session ID"
2. **New `McpClient` created per call** — No session persistence
3. **Protocol non-compliance** — Missing `mcp-session-id` header exchange
4. **Channel @mentions lack tool feedback** — User sees only "_Thinking..._"

### Evidence

- HTTP 400 from Samba MCPs: "Missing session ID"
- Sessionless servers (Exa) work correctly
- Documented in `docs/mcp-config-implementation-2025-12-31.md`

### Root Cause

The custom `McpClient` implements HTTP Streamable Transport for request/response, but:
- Does not send `initialize` request to establish session
- Does not capture `mcp-session-id` from response headers
- Does not send session ID on subsequent requests
- Creates new client instance per tool call (no reuse)

---

## Solution

### Recommended Approach: Adopt Official MCP SDK

Use `@modelcontextprotocol/sdk` v1.25.1 which provides:
- `StreamableHTTPClientTransport` — Full session lifecycle management
- `Client` class — Protocol-compliant request/response handling
- Built-in reconnection, backoff, auth, SSE parsing

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    McpClientManager                          │
│  - Singleton per process                                     │
│  - Caches SDK Client instances per server                   │
│  - Lazy initialization on first call                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ exa Client   │  │ samba Client │  │ other Client │       │
│  │ (SDK)        │  │ (SDK)        │  │ (SDK)        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Tool Registry   │
                    │  (existing)      │
                    └──────────────────┘
```

### GCP Cloud Run Compatibility

| Concern | Mitigation |
|---------|------------|
| Stateless containers | Each container gets its own session (OK for MCP) |
| Cold starts | Lazy init on first call |
| Container restarts | Re-initialize session automatically |
| Concurrency | Mutex/lock for session init |

**No Redis needed** — MCP sessions are server-side state; each container can have independent sessions.

---

## Action Plan

### Phase 1: Core Fix (P0) — Day 1

| Task | File | Effort |
|------|------|--------|
| Add `@modelcontextprotocol/sdk` dependency | `package.json` | 5 min |
| Update `project-context.md` with new dependency | `_bmad-output/project-context.md` | 5 min |
| Create `McpClientManager` singleton | `src/tools/mcp/manager.ts` | 2 hrs |
| Wrap SDK Client + Transport | `src/tools/mcp/manager.ts` | 3 hrs |
| Update router to use cached clients | `src/tools/router.ts` | 1 hr |
| Update discovery to reuse clients | `src/tools/mcp/discovery.ts` | 1 hr |

### Phase 2: Testing (P1) — Day 2

| Task | File | Effort |
|------|------|--------|
| Add session lifecycle tests (see specific cases below) | `src/tools/mcp/manager.test.ts` | 3 hrs |
| Integration test with Samba MCPs | Manual verification | 1 hr |
| Update existing tests with new mocks | `src/tools/mcp/*.test.ts` | 1 hr |

### Phase 3: Documentation (P2) — Day 2

| Task | File | Effort |
|------|------|--------|
| Update architecture with ADR | `_bmad-output/architecture.md` | 30 min |
| Update Story 3.1 with changelog entry | `stories/3-1-generic-mcp-client.md` | 15 min |
| Update story acceptance criteria | Stories 3.1, 3.2 | 30 min |

**Total Effort: 2 days**

---

## Specific Test Cases (Session Lifecycle)

| Test | Scenario | Expected |
|------|----------|----------|
| `session_captured_from_first_response` | Make first request to MCP server | `mcp-session-id` header captured and stored |
| `session_reused_on_subsequent_requests` | Make 3 tool calls to same server | Same session ID sent in all 3 requests |
| `session_reestablished_on_404` | Server returns 404 "session not found" | Client re-initializes session and retries |
| `multiple_servers_independent_sessions` | Call tools on 2 different MCP servers | Each server has its own session ID |
| `concurrent_calls_same_session` | `Promise.all()` with 5 tool calls | All use same session, no race conditions |
| `cold_start_initializes_session` | First call after container restart | Session initialized successfully |

---

## Story 3.4: Channel Tool Feedback (New)

**Note:** Tool feedback UX for channel @mentions was identified during this analysis but is **out of scope** for this MCP session fix. It should be tracked as a separate story:

| Story | Title | Priority | Parent Epic |
|-------|-------|----------|-------------|
| 3.4 | Channel @Mention Tool Feedback | P2 | Epic 3 |

**Description:** Update `app-mention.ts` to show tool execution status (similar to `user-message.ts`) instead of static "_Thinking..._" message.

---

## Out of Scope (Tracked Separately)

| Item | Reason | Tracking |
|------|--------|----------|
| `input_json_delta` accumulation | Not related to MCP sessions; streaming enhancement | **Story 2.9 created** |
| Story 2.8 reopening | UX issue, not protocol compliance | Story 3.4 created instead |

---

## Epic & Story Impact

### Status Changes

| Epic/Story | Current | New | Notes |
|------------|---------|-----|-------|
| Epic 3 | `done` | `in-progress` | Session management missing |
| Story 3.1 | `done` | `in-progress` | Add session lifecycle |
| Story 3.2 | `done` | `in-progress` | Add client caching |
| Story 3.4 | N/A | `ready-for-dev` | **New:** Channel tool feedback (P2) |

### Artifact Updates Required

| Artifact | Change |
|----------|--------|
| `sprint-status.yaml` | Update Epic 3 to `in-progress` |
| `architecture.md` | Add ADR: "Adopt official MCP SDK for session management" |
| `project-context.md` | Add `@modelcontextprotocol/sdk` to Key Dependencies |
| Story 3.1 | Add AC + changelog (see below) |
| Story 3.2 | Add AC (see below) |

### Story 3.1 Changelog Entry (Required)

Add to `_bmad-output/implementation-artifacts/stories/3-1-generic-mcp-client.md`:

```markdown
## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2025-12-31 | Identified session management gap with Samba MCPs | Testing revealed HTTP 400 "Missing session ID" errors |
| 2025-12-31 | Adopting official `@modelcontextprotocol/sdk` | Session lifecycle handled by battle-tested SDK |

See: `sprint-change-proposal-2025-12-31.md`
```

### Story 3.1 New Acceptance Criteria

Add to Story 3.1:

```markdown
## Additional Acceptance Criteria (Added 2025-12-31)

- **AC-S1**: Client captures `mcp-session-id` header from initialize response
- **AC-S2**: Client sends `Mcp-Session-Id` header on all subsequent requests
- **AC-S3**: Session re-established automatically on HTTP 404 "session not found"
- **AC-S4**: Client logs session establishment with `traceId` for observability
```

### Story 3.2 New Acceptance Criteria

Add to Story 3.2:

```markdown
## Additional Acceptance Criteria (Added 2025-12-31)

- **AC-C1**: `McpClientManager` caches SDK Client per server (not per call)
- **AC-C2**: Multiple tool calls to same server reuse cached client
- **AC-C3**: Each MCP server maintains independent session
- **AC-C4**: Concurrent calls to same server do not race on session init
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SDK incompatibility | Low | Medium | SDK is well-documented; rollback to custom if needed |
| Performance regression | Low | Low | SDK is optimized; adds minimal overhead |
| Breaking existing tests | Medium | Low | Update mocks to match new patterns |
| Timeline slip | Low | Medium | Focused 2-day effort with clear scope |

---

## Answers to Pre-Approval Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Was the official SDK tested in Cloud Run? | Not yet. SDK is pure TS/JS with no native deps — should work. Validation in Phase 2. |
| 2 | Does SDK support bearer tokens? | Yes. `StreamableHTTPClientTransport` accepts custom headers including `Authorization: Bearer`. |
| 3 | Can we delete custom `McpClient`? | **Yes.** Once SDK wrapper is stable, delete `src/tools/mcp/client.ts` entirely. |
| 4 | Container scale-down session invalidation? | MCP sessions are server-side. New container = new session. SDK handles re-init automatically. |
| 5 | Is Epic 4 removal proposal approved? | **Pending.** Should be approved alongside this proposal. No conflicts — they're independent. |

---

## Success Criteria

| Criteria | Measurement |
|----------|-------------|
| Session-based MCPs work | Samba servers return tool results (not HTTP 400) |
| Session reuse | Same session ID across multiple tool calls (logged) |
| No regression | All existing tests pass (`npm test`) |
| New tests pass | 6 session lifecycle test cases pass |
| Documentation updated | Architecture ADR added, project-context.md updated |
| Custom client deleted | `src/tools/mcp/client.ts` removed after validation |

---

## Handoff Plan

| Role | Action |
|------|--------|
| **Sid (User)** | Approve this proposal + Epic 4 removal proposal |
| **Dev Agent** | Implement Phase 1-2 (MCP SDK + tests) |
| **SM Agent** | Update sprint artifacts + create Story 3.4 |
| **QA** | Verify with Samba MCPs |

---

## Approval

- [ ] **Approved** — Proceed with implementation
- [ ] **Approved with changes** — (specify changes)
- [ ] **Rejected** — (specify reason)

**Approver:** _______________
**Date:** _______________

---

## Appendix: Research Summary

### Official MCP SDK Session Handling

From `@modelcontextprotocol/sdk@1.25.1`:

```typescript
// Session storage
private _sessionId?: string;

// Header management
async _commonHeaders() {
  const headers = {};
  if (this._sessionId) {
    headers['mcp-session-id'] = this._sessionId;
  }
  return headers;
}

// Session capture from response
const sessionId = response.headers.get('mcp-session-id');
if (sessionId) {
  this._sessionId = sessionId;
}
```

### Current Implementation Gap

```typescript
// Our McpClient - MISSING session handling
private async sendRequest<T>(...) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  // ❌ No mcp-session-id header
  // ❌ No session ID storage
  // ❌ New client per call
}
```

---

*Generated by Course Correction Workflow — 2025-12-31*
*Updated after adversarial review — 2025-12-31*

