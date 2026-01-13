# Story 8.1: Anthropic Citations API - Citations & Sources Unification

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user interacting with Orion**,
I want to see verifiable source citations alongside tool transparency,
So that I can trust the accuracy of responses and easily access source materials.

## Background

Orion has two similar systems for source attribution:
1. **Existing "Sources"** (Story 2.7) - Tool transparency showing which MCP tools were called
2. **Anthropic Citations API** - Document-level claim verification with exact text references

This story unifies both systems into a single professional `*References:*` footer block without emojis, combining tool sources with document citations.

## Acceptance Criteria

1. **Given** documents are sent to Claude via document blocks, **When** `citations.enabled=true` is set, **Then** Claude returns citation blocks with `cited_text`, `document_index`, `start_char_index`, `end_char_index`

2. **Given** Claude returns citation blocks, **When** parsing the response, **Then** extract all `cite` type blocks using `extractCitations()` function

3. **Given** both tool sources and document citations exist, **When** formatting the response, **Then** render a single unified `*References:*` footer block (no emojis)

4. **Given** only tool sources exist (no documents), **When** formatting the response, **Then** show tool sources in the `*References:*` block format: `[n] Tool Name - "query"`

5. **Given** citations are extracted, **When** logging to Langfuse, **Then** track `tool_source_count`, `document_citation_count`, and `citation_types`

6. **Given** no documents were sent to Claude, **When** no citations exist, **Then** the parser returns empty array without errors (backwards compatible)

7. **Given** inline citation markers `[1]`, `[2]` in Claude's response, **Then** they link to the numbered entries in the `*References:*` footer

## Tasks / Subtasks

- [x] **Task 1: Define Citation Types** (AC: #1, #2)
  - [x] Create `src/slack/citations/types.ts` with:
    - `DocumentCitation` - Raw citation from Anthropic API
    - `ParsedCitation` - Citation with document metadata for display
    - `DocumentMetadata` - Metadata for documents sent to Claude
    - `ToolSource` - Tool call representation for References
    - `UnifiedReference` - Combined reference for footer
    - `CitationEventMetadata` - Langfuse observability data

- [x] **Task 2: Implement Citation Parser** (AC: #2, #6)
  - [x] Create `src/slack/citations/parser.ts` with:
    - `isCiteBlock()` - Type guard for cite blocks
    - `extractCitations()` - Extract DocumentCitation[] from response
    - `parseCitationsWithMetadata()` - Enrich with document names
    - `truncateCitedText()` - Truncate for display
    - `deduplicateCitations()` - Remove duplicate citations
    - `countCitationsByDocument()` - For observability

- [x] **Task 3: Implement Unified Formatter** (AC: #3, #4, #7)
  - [x] Create `src/slack/citations/formatter.ts` with:
    - `formatToolDisplayName()` - Human-readable tool names
    - `formatToolReference()` - `[n] Tool Name - "query"`
    - `formatDocumentReference()` - `[n] "excerpt..." - Document.pdf, page X`
    - `buildUnifiedReferences()` - Combine tools + docs
    - `formatReferencesBlock()` - Create Block Kit context block

- [x] **Task 4: Create Module Index** (AC: all)
  - [x] Create `src/slack/citations/index.ts` - Public API exports

- [ ] **Task 5: Enable Citations in Document Blocks** (AC: #1)
  - [ ] Update `src/agent/loop.ts` to add `citations: { enabled: true }` on document blocks
  - [ ] Note: GA feature, no beta header required
  - [ ] Note: Incompatible with Structured Outputs - do not use both

- [ ] **Task 6: Integrate with Handler** (AC: #3, #4)
  - [ ] Update `src/slack/handlers/user-message.ts`:
    - Call `extractCitations(response.content)` after agent loop
    - Pass `documentCitations` to `formatReferencesBlock()`
    - Replace old sources block with unified References block
  - [ ] Update `src/slack/handlers/app-mention.ts` similarly

- [ ] **Task 7: Langfuse Observability** (AC: #5)
  - [ ] Add `citation.response` event with:
    - `tool_source_count`
    - `document_citation_count`
    - `citation_types: ['tool', 'document']`

- [ ] **Task 8: Remove Emoji from Sources** (AC: #3)
  - [ ] Remove emoji from `src/slack/sources-block.ts`
  - [ ] Update to use `*References:*` header format

- [ ] **Task 9: Unit Tests** (AC: all)
  - [ ] `src/slack/citations/parser.test.ts` - Parser functions
  - [ ] `src/slack/citations/formatter.test.ts` - Formatter functions
  - [ ] Integration tests for handlers

- [ ] **Task 10: Update project-context.md** (AC: all)
  - [ ] Document References Block Pattern
  - [ ] Document module organization

## Dev Notes

### Unified Format Example

```
*References:*
[1] MSCI Reports: Search - "Hulu"
[2] "Hulu's Q3 revenue grew 12% YoY" - MSCI_Hulu_Report.pdf, page 3
[3] Audience Manager - "segment lookup"
```

### Key Rules

1. **No Emojis**: Remove the old emoji prefix format in sources-block.ts
2. **Header**: `*References:*` (bold in mrkdwn, NO emoji)
3. **Tool Sources**: `[n] Tool Name - "query"` (no emoji prefix)
4. **Document Citations**: `[n] "excerpt..." - Document.pdf, page X`
5. **Ordering**: Tools first, then document citations (unified numbering)

### Citations API Constraints

- **GA Feature**: No beta header required
- **Incompatible with Structured Outputs**: Cannot use both simultaneously
- **Document Blocks Only**: Citations require `type: 'document'` content blocks

### Architecture Compliance

| Requirement | Implementation |
|-------------|----------------|
| ESM imports | All imports use `.js` extension |
| Slack mrkdwn | `*References:*` not `**References:**` |
| Error handling | Parser returns `[]` on invalid input |
| Logging | Uses `logger.*` with traceId |
| Types | `ToolResult<T>` pattern not applicable (formatters) |

### File Structure

```
src/slack/citations/
  types.ts        # DocumentCitation, ToolSource, UnifiedReference
  parser.ts       # extractCitations() - parse Anthropic response
  parser.test.ts  # Parser unit tests
  formatter.ts    # formatReferencesBlock() - create Block Kit
  formatter.test.ts # Formatter unit tests
  index.ts        # Public exports
```

### Integration Points

1. **Agent Loop**: Returns `documentCitations: DocumentCitation[]` in AgentLoopResult
2. **Slack Handler**: Calls `formatReferencesBlock(toolSources, documentCitations)`
3. **Langfuse**: `citation.response` event with counts and types

### Backwards Compatibility

- Empty `documentCitations[]` when no documents sent to Claude
- Parser gracefully returns `[]` for responses without citations
- Existing tool source tracking unchanged

### Project Context Reference

From `project-context.md`:
- **References Block Pattern**: `*References:*` header (NO emoji)
- **Tool sources format**: `[n] Tool Name - "query"` (no emoji)
- **URL sources format**: `[n] <url|title>` (clickable link)
- **Document citations format**: `[n] "excerpt..." - Document.pdf, page N`

### Previous Story Intelligence

From Story 2-7 (Source Citations):
- `src/slack/sources-block.ts` exists with emoji format - needs update
- `ContextSource` type includes `title`, `url?`, `toolContext?`
- Sources are tracked in `agentResult.sources`

From Story 7-3 (Contextual Tool Feedback):
- Tool calls are shown during execution with descriptive format
- `formatToolSummary()` provides consistent status messages

### References

- [Source: _bmad-output/epics.md#Story 8.1] - Story definition
- [Source: _bmad-output/architecture.md#8.1 Citations API] - Architecture
- [Source: _bmad-output/project-context.md#References Block Pattern] - Format rules
- [Source: https://docs.anthropic.com/en/docs/build-with-claude/citations] - Anthropic docs

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

Files to create/modify:
- `src/slack/citations/types.ts` (EXISTS - verify complete)
- `src/slack/citations/parser.ts` (EXISTS - verify complete)
- `src/slack/citations/parser.test.ts` (EXISTS - verify complete)
- `src/slack/citations/formatter.ts` (EXISTS - verify complete)
- `src/slack/citations/formatter.test.ts` (EXISTS - verify complete)
- `src/slack/citations/index.ts` (EXISTS - verify complete)
- `src/agent/loop.ts` (MODIFY - enable citations on document blocks)
- `src/slack/handlers/user-message.ts` (MODIFY - integrate citations)
- `src/slack/handlers/app-mention.ts` (MODIFY - integrate citations)
- `src/slack/sources-block.ts` (MODIFY - remove emoji, update format)
