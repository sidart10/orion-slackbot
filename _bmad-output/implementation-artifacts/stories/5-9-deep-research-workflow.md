# Story 5.9: Deep Research Workflow

Status: ready-for-dev

## Story

As a **user**,
I want to request comprehensive research with a single message,
So that complex research happens automatically.

## Acceptance Criteria

1. **Given** a user requests deep research, **When** the agent processes the request, **Then** the Deep Research workflow is triggered (FR41)
2. **Given** the workflow runs, **When** sources are searched, **Then** multiple sources are searched in parallel (FR10)
3. **Given** results are gathered, **When** output is generated, **Then** results are synthesized with source citations
4. **Given** time constraints exist, **When** monitoring progress, **Then** the workflow completes in <5 minutes (NFR3)
5. **Given** long-running operation, **When** user is waiting, **Then** progress updates are streamed to the user
6. **Given** tracing is active, **When** workflow runs, **Then** the complete workflow is traced in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Deep Research Workflow** (AC: #1)
  - [ ] Create `.orion/workflows/deep-research/workflow.md`
  - [ ] Define workflow steps
  - [ ] Trigger on research requests

- [ ] **Task 2: Parallel Source Search** (AC: #2)
  - [ ] Spawn search subagents
  - [ ] Search Slack, Confluence, web
  - [ ] Execute in parallel

- [ ] **Task 3: Synthesize with Citations** (AC: #3)
  - [ ] Use synthesis module
  - [ ] Include all sources
  - [ ] Format citations

- [ ] **Task 4: Enforce Time Limit** (AC: #4)
  - [ ] Set 5-minute timeout
  - [ ] Monitor progress
  - [ ] Return partial if needed

- [ ] **Task 5: Stream Progress** (AC: #5)
  - [ ] Update user status
  - [ ] Show phases
  - [ ] Report completion

- [ ] **Task 6: Complete Tracing** (AC: #6)
  - [ ] Trace workflow
  - [ ] Trace each phase
  - [ ] Track duration

## Dev Notes

### Deep Research Workflow

```
User: "Research our Q1 audience targeting strategy"
    │
    ▼
[Parse Request] → Identify research topic
    │
    ▼
[Spawn Subagents] ─────────────────┐
    ├── Slack Search               │
    ├── Confluence Search          │  Parallel
    └── Web Search                 │
    │                              │
    ▼ ◀────────────────────────────┘
[Aggregate Results]
    │
    ▼
[Synthesize]
    │
    ▼
[Verify & Cite]
    │
    ▼
[Deliver Response]
```

### NFR3: 5-Minute Target

```typescript
const DEEP_RESEARCH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function executeDeepResearch(
  query: string
): Promise<ResearchResult> {
  return withTimeout(
    runDeepResearchWorkflow(query),
    DEEP_RESEARCH_TIMEOUT
  );
}
```

### File List

Files to create:
- `.orion/workflows/deep-research/workflow.md`
- `src/workflows/deep-research.ts`

