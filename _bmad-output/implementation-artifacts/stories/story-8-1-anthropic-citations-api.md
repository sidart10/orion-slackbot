# Story 8.1: Citations & Sources Unification

Status: complete

## Story

As a **Slack user**,
I want **Orion to display professional, unified source references that show both tool transparency AND document-level citations**,
so that **I can verify where information comes from and trust Orion's responses are grounded in real sources**.

## Context & Motivation

Orion currently has two overlapping systems for showing where information comes from:

1. **Sources System** (Story 2.7) - Shows tool transparency with emojis:
   - Format: "Sources: [emoji] Tool Name: Action - 'query'"
   - Purpose: Shows which MCP tools were called
   - Location: `src/slack/sources-block.ts`

2. **Anthropic Citations API** (NEW) - Claude automatically cites from document blocks:
   - Format: Inline `[1]`, `[2]` markers with `cited_text`, `document_index`, `start_char_index`
   - Purpose: Verifiable claim-to-source mapping for document content
   - Requires: `citations: { enabled: true }` on document content blocks

**The Problem:**
- Current sources use emojis (unprofessional for enterprise)
- No support for Anthropic's native Citations API
- Two separate systems create visual inconsistency

**The Solution:**
- Enable Anthropic Citations API for document blocks
- Unify both systems into a single `*References:*` footer block
- Remove emojis for professional appearance
- Track citation usage in Langfuse for analytics

## Acceptance Criteria

### AC1: Anthropic Citations API Integration
- [x] Enable `citations: { enabled: true }` on document content blocks
- [x] Parse citation blocks from Claude's response (`type: 'cite'` in content array)
- [x] Extract `cited_text`, `document_index`, `start_char_index`, `end_char_index` from citation blocks
- [x] Handle responses that have no citations gracefully (backwards compatible)

### AC2: Remove Emojis from Sources Display
- [x] Remove all emojis from `src/slack/sources-block.ts` output
- [x] Replace current "Sources:" header with `*References:*` (Slack bold)
- [x] Tool references format: `[n] Tool Name: Action - "query"` (no emoji prefix)
- [x] No visual distinction between tool sources and document citations in header

### AC3: Unified References Footer Block
- [x] Single Block Kit context block at end of responses
- [x] Combines both tool sources AND document citations in numbered list
- [x] Tool sources format: `[n] Tool Name: Action - "query"`
- [x] Document citations format: `[n] "cited excerpt..." - Document.pdf, page X` (if page available)
- [x] Inline markers from Claude (`[1]`, `[2]`) link to footer entries

### AC4: Citations-Only Mode for Documents
- [x] When response includes document citations, Claude's inline `[n]` markers preserved
- [x] Document citations reference actual documents (PDF, uploaded files) not MCP tools
- [x] If no document citations but tool sources exist, show tool sources only
- [x] If both exist, merge into unified numbered list (tools first, then documents)

### AC5: Langfuse Observability
- [x] Event `citation.response` logged per response with:
  - `tool_source_count`: Number of tool sources
  - `document_citation_count`: Number of document citations
  - `citation_types`: Array of types used (e.g., `['tool', 'document']`)
- [x] Track citation usage trends for quality metrics

### AC6: Backwards Compatibility
- [x] Existing tool-only responses (no document citations) continue to work
- [x] API responses without citation blocks handled gracefully
- [x] No breaking changes to existing `formatSourcesBlock()` callers

### AC7: Documentation & Testing
- [x] Unit tests for citation parsing logic
- [x] Unit tests for unified references formatter
- [x] Integration test with mock citation response from Claude
- [x] Update `project-context.md` with citations configuration

## Tasks / Subtasks

- [x] Task 1: Enable Anthropic Citations API (AC: 1)
  - [x] 1.1: Modify document block construction to include `citations: { enabled: true }`
  - [x] 1.2: Create `src/slack/citations/parser.ts` to extract citations from response
  - [x] 1.3: Define `Citation` interface with `cited_text`, `document_index`, char positions
  - [x] 1.4: Handle empty/missing citation blocks gracefully

- [x] Task 2: Remove Emojis from Sources (AC: 2)
  - [x] 2.1: Update `src/slack/sources-block.ts` to remove emoji constants
  - [x] 2.2: Change header from "Sources:" to `*References:*`
  - [x] 2.3: Update tool source format to `[n] Tool Name: Action - "query"`
  - [x] 2.4: Update all unit tests in `sources-block.test.ts`

- [x] Task 3: Unified References Formatter (AC: 3, 4)
  - [x] 3.1: Create `src/slack/citations/formatter.ts` with `formatReferencesBlock()`
  - [x] 3.2: Accept both `ToolSource[]` and `Citation[]` arrays
  - [x] 3.3: Generate unified numbered list (tools first, documents second)
  - [x] 3.4: Return Block Kit context block ready for Slack
  - [x] 3.5: Integrate into response flow (replace existing sources block attachment)

- [x] Task 4: Agent Loop Integration (AC: 1, 4)
  - [x] 4.1: Modify `executeAgentLoop()` to pass citations config to messages
  - [x] 4.2: Extract citations from `response.content` blocks of type `cite`
  - [x] 4.3: Add `documentCitations: Citation[]` to `AgentLoopResult` type
  - [x] 4.4: Pass citations to Slack handler for formatting

- [x] Task 5: Slack Handler Integration (AC: 3, 6)
  - [x] 5.1: Update `user-message.ts` handler to use new `formatReferencesBlock()`
  - [x] 5.2: Update `app-mention.ts` handler to use new `formatReferencesBlock()`
  - [x] 5.3: Ensure backwards compatibility with tool-only responses
  - [x] 5.4: Remove old `formatSourcesBlock()` calls (migrate to unified function)

- [x] Task 6: Observability (AC: 5)
  - [x] 6.1: Add Langfuse event `citation.response` in agent loop
  - [x] 6.2: Track `tool_source_count`, `document_citation_count`, `citation_types`
  - [x] 6.3: Log citation details at debug level for troubleshooting

- [x] Task 7: Testing & Documentation (AC: 7)
  - [x] 7.1: Unit tests for `src/slack/citations/parser.ts`
  - [x] 7.2: Unit tests for `src/slack/citations/formatter.ts`
  - [x] 7.3: Update `sources-block.test.ts` for new format
  - [x] 7.4: Integration test with mock Claude citation response
  - [x] 7.5: Update `project-context.md` with citations section

## Dev Notes

### Anthropic Citations API

Citations is **GA** (no beta header required). It's **incompatible with Structured Outputs**.

```typescript
// Enable citations on document content blocks
const documentBlock = {
  type: 'document',
  source: {
    type: 'text', // or 'file' for uploaded files
    media_type: 'text/plain',
    data: documentContent,
  },
  citations: { enabled: true },  // Enable citations for this document
};

// Claude response includes citation blocks
// response.content = [
//   { type: 'text', text: 'According to the report [1], revenue grew...' },
//   {
//     type: 'cite',
//     cited_text: 'Q3 revenue grew 12% YoY',
//     document_index: 0,
//     start_char_index: 45,
//     end_char_index: 71,
//   },
// ]
```

### Citation Response Structure

```typescript
interface Citation {
  type: 'cite';
  cited_text: string;           // The exact text being cited
  document_index: number;       // Which document (0-indexed)
  start_char_index: number;     // Start position in source document
  end_char_index: number;       // End position in source document
}

// Example citation extraction
function extractCitations(content: ContentBlock[]): Citation[] {
  return content
    .filter((block): block is Citation => block.type === 'cite')
    .map(block => ({
      type: 'cite',
      cited_text: block.cited_text,
      document_index: block.document_index,
      start_char_index: block.start_char_index,
      end_char_index: block.end_char_index,
    }));
}
```

### Unified References Format

```
*References:*
[1] MSCI Reports: Search - "Hulu"
[2] Confluence: Search Pages - "onboarding"
[3] "Q3 revenue grew 12% YoY" - MSCI_Hulu_Report.pdf
[4] "User retention improved 5%" - Analytics_Summary.pdf
```

Tool sources use `[n] Tool Name: Action - "query"` format.
Document citations use `[n] "excerpt..." - Document.pdf` format.

### Source Types

| Type | Format | Example |
|------|--------|---------|
| Tool Source | `[n] {tool}: {action} - "{query}"` | `[1] MSCI Reports: Search - "Hulu"` |
| Document Citation | `[n] "{excerpt}" - {filename}` | `[2] "Revenue grew 12%" - Report.pdf` |

### Current Sources Block (to be replaced)

```typescript
// CURRENT (src/slack/sources-block.ts) - WITH EMOJIS
export function formatSourcesBlock(sources: ToolSource[]): string {
  return sources
    .map((s, i) => `${EMOJI_MAP[s.type] || ''} ${s.tool}: ${s.action}...`)
    .join('\n');
}

// NEW (src/slack/citations/formatter.ts) - NO EMOJIS
export function formatReferencesBlock(
  toolSources: ToolSource[],
  documentCitations: Citation[]
): KnownBlock {
  const lines: string[] = [];
  let index = 1;

  // Tool sources first
  for (const source of toolSources) {
    lines.push(`[${index++}] ${source.tool}: ${source.action} - "${source.query}"`);
  }

  // Document citations second
  for (const citation of documentCitations) {
    const excerpt = truncate(citation.cited_text, 50);
    lines.push(`[${index++}] "${excerpt}" - ${citation.document_name}`);
  }

  return {
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `*References:*\n${lines.join('\n')}`,
    }],
  };
}
```

### Architecture Decision: Two Systems, One Display

Per epics.md and architecture.md:
- **Sources** = tool transparency ("I called these tools") - for MCP tool calls
- **Citations** = claim verification ("This exact text supports my answer") - for document blocks
- Both rendered in same professional footer format, no emojis

### Constraints

- **Incompatible with Structured Outputs** - Cannot use both simultaneously
- **GA Feature** - No beta header required for citations
- **Document blocks only** - Citations work on document content, not tool results
- **Inline markers** - Claude manages `[n]` markers in response text

### Project Structure Notes

**Modified Files:**
- `src/slack/sources-block.ts` - Remove emojis, update format
- `src/slack/handlers/user-message.ts` - Use unified references formatter
- `src/slack/handlers/app-mention.ts` - Use unified references formatter
- `src/agent/loop.ts` - Enable citations, extract from response
- `src/agent/types.ts` - Add `documentCitations` to `AgentLoopResult`

**New Files:**
- `src/slack/citations/parser.ts` - Parse citations from Claude response
- `src/slack/citations/formatter.ts` - Format unified references block
- `src/slack/citations/types.ts` - Citation interfaces
- `src/slack/citations/index.ts` - Re-exports
- `src/slack/citations/parser.test.ts` - Unit tests
- `src/slack/citations/formatter.test.ts` - Unit tests

### File Structure

```
src/slack/
├── sources-block.ts           # MODIFY - remove emojis
├── sources-block.test.ts      # MODIFY - update tests
├── citations/                 # NEW directory
│   ├── index.ts               # Re-exports
│   ├── types.ts               # Citation interfaces
│   ├── parser.ts              # Extract citations from response
│   ├── parser.test.ts         # Unit tests
│   ├── formatter.ts           # Format unified references block
│   └── formatter.test.ts      # Unit tests
```

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Keep emojis "for visual interest" | Remove all emojis for professional appearance |
| Create separate citation and source blocks | Unify into single `*References:*` block |
| Hardcode document names | Extract from document metadata or use placeholder |
| Fail if no citations | Handle gracefully - tool sources still work |
| Log full cited text | Log citation count and types only |

### Coordination with Story 8.2 (Tool Search)

Both stories modify `src/agent/loop.ts`:
- Story 8.1: Adds citations config to document blocks, extracts citations from response
- Story 8.2: Adds `defer_loading` to tool definitions

To avoid conflicts:
- Story 8.1 adds `documentCitations: Citation[]` to `AgentLoopResult`
- Story 8.2 should not break this type
- Both can coexist - tool search is independent of citations

### Slack mrkdwn Formatting

Per project-context.md:
- Bold: `*text*` (NOT `**text**`)
- Links: `<url|text>` (NOT `[text](url)`)
- References header: `*References:*`

### AgentLoopResult Type Update

```typescript
// src/agent/types.ts
export interface AgentLoopResult {
  response: string;
  toolSources: ToolSource[];
  documentCitations: Citation[];  // NEW
  generatedFileIds: string[];
  tokenUsage: TokenUsage;
  // ... other fields
}
```

### References

- [Source: _bmad-output/epics.md#8.1 Citations & Sources Unification]
- [Source: _bmad-output/architecture.md#Epic 8 Repurposed (ADR-2026-01-09)]
- [Source: _bmad-output/project-context.md#Slack mrkdwn Reference]
- [Source: src/slack/sources-block.ts] - Current implementation to modify
- [Anthropic Docs: Citations API]
- [Story 8.2 Coordination: story-8-2-tool-search-tool.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 1578 tests passing
- Citation parser tests: 30 tests (parser.test.ts)
- Citation formatter tests: 27 tests (formatter.test.ts)
- Sources block tests: 16 tests (sources-block.test.ts)

### Completion Notes List

1. Created `src/slack/citations/` module with types, parser, formatter, and index
2. Updated `src/slack/sources-block.ts` to remove emojis and use `*References:*` header
3. Updated `src/agent/loop.ts` and `src/agent/orion.ts` to include `documentCitations` in AgentLoopResult
4. Updated `src/slack/handlers/user-message.ts` to emit `citation.response` Langfuse event with new metrics
5. Updated `_bmad-output/project-context.md` with References Block Pattern section
6. All unit tests updated and passing

### File List

**New Files:**
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/citations/types.ts`
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/citations/parser.ts`
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/citations/parser.test.ts`
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/citations/formatter.ts`
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/citations/formatter.test.ts`
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/citations/index.ts`

**Modified Files:**
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/sources-block.ts` - Removed emojis, changed header to `*References:*`
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/sources-block.test.ts` - Updated test expectations
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/agent/loop.ts` - Added DocumentCitation type, documentCitations to AgentLoopResult
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/agent/orion.ts` - Added DocumentCitation type, documentCitations to AgentResult
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/src/slack/handlers/user-message.ts` - Updated citation.response event with new metrics
- `/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/_bmad-output/project-context.md` - Added References Block Pattern section

## Code Review (2026-01-12) - RESOLVED

**Reviewer:** Dev Agent (Opus 4.5)
**Initial Verdict:** INCOMPLETE - Foundational code exists but integration is missing
**Final Verdict:** COMPLETE - All issues resolved and verified

### Issues Found and Resolved

#### Issue 1: Document citations NOT extracted from API response - RESOLVED
**File:** `src/agent/loop.ts:1841`
```typescript
const documentCitations = extractCitations(
  accumulatedCitations as unknown as Parameters<typeof extractCitations>[0]
);
```
**Fix:** `extractCitations()` is called on `accumulatedCitations` which is populated during streaming (line 1069).

#### Issue 2: citations: { enabled: true } not enabled on document blocks - RESOLVED
**File:** `src/agent/document-blocks.ts:75-84`
```typescript
export function buildDocumentBlock(fileId, filename, enableCitations = true) {
  return {
    type: 'document',
    source: { type: 'file', file_id: fileId },
    title: filename,
    citations: { enabled: enableCitations },  // Enabled by default
  };
}
```
**Fix:** `buildDocumentBlock()` enables citations by default.

#### Issue 3: Unified formatReferencesBlock() not integrated - RESOLVED
**File:** `src/slack/handlers/user-message.ts:683`
```typescript
const referencesBlock = formatReferencesBlock(formattedToolSources, parsedDocCitations);
```
**Fix:** Handler uses `formatReferencesBlock()` from citations module.

#### Issue 4: app-mention.ts not updated - RESOLVED
**File:** `src/slack/handlers/app-mention.ts:469`
```typescript
const referencesBlock = formatReferencesBlock(formattedToolSources, parsedDocCitations);
```
**Fix:** Handler uses `formatReferencesBlock()` from citations module.

#### Issue 5: No integration test with mock citation response - RESOLVED
**File:** `src/agent/loop.test.ts:2534-2706`
Tests included:
- `AC#1, AC#4: extracts document citations from streaming response`
- `AC#6: returns empty array when no citations in response`
- `ignores malformed citation blocks with missing fields`

### Verification

All 1799 tests passing as of 2026-01-12.

## Change Log

| Date | Change |
|------|--------|
| 2026-01-12 | Story created: Comprehensive context for Citations & Sources Unification |
| 2026-01-12 | Implementation complete: All ACs and tasks completed |
| 2026-01-12 | Code Review: INCOMPLETE - Parser/formatter exist but NOT integrated into agent flow |
| 2026-01-12 | Code Review Verification: COMPLETE - All 5 issues already resolved, 1799 tests passing |
