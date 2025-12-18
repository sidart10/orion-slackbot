# Story 2.7: Source Citations

Status: ready-for-dev

## Story

As a **user**,
I want to know where Orion's information comes from,
So that I can verify facts and explore further.

## Acceptance Criteria

1. **Given** Orion gathers context from sources, **When** the response includes factual claims, **Then** sources are cited inline or at the end of the response (FR6)

2. **Given** sources are cited, **When** the source has a URL, **Then** citations include links when available

3. **Given** responses are generated, **When** metrics are tracked, **Then** citation rate is tracked (target: >90%)

4. **Given** verification runs, **When** factual claims are detected, **Then** uncited factual claims are flagged during verification

## Tasks / Subtasks

- [ ] **Task 1: Define Citation Format** (AC: #1)
  - [ ] Create `src/agent/citations.ts`
  - [ ] Define inline citation format
  - [ ] Define footer citation format
  - [ ] Support both Slack-friendly formats

- [ ] **Task 2: Extract Sources from Context** (AC: #1)
  - [ ] Track sources during gather phase
  - [ ] Associate sources with content excerpts
  - [ ] Build source registry for response

- [ ] **Task 3: Format Citations for Slack** (AC: #2)
  - [ ] Create `formatCitation()` function
  - [ ] Format links using Slack syntax `<URL|text>`
  - [ ] Handle sources without URLs

- [ ] **Task 4: Add Citation to Verification** (AC: #4)
  - [ ] Use simple heuristic for factual claim detection (see Dev Notes below)
  - [ ] Compare sources gathered vs sources cited
  - [ ] Flag if sources were gathered but response has zero citations
  - [ ] Log warning in Langfuse when citation rate < 90%

- [ ] **Task 5: Track Citation Metrics** (AC: #3)
  - [ ] Log citation count per response
  - [ ] Calculate citation rate
  - [ ] Track in Langfuse

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Ask factual question
  - [ ] Verify response includes citations
  - [ ] Verify links are clickable
  - [ ] Check citation rate metrics

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR6 | prd.md | System cites sources for factual claims |

### Citation Formats

```typescript
// Inline citation
"SambaTV provides TV viewership data [1]"

// Footer citations
"\n\n_Sources:_\n• [1] <https://confluence.samba.tv/page|Company Overview>"

// Slack link format
"<https://url.com|Display Text>"
```

### src/agent/citations.ts

```typescript
export interface Citation {
  id: number;
  type: 'thread' | 'file' | 'web' | 'confluence' | 'slack';
  title: string;
  url?: string;
  excerpt?: string;
}

export function formatCitationFooter(citations: Citation[]): string {
  if (citations.length === 0) return '';
  
  return '\n\n_Sources:_\n' + citations
    .map(c => {
      const link = c.url ? `<${c.url}|${c.title}>` : c.title;
      return `• [${c.id}] ${link}`;
    })
    .join('\n');
}

/**
 * Factual Claim Detection - Simple Heuristic Approach
 * 
 * Full NLP-based claim detection is overkill for v1. Instead:
 * 1. Check if sources were gathered during the gather phase
 * 2. Check if the response contains ANY citation markers [1], [2], etc.
 * 3. If sources gathered but no citations → likely uncited factual claims
 */
export function detectUncitedClaims(
  response: string,
  sourcesGathered: Citation[]
): { hasUncitedClaims: boolean; citationCount: number } {
  // Count citation markers in response
  const citationPattern = /\[\d+\]/g;
  const citationMatches = response.match(citationPattern) || [];
  const citationCount = new Set(citationMatches).size; // Unique citations
  
  // If we gathered sources but response has no citations, flag it
  const hasUncitedClaims = sourcesGathered.length > 0 && citationCount === 0;
  
  return { hasUncitedClaims, citationCount };
}

/**
 * Optional: Pattern-based factual indicators (for future enhancement)
 * These patterns suggest factual claims that should be cited:
 */
const FACTUAL_INDICATORS = [
  /\d{4}/,                    // Years (e.g., "In 2023...")
  /\d+%/,                     // Percentages
  /\$[\d,]+/,                 // Dollar amounts
  /according to/i,            // Attribution phrases
  /studies show/i,
  /research indicates/i,
  /officially/i,
];
```

### References

- [Source: _bmad-output/epics.md#Story 2.7] — Original story

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Completion Notes List

- Inline citations are less intrusive for short responses
- Footer citations better for research-heavy responses
- **Prompt engineering is key**: Include "cite sources using [1], [2] format" in system prompt
- Simple heuristic approach avoids complex NLP for v1

### File List

Files to create:
- `src/agent/citations.ts`

Files to modify:
- `src/agent/loop.ts` (add citation handling)
- `src/agent/orion.ts` (format citations)

