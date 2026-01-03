# Sprint Change Proposal: Course Correction Review (2025-12-31)

**Date:** 2025-12-31  
**Author:** PM Agent (John) — Course Correction Workflow  
**Status:** Approved (Batch Mode)  
**Triggered By:** Multiple sprint changes + code review findings

---

## Executive Summary

This course correction validates two pending sprint change proposals and confirms Story 2.8 code review issues have been resolved. The sprint is on track with minor artifact updates needed.

| Change | Status | Impact |
|--------|--------|--------|
| Epic 4 Removal | ✅ APPROVED | -3 stories, saves ~3 dev days |
| Epic 3 MCP Session Fix | ✅ APPROVED | 2 days work, Stories 3.1/3.2 reopened |
| Story 2.8 Code Review | ✅ FIXED | HIGH issues already addressed |
| Story 2.9 Created | ✅ DONE | New robustness story for streaming |

**Net Impact:** MVP scope unchanged. 2 days of new work (MCP sessions), 3 days saved (Epic 4 removal). Overall neutral-to-positive.

---

## 1. Issue Summary

### What Triggered This Review

1. **Epic 3 testing failure** — Samba MCPs return HTTP 400 "Missing session ID"
2. **Epic 4 questioned** — Subagent pattern over-engineered vs. native Claude `tool_use`
3. **Story 2.8 code review** — Found 2 HIGH, 3 MEDIUM issues
4. **Story 2.9 created** — Streaming `input_json_delta` robustness fix

### Discovery Context

During implementation planning review before transitioning from Epic 2 (complete) to Epic 3 work, multiple architectural concerns surfaced simultaneously.

---

## 2. Impact Analysis

### Epic Impact

| Epic | Current Status | Action | Notes |
|------|---------------|--------|-------|
| Epic 2 | `done` | No change | All stories complete, retro optional |
| Epic 3 | `done` → `in-progress` | **Reopen** | Session management gap |
| Epic 4 | `backlog` → `removed` | **Remove** | Over-engineering |
| Epic 5-7 | `backlog` | No change | No dependencies on Epic 3/4 |

### Story Impact

| Story | Current | New | Action |
|-------|---------|-----|--------|
| 2.8 | `done` | `done` | No change — code review fixes confirmed |
| 2.9 | N/A | `ready-for-dev` | **New story created** |
| 3.1 | `done` | `in-progress` | Reopen for session lifecycle |
| 3.2 | `done` | `in-progress` | Reopen for client caching |
| 3.4 | N/A | `ready-for-dev` | **New story:** Channel tool feedback |
| 4.1-4.3 | `ready-for-dev` | `removed` | Archive story files |

### Artifact Updates Required

| Artifact | Change |
|----------|--------|
| `sprint-status.yaml` | Update Epic 3 to `in-progress`, Epic 4 to removed |
| `epics.md` | Mark Epic 4 removed with rationale |
| `prd.md` | Reword FR3, FR4 (subagents → native pattern) |
| `architecture.md` | Add ADR for MCP SDK; remove subagent references |
| `project-context.md` | Add `@modelcontextprotocol/sdk` to dependencies |

---

## 3. Recommended Approach

### Selected Path: Direct Adjustment ✅

| Aspect | Decision |
|--------|----------|
| **Path** | Direct Adjustment |
| **Rationale** | Well-scoped changes, MVP intact |
| **Effort** | 2 days (MCP sessions) |
| **Savings** | 3 days (Epic 4 removal) |
| **Risk** | Low |

---

## 4. Detailed Change Proposals

### Change 1: Epic 4 Removal

**Proposal:** `sprint-change-proposal-2025-12-31-epic4-removal.md`

**Summary:**
- Remove Epic 4 entirely (Subagents & Parallel Execution)
- Claude's native `tool_use` with `Promise.all()` execution achieves the same result
- Saves ~2-3× token cost per deep research query
- Saves ~500 lines of code that would have been written

**PRD FR3 Change:**
```
OLD: System spawns subagents for parallel task execution with isolated context windows
NEW: System executes multiple tool calls in parallel when beneficial (via native Claude tool_use pattern)
```

**PRD FR4 Change:**
```
OLD: System aggregates only relevant results from subagents into the orchestrator response
NEW: System synthesizes results from multiple tool calls into coherent responses (handled by Claude natively)
```

**Action:** ✅ APPROVED

---

### Change 2: Epic 3 MCP Session Fix

**Proposal:** `sprint-change-proposal-2025-12-31.md`

**Summary:**
- Adopt `@modelcontextprotocol/sdk` v1.25.1 for proper session management
- Create `McpClientManager` singleton for client caching
- Stories 3.1, 3.2 get additional acceptance criteria

**Implementation:**
- Phase 1 (Day 1): Add SDK dependency, create McpClientManager
- Phase 2 (Day 2): Session lifecycle tests, integration verification
- Phase 3 (Day 2): Documentation updates, delete custom client

**New Story 3.4:** Channel @Mention Tool Feedback (P2)
- Update `app-mention.ts` to show dynamic tool status during execution

**Action:** ✅ APPROVED

---

### Change 3: Story 2.8 Code Review Resolution

**Original Findings:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | AC#3 violation — Not using `createStreamer()` | HIGH |
| 2 | Sources block uses `s.reference` instead of `s.title` | HIGH |
| 3-5 | Missing tests (feedback, error path, sources) | MEDIUM |
| 6 | Story claims 14 tests but 15 exist | LOW |

**Current Status:** ✅ HIGH ISSUES FIXED

Verification from current `app-mention.ts`:
- Lines 123-131: Uses `createStreamer()` correctly ✅
- Lines 268-273: Uses `s.title` and `s.url` correctly ✅

**Action:** Story remains `done`. MEDIUM test gaps are acceptable technical debt.

---

### Change 4: Story 2.9 Creation

**Story:** `2-9-streaming-input-accumulation.md`

**Purpose:** Fix streaming tool input accumulation when Claude streams large tool arguments via `input_json_delta` events.

**Status:** `ready-for-dev`  
**Priority:** P1 (robustness)  
**Effort:** ~4 hours

**Action:** ✅ Already created, no further action needed

---

## 5. Implementation Handoff

### Change Scope: Minor

- Epic 4 removal: Documentation only
- Epic 3 fix: 2 days focused development
- Story 2.8: No action (already fixed)
- Story 2.9: Ready for dev when prioritized

### Handoff Assignments

| Role | Responsibility |
|------|---------------|
| **PM** | Update PRD with FR3/FR4 rewording ✅ |
| **Architect** | Update architecture.md (MCP SDK ADR, remove subagent refs) |
| **SM** | Update sprint-status.yaml, archive Epic 4 stories |
| **Dev** | Implement Story 3.1/3.2 updates (MCP sessions) |

### Success Criteria

- [ ] Epic 4 marked as removed in epics.md
- [ ] FR3, FR4 reworded in PRD
- [ ] Epic 3 set to `in-progress` in sprint-status.yaml
- [ ] Architecture document updated with MCP SDK ADR
- [ ] Story 3.4 created (Channel Tool Feedback)
- [ ] MCP session tests pass
- [ ] Samba MCPs return tool results (not HTTP 400)

---

## 6. Summary

| Metric | Value |
|--------|-------|
| **Stories removed** | 3 (Epic 4) |
| **Stories added** | 2 (2.9, 3.4) |
| **Stories reopened** | 2 (3.1, 3.2) |
| **Development days saved** | ~3 (Epic 4) |
| **Development days added** | ~2 (MCP sessions) |
| **Net impact** | ~1 day saved |
| **MVP scope** | Unchanged |
| **Functionality lost** | None |

---

## Approval

**Batch Approval:** ✅ All changes approved

| Proposal | Status |
|----------|--------|
| Epic 4 Removal | ✅ Approved |
| Epic 3 MCP Session Fix | ✅ Approved |
| Story 2.8 Code Review | ✅ Resolved |
| Story 2.9 Creation | ✅ Approved |

**Approver:** Sid  
**Date:** 2025-12-31

---

*Generated by Course Correction Workflow — 2025-12-31*

