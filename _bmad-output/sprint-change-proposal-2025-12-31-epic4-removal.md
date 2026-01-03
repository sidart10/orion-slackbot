# Sprint Change Proposal: Remove Epic 4 (Subagents)

**Date:** 2025-12-31  
**Author:** John (PM) with Sid  
**Status:** Proposed  
**Change Type:** Scope Reduction  

---

## 1. Issue Summary

### Problem Statement

Epic 4 (Subagents & Parallel Execution) proposes a separate agent orchestration layer to spawn parallel subagents for multi-source research. Analysis reveals this is over-engineering — Claude's native `tool_use` pattern already supports parallel tool execution without the complexity.

### Discovery Context

During implementation planning review, concerns arose about architectural complexity vs. actual value delivered. Deep analysis of the pattern confirms:

- Claude can return **multiple tool_use blocks in a single response**
- These can be executed in parallel via `Promise.all()`
- Claude naturally synthesizes multi-source results
- Subagent pattern triples system prompt tokens and API calls

### Evidence

| Aspect | Subagent Approach | Native Parallel Tool Use |
|--------|-------------------|-------------------------|
| API calls per research | 3+ (one per subagent) | 1 (agent loop handles) |
| System prompt tokens | 3× (per subagent) | 1× |
| New code required | ~500 lines (spawner, orchestrator, aggregator) | 0 lines |
| Complexity | High (isolated contexts, result merging) | Low (Claude handles) |
| Cost multiplier | ~2-3× per deep research | Baseline |

---

## 2. Impact Analysis

### Epic Impact

| Epic | Impact | Action |
|------|--------|--------|
| **Epic 4** | Removed entirely | Delete from backlog |
| Epic 2 | None | Agent loop unchanged |
| Epic 3 | None | MCP tools work with native pattern |
| Epic 5-7 | None | No dependencies on Epic 4 |

### Story Impact

| Story | Status | Action |
|-------|--------|--------|
| 4.1 Subagent Spawner | ready-for-dev | **Remove** |
| 4.2 Result Aggregation | ready-for-dev | **Remove** |
| 4.3 Deep Research Workflow | ready-for-dev | **Modify** — becomes prompting strategy |

### Artifact Conflicts

**PRD:**
- FR3: "System spawns subagents for parallel task execution" → **Remove or reword**
- FR4: "System aggregates only relevant results from subagents" → **Remove or reword**
- FR10: "Users can request deep research with automatic parallelization" → **Keep** (achieved via native pattern)
- NFR5: "Maximum 3 concurrent subagents per request" → **Remove**

**Architecture:**
- Section on subagent spawner → **Remove**
- Directory `src/agent/subagents/` → **Not created**
- SubagentContext, SubagentResult types → **Not needed**

**Epics:**
- Epic 4 block → **Remove**
- Epic summary table → **Update count**

### Technical Impact

- No code changes to existing implementation
- 3 story files can be deleted or archived
- Sprint status file updated to remove Epic 4
- Estimated 3 fewer development days

---

## 3. Recommended Approach

### Selected Path: Direct Removal

**Rationale:**

1. **Claude handles parallelism natively** — The agent loop already supports multiple tool_use blocks per turn. No orchestration layer needed.

2. **Lower cost** — Subagents would triple API costs for multi-source research with no proportional benefit.

3. **Simpler architecture** — Fewer moving parts, easier to debug, less to maintain.

4. **No lost functionality** — "Deep research" capability achieved via prompting + parallel tool execution, not subagent spawning.

**Effort:** Low (documentation updates only)  
**Risk:** Low (removing planned work, not changing working code)

### How Deep Research Works Post-Change

```
User: "Research what we know about competitor X"

Claude (agent loop turn 1):
  → tool_use: slack_search("competitor X")
  → tool_use: confluence_search("competitor X")
  → tool_use: web_search("competitor X")

Your code (existing pattern):
  → Promise.all([execTool(slack), execTool(confluence), execTool(web)])
  → Return all 3 results to Claude

Claude (agent loop turn 2):
  → Synthesizes all results with citations
  → Returns final response
```

This is **already supported** by Epic 2 (Agent Loop) + Epic 3 (MCP Tools).

---

## 4. Detailed Change Proposals

### Change 1: Remove Epic 4 from Epics Document

**File:** `_bmad-output/epics.md`

**OLD:**
```markdown
### Epic 4: Subagents & Parallel Execution
Enable complex tasks to spawn parallel workers for faster execution.

**User Outcome:** Research and complex tasks run in parallel, returning synthesized results faster.

**Scope:**
- Subagent spawner (parallel `messages.create()` calls)
- Context isolation (subagents don't pollute parent context)
- Result aggregation (only relevant results bubble up)
- `Promise.all()` orchestration with error handling

**FRs:** FR3, FR4, FR10
**NFRs:** NFR3, NFR5

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 4.1 | Subagent Spawner | ready-for-dev |
| 4.2 | Result Aggregation | ready-for-dev |
| 4.3 | Deep Research Workflow | ready-for-dev |
```

**NEW:**
```markdown
### ~~Epic 4: Subagents & Parallel Execution~~ — REMOVED

**Removed:** 2025-12-31  
**Reason:** Over-engineering. Claude's native parallel tool_use pattern achieves the same outcome without a separate orchestration layer.

**Original FRs (FR3, FR4):** Reworded to reflect native pattern.  
**FR10 (Deep Research):** Achieved via prompting + parallel MCP tool execution in Epic 2+3.

See: `sprint-change-proposal-2025-12-31-epic4-removal.md`
```

**Rationale:** Preserves history while clearly marking as removed.

---

### Change 2: Update PRD Functional Requirements

**File:** `_bmad-output/prd.md`

**OLD (FR3):**
```markdown
- FR3: System spawns subagents for parallel task execution with isolated context windows
```

**NEW (FR3):**
```markdown
- FR3: System executes multiple tool calls in parallel when beneficial (via native Claude tool_use pattern)
```

**OLD (FR4):**
```markdown
- FR4: System aggregates only relevant results from subagents into the orchestrator response
```

**NEW (FR4):**
```markdown
- FR4: System synthesizes results from multiple tool calls into coherent responses (handled by Claude natively)
```

**Rationale:** Functionality preserved, implementation simplified.

---

### Change 3: Update Architecture Document

**File:** `_bmad-output/architecture.md`

**Section to update:** "What Claude Agent SDK Provides (We're Replacing)"

**OLD:**
```markdown
| Subagent orchestration | Parallel `messages.create()` calls + `Promise.all()` |
```

**NEW:**
```markdown
| Parallel execution | Native Claude tool_use (multiple tools per turn) + Promise.all() on execution |
```

**Section to remove:** Directory `src/agent/subagents/` from project structure (never created).

**Rationale:** Architecture reflects simpler reality.

---

### Change 4: Update Sprint Status

**File:** `_bmad-output/sprint-status.yaml`

**OLD:**
```yaml
  # Epic 4: Subagents & Parallel Execution
  epic-4: backlog
  4-1-subagent-spawner: ready-for-dev
  4-2-result-aggregation: ready-for-dev
  4-3-deep-research-workflow: ready-for-dev
  epic-4-retrospective: optional
```

**NEW:**
```yaml
  # Epic 4: Subagents — REMOVED (2025-12-31)
  # Reason: Over-engineering. Native Claude parallel tool_use achieves same outcome.
  # See: sprint-change-proposal-2025-12-31-epic4-removal.md
  # epic-4: removed
  # 4-1-subagent-spawner: removed
  # 4-2-result-aggregation: removed
  # 4-3-deep-research-workflow: removed
```

---

### Change 5: Archive Story Files

**Files:**
- `_bmad-output/implementation-artifacts/stories/4-1-subagent-spawner.md`
- `_bmad-output/implementation-artifacts/stories/4-2-result-aggregation.md`
- `_bmad-output/implementation-artifacts/stories/4-3-deep-research-workflow.md`

**Action:** Move to `_bmad-output/implementation-artifacts/stories/_archived/` or delete.

---

## 5. Implementation Handoff

### Change Scope: Minor

This is a **documentation-only change**. No code has been written for Epic 4.

### Handoff

| Role | Responsibility |
|------|---------------|
| **PM (John)** | Update PRD with FR3/FR4 rewording |
| **Architect** | Update architecture.md to remove subagent references |
| **SM** | Update sprint-status.yaml, archive story files |
| **Dev** | No action required |

### Success Criteria

- [ ] Epic 4 marked as removed in epics.md
- [ ] FR3, FR4 reworded in PRD
- [ ] Architecture document updated
- [ ] Sprint status updated
- [ ] Story files archived
- [ ] This proposal saved to `_bmad-output/`

---

## 6. Summary

| Metric | Value |
|--------|-------|
| Stories removed | 3 |
| Development days saved | ~3 |
| Token cost reduction | ~2-3× per deep research query |
| Functionality lost | None (native pattern equivalent) |
| Risk | None (removing planned work, not implemented code) |

**Recommendation:** Approve and execute immediately.

---

**Approval:**

- [ ] Sid (Product Owner): _______________
- [ ] Date: _______________

