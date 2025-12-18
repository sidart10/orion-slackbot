# Story 5.7: Result Aggregation & Synthesis

Status: ready-for-dev

## Story

As a **user**,
I want research results synthesized into a coherent summary,
So that I don't have to read through raw data.

## Acceptance Criteria

1. **Given** subagents have completed their searches, **When** results are returned to the orchestrator, **Then** only relevant results are aggregated (FR4)
2. **Given** multiple sources exist, **When** synthesis runs, **Then** information is synthesized into structured summaries (FR8)
3. **Given** sources may conflict, **When** synthesis runs, **Then** contradictions or gaps are noted
4. **Given** synthesis completes, **When** output is generated, **Then** the synthesis is coherent and actionable
5. **Given** quality matters, **When** synthesis is returned, **Then** synthesis quality is verified before delivery

## Tasks / Subtasks

- [ ] **Task 1: Aggregate Results** (AC: #1)
  - [ ] Create `src/agent/synthesis.ts`
  - [ ] Collect subagent outputs
  - [ ] Filter irrelevant results
  - [ ] Rank by relevance

- [ ] **Task 2: Generate Synthesis** (AC: #2)
  - [ ] Use LLM for synthesis
  - [ ] Structure into sections
  - [ ] Include key findings

- [ ] **Task 3: Note Contradictions** (AC: #3)
  - [ ] Detect conflicting info
  - [ ] Note in output
  - [ ] Suggest verification

- [ ] **Task 4: Ensure Coherence** (AC: #4)
  - [ ] Review for flow
  - [ ] Add transitions
  - [ ] Make actionable

- [ ] **Task 5: Verify Quality** (AC: #5)
  - [ ] Run through verification
  - [ ] Check citations
  - [ ] Ensure completeness

## Dev Notes

### Synthesis Pattern

```typescript
async function synthesizeResults(
  results: SubagentResult[]
): Promise<SynthesizedOutput> {
  // Filter relevant results
  const relevant = results.filter(r => r.relevanceScore > 0.5);
  
  // Use LLM to synthesize
  const synthesis = await generateSynthesis(relevant);
  
  // Note any contradictions
  const contradictions = findContradictions(relevant);
  
  return {
    summary: synthesis,
    sources: relevant.map(r => r.source),
    contradictions,
    verified: true,
  };
}
```

### File List

Files to create:
- `src/agent/synthesis.ts`

