# ATDD Checklist: 8-1-anthropic-citations-api

Story: Anthropic Citations API - Citations & Sources Unification
Status: ready-for-dev

---

## AC1: Citations API Integration with Document Blocks

**Given** documents are sent to Claude via document blocks, **When** `citations.enabled=true` is set, **Then** Claude returns citation blocks with `cited_text`, `document_index`, `start_char_index`, `end_char_index`

### Happy Path
- [ ] Test: Document block with citations enabled returns citation blocks
  - Given: A document block with `citations: { enabled: true }` is included in messages
  - When: Agent loop calls Anthropic API with the document
  - Then: Response content includes blocks with `type: 'cite'` containing all required fields

- [ ] Test: Multiple documents return citations with correct document_index
  - Given: Two document blocks with `citations: { enabled: true }`
  - When: Agent loop processes response
  - Then: Citations reference correct document by `document_index` (0 or 1)

### Edge Cases
- [ ] Test: Document with no citable content returns empty citations
  - Given: A document block containing only images or non-text content
  - When: Response is parsed
  - Then: No cite blocks returned, no errors thrown

- [ ] Test: Very long document with many citations
  - Given: A 50-page PDF document
  - When: Response includes 20+ citation blocks
  - Then: All citations extracted with correct character positions

### Error Handling
- [ ] Test: Citations disabled still works (backwards compatible)
  - Given: Document block without `citations` property
  - When: Agent loop processes response
  - Then: No cite blocks expected, response processes normally

- [ ] Test: Invalid document_index handled gracefully
  - Given: Mock citation block with out-of-range document_index
  - When: `parseCitationsWithMetadata()` is called
  - Then: Uses placeholder document name (e.g., "Document 3")

---

## AC2: Citation Parser Implementation

**Given** Claude returns citation blocks, **When** parsing the response, **Then** extract all `cite` type blocks using `extractCitations()` function

### Happy Path
- [ ] Test: Extract single citation from response content
  - Given: Response content with one cite block
  - When: `extractCitations(content)` is called
  - Then: Returns array with exactly one `DocumentCitation`

- [ ] Test: Extract multiple citations from interleaved content
  - Given: Response with text, cite, text, cite pattern
  - When: `extractCitations(content)` is called
  - Then: Returns array with all cite blocks in order

- [ ] Test: Parse citations with document metadata
  - Given: Citations and document metadata array
  - When: `parseCitationsWithMetadata()` is called
  - Then: Returns `ParsedCitation[]` with `document_name` and `page_number`

### Edge Cases
- [ ] Test: Response with only text blocks (no citations)
  - Given: Response content with only text type blocks
  - When: `extractCitations(content)` is called
  - Then: Returns empty array

- [ ] Test: Response with tool_use blocks mixed in
  - Given: Response with text, tool_use, cite, tool_result blocks
  - When: `extractCitations(content)` is called
  - Then: Returns only cite blocks, ignores other types

- [ ] Test: Duplicate citations are deduplicated
  - Given: Response with same citation appearing twice (same doc, same position)
  - When: `deduplicateCitations()` is called
  - Then: Returns single citation

### Error Handling
- [ ] Test: Malformed cite block missing required fields
  - Given: Block with `type: 'cite'` but missing `document_index`
  - When: `isCiteBlock()` validates the block
  - Then: Returns false, block is skipped

- [ ] Test: Null or undefined content array
  - Given: `null` or `undefined` passed to `extractCitations()`
  - When: Function executes
  - Then: Returns empty array without throwing

---

## AC3: Unified References Block with Tools and Documents

**Given** both tool sources and document citations exist, **When** formatting the response, **Then** render a single unified `*References:*` footer block (no emojis)

### Happy Path
- [ ] Test: Combined references block with tools first, then documents
  - Given: 2 tool sources and 2 document citations
  - When: `formatReferencesBlock(tools, citations)` is called
  - Then: Returns Block Kit context block with `*References:*` header, tools numbered [1], [2], documents [3], [4]

- [ ] Test: References block uses mrkdwn format correctly
  - Given: Tool and document references
  - When: Block is rendered
  - Then: Uses `*References:*` (single asterisks), not `**References:**`

- [ ] Test: Tool sources format as `[n] Tool Name - "query"`
  - Given: Tool source with query "Hulu"
  - When: `formatToolReference()` is called
  - Then: Returns `[1] MSCI Reports - "Hulu"` format

- [ ] Test: Document citations format as `[n] "excerpt..." - Document.pdf, page X`
  - Given: ParsedCitation with document_name and page_number
  - When: `formatDocumentReference()` is called
  - Then: Returns `[1] "excerpt text" - Document.pdf, page 5`

### Edge Cases
- [ ] Test: No emojis in output
  - Given: Any combination of tools and documents
  - When: `formatReferencesBlock()` is called
  - Then: Output contains no emoji characters

- [ ] Test: Very long cited text is truncated
  - Given: Citation with 100+ character cited_text
  - When: `truncateCitedText()` is called
  - Then: Returns truncated text with "..." (50 chars default)

- [ ] Test: Special characters sanitized for mrkdwn
  - Given: Tool name or citation with `|`, `<`, `>` characters
  - When: Formatted for display
  - Then: Special chars replaced with safe alternatives

- [ ] Test: Tool with URL formats as clickable link
  - Given: Tool source with url property
  - When: `formatToolReference()` is called
  - Then: Returns `[n] <https://url|Tool Name>` format

### Error Handling
- [ ] Test: Empty references returns null block
  - Given: Empty tools array and empty citations array
  - When: `formatReferencesBlock([], [])` is called
  - Then: Returns null (no block to render)

---

## AC4: Tool Sources Only (No Documents)

**Given** only tool sources exist (no documents), **When** formatting the response, **Then** show tool sources in the `*References:*` block format: `[n] Tool Name - "query"`

### Happy Path
- [ ] Test: Multiple tool sources displayed correctly
  - Given: 3 tool sources with different tools
  - When: `formatReferencesBlock(tools, [])` is called
  - Then: Returns block with `[1]`, `[2]`, `[3]` numbered tools

- [ ] Test: Tool display name formats MCP tool correctly
  - Given: Tool name "msci-reports__search_reports"
  - When: `formatToolDisplayName()` is called
  - Then: Returns "Msci Reports: Search Reports"

- [ ] Test: Tool display name formats simple tool correctly
  - Given: Tool name "web_search"
  - When: `formatToolDisplayName()` is called
  - Then: Returns "Web Search"

### Edge Cases
- [ ] Test: Tool without query shows name only
  - Given: Tool source without query property
  - When: `formatToolReference()` is called
  - Then: Returns `[n] Tool Name` (no dash or quotes)

- [ ] Test: Very long query is truncated
  - Given: Tool query with 100+ characters
  - When: `formatToolReference()` is called
  - Then: Query truncated to 50 characters

- [ ] Test: ContextSource converted to ToolSource correctly
  - Given: Legacy ContextSource with title, reference, toolContext
  - When: `contextSourceToToolSource()` is called
  - Then: Returns ToolSource with correct mapping

---

## AC5: Langfuse Observability

**Given** citations are extracted, **When** logging to Langfuse, **Then** track `tool_source_count`, `document_citation_count`, and `citation_types`

### Happy Path
- [ ] Test: Citation event logged with correct counts
  - Given: 2 tool sources and 3 document citations
  - When: Citation response event is emitted
  - Then: Langfuse event has `tool_source_count: 2`, `document_citation_count: 3`

- [ ] Test: Citation types array reflects actual types
  - Given: Both tools and documents present
  - When: Event is logged
  - Then: `citation_types` is `['tool', 'document']`

- [ ] Test: Tool-only response logs correct types
  - Given: Only tool sources, no documents
  - When: Event is logged
  - Then: `citation_types` is `['tool']`

### Edge Cases
- [ ] Test: Zero citations logged correctly
  - Given: No tools and no documents
  - When: Response is processed
  - Then: Event has counts of 0, or event is not emitted

- [ ] Test: Document count per document tracked
  - Given: Multiple citations from same document
  - When: `countCitationsByDocument()` is called
  - Then: Returns Map with correct per-document counts

---

## AC6: Backwards Compatibility

**Given** no documents were sent to Claude, **When** no citations exist, **Then** the parser returns empty array without errors (backwards compatible)

### Happy Path
- [ ] Test: Standard text response with no documents
  - Given: Agent loop without documentBlocks option
  - When: Response is processed
  - Then: `documentCitations` is empty array in AgentLoopResult

- [ ] Test: Empty documentCitations in AgentLoopResult
  - Given: Normal conversation without file uploads
  - When: Agent loop completes
  - Then: `result.documentCitations` is `[]`

### Edge Cases
- [ ] Test: Response with cite-like text in content
  - Given: Claude says "as shown in [1]" without actual cite blocks
  - When: `extractCitations()` is called
  - Then: Returns empty array (text is not a cite block)

- [ ] Test: Existing tool source tracking unchanged
  - Given: Tool calls made during agent loop
  - When: Sources are collected
  - Then: `result.sources` contains ContextSource[] as before

### Error Handling
- [ ] Test: Parser handles unexpected block types gracefully
  - Given: Response with unknown block type "custom_block"
  - When: `extractCitations()` is called
  - Then: Ignores unknown types, no errors

---

## AC7: Inline Citation Markers Link to References

**Given** inline citation markers `[1]`, `[2]` in Claude's response, **Then** they link to the numbered entries in the `*References:*` footer

### Happy Path
- [ ] Test: Citation numbering is consecutive
  - Given: 2 tools and 2 documents
  - When: `buildUnifiedReferences()` is called
  - Then: Returns references with index 1, 2, 3, 4

- [ ] Test: Tools get lower numbers than documents
  - Given: Tools and documents mixed
  - When: References are built
  - Then: All tools numbered first, then documents continue sequence

### Edge Cases
- [ ] Test: Single reference numbered as [1]
  - Given: Only one tool source
  - When: Reference block is built
  - Then: Tool is numbered `[1]`

- [ ] Test: Many references (10+) numbered correctly
  - Given: 15 total references
  - When: Block is formatted
  - Then: Numbers go [1] through [15] correctly

---

## Integration Tests

### Handler Integration
- [ ] Test: user-message handler integrates citations
  - Given: User sends message with attached document
  - When: Handler processes response with citations
  - Then: References block appended to Slack message

- [ ] Test: app-mention handler integrates citations
  - Given: User mentions bot with document
  - When: Handler processes response
  - Then: References block formatted correctly

### Agent Loop Integration
- [ ] Test: Document blocks passed to API with citations enabled
  - Given: documentBlocks option provided to agentLoop
  - When: API call is made
  - Then: Document blocks include `citations: { enabled: true }`

- [ ] Test: Citations extracted from streaming response
  - Given: Streaming response with cite blocks
  - When: Response content is accumulated
  - Then: All citations captured in final result

### Sources Block Migration
- [ ] Test: Old sources-block.ts updated to remove emoji
  - Given: Existing sources block module
  - When: formatReferencesBlock is used instead
  - Then: No emoji in output, uses `*References:*` format

---

## Unit Test Files Required

Based on story Task 9, these test files must exist:

- [ ] `src/slack/citations/parser.test.ts` - Parser function tests (EXISTS - verify complete)
- [ ] `src/slack/citations/formatter.test.ts` - Formatter function tests (EXISTS - verify complete)
- [ ] Integration tests in handler files for end-to-end flow

---

## Test Coverage Summary

| AC | Happy Path | Edge Cases | Error Handling | Total |
|----|------------|------------|----------------|-------|
| AC1 | 2 | 2 | 2 | 6 |
| AC2 | 3 | 3 | 2 | 8 |
| AC3 | 4 | 4 | 1 | 9 |
| AC4 | 3 | 3 | 0 | 6 |
| AC5 | 3 | 2 | 0 | 5 |
| AC6 | 2 | 2 | 1 | 5 |
| AC7 | 2 | 2 | 0 | 4 |
| Integration | 5 | 0 | 0 | 5 |
| **Total** | **24** | **18** | **6** | **48** |

---

## Notes

### Existing Test Coverage

Based on examination of existing test files:
- `parser.test.ts` (463 lines) - Comprehensive coverage of isCiteBlock, extractCitations, parseCitationsWithMetadata, truncateCitedText, deduplicateCitations, countCitationsByDocument
- `formatter.test.ts` (390 lines) - Comprehensive coverage of formatToolDisplayName, formatToolReference, formatDocumentReference, buildUnifiedReferences, formatReferencesBlock, contextSourceToToolSource

### Remaining Tasks to Implement

Per story Tasks 5-10:
- Task 5: Enable citations in document blocks in loop.ts
- Task 6: Integrate with Slack handlers
- Task 7: Langfuse observability events
- Task 8: Remove emoji from sources-block.ts
- Task 10: Update project-context.md

### Testing Strategy

1. **Unit tests** - Verify each function in isolation (mostly complete)
2. **Integration tests** - Verify handler integration (needs implementation)
3. **E2E verification** - Manual testing with real documents in Slack

### Project Test Patterns (from project-context.md)

- Use Vitest as test framework
- Co-locate tests with source (`*.test.ts`)
- Follow `describe` / `it` structure with clear descriptions
- Reference story and AC in JSDoc comments
