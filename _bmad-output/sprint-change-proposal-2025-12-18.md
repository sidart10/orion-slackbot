# Sprint Change Proposal: E2B Sandbox + SDK Simplification

**Date:** 2025-12-18  
**Author:** John (PM Agent) with Sid  
**Status:** Pending Approval  

---

## 1. Issue Summary

### Problem Statement

Claude Agent SDK's `query()` function spawns a subprocess (Claude Code CLI) that requires sandbox environments with process isolation. Cloud Run does not provide this capability — the subprocess hangs silently with no errors.

### Discovery Context

- **When discovered:** After Epic 2 completion, during production deployment testing
- **Evidence:** Processing stops at `query()` call, eyes emoji displays but no response delivered
- **Root cause:** Architecture assumed Claude Agent SDK works as standard HTTP library — it does not

### Additional Finding

Stories 3.1 and 3.2 built MCP infrastructure that duplicates Claude Agent SDK's native capabilities:
- `discovery.ts` (398 lines) manually implements MCP protocol
- `registry.ts` caches tool schemas
- SDK already handles all of this internally via `mcpServers` option

---

## 2. Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|------|--------|--------|
| **Epic 1** | Done | Need to add E2B deployment story |
| **Epic 2** | Done | Agent loop code is correct, just needs right runtime |
| **Epic 3** | In Progress | Story 3.2 should be cancelled (redundant), 3.1 partially valid |
| **Epic 4** | Not Started | Story 4.2 (Sandbox Setup) was already planned — now critical path |
| **Epic 5-9** | Not Started | No changes needed |

### Artifact Conflicts

| Artifact | Conflict | Required Update |
|----------|----------|-----------------|
| `architecture.md` | Assumes Cloud Run works for SDK | Update deployment section for E2B |
| `sprint-status.yaml` | 3.1/3.2 marked "done" | Update statuses |
| Story 1.6 | Docker/Cloud Run deployment | Revise for E2B + thin proxy pattern |

### Code Impact

**Files to REMOVE (Redundant):**
- `src/tools/mcp/discovery.ts` (398 lines)
- `src/tools/mcp/discovery.test.ts`
- `src/tools/mcp/tools-list-discovery.test.ts`
- `src/tools/registry.ts` (159+ lines)
- `src/tools/registry.test.ts`

**Files to KEEP:**
- `src/tools/mcp/config.ts` — SDK needs MCP configs
- `src/tools/mcp/health.ts` — Graceful degradation tracking
- `src/tools/mcp/types.ts` — Type definitions

---

## 3. Recommended Approach

### Selected Path: **Option B — E2B Sandbox Deployment**

Deploy Claude Agent SDK on E2B (Firecracker-based sandbox). Cloud Run becomes a thin proxy for Slack webhooks.

**Why this option:**
- Preserves full Claude Agent SDK capabilities (subagents, native MCP, compaction)
- E2B was already planned for code execution (Story 4.2)
- Clean architecture: Slack proxy (Cloud Run) + Agent runtime (E2B)
- No code changes to agent loop — just deployment target

**Alternative considered:** Switch to standard Anthropic SDK (Option A)
- Rejected because: Loses SDK features, requires rewriting tool handling

### Effort Estimate

| Task | Effort | Risk |
|------|--------|------|
| E2B integration for agent runtime | 4-6 hours | Low |
| Update Cloud Run to thin proxy | 2-3 hours | Low |
| Remove redundant discovery/registry code | 1-2 hours | Low |
| Update architecture docs | 1 hour | Low |
| **Total** | **8-12 hours** | **Low** |

---

## 4. Detailed Change Proposals

### Change 1: New Story — E2B Agent Runtime

**Add to Epic 1 (or create as Epic 3 prerequisite):**

```markdown
# Story: E2B Agent Runtime Deployment

As a **developer**,
I want Claude Agent SDK to run in an E2B sandbox,
So that the `query()` subprocess can execute properly.

## Acceptance Criteria

1. **Given** E2B SDK is integrated, **When** `query()` is called, **Then** it executes successfully in E2B sandbox
2. **Given** Slack sends an event, **When** Cloud Run receives it, **Then** it forwards to E2B for processing
3. **Given** E2B returns a response, **When** Cloud Run receives it, **Then** it streams to Slack
4. **Given** E2B is unavailable, **When** a request arrives, **Then** user receives error message (graceful degradation)

## Tasks

- [ ] Add `@e2b/code-interpreter` SDK dependency
- [ ] Create E2B sandbox wrapper for agent execution
- [ ] Update Cloud Run to be Slack webhook proxy
- [ ] Configure E2B environment variables
- [ ] Test end-to-end: Slack → Cloud Run → E2B → Claude SDK → Response
```

### Change 2: Cancel Story 3.2 (Tool Discovery & Registration)

**Reason:** Claude Agent SDK handles MCP tool discovery natively. The manual discovery layer is redundant.

**Action:** 
- Mark Story 3.2 as `cancelled` in sprint-status.yaml
- Remove associated code files

### Change 3: Update Story 3.1 Status

**Story 3.1** built useful infrastructure (config loading, health tracking) but the "done" status is misleading since the full MCP integration wasn't tested on a working runtime.

**Action:**
- Keep Story 3.1 as `done` — the config/health code is valid
- Note in retrospective that discovery was over-engineered

### Change 4: Remove Redundant Code

**Files to delete:**

```
src/tools/mcp/discovery.ts
src/tools/mcp/discovery.test.ts  
src/tools/mcp/tools-list-discovery.test.ts
src/tools/registry.ts
src/tools/registry.test.ts
```

**Files to update:**
- `src/tools/mcp/index.ts` — Remove discovery exports
- `src/tools/index.ts` — Remove registry exports
- Any imports of `toolRegistry` or `discoverMcpTools`

### Change 5: Update Architecture Document

**Section:** Infrastructure & Deployment

**Add:**
```markdown
### Deployment Architecture (Updated 2025-12-18)

Claude Agent SDK requires sandbox environments for subprocess execution. 
Cloud Run does not support this.

| Component | Runtime | Purpose |
|-----------|---------|---------|
| Slack Webhook Proxy | Cloud Run | Receives events, forwards to E2B |
| Agent Execution | E2B Sandbox | Runs Claude Agent SDK `query()` |

**Pattern:**
Slack → Cloud Run (proxy) → E2B (agent) → Claude API → E2B → Cloud Run → Slack
```

---

## 5. Implementation Handoff

### Scope Classification: **Moderate**

- Requires backlog reorganization (new story, cancelled story)
- No fundamental replan needed
- Clear implementation path

### Handoff Recipients

| Role | Responsibility |
|------|---------------|
| **SM (Scrum Master)** | Create new E2B story, cancel Story 3.2, update sprint status |
| **Dev** | Implement E2B integration, remove redundant code |
| **Architect** | Update architecture.md deployment section |

### Success Criteria

1. ✅ Claude Agent SDK `query()` executes successfully in E2B
2. ✅ Slack receives streamed responses
3. ✅ Redundant discovery/registry code removed
4. ✅ All existing tests pass (minus removed test files)
5. ✅ Architecture documentation updated

### Implementation Sequence

1. **Remove redundant code first** — Clean slate before E2B work
2. **Integrate E2B SDK** — Add dependency, create wrapper
3. **Update Cloud Run** — Make it a thin proxy
4. **Test end-to-end** — Slack → E2B → Claude → Response
5. **Update docs** — Architecture, sprint status

---

## 6. Approval

**Decision needed from:** Sid

- [ ] Approve Sprint Change Proposal
- [ ] Proceed with implementation

---

## Appendix: Technical Details

### E2B Integration Pattern

```typescript
// src/sandbox/agent-runtime.ts
import { Sandbox } from '@e2b/code-interpreter';

export async function executeAgentInSandbox(
  userMessage: string,
  context: AgentContext
): Promise<AgentResponse> {
  const sandbox = await Sandbox.create({
    timeoutMs: 240_000, // 4 minute timeout (AR20)
  });

  try {
    // Agent code runs inside E2B
    const result = await sandbox.runCode(`
      const { query } = require('@anthropic-ai/claude-agent-sdk');
      // ... execute agent loop
    `);
    
    return parseAgentResponse(result);
  } finally {
    await sandbox.kill();
  }
}
```

### Architecture Diagram (Updated)

```
┌─────────────────┐     HTTP      ┌─────────────────┐
│     Slack       │──────────────▶│   Cloud Run     │
│  (User Events)  │◀──────────────│  (Thin Proxy)   │
└─────────────────┘    Stream     └────────┬────────┘
                                           │
                                           │ Forward
                                           ▼
                                  ┌─────────────────┐
                                  │   E2B Sandbox   │
                                  │                 │
                                  │ Claude Agent    │
                                  │ SDK `query()`   │
                                  │                 │
                                  │ ┌─────────────┐ │
                                  │ │ Claude Code │ │
                                  │ │    CLI      │ │
                                  │ └─────────────┘ │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │  Claude API     │
                                  │  (Anthropic)    │
                                  └─────────────────┘
```

