# Story 8.3: Audience Targeting Recommendations

Status: ready-for-dev

## Story

As a **programmatic consultant**, I want Orion to recommend audience segments, So that I can quickly build targeting strategies for clients.

## Acceptance Criteria

1. **Given** I describe a client targeting need, **When** I ask for recommendations, **Then** relevant audience segments are recommended (FR33)
2. Recommendations are based on SambaTV audience data in orion-context/knowledge/
3. Each recommendation includes rationale for the match
4. Recommendations include reach estimates when available
5. Both regular and contextual segments are suggested when appropriate

## Tasks / Subtasks

- [ ] **Task 1: Parse Targeting Request** (AC: #1) - Extract client needs
- [ ] **Task 2: Search Knowledge Base** (AC: #2) - Query audience data
- [ ] **Task 3: Match Segments** (AC: #1) - Find relevant segments
- [ ] **Task 4: Generate Rationale** (AC: #3) - Explain matches
- [ ] **Task 5: Include Estimates** (AC: #4) - Reach/availability
- [ ] **Task 6: Suggest Contextual** (AC: #5) - TTD Rail options
- [ ] **Task 7: Verification** - Test with sample requests

## Dev Notes

### Response Format

```
*Audience Targeting Recommendations for [Client]*

*Recommended Segments:*

1. *[Segment Name]* (ID: [activation_id])
   • Rationale: [why this matches]
   • Estimated Reach: [reach]

2. *[Segment Name]* (ID: [activation_id])
   • Rationale: [why this matches]
   • Estimated Reach: [reach]

*Contextual Options (TTD Rail):*
• [Contextual segment] (ID: [id])
```

### File List

Files to create: `src/workflows/audience-targeting.ts`

