# Story 2.7: Source Citations

Status: done

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

- [x] **Task 1: Define Citation Format** (AC: #1)
  - [x] Create `src/agent/citations.ts`
  - [x] Define inline citation format
  - [x] Define footer citation format
  - [x] Support both Slack-friendly formats

- [x] **Task 2: Extract Sources from Context** (AC: #1)
  - [x] Track sources during gather phase
  - [x] Associate sources with content excerpts
  - [x] Build source registry for response

- [x] **Task 3: Format Citations for Slack** (AC: #2)
  - [x] Create `formatCitation()` function
  - [x] Format links using Slack syntax `<URL|text>`
  - [x] Handle sources without URLs

- [x] **Task 4: Add Citation to Verification** (AC: #4)
  - [x] Use simple heuristic for factual claim detection (see Dev Notes below)
  - [x] Compare sources gathered vs sources cited
  - [x] Flag if sources were gathered but response has zero citations
  - [x] Log warning in Langfuse when citation rate < 90%

- [x] **Task 5: Track Citation Metrics** (AC: #3)
  - [x] Log citation count per response
  - [x] Calculate citation rate
  - [x] Track in Langfuse

- [x] **Task 6: Verification** (AC: all)
  - [x] Ask factual question
  - [x] Verify response includes citations
  - [x] Verify links are clickable
  - [x] Check citation rate metrics

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR6 | prd.md | System cites sources for factual claims |

### Citation Formats

```typescript
// Inline citation
"Samba provides TV viewership data [1]"

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

#### Implementation Complete (2025-12-18)

- **Task 1**: Created `citations.ts` with Citation interface, formatInlineCitation, formatSlackLink, formatCitationFooter
- **Task 2**: Added sourceToCitation and buildCitationRegistry for Source → Citation conversion
- **Task 3**: Slack formatting integrated via formatSlackLink using `<URL|text>` syntax
- **Task 4**: Enhanced `cites_sources` verification rule to check for `[1]`, `[2]` markers instead of just keywords
- **Task 5**: Added trackCitations, getCitationMetrics, CITATION_RATE_TARGET (90%) to metrics module
- **Task 6**: Integrated citation footer into orion.ts response generation

All tests passing: 438 total (44 citation tests, 15 metrics tests, 3 loop tests)

#### Code Review Fixes (2025-12-18)

- **[M2] Slack link escaping**: Added `escapeSlackLinkChars()` to properly escape `|`, `<`, `>` in URLs and display text
- **[M3] Confluence URL extraction**: Added `extractUrlFromReference()` to extract URLs from tool source references like `confluence: Title (https://...)`
- **[M4] AC#4 verification integration**: Updated `cites_sources` rule to use `detectUncitedClaims()` and new `detectFactualClaims()` for proper flagging
- **[M5] FACTUAL_INDICATORS usage**: Added `detectFactualClaims()` function that uses the patterns
- Added 11 new tests for escaping, URL extraction, and factual claim detection

### File List

Files created:
- `src/agent/citations.ts` - Citation types, formatting, URL extraction, Slack escaping, factual claim detection
- `src/agent/citations.test.ts` - 44 tests for citation module

Files modified:
- `src/agent/loop.ts` - Enhanced cites_sources rule with detectUncitedClaims + detectFactualClaims integration
- `src/agent/loop.test.ts` - Added 3 tests for citation verification
- `src/agent/orion.ts` - Updated source formatting to use citation footer
- `src/observability/metrics.ts` - Added citation metrics tracking (trackCitations, getCitationMetrics)
- `src/observability/metrics.test.ts` - Added 15 tests for citation metrics

