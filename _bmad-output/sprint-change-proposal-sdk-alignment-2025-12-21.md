# Sprint Change Proposal: SDK-Aligned Scope Reduction

**Date**: 2025-12-21  
**Author**: John (PM Agent)  
**Status**: Proposed  
**Scope Classification**: Moderate

---

## 1. Issue Summary

### Problem Statement

Deep analysis of the current backlog revealed significant overlap between planned stories and capabilities provided natively by the Claude Agent SDK. Approximately 17 stories build custom infrastructure that the SDK already provides out-of-the-box, while an additional 7 stories can be consolidated into 2 merged stories.

### Discovery Context

This issue was identified during a comprehensive cross-reference of:
- Story specifications in `_bmad-output/implementation-artifacts/stories/`
- Claude Agent SDK documentation and capabilities
- Current implementation in `src/agent/orion.ts` and related modules
- Existing Vercel Sandbox implementation (`src/sandbox/vercel-runtime.ts`)

### Evidence

| Category | Finding |
|----------|---------|
| Subagent Infrastructure (5-1, 5-2, 5-3) | SDK provides native subagent spawning with automatic context isolation |
| Skills/Commands Framework (7-1 to 7-4) | SDK auto-discovers `.claude/skills/` and `.claude/commands/` directories |
| Tool Discovery (3-2) | Already cancelled - SDK handles natively |
| Sandbox Setup (4-2, 4-3) | Story 3-0 (Vercel Sandbox) already implements this |
| Observability (9-1, 9-3, 9-4) | Langfuse already captures token usage, traces, and prompt versioning |

---

## 2. Impact Analysis

### Epic Impact

| Epic | Current Stories | After Change | Net Impact |
|------|-----------------|--------------|------------|
| Epic 3: MCP Tools | 8 stories | 3 stories | -5 cancelled |
| Epic 4: Code Gen | 6 stories | 1 merged story | -5 (merge) |
| Epic 5: Subagents | 9 stories | 4 stories | -5 (3 cancelled, 3 merged to 1) |
| Epic 6: Workflows | 5 stories | 5 stories | No change |
| Epic 7: Extensions | 6 stories | 2 stories | -4 cancelled |
| Epic 8: Domain | 4 stories | 4 stories | No change |
| Epic 9: Observability | 5 stories | 2 stories | -3 cancelled |
| **TOTAL** | **43 active** | **21 stories** | **-22 stories** |

### Story Impact - Cancellations (17 Stories)

| Story ID | Title | Cancellation Reason |
|----------|-------|---------------------|
| 3-4 | Multiple MCP Servers | SDK handles multi-server natively; `orion.ts` already passes `mcpServers` to `query()` |
| 3-5 | Intelligent Tool Selection | Claude's reasoning handles tool selection; not code, it's prompting |
| 3-6 | Tool Execution Logging | Langfuse already captures tool executions via SDK instrumentation |
| 3-7 | Admin Tool Configuration | Already implemented via `.orion/config.yaml` pattern |
| 3-8 | Graceful Degradation | Already in error handling code |
| 4-2 | Sandbox Environment Setup | Outdated (references E2B); covered by 3-0 Vercel Sandbox |
| 4-3 | Code Execution | Covered by 3-0 Vercel Sandbox |
| 5-1 | Subagent Infrastructure | SDK provides native `spawnSubagent()` capability |
| 5-2 | Subagent Context Isolation | SDK automatically isolates subagent contexts |
| 5-3 | Parallel Subagent Execution | Trivial `Promise.all()` pattern, not a story |
| 7-1 | Skills Framework Infrastructure | SDK auto-discovers `.claude/skills/` |
| 7-2 | Skill Discovery & Registration | SDK handles skill matching |
| 7-3 | Commands Framework Infrastructure | SDK auto-discovers `.claude/commands/` |
| 7-4 | Command Discovery & Execution | SDK handles command triggering |
| 9-1 | Token Usage Tracking | Langfuse already captures token usage |
| 9-3 | Admin Trace Viewing | Langfuse dashboard provides this |
| 9-4 | Prompt Version Management | Langfuse prompt management feature |

### Story Impact - Merges (7 Stories → 2)

**Merge 1: Code Execution via Vercel Sandbox**
- **New ID**: 4-1-merged
- **Replaces**: 4-1, 4-4, 4-5, 4-6
- **Scope**: Code generation + execution + external API calls + data processing + validation
- **Rationale**: All these stories use the same Vercel Sandbox infrastructure; implementing them separately creates artificial boundaries

**Merge 2: Search Integrations**
- **New ID**: 5-search
- **Replaces**: 5-4, 5-5, 5-6
- **Scope**: Slack history search + Confluence search + Web search
- **Rationale**: All are MCP tool integrations with similar patterns; one story covering all three is cleaner

### Artifact Conflicts

No conflicts with PRD, Architecture, or UX documents. This is purely a backlog optimization—the product requirements remain unchanged, we're just not building infrastructure the SDK provides.

---

## 3. Recommended Approach

### Path Forward: Direct Adjustment

Modify backlog within existing sprint plan. No rollback or MVP review needed.

**Rationale**:
- No code needs to be reverted
- Stories not yet started can be cleanly cancelled
- Merged stories consolidate related work that would have been done sequentially anyway
- Total effort decreases significantly

### Effort Estimate

| Action | Effort |
|--------|--------|
| Update sprint-status.yaml | 5 min |
| Update 17 story files (cancelled) | 15 min |
| Create 2 merged story files | 30 min |
| Mark 7 original stories as superseded | 10 min |
| **Total** | **~1 hour** |

### Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SDK doesn't fully cover assumed capability | Low | Stories preserved with `superseded` status; can be reactivated |
| Team confusion on story status | Medium | Clear cancellation reasons in each story file |

### Timeline Impact

**Positive**: Sprint velocity effectively doubles as we focus only on business logic stories rather than infrastructure that duplicates SDK capabilities.

---

## 4. Detailed Change Proposals

### 4.1 Stories to Cancel

Each cancelled story will receive the following frontmatter update:

```yaml
status: cancelled
cancellation_date: 2025-12-21
cancellation_reason: "SDK-provided" | "Covered by 3-0" | "Langfuse-provided"
```

**Full Cancellation List**:

1. **3-4-multiple-mcp-servers.md** → `SDK handles multi-server natively`
2. **3-5-intelligent-tool-selection.md** → `Claude's reasoning handles tool selection`
3. **3-6-tool-execution-logging.md** → `Langfuse already captures via instrumentation`
4. **3-7-admin-tool-configuration.md** → `Already implemented in .orion/config.yaml`
5. **3-8-graceful-degradation-tool-failures.md** → `Already in error handling code`
6. **4-2-sandbox-environment-setup.md** → `Covered by 3-0 Vercel Sandbox`
7. **4-3-code-execution.md** → `Covered by 3-0 Vercel Sandbox`
8. **5-1-subagent-infrastructure.md** → `SDK provides native subagent spawning`
9. **5-2-subagent-context-isolation.md** → `SDK automatically isolates contexts`
10. **5-3-parallel-subagent-execution.md** → `Trivial Promise.all() pattern`
11. **7-1-skills-framework-infrastructure.md** → `SDK auto-discovers .claude/skills/`
12. **7-2-skill-discovery-registration.md** → `SDK handles skill matching`
13. **7-3-commands-framework-infrastructure.md** → `SDK auto-discovers .claude/commands/`
14. **7-4-command-discovery-execution.md** → `SDK handles command triggering`
15. **9-1-token-usage-tracking.md** → `Langfuse already captures token usage`
16. **9-3-admin-trace-viewing.md** → `Langfuse dashboard provides this`
17. **9-4-prompt-version-management.md** → `Langfuse prompt management feature`

### 4.2 Stories to Merge

**Merged Story 1: 4-1-merged**

```markdown
# Story 4-1-merged: Code Execution via Vercel Sandbox

## Consolidated From
- 4-1: Code Generation Capability
- 4-4: External API Calls via Code
- 4-5: Data Processing via Code
- 4-6: Code Output Validation

## Scope
Enable Orion to generate, execute, and validate code in the Vercel Sandbox:
- Generate TypeScript/JavaScript code for user requests
- Execute code in sandboxed environment (via story 3-0 infrastructure)
- Make external API calls from generated code
- Process and transform data
- Validate outputs and handle errors

## Acceptance Criteria
- [ ] User can request code-based tasks ("fetch weather for NYC")
- [ ] Orion generates appropriate code
- [ ] Code executes in Vercel Sandbox
- [ ] External API calls work (with appropriate timeouts)
- [ ] Data processing returns structured results
- [ ] Errors are caught and reported gracefully
```

**Merged Story 2: 5-search**

```markdown
# Story 5-search: Search Integrations (Slack, Confluence, Web)

## Consolidated From
- 5-4: Slack History Search
- 5-5: Confluence Search
- 5-6: Web Search Integration

## Scope
Enable Orion to search across multiple data sources via MCP tools:
- Search Slack message history
- Search Confluence pages and spaces
- Search the web for current information

## Acceptance Criteria
- [ ] Slack search MCP tool configured and functional
- [ ] Confluence search MCP tool configured and functional
- [ ] Web search MCP tool configured and functional
- [ ] Results from each source properly formatted
- [ ] Source attribution included in responses
```

### 4.3 Stories Marked as Superseded

Original stories that were merged will receive:

```yaml
status: superseded
superseded_by: "4-1-merged" | "5-search"
superseded_date: 2025-12-21
```

**Stories to Mark Superseded**:
- 4-1-code-generation-capability.md → superseded by 4-1-merged
- 4-4-external-api-calls-via-code.md → superseded by 4-1-merged
- 4-5-data-processing-via-code.md → superseded by 4-1-merged
- 4-6-code-output-validation.md → superseded by 4-1-merged
- 5-4-slack-history-search.md → superseded by 5-search
- 5-5-confluence-search.md → superseded by 5-search
- 5-6-web-search-integration.md → superseded by 5-search

---

## 5. Implementation Handoff

### Scope Classification: Moderate

This change requires backlog reorganization but no architectural changes.

### Handoff Recipients

| Recipient | Responsibility |
|-----------|----------------|
| SM Agent | Update sprint-status.yaml, re-plan sprint |
| Dev Agent | Implement merged stories when scheduled |
| PM (self) | Create merged story files |

### Success Criteria

- [ ] All 17 stories marked `cancelled` in sprint-status.yaml
- [ ] All 17 story files updated with cancellation frontmatter
- [ ] 2 merged story files created
- [ ] 7 original stories marked `superseded`
- [ ] Sprint-status.yaml reflects accurate story counts

### Remaining Backlog (Priority Order)

After this correction, the active backlog is:

**High Priority (Unlock Research)**:
1. 5-search (merged) - Search Integrations
2. 5-7 - Result Aggregation & Synthesis
3. 5-8 - Source Linking
4. 5-9 - Deep Research Workflow

**Medium Priority (Quick Wins)**:
5. 6-1 - Thread Summarization
6. 6-2 - Document Summarization
7. 6-3 - Conversation Summarization
8. 6-4 - Troubleshooting via Recent Issues
9. 6-5 - Q&A Workflow

**Lower Priority (Code Execution)**:
10. 4-1-merged - Code Execution via Vercel Sandbox

**Domain Features**:
11. 8-1 - Prospect Research Capability
12. 8-2 - Structured Prospect Dossiers
13. 8-3 - Audience Targeting Recommendations
14. 8-4 - Knowledge Base ID Matching

**Operational Maturity**:
15. 9-2 - Cost Tracking Per Interaction
16. 9-5 - Budget Alerts & Limits

**Nice to Have**:
17. 7-5 - Suggested Prompts
18. 7-6 - Extensibility Validation

---

## Approval

- [ ] PM Review: Pending
- [ ] Implementation Approved: Pending

---

*Generated by Correct Course workflow on 2025-12-21*

