# Sprint Change Proposal: MCP Session Lifecycle Compliance

**Date:** 2026-01-02  
**Author:** PM Agent (Course Correction Workflow)  
**Priority:** P0 (Blocks Samba MCP servers)  
**Status:** Approved

---

## Executive Summary

The MCP client implementation violates the MCP specification by skipping the mandatory `initialize` → `notifications/initialized` handshake. Stateful MCP servers (Samba `audience-manager`, `msci-reports`) reject requests, breaking core MCP integration. This proposal adds Story 3.5 to implement spec-compliant lifecycle.

---

## Problem Statement

Story 3.1 marked session management "complete" but the implementation only captures session IDs from response headers — it does NOT perform the mandatory initialization handshake required by MCP specification 2025-06-18.

**Symptoms:**
- Stateful servers return "Invalid request parameters" 
- Session ID never established (only received on `InitializeResult`, not on `tools/list`)

**Root Cause:**
- Missing `initialize` request as first interaction
- Missing `notifications/initialized` notification
- Missing `MCP-Protocol-Version` header

**Evidence:**
- MCP Spec (2025-06-18): "Initialization MUST be the first interaction"
- `docs/mcp-enterprise-upgrade-proposal.md` by Dev Agent Amelia
- Test gap: mocks return session ID on `tools/list` (unrealistic)

---

## Proposed Changes

### New Story

| Story | Title | Priority | Effort |
|-------|-------|----------|--------|
| 3.5 | MCP Session Lifecycle | P0 | ~10h |

### Epic Impact

| Element | Before | After |
|---------|--------|-------|
| Epic 3 Status | done | in-progress |
| Epic 3 Stories | 4 (3.1-3.4) | 5 (3.1-3.5) |

### Architecture Update

ADR-2025-12-31 updated to reflect full MCP lifecycle requirements.

---

## Scope of Work

### P0 — Required for Samba Servers

| Item | Effort |
|------|--------|
| `initialize` request + `notifications/initialized` | 4h |
| Session state machine (DISCONNECTED → INITIALIZING → CONNECTED) | 2h |
| `MCP-Protocol-Version` header on all requests | 30m |
| Fix 404 recovery to re-handshake | 1h |

### P1 — High Value

| Item | Effort |
|------|--------|
| Retry with exponential backoff | 2h |

### P2 — Nice-to-Have (Defer)

| Item | Effort |
|------|--------|
| Graceful shutdown (HTTP DELETE) | 1h |

**Total Effort:** ~10 hours

---

## MVP Impact

✅ **No change to MVP scope.** This fix enables existing MCP requirements (FR26, FR27, NFR17, NFR18).

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Exa rejects `initialize` | Low | Test before deploy; add config flag if needed |
| Breaking existing tests | Medium | Update mocks as part of implementation |
| Over-engineering | Low | Strict P0/P1 prioritization |

---

## Handoff

| Role | Action |
|------|--------|
| **SM** | Story 3.5 created, sprint-status updated |
| **Dev** | Implement per Story 3.5 ACs |
| **Architect** | ADR updated (done) |

---

## Approval

- **Approved By:** Sid (User)
- **Approval Date:** 2026-01-02

---

## Files Changed

| File | Change |
|------|--------|
| `_bmad-output/implementation-artifacts/stories/3-5-mcp-session-lifecycle.md` | Created |
| `_bmad-output/sprint-status.yaml` | Epic 3 reopened, Story 3.5 added |
| `_bmad-output/architecture.md` | ADR-2025-12-31 updated |
| `_bmad-output/epics.md` | Story 3.5 added to Epic 3 |

---

## References

- `docs/mcp-enterprise-upgrade-proposal.md` — Original analysis
- [MCP Specification 2025-06-18 - Lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- [MCP Specification 2025-06-18 - Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

