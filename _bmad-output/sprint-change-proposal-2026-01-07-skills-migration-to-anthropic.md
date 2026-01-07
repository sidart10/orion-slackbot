# Sprint Change Proposal: Skills Migration to Anthropic Container

**Status:** ✅ Approved
**Date:** 2026-01-07
**Author:** John (PM Agent) + Sid
**Triggered By:** Story 6.3 (Anthropic Managed PTC) insights
**Workflow:** Course Correction (correct-course)
**Change Scope:** Moderate — 12 new stories, ~8.5 days effort

---

## Executive Summary

During Story 6.3 implementation, we discovered that Anthropic's code execution container supports **both** Skills AND Programmatic Tool Calling (PTC) in the same environment. Skills uploaded to Anthropic can call MCP tools via `allowed_callers` — they don't need arbitrary network access because Anthropic routes the tool calls.

This insight invalidates the core assumption behind ADR-2026-01-03 (GKE Agent Sandbox) and simplifies our architecture significantly.

**Decision:** Archive Stories 6.2-6.3, create 12 new stories (6.2-6.13) to adopt Anthropic Skills API + Files API, demote GKE sandbox to edge-case-only.

---

## Section 1: Trigger and Context

### 1.1 Triggering Story

**Story 6.3 (Anthropic Managed PTC)** — Status: Done

During PTC implementation, discovered that Anthropic's code execution container supports both Skills AND MCP tools accessible via `allowed_callers`.

### 1.2 Core Problem

**Issue Type:** Technical insight discovered during implementation

**Problem Statement:**

ADR-2026-01-03 adopted GKE Agent Sandbox because "Anthropic's container has NO network access." This was correct for **arbitrary HTTP calls**, but incomplete:

> **MCP tools ARE accessible via `allowed_callers` because Anthropic routes them — they don't traverse the network from inside the container.**

This means:
- Most Skills DON'T need GKE sandbox — they can run in Anthropic's container
- GKE sandbox infrastructure is over-engineering for most use cases
- Story 6-2's full K8s lifecycle adds ~1.8s latency for something Anthropic handles natively

### 1.3 Supporting Evidence

#### Skills Inventory (Audited)

| Skill | Can Migrate? | Reason | Action |
|-------|--------------|--------|--------|
| **xlsx** | ✅ Yes | Anthropic has built-in | **Use Anthropic's** |
| **pdf** | ✅ Yes | Anthropic has built-in | **Use Anthropic's** |
| **docx** | ✅ Yes | Anthropic has built-in | **Use Anthropic's** |
| **summarize** | ⚠️ Partial | Needs Slack API — use Rube MCP | **Migrate if using Rube MCP** |
| **example** | ✅ Yes | Pure demonstration | **Migrate (or drop)** |
| **algorithmic-art** | ✅ Yes | Pure p5.js computation | **Migrate** |
| **skill-creator** | ✅ Yes | Documentation + scripts | **Migrate** |
| **frontend-design** | ✅ Yes | Pure code generation | **Migrate** |
| **mcp-builder** | ✅ Yes | Documentation + code gen | **Migrate** |
| **d3js-visualization** | ✅ Yes | Pure D3.js computation | **Migrate** |
| **webapp-testing** | ❌ No | Needs Playwright + local servers | **Keep in GKE** |
| **web-artifacts-builder** | ❌ No | Needs local filesystem | **Keep in GKE** |

**Summary:**
- **3 Skills** → Use Anthropic's built-in versions (xlsx, pdf, docx)
- **7 Skills** → Can migrate to Anthropic container
- **2 Skills** → Must stay in GKE sandbox

---

## Section 2: Epic Impact Assessment

### 2.1 Current Epic (Epic 6) Evaluation

**Can Epic 6 be completed as originally planned?** No — over-engineered.

| What We Built | What We Actually Need |
|--------------|----------------------|
| `src/skills/prompt-builder.ts` | ❌ DELETE — Anthropic does this |
| `src/skills/loader.ts` | ❌ DELETE — Skills live on Anthropic |
| `src/skills/runtime.ts` | ❌ DELETE — Anthropic handles this |
| GKE sandbox (~$70-150/mo) | ⚠️ KEEP for edge cases only |

### 2.2 Required Epic-Level Changes

**Epic 6 Scope Modification:**

**OLD Scope:**
- Load Skills from .skills/ directory
- Inject hints into system prompt (progressive disclosure)
- Execute code in GKE Agent Sandbox

**NEW Scope:**
- Upload custom Skills to Anthropic via Skills API
- Use Anthropic built-in Skills (xlsx, pdf, docx)
- Pass skill_ids in container parameter
- GKE sandbox for edge cases only

### 2.3-2.5 Other Epics

| Epic | Impact |
|------|--------|
| Epics 1-5, 7-8 | No impact |

No epic reordering needed.

---

## Section 3: Artifact Conflict Analysis

### 3.1 PRD Conflicts

| PRD Section | Change Needed |
|-------------|---------------|
| FR20 | Change "GKE Agent Sandbox" → "Anthropic container (primary) + GKE (edge cases)" |
| FR24 | Change ".skills/ directory" → "Skills uploaded to Anthropic via Skills API" |

### 3.2 Architecture Conflicts

**ADR-2026-01-03 needs update:**
- Clarify MCP tools accessible via `allowed_callers`
- Demote GKE to edge cases
- Update architecture diagram

### 3.3 UI/UX

N/A — Backend infrastructure only.

### 3.4 Other Artifacts

| Artifact | Change |
|----------|--------|
| IaC | Document GKE as optional |
| CI/CD | Add skill upload step |
| Code | Delete ~6 files, create ~2 files |

---

## Section 4: Path Forward Evaluation

### Options Evaluated

| Option | Verdict | Effort | Risk |
|--------|---------|--------|------|
| **Option 1: Direct Adjustment** | ✅ **RECOMMENDED** | Low (~2-3 days) | Low |
| **Option 2: Rollback** | ❌ Not viable | Medium | Medium |
| **Option 3: MVP Review** | N/A | — | — |

### Recommended Path: Direct Adjustment

Add **Story 6.4: Migrate Skills to Anthropic Container**

**Rationale:**
- Lowest effort (~2-3 days)
- Lowest risk (Anthropic Skills API documented, PTC proven)
- Simplifies architecture
- Reduces operational cost
- Improves local dev experience

---

## Section 5: Implementation Plan

### Story Breakdown (12 Stories)

**Phase 1: API Integration Foundation (~4 days)**

| Story | Title | Scope | Effort |
|-------|-------|-------|--------|
| 6.2 | Skills API Client | Create `src/services/skills-api.ts` — upload, list, retrieve | 1 day |
| 6.3 | Skills Container Config | Add `container: { skills: [...] }`, track `container.id` | 0.5 day |
| 6.4 | Skill Registry Service | Create `.orion/skills.yaml` + `src/services/skill-registry.ts` | 0.5 day |
| 6.5 | Files API Client | Create `src/services/files-api.ts` — upload, download, delete | 1 day |
| 6.6 | Files API Slack Integration | Extract file_ids, download, upload to Slack | 1 day |

**Phase 2: PTC & Skill Migration (~3.5 days)**

| Story | Title | Scope | Effort |
|-------|-------|-------|--------|
| 6.7 | PTC Core | Add `code_execution` tool + `allowed_callers`, handle responses | 1 day |
| 6.8 | PTC Observability | Langfuse metrics, streaming UX | 0.5 day |
| 6.9 | Upload Custom Skills Script | Create `scripts/upload-skills.ts` | 0.5 day |
| 6.10 | Skill Migration & Testing | Configure built-ins, update registry, test each skill | 1 day |
| 6.11 | Prompt Builder Cleanup | Remove `orion_sandbox({ skill_doc })` hint | 0.5 day |

**Phase 3: Cleanup (~1 day)**

| Story | Title | Scope | Effort |
|-------|-------|-------|--------|
| 6.12 | GKE Sandbox Scope Reduction | Keep for webapp-testing + web-artifacts-builder only | 0.5 day |
| 6.13 | Documentation Update | Update architecture.md, README, operational docs | 0.5 day |

**Total Estimate:** ~8.5 days

### Archived Stories

| Story | Status | Reason |
|-------|--------|--------|
| 6.2 (old) | Archived | GKE sandbox implemented, now fallback only → replaced by 6.12 |
| 6.3 (old) | Archived | Never started, absorbed into 6.7/6.8 with expanded scope |

### New Project Structure

**New files:**
```
src/services/
├── skills-api.ts              # Skills API client
├── skills-api.test.ts
├── files-api.ts               # Files API client
├── files-api.test.ts
├── skill-registry.ts          # Map skill names → skill_ids
└── skill-registry.test.ts

src/tools/
├── code-execution/            # Anthropic PTC (primary)
└── gke-sandbox/               # GKE fallback (edge cases)

.orion/skills.yaml             # Skill ID configuration
scripts/upload-skills.ts       # CI/CD skill upload
```

### Beta Headers Required

```typescript
betas: [
  'code-execution-2025-08-25',   // PTC code_execution tool
  'skills-2025-10-02',           // Skills API + container.skills
  'files-api-2025-04-14',        // Files API upload/download
]
```

---

## Section 6: Handoff Plan

### Change Scope: Moderate

Requires backlog reorganization (12 new stories) + implementation, but not fundamental replan.

### Responsibilities

| Role | Responsibility |
|------|---------------|
| **PM** | Approve this proposal ✅ |
| **Architect** | Update ADR, add new ADR for Skills + Files API |
| **Dev Team** | Implement Stories 6.2-6.13 |
| **SM** | Update sprint backlog, track phases |

### Success Criteria

- [ ] Skills API client working (upload, list, retrieve)
- [ ] Files API client working (download, upload to Slack)
- [ ] PTC with `allowed_callers` calling MCP tools
- [ ] 10 skills migrated to Anthropic (3 built-in + 7 custom)
- [ ] GKE retained for webapp-testing, web-artifacts-builder
- [ ] Container reuse working across conversation turns
- [ ] Local dev works without port-forward (for migrated skills)
- [ ] Architecture, PRD, Epics updated

### Artifact Changes Summary

| Artifact | Changes |
|----------|---------|
| `epics.md` | Epic 6 description, stories table (13 stories), summary |
| `prd.md` | FR20-22 update, course correction note |
| `architecture.md` | New ADR, project structure, beta headers, course correction |
| `stories/archived/` | Archive 6.2, 6.3 (old) |

---

## Approval

**Proposal Status:** ✅ Approved

| Approver | Status | Date |
|----------|--------|------|
| PM (John) | ✅ Approved | 2026-01-07 |
| User (Sid) | ✅ Approved | 2026-01-07 |

---

## Next Steps

1. [ ] Apply all 12 change proposals to artifacts (PRD, Architecture, Epics)
2. [ ] Archive stories 6.2 and 6.3 (old numbering)
3. [ ] Create story files for 6.2-6.13 (new numbering)
4. [ ] Begin Phase 1 implementation (Stories 6.2-6.6)

---

## References

- Tech Spec: `_bmad-output/tech-spec-skills-migration-to-anthropic-container.md`
- Architecture: `_bmad-output/architecture.md`
- PRD: `_bmad-output/prd.md`
- Epics: `_bmad-output/epics.md`
- Anthropic Skills API Docs: `docs/anthropic-sdk/using-skills-with-api.md`
- Anthropic Files API Docs: https://docs.anthropic.com/claude/docs/files-api
