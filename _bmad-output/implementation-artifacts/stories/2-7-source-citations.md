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
  - [x] Define **inline citation markers** format: `[1]`, `[2]`, etc.
  - [x] Define **Slack "Sources" Block Kit context block** format (primary UX output)
  - [x] Define optional **footer citations** string format (fallback plain text)

- [x] **Task 2: Extract Sources from Context** (AC: #1)
  - [x] Track sources during gather phase (Story 2.2 gather contract)
  - [x] Normalize gathered sources into a single registry for a response:
    - [x] Stable ordering + IDs (1..N)
    - [x] `title` (human readable)
    - [x] `url?` (when available)
    - [x] optional `excerpt?` (short, not raw dumps)
  - [x] Surface sources to Slack without changing streaming behavior:
    - [x] Add `sources?: Citation[]` to the generator return value (`AgentResult`) in `src/agent/orion.ts`
    - [x] `src/slack/handlers/user-message.ts` already captures `AgentResult` via a `next()` loop
    - [x] If `src/agent/loop.ts` exists (Story 2.2): ensure the loop populates sources and `runOrionAgent()` passes them through unchanged

- [x] **Task 3: Format Citations for Slack** (AC: #2)
  - [x] Create `formatCitationLink()` helper that uses Slack syntax `<URL|text>`
  - [x] Handle sources without URLs (render as plain text title)
  - [x] Create `src/slack/sources-block.ts` that renders citations as a Block Kit context block:
    - Example (UX spec): `📎 Sources: [1] Name | [2] Name | [3] Name`

- [x] **Task 4: Add Citation to Verification** (AC: #4)
  - [x] Use simple heuristic for factual claim detection (see Dev Notes below)
  - [x] Compare sources gathered vs citations rendered:
    - [x] If sources gathered but **no sources block** was sent, flag
    - [x] If you also require inline markers for some response types, check `[\d+]` markers too
  - [x] Add/extend the verification rule in `src/agent/verification.ts` (created in Story 2.3)
  - [x] Emit Langfuse warning/event when citation rate falls below 90% over a rolling window (Langfuse-first)

- [x] **Task 5: Track Citation Metrics** (AC: #3)
  - [x] Track in Langfuse (events/spans; no separate metrics backend required)
  - [x] Define the v1 metric precisely:
    - **eligible_response**: `sourcesGatheredCount > 0`
    - **cited_response**: eligible_response AND `sourcesBlockSent === true`
    - **citation_rate_v1**: `cited_responses / eligible_responses` (target > 90%)
  - [x] Also log basic per-response counters:
    - `sourcesGatheredCount`
    - `sourcesCitedCount` (IDs rendered in block)
    - `inlineCitationMarkerCount` (unique `[n]` markers in text, if used)

- [x] **Task 6: Verification** (AC: all)
  - [x] Ask factual question
  - [x] Verify response includes a sources block when sources are gathered
  - [x] Verify links are clickable (Slack link syntax)
  - [x] Check Langfuse events/spans contain citation metrics and no PII

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR6 | prd.md | System cites sources for factual claims |

### Citation Formats

```typescript
// Inline citation
"SambaTV provides TV viewership data [1]"

// Footer citations (text format) — fallback only
"\n\n_Sources:_\n• [1] <https://confluence.samba.tv/page|Company Overview>"

// Slack link format
"<https://url.com|Display Text>"
```

### Block Kit Context Block for Sources (UX Spec Pattern)

Per UX design specification, sources should be rendered as a Block Kit context block for better visual treatment:

```typescript
// src/slack/sources-block.ts
// Follow repo conventions from src/slack/feedback-block.ts (local interfaces; cast at call site)

export interface SourceCitation {
  id: number;
  title: string;
  url?: string;
}

/**
 * Create Block Kit context block for source citations
 * Per UX spec: "📎 Sources: [1] Name | [2] Name | [3] Name"
 */
interface SourcesContextBlock {
  type: 'context';
  elements: Array<{ type: 'mrkdwn'; text: string }>;
}

export function createSourcesContextBlock(
  sources: SourceCitation[]
): SourcesContextBlock | null {
  if (sources.length === 0) return null;

  const sourceText = sources
    .map(s => {
      const link = s.url ? `<${s.url}|${s.title}>` : s.title;
      return `[${s.id}] ${link}`;
    })
    .join(' | ');

  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📎 *Sources:* ${sourceText}`,
      },
    ],
  };
}
```

### Integration with Response Streaming

```typescript
// In src/slack/handlers/user-message.ts (matches current repo patterns)

// After streaming text response completes
await streamer.stop();

// AgentResult is already captured in this handler via the manual next() loop
const sources = (agentResult.sources ?? []).map((s, i) => ({
  id: i + 1,
  title: s.title,
  url: s.url,
}));

// Post sources as a follow-up message (same pattern as feedback buttons)
if (sources.length > 0) {
  const block = createSourcesContextBlock(sources);
  if (block) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs ?? undefined,
      text: ' ',
      blocks: [block as unknown as Block],
      metadata: { event_type: 'orion_sources', event_payload: { traceId: trace.id } },
    });
  }
}

// Then post feedback buttons message (Story 1.8)
await client.chat.postMessage({ ...feedbackBlock... });
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
 * 2. Check if the response contains ANY citation markers [1], [2], etc. (optional)
 * 3. Check whether a sources block was sent when sources were gathered (primary)
 * 4. If sources gathered but no citations rendered → likely uncited factual claims
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

### File Structure After This Story

```
orion-slack-agent/
├── src/
│   ├── agent/
│   │   ├── orion.ts                # Updated: surface sources via AgentResult return value (streaming unchanged)
│   │   ├── loop.ts                 # From Story 2.2 (if implemented): populate sources during gather/act
│   │   ├── citations.ts            # NEW: Citation type, formatCitationFooter, detectUncitedClaims
│   │   ├── compaction.ts           # From Story 2.6
│   │   ├── loader.ts               # From Story 2.1
│   │   └── tools.ts                # From Story 2.1
│   ├── slack/
│   │   ├── sources-block.ts        # NEW: createSourcesContextBlock (Block Kit context block)
│   │   ├── thread-context.ts       # From Story 2.5
│   │   └── handlers/
│   │       └── user-message.ts     # Posts sources block message after streaming, before feedback
│   └── ...
└── ...
```

### References

- [Source: _bmad-output/epics.md#Story 2.7] — Original story
- [Source: _bmad-output/ux-design-specification.md#Source Citations] — UX citation pattern

### Previous Story Intelligence

From Story 2-6 (Context Compaction):
- Compaction preserves key facts—citations should reference original sources
- Long conversations may have many sources—compaction summary should note them

From Story 2-3 (Verification & Retry):
- Create/extend `src/agent/verification.ts` to include a citation rule
- Verification is responsible for flagging uncited responses when sources were gathered

From Story 2-2 (Agent Loop):
- Gather phase records sources (per Story 2.2 gather contract)
- Sources are surfaced to the Slack layer via the generator return value (`AgentResult`) or an AgentResponse wrapper if `src/agent/loop.ts` exists

From Story 1-8 (Feedback Buttons):
- Feedback is sent as a follow-up message with blocks (`src/slack/handlers/user-message.ts`)
- Sources follow the same follow-up-message pattern and should be posted before feedback

From Story 1-5 (Response Streaming):
- Current repo streams text via `SlackStreamer`, then posts follow-up messages for blocks
- Do not change the `streamer.stop()` signature; post sources as a follow-up `chat.postMessage`

### Tests (explicit targets)

- `src/slack/sources-block.test.ts` (new): `createSourcesContextBlock()` renders correct Slack link syntax and handles no-url sources
- `src/slack/handlers/user-message.test.ts`: when `agentResult.sources` is non-empty, a sources message is posted **before** the feedback message
- `src/agent/orion.test.ts`: AgentResult can carry `sources` metadata without affecting streaming behavior

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Completion Notes List

- Inline citations are less intrusive for short responses
- Footer citations better for research-heavy responses
- **Prompt engineering is key**: Include "cite sources using [1], [2] format" in system prompt
- Simple heuristic approach avoids complex NLP for v1
- **Implementation validated**: sources now carry `title` + optional `url` from gather → agent → Slack sources block
- **Verification tightened**: when sources exist, verification expects `[n]` markers or a sources footer (not just “according to”)
- **Metrics fixed**: `detectUncitedClaims()` now receives gathered sources; added in-memory rolling window warning (`citation_rate_warning`)
- **Slack safety**: sanitize link text/urls to avoid breaking `<url|text>` syntax
- All tests pass with no regressions (476 passed)

### File List

Files created:
- `src/agent/citations.ts` — Citation type, formatCitationLink, formatCitationFooter, detectUncitedClaims, FACTUAL_INDICATORS
- `src/agent/citations.test.ts` — Unit tests for citation module
- `src/agent/gather.ts` — Gather sources now include `title` + optional `url`
- `src/agent/gather.test.ts` — Gather phase tests
- `src/agent/loop.ts` — Canonical agent loop (gather/act/verify) returning sources
- `src/agent/loop.test.ts` — Agent loop tests
- `src/agent/orion.ts` — Public streaming entry point; `AgentResult.sources?: ContextSource[]`
- `src/agent/orion.test.ts` — Verifies AgentResult can carry `sources`
- `src/agent/verification.ts` — Verification rule requires real citations when sources exist
- `src/agent/verification.test.ts` — Verification tests
- `src/slack/sources-block.ts` — createSourcesContextBlock for Block Kit context block
- `src/slack/sources-block.test.ts` — Unit tests for sources block
- `src/observability/citation-rate.ts` — Rolling window citation-rate tracker
- `src/observability/citation-rate.test.ts` — Tests for rolling citation-rate tracker

Files modified:
- `src/slack/handlers/user-message.ts` — Posts sources block after streaming, tracks citation metrics + rolling warning
- `src/slack/handlers/user-message.test.ts` — Asserts sources message posted before feedback when sources exist

### Change Log

- 2025-12-23: Code review fixes applied - sources carry title/url, verification tightened, rolling citation-rate warning added, tests updated (476 passed)

## Senior Developer Review (AI)

### Summary

- ✅ **AC#1**: Sources are gathered and surfaced; citations can be rendered inline or as a sources follow-up.
- ✅ **AC#2**: If a source has a URL, Slack rendering uses `<url|text>` (and sanitizes values).
- ✅ **AC#3**: Per-response citation metrics are emitted; rolling-window rate warning is emitted when below target.
- ✅ **AC#4**: Verification now flags missing citations when sources exist (prefers `[n]` markers or footer).

### Notable Fixes Applied

- Sources now include `title` + optional `url` in `ContextSource` and are passed through to Slack.
- `detectUncitedClaims()` is now called with gathered sources (not an empty array).
- Added rolling citation-rate tracking (`src/observability/citation-rate.ts`) + warning event when below target.
- Added/updated tests to assert sources message posting and ordering, and to cover sanitization.

