# Story 8.1: Anthropic Citations API Integration

Status: drafted

## Story

As a **user**,
I want Orion's responses to include verifiable citations from source documents,
so that I can trust the information and verify claims against original sources.

## Background

We currently have two citation/source systems:
1. **Tool Sources (Story 2.7):** Shows transparency about which tools were called ("I called these MCP tools")
2. **Anthropic Citations API (NEW):** Provides document-level claim verification ("This exact text supports my answer")

This story integrates Anthropic's Citations API alongside the existing sources system, then unifies both into a professional `*References:*` footer block (no emojis).

### Why This Matters

- **User Trust:** Citations with exact quoted text and page numbers increase response credibility
- **Verification:** Users can click through to verify claims in original documents
- **Cost Efficiency:** Anthropic's `cited_text` does not count toward output tokens
- **Quality:** Anthropic's internal evals show 15% better citation accuracy vs prompt-based approaches

### Anthropic Citations API Overview

The Citations API enables Claude to cite specific passages from documents, providing verifiable references with exact quoted text and source locations.

**How to Enable:**
```json
{
  "type": "document",
  "source": {
    "type": "text",
    "media_type": "text/plain",
    "data": "The grass is green. The sky is blue."
  },
  "title": "My Document",
  "context": "This is a trustworthy document.",
  "citations": {"enabled": true}
}
```

**Response Structure:**
```json
{
  "content": [
    { "type": "text", "text": "According to the document, " },
    {
      "type": "text",
      "text": "the grass is green",
      "citations": [{
        "type": "char_location",
        "cited_text": "The grass is green.",
        "document_index": 0,
        "document_title": "Example Document",
        "start_char_index": 0,
        "end_char_index": 20
      }]
    }
  ]
}
```

**Citation Types:**
| Document Type | Citation Type | Location Format |
|--------------|--------------|-----------------|
| Plain text | `char_location` | Character indices (0-indexed) |
| PDF | `page_location` | Page numbers (1-indexed) |
| Custom content | `content_block_location` | Block indices (0-indexed) |

**Key Constraints:**
- Citations must be enabled on ALL or NONE of the documents in a request
- **INCOMPATIBLE with Structured Outputs** - returns 400 error if both enabled
- Only text citations supported (no image citations)
- GA feature - no beta header required

## Acceptance Criteria

### AC1: Enable Citations on Document Blocks

**Given** a document block (text or PDF) is included in the API request,
**When** the document has potential citations enabled,
**Then** set `citations: { enabled: true }` on that document block.

### AC2: Parse Citation Blocks from Response

**Given** Claude's response contains text blocks with `citations` arrays,
**When** processing the response for Slack rendering,
**Then** extract citation metadata (`cited_text`, `document_index`, location info).

### AC3: No Emojis in Sources Block

**Given** the current sources-block.ts uses emojis (`:globe_with_meridians:`, `:wrench:`, etc.),
**When** rendering the unified references footer,
**Then** remove ALL emojis and use plain `*References:*` header instead.

### AC4: Unified References Footer

**Given** a response has both tool sources AND document citations,
**When** rendering the footer block,
**Then** combine into single Block Kit context block with format:
```
*References:*
[1] MSCI Reports: Search — "Hulu"
[2] "Hulu's Q3 revenue grew 12% YoY" — MSCI_Hulu_Report.pdf, page 3
```

### AC5: Tool Sources Format

**Given** a tool was called during the response,
**When** rendering its reference entry,
**Then** use format: `[n] Tool Name: Action — "query"` (no emoji prefix).

### AC6: Document Citations Format

**Given** a document citation exists in Claude's response,
**When** rendering its reference entry,
**Then** use format: `[n] "cited text excerpt..." — Document.pdf, page X` for PDFs, or `[n] "cited text..." — Document.txt, chars X-Y` for text.

### AC7: Inline Markers Preserved

**Given** Claude generates inline citation markers `[1]`, `[2]` in response text,
**When** rendering to Slack,
**Then** preserve markers (Slack mrkdwn supports `[n]` syntax) linking to footer references.

### AC8: Langfuse Tracking

**Given** a response is generated with or without citations,
**When** the response completes,
**Then** emit Langfuse event with:
- `citation_count`: number of document citations
- `source_count`: number of tool sources
- `citation_types`: array of types used (tool, char_location, page_location, content_block_location)
- `documents_with_citations`: count of documents that had citations enabled

### AC9: Backwards Compatible

**Given** a response uses only MCP tools (no document blocks),
**When** rendering the sources footer,
**Then** behavior unchanged except emoji removal per AC3.

### AC10: Streaming Support

**Given** citations are enabled on documents,
**When** streaming the response,
**Then** handle `citations_delta` events to accumulate citations during streaming.

## Tasks / Subtasks

### Task 1: Citation Types Definition (AC: #2, #6)

Create `src/agent/citations-api.ts`:

- [ ] **1.1** Define `DocumentCitation` interface matching Anthropic response:
  ```typescript
  interface DocumentCitation {
    type: 'char_location' | 'page_location' | 'content_block_location';
    cited_text: string;
    document_index: number;
    document_title?: string;
    // char_location
    start_char_index?: number;
    end_char_index?: number;
    // page_location
    start_page_number?: number;
    end_page_number?: number;
    // content_block_location
    start_block_index?: number;
    end_block_index?: number;
  }
  ```

- [ ] **1.2** Define `CitationTextBlock` interface for response parsing:
  ```typescript
  interface CitationTextBlock {
    type: 'text';
    text: string;
    citations?: DocumentCitation[];
  }
  ```

- [ ] **1.3** Export `extractCitationsFromResponse(response)` helper function

### Task 2: Document Block Builder (AC: #1)

Create helper in `src/agent/document-blocks.ts`:

- [ ] **2.1** Create `buildCitableDocumentBlock(params)` helper:
  ```typescript
  interface DocumentBlockParams {
    content: string;
    title: string;
    mediaType: 'text/plain' | 'application/pdf';
    context?: string;
  }
  function buildCitableDocumentBlock(params: DocumentBlockParams): DocumentBlock
  ```

- [ ] **2.2** Handle base64 encoding for PDF content

- [ ] **2.3** Always set `citations: { enabled: true }` (fail-safe default)

### Task 3: Response Citation Extraction (AC: #2, #10)

Modify `src/agent/loop.ts`:

- [ ] **3.1** Add citation accumulation during streaming (handle `citations_delta` events)

- [ ] **3.2** Create `extractAllCitations(responseContent)` to collect citations from all text blocks

- [ ] **3.3** Include extracted citations in `AgentLoopResult`:
  ```typescript
  interface AgentLoopResult {
    // ... existing fields
    documentCitations: DocumentCitation[];
  }
  ```

- [ ] **3.4** Handle streaming event type `citations_delta`:
  ```typescript
  // In stream loop
  if (event.delta?.type === 'citations_delta') {
    const citation = event.delta.citation;
    // Accumulate citation for current text block
  }
  ```

### Task 4: Unified References Rendering (AC: #3, #4, #5, #6, #7)

Modify `src/slack/sources-block.ts`:

- [ ] **4.1** Rename `createSourcesContextBlock` to `createReferencesBlock`

- [ ] **4.2** Remove ALL emoji constants and `getSourceEmoji()` function

- [ ] **4.3** Create new `UnifiedReference` interface:
  ```typescript
  interface UnifiedReference {
    id: number;
    type: 'tool' | 'document';
    // Tool reference
    toolName?: string;
    toolAction?: string;
    toolQuery?: string;
    // Document citation
    citedText?: string;
    documentTitle?: string;
    pageNumber?: number;
    charRange?: { start: number; end: number };
  }
  ```

- [ ] **4.4** Update rendering format:
  - Tool: `[n] Tool Name: Action — "query"`
  - Document (PDF): `[n] "cited text..." — Document.pdf, page X`
  - Document (text): `[n] "cited text..." — Document.txt`

- [ ] **4.5** Replace header from `📎 *Sources:*` to `*References:*`

- [ ] **4.6** Update all callers to use new interface

### Task 5: Handler Integration (AC: #1, #9)

Modify `src/slack/handlers/user-message.ts` and `app-mention.ts`:

- [ ] **5.1** Detect document content in user messages (e.g., from Story 8.3 Slack file ingestion)

- [ ] **5.2** Build citable document blocks when documents present

- [ ] **5.3** Pass document citations from `AgentLoopResult` to references block

- [ ] **5.4** Merge tool sources + document citations for unified rendering

### Task 6: Langfuse Observability (AC: #8)

Add observability events:

- [ ] **6.1** Create `citations.tracked` event in loop.ts after response completes

- [ ] **6.2** Include metrics:
  ```typescript
  langfuse.event({
    name: 'citations.tracked',
    metadata: {
      traceId: context.traceId,
      citationCount: documentCitations.length,
      sourceCount: toolSources.length,
      citationTypes: uniqueCitationTypes,
      documentsWithCitations: documentsEnabled,
    },
  });
  ```

### Task 7: Unit Tests (AC: all)

Create comprehensive test coverage:

- [ ] **7.1** `src/agent/citations-api.test.ts`:
  - Parse char_location citations
  - Parse page_location citations
  - Parse content_block_location citations
  - Handle empty citations array
  - Handle missing optional fields

- [ ] **7.2** `src/agent/document-blocks.test.ts`:
  - Build plain text document block
  - Build PDF document block (base64)
  - Verify citations enabled on all blocks

- [ ] **7.3** `src/slack/sources-block.test.ts` (update existing):
  - No emojis in output
  - Tool references format correct
  - Document citations format correct
  - Combined tool + document rendering
  - Backwards compatibility (tool-only responses)

- [ ] **7.4** `src/agent/loop.test.ts` (update existing):
  - Citations extracted from streaming response
  - DocumentCitations included in AgentLoopResult
  - citations_delta events handled

### Task 8: Documentation (AC: all)

- [ ] **8.1** Update `project-context.md` with Citations API patterns

- [ ] **8.2** Document incompatibility with Structured Outputs

- [ ] **8.3** Document reference format standards

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR6 | prd.md | System cites sources for factual claims |
| FR6 enhanced | epics.md #Epic 8.1 | Unify tool sources + document citations |
| Citations API | Anthropic Docs | Enable `citations.enabled=true` on document blocks |
| No Structured Outputs | Anthropic Docs | Citations incompatible with `output_format` parameter |
| GA Status | Anthropic Docs | Citations is GA — NO beta header required (unlike PTC/Skills) |

### Project Structure Notes

**Files to Create:**
```
src/agent/citations-api.ts         # Citation type definitions, extraction helpers
src/agent/citations-api.test.ts    # Unit tests
src/agent/document-blocks.ts       # Document block builder with citations
src/agent/document-blocks.test.ts  # Unit tests
```

**Files to Modify:**
```
src/agent/loop.ts                  # Add citation extraction from streaming
src/slack/sources-block.ts         # Unify rendering, remove emojis
src/slack/sources-block.test.ts    # Update tests for new format
src/slack/handlers/user-message.ts # Integrate citations
src/slack/handlers/app-mention.ts  # Integrate citations
```

### Existing Code Patterns

**Current Sources Block (to be modified):**
```typescript
// src/slack/sources-block.ts - BEFORE
const SOURCE_TYPE_EMOJI: Record<SourceType, string> = {
  web: ':globe_with_meridians:',
  document: ':page_facing_up:',
  tool: ':wrench:',
  // ...
};

export function createSourcesContextBlock(sources: SourceCitation[])

// AFTER - rename and remove emojis
export function createReferencesBlock(references: UnifiedReference[])
```

**Current Citation Module (reuse patterns):**
```typescript
// src/agent/citations.ts - keep for formatSlackLink helper
export function formatSlackLink(params: { url: string; text: string }): string
```

**Agent Loop Pattern (extend):**
```typescript
// src/agent/loop.ts - add to AgentLoopResult
export interface AgentLoopResult extends AgentResult {
  sources: ContextSource[];
  documentCitations: DocumentCitation[];  // NEW
  // ...
}
```

### Streaming Citations Handling

Anthropic sends `citations_delta` events during streaming:
```typescript
// Example streaming event
event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "citations_delta",
    "citation": {
      "type": "char_location",
      "cited_text": "The grass is green.",
      "document_index": 0,
      // ...
    }
  }
}
```

Implementation pattern:
```typescript
// In stream loop (loop.ts)
const currentBlockCitations: DocumentCitation[] = [];

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    const delta = event.delta;
    if (delta?.type === 'citations_delta' && delta.citation) {
      currentBlockCitations.push(delta.citation as DocumentCitation);
    }
  }
}
```

### Token Cost Implications

- `cited_text` does NOT count toward output tokens (cost savings)
- `cited_text` is NOT counted toward input tokens when passed back in conversation
- Enabling citations incurs slight increase in input tokens due to document chunking

### Critical Constraints

1. **Structured Outputs Incompatibility:** Citations CANNOT be used with `output_format` parameter
   - Will return 400 error if both enabled
   - Currently no Structured Outputs in Orion, so no conflict

2. **All-or-None:** Citations must be enabled on ALL or NONE of documents in request
   - Solution: Always enable citations when any document present

3. **Sonnet 3.7 Note:** May need explicit instruction "Use citations to back up your answer"
   - Add to system prompt if using Sonnet 3.7

### Backwards Compatibility

- Existing tool-only responses continue to work
- Only difference: emoji removal from existing sources
- No breaking changes to AgentLoopResult consumers (new field is optional)

### References

- [Source: epics.md#Epic 8.1] — Story definition and acceptance criteria
- [Source: _bmad-output/implementation-artifacts/stories/2-7-source-citations.md] — Existing citation implementation
- [Source: Anthropic Citations API Docs](https://platform.claude.com/docs/en/build-with-claude/citations) — API reference
- [Source: project-context.md] — Coding standards and ESM import rules
- [Source: architecture.md] — System architecture patterns

### Previous Story Intelligence

**From Story 2.7 (Source Citations):**
- `createSourcesContextBlock()` already exists in `src/slack/sources-block.ts`
- `formatSlackLink()` helper available in `src/agent/citations.ts`
- Sources flow: gather → loop → handler → Slack block

**From Story 7.8 (Enhanced Slack UI Polish):**
- Block Kit patterns established in `src/slack/blocks/`
- `escapeMrkdwn()` helper for safe Slack rendering
- Truncation helpers already exist

**From Story 6.5 (Files API Client):**
- Files API patterns for downloading/uploading (reuse for 8.3)
- Beta header management via config

### Git Commit Patterns (from recent commits)

```
a8c28e2 feat: sprint 6 ongoing work - PTC, skills, agent loop, docs
24f0179 refactor(skills): simplify buildSkillsHint() output (Story 6.11)
12c09df feat(skills): migrate to Anthropic managed container with PTC support
a2b2514 feat(ptc): add Programmatic Tool Calling support for Sonnet 4.5
```

Commit message pattern: `feat|fix|refactor(scope): description (Story X.Y)`

### Testing Requirements

- Unit test ratio: 60% unit / 30% integration / 10% E2E (per test-design-system.md)
- Tests co-located: `*.test.ts` alongside source files
- Mock Anthropic SDK responses for citation parsing tests
- Test streaming citation accumulation
- Test backwards compatibility with tool-only responses

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Use emojis in professional output | Plain text with mrkdwn formatting |
| Enable citations selectively | All-or-none per request |
| Mix Structured Outputs with Citations | Choose one per request |
| Assume citation field exists | Check `text.citations?.length` |
| Add beta headers for Citations | GA feature — no beta required |

### Implementation Priority (LLM Agent Guidance)

Execute tasks in this order for optimal implementation flow:

1. **Task 1** (Types) — Define TypeScript interfaces first (enables type checking for all other tasks)
2. **Task 2** (Document Blocks) — Build citable document helper
3. **Task 3** (Loop Integration) — Add citation extraction during streaming
4. **Task 4** (Unified Rendering) — Modify sources-block.ts to remove emojis, unify format
5. **Task 5** (Handler Integration) — Wire citations into Slack handlers
6. **Task 6** (Observability) — Add Langfuse tracking
7. **Task 7** (Tests) — Write tests for all new code
8. **Task 8** (Docs) — Update project-context.md

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

_To be filled during implementation_

### Completion Notes List

_To be filled during implementation_

### File List

**Files to Create:**
- `src/agent/citations-api.ts` — Citation types and extraction
- `src/agent/citations-api.test.ts` — Unit tests
- `src/agent/document-blocks.ts` — Document block builder
- `src/agent/document-blocks.test.ts` — Unit tests

**Files to Modify:**
- `src/agent/loop.ts` — Add citation extraction from streaming
- `src/slack/sources-block.ts` — Unify rendering, remove emojis
- `src/slack/sources-block.test.ts` — Update tests
- `src/slack/handlers/user-message.ts` — Integrate citations
- `src/slack/handlers/app-mention.ts` — Integrate citations

## Change Log

| Date | Change |
|------|--------|
| 2026-01-09 | Story created - Citations API integration with unified references |
| 2026-01-09 | Story validated - Added GA status clarification, implementation priority guide, enhanced anti-patterns |
