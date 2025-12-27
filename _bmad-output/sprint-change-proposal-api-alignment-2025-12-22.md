# Sprint Change Proposal: SDK to API Alignment

**Date:** 2025-12-22  
**Author:** PM Agent (John)  
**Status:** APPROVED  
**Scope:** Minor (Documentation alignment)

---

## 1. Issue Summary

### Problem Statement

Claude Agent SDK's built-in sandbox introduces unacceptable latency for agent startup and tool execution. Since Rube MCP server already provides sandbox capabilities (RUBE_REMOTE_WORKBENCH), multi-tool execution (RUBE_MULTI_EXECUTE_TOOL), and workflow orchestration, using raw Anthropic API with tool_use is both faster and architecturally cleaner.

### Discovery Context

- **When:** Pre-implementation (during Epic 2 planning)
- **How:** Performance testing of SDK sandbox revealed cold-start issues
- **Category:** Technical limitation discovered during implementation planning

### Evidence

- SDK sandbox slow to cold-start in serverless environment
- Rube already provides equivalent capabilities with better performance
- Cleaner architecture: agent loop in application code, tools via MCP
- No additional infrastructure needed — Rube handles sandbox

---

## 2. Impact Analysis

### Epic Impact

| Epic | Impact Level | Changes Required |
|------|--------------|------------------|
| Epic 2: Agent Core | MEDIUM | Story titles/content alignment. Agent loop owned by application code. |
| Epic 3: MCP Tools | LOW | Rube elevated to primary capability layer |
| Epic 4: Code Gen | HIGH | Sandbox via Rube RUBE_REMOTE_WORKBENCH, not SDK |
| Epics 5-9 | LOW | Terminology cleanup only |

### Artifact Conflicts

| Artifact | Status | Changes |
|----------|--------|---------|
| PRD | ❌ Not aligned | 5 references to "Claude Agent SDK" need updating |
| Architecture | ⚠️ Partially aligned | Minor terminology cleanup (AR14) |
| Epics | ⚠️ Partially aligned | Story 2.1 title, AR14, Story 4.2 references |
| Sprint Status | ❌ Mismatch | Story 2-1 naming inconsistent with file |
| Story 2-1 | ✅ Already correct | No changes needed |
| Story 4-2 | ⚠️ Needs updates | Tasks and dev notes reference SDK |

### MVP Impact

**None.** This is a *how* change, not a *what* change. MVP scope, features, and success criteria remain unchanged.

---

## 3. Recommended Approach

### Selected Path: Direct Adjustment (Option 1)

**Rationale:**
- This is a clean architectural pivot discovered before significant implementation
- Changes are documentation/terminology updates only
- No code rollback required
- No structural changes to epics or MVP scope

**Effort Estimate:** LOW  
**Risk Level:** LOW  
**Timeline Impact:** None

---

## 4. Detailed Change Proposals

### 4.1 PRD Updates (`_bmad-output/prd.md`)

| Location | Change |
|----------|--------|
| Line 25 | "Claude Agent SDK" → "Anthropic API with tool_use" |
| Line 53 | "Claude Agent SDK (TypeScript)" → "Anthropic API + MCP (Rube primary)" |
| Line 125 | "Claude Agent SDK `query()`" → "Anthropic API `messages.create()`" |
| Line 369 | "Claude Agent SDK built-in sandbox" → "Rube RUBE_REMOTE_WORKBENCH" |
| Line 377 | "initially Claude Agent SDK" → "Anthropic API" |

### 4.2 Architecture Updates (`_bmad-output/architecture.md`)

| Location | Change |
|----------|--------|
| AR14 reference | "after Claude SDK ready" → "on first tool call" |

### 4.3 Epics Updates (`_bmad-output/epics.md`)

| Location | Change |
|----------|--------|
| Story 2.1 title | "Claude Agent SDK Integration" → "Anthropic API Integration" |
| Story 2.1 AC | "`agent.query()`" → "`messages.create()`" |
| AR14 | "after Claude SDK ready" → "on first tool call" |
| AR16 | Add clarity: "replaces SDK sandbox" |
| Epic 2 description | Add "via Anthropic API with tool_use" |
| Story 4.2 AC | Already correct (references Rube) |

### 4.4 Sprint Status Updates (`_bmad-output/sprint-status.yaml`)

| Location | Change |
|----------|--------|
| Line 54 | `2-1-claude-agent-sdk-integration` → `2-1-anthropic-api-integration` |

### 4.5 Story 4-2 Updates (`stories/4-2-sandbox-environment-setup.md`)

| Location | Change |
|----------|--------|
| Task 1 | "Configure Claude SDK Sandbox" → "Configure Rube RUBE_REMOTE_WORKBENCH" |
| Dev Notes | Update code examples to show Rube pattern |
| Completion Notes | "Claude SDK provides sandbox" → "Rube provides sandbox" |

---

## 5. Implementation Handoff

### Scope Classification: MINOR

This is a documentation alignment task. No code changes required. Changes can be applied immediately.

### Handoff Plan

| Role | Responsibility |
|------|----------------|
| PM Agent | Apply document changes (this session) |
| Dev Team | No action required — stories already aligned |
| Architect | Review if needed (optional) |

### Success Criteria

- [ ] All documents use consistent "Anthropic API" terminology
- [ ] No remaining "Claude Agent SDK" references in active artifacts
- [ ] Sprint status matches story file names
- [ ] Story 4-2 correctly references Rube for sandbox

---

## 6. Approval Record

**Approved by:** Sid  
**Date:** 2025-12-22  
**Mode:** Incremental review (all 5 change groups approved)

### Change Groups Approved

1. ✅ PRD Updates (5 changes)
2. ✅ Architecture Updates (1 change)
3. ✅ Epics Updates (6 changes)
4. ✅ Sprint Status Updates (1 change)
5. ✅ Story 4-2 Updates (3 changes)

---

## 7. Architecture Summary (New Approach)

```
┌─────────────────────────────────────────────────────────────┐
│                     NEW ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────┤
│  AGENT LOOP         │ Application code (you own it)         │
│                     │ Anthropic API messages.create()       │
│  ───────────────────┼────────────────────────────────────── │
│  TOOL EXECUTION     │ MCP Protocol                          │
│                     │ Rube as primary capability layer      │
│  ───────────────────┼────────────────────────────────────── │
│  MULTI-TOOL         │ RUBE_MULTI_EXECUTE_TOOL               │
│                     │ Parallel tool calls via MCP           │
│  ───────────────────┼────────────────────────────────────── │
│  SANDBOX            │ RUBE_REMOTE_WORKBENCH                 │
│                     │ Python/bash execution (remote)        │
│  ───────────────────┼────────────────────────────────────── │
│  TOOL DISCOVERY     │ RUBE_SEARCH_TOOLS                     │
│                     │ Dynamic at runtime                    │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- Faster cold starts (no SDK sandbox initialization)
- Cleaner separation of concerns
- Rube provides battle-tested sandbox infrastructure
- Agent loop under your control for customization

---

**Status:** Ready for implementation of document changes.

