# Story 8.4: Knowledge Base ID Matching

Status: ready-for-dev

## Story

As a **programmatic consultant**, I want exact IDs from our audience knowledge base, So that I can immediately use them in activation platforms.

## Acceptance Criteria

1. **Given** audience recommendations are being generated, **When** the agent matches segments, **Then** exact Activation IDs are retrieved from orion-context/knowledge/
2. IDs are verified against the knowledge base
3. Mismatches or missing IDs are flagged
4. Both standard and contextual segment options are provided
5. The output is implementation-ready

## Tasks / Subtasks

- [ ] **Task 1: Load Knowledge Base** (AC: #1) - Parse audience data files
- [ ] **Task 2: Match Exact IDs** (AC: #1) - Find activation IDs
- [ ] **Task 3: Verify IDs** (AC: #2) - Cross-reference
- [ ] **Task 4: Flag Issues** (AC: #3) - Note mismatches
- [ ] **Task 5: Include All Types** (AC: #4) - Standard + contextual
- [ ] **Task 6: Format for Activation** (AC: #5) - Copy-paste ready
- [ ] **Task 7: Verification** - Test ID matching accuracy

## Dev Notes

### Knowledge Base Structure

```
orion-context/knowledge/
├── audience-segments-us.csv
├── audience-segments-apac.csv
└── contextual-segments-ttd.csv
```

### ID Matching

```typescript
async function matchActivationId(
  segmentDescription: string,
  region: 'us' | 'apac'
): Promise<{ id: string; confidence: number } | null> {
  // Search knowledge base
  // Return exact ID with confidence score
}
```

### File List

Files to modify: `src/workflows/audience-targeting.ts`

