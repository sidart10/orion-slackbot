# ATDD Checklist: 8-1-anthropic-citations-api

Story: Citations & Sources Unification
Status: ready-for-dev

---

## AC1: Anthropic Citations API Integration

### Happy Path
- [ ] Test: Enable citations on document content blocks
  - Given: A document content block with text content
  - When: The block is constructed for the API request
  - Then: The block includes `citations: { enabled: true }` property

- [ ] Test: Parse citation blocks from Claude's response
  - Given: A Claude response containing `type: 'cite'` blocks in content array
  - When: The response is processed by the citation parser
  - Then: Citations are extracted with `cited_text`, `document_index`, `start_char_index`, `end_char_index`

- [ ] Test: Extract multiple citations from a single response
  - Given: A Claude response with 3 citation blocks referencing different documents
  - When: The citation parser processes the response
  - Then: All 3 citations are extracted with correct document indices

### Edge Cases
- [ ] Test: Response with no citation blocks
  - Given: A Claude response with only text blocks (no `type: 'cite'`)
  - When: The citation parser processes the response
  - Then: Returns empty array without errors

- [ ] Test: Response with mixed content types
  - Given: A Claude response with text, tool_use, and cite blocks interleaved
  - When: The citation parser processes the response
  - Then: Only cite blocks are extracted, other block types ignored

- [ ] Test: Citation with zero-length char indices
  - Given: A citation block where `start_char_index === end_char_index`
  - When: The citation parser processes the response
  - Then: Citation is still extracted (edge case, may indicate API quirk)

- [ ] Test: Citation with very long cited_text
  - Given: A citation block with `cited_text` > 500 characters
  - When: The citation is formatted for display
  - Then: Text is truncated appropriately for Slack display

### Error Handling
- [ ] Test: Malformed citation block (missing required fields)
  - Given: A cite block missing `document_index` field
  - When: The citation parser processes the response
  - Then: Malformed citation is skipped with warning log, other citations still processed

- [ ] Test: Invalid document_index (negative number)
  - Given: A citation with `document_index: -1`
  - When: The citation parser processes the response
  - Then: Citation is skipped or handled gracefully with warning

- [ ] Test: Citation with non-string cited_text
  - Given: A cite block where `cited_text` is not a string (API anomaly)
  - When: The citation parser processes the response
  - Then: Parser handles gracefully, converts or skips

---

## AC2: Remove Emojis from Sources Display

### Happy Path
- [ ] Test: Sources block generates without emojis
  - Given: A list of tool sources (MSCI Reports, Confluence)
  - When: `formatSourcesBlock()` is called
  - Then: Output contains no emoji characters (no unicode emoji ranges)

- [ ] Test: Header uses Slack bold format
  - Given: Any tool sources array
  - When: References block is generated
  - Then: Header is exactly `*References:*` (Slack mrkdwn bold)

- [ ] Test: Tool reference format is correct
  - Given: A tool source with tool="MSCI Reports", action="Search", query="Hulu"
  - When: Formatted for display
  - Then: Output is `[n] MSCI Reports: Search - "Hulu"` (n = index)

### Edge Cases
- [ ] Test: Empty query string in tool source
  - Given: A tool source with `query: ""`
  - When: Formatted for display
  - Then: Output is `[n] Tool Name: Action - ""` (empty quotes shown)

- [ ] Test: Query with special characters (quotes, backslashes)
  - Given: A tool source with `query: 'Find "quoted" text'`
  - When: Formatted for display
  - Then: Special characters are escaped or handled for Slack mrkdwn

- [ ] Test: Tool name with special characters
  - Given: A tool source with `tool: "Tool & Name: Special"`
  - When: Formatted for display
  - Then: Characters are preserved or escaped appropriately

### Error Handling
- [ ] Test: Tool source with undefined fields
  - Given: A tool source where `action` is undefined
  - When: Formatted for display
  - Then: Graceful handling (skip, default value, or error logged)

---

## AC3: Unified References Footer Block

### Happy Path
- [ ] Test: Generate Block Kit context block
  - Given: Tool sources and document citations
  - When: `formatReferencesBlock()` is called
  - Then: Returns object with `type: 'context'` and `elements` array

- [ ] Test: Unified numbered list with tools and citations
  - Given: 2 tool sources and 2 document citations
  - When: Formatted as references block
  - Then: Output shows `[1]`, `[2]` for tools, `[3]`, `[4]` for documents

- [ ] Test: Tool sources format in unified block
  - Given: Tool source {tool: "Confluence", action: "Search Pages", query: "onboarding"}
  - When: Included in unified references
  - Then: Line is `[n] Confluence: Search Pages - "onboarding"`

- [ ] Test: Document citations format in unified block
  - Given: Citation {cited_text: "Q3 revenue grew 12% YoY", document_name: "MSCI_Report.pdf"}
  - When: Included in unified references
  - Then: Line is `[n] "Q3 revenue grew 12% YoY" - MSCI_Report.pdf`

- [ ] Test: Inline markers link to footer entries
  - Given: Claude response with `[1]` inline marker and matching citation
  - When: Response is rendered with references
  - Then: Inline `[1]` corresponds to `[1]` in footer

### Edge Cases
- [ ] Test: Only tool sources, no document citations
  - Given: 3 tool sources, 0 document citations
  - When: `formatReferencesBlock()` is called
  - Then: References block shows only tool sources numbered [1], [2], [3]

- [ ] Test: Only document citations, no tool sources
  - Given: 0 tool sources, 2 document citations
  - When: `formatReferencesBlock()` is called
  - Then: References block shows only document citations numbered [1], [2]

- [ ] Test: Empty sources and citations
  - Given: 0 tool sources, 0 document citations
  - When: `formatReferencesBlock()` is called
  - Then: Returns null/undefined or empty block (no references header)

- [ ] Test: Very long cited_text (truncation)
  - Given: Citation with 200-character cited_text
  - When: Formatted for display
  - Then: Text is truncated to ~50 chars with ellipsis

- [ ] Test: Document citation without page number
  - Given: Citation with no page metadata
  - When: Formatted for display
  - Then: Shows `[n] "excerpt..." - Document.pdf` (no page)

- [ ] Test: Document citation with page number
  - Given: Citation with page=5 in metadata
  - When: Formatted for display
  - Then: Shows `[n] "excerpt..." - Document.pdf, page 5`

### Error Handling
- [ ] Test: Null tool sources array
  - Given: `toolSources: null`, `citations: []`
  - When: `formatReferencesBlock()` is called
  - Then: Handles gracefully (treats as empty array)

- [ ] Test: Null citations array
  - Given: `toolSources: []`, `citations: null`
  - When: `formatReferencesBlock()` is called
  - Then: Handles gracefully (treats as empty array)

---

## AC4: Citations-Only Mode for Documents

### Happy Path
- [ ] Test: Claude's inline markers preserved in response
  - Given: Claude response text contains `According to [1], revenue grew...`
  - When: Response is processed for Slack
  - Then: `[1]` marker is preserved in the message text

- [ ] Test: Document citations reference actual documents
  - Given: Citations extracted from response referencing document index 0
  - When: Mapped to document metadata
  - Then: Citation references actual document name (e.g., "Report.pdf")

- [ ] Test: Tool sources only (no document citations)
  - Given: Response from tools-only interaction (no document blocks)
  - When: References block is generated
  - Then: Shows tool sources only, no document citation section

- [ ] Test: Merged list - tools first, documents second
  - Given: 2 tool sources and 3 document citations
  - When: References block is generated
  - Then: Tools are [1], [2]; documents are [3], [4], [5]

### Edge Cases
- [ ] Test: Duplicate citations for same document
  - Given: 3 citations all referencing `document_index: 0`
  - When: Formatted as references
  - Then: Each citation shown separately with unique number

- [ ] Test: Citations for non-existent document index
  - Given: Citation with `document_index: 5` but only 2 documents provided
  - When: Formatting references
  - Then: Graceful handling (show with placeholder name or skip with warning)

- [ ] Test: Mixed response - some inline markers, some standalone citations
  - Given: Response with `[1]` inline AND additional cite blocks without inline refs
  - When: Processed for display
  - Then: All citations appear in footer, inline markers link correctly

### Error Handling
- [ ] Test: Document metadata unavailable
  - Given: Citation with document_index but no document metadata tracked
  - When: Formatting for display
  - Then: Uses fallback name like "Document [index]" or "Unknown Document"

---

## AC5: Langfuse Observability

### Happy Path
- [ ] Test: Event logged with tool_source_count
  - Given: Response with 3 tool sources
  - When: `citation.response` event is logged
  - Then: Event metadata includes `tool_source_count: 3`

- [ ] Test: Event logged with document_citation_count
  - Given: Response with 5 document citations
  - When: `citation.response` event is logged
  - Then: Event metadata includes `document_citation_count: 5`

- [ ] Test: Event logged with citation_types array
  - Given: Response with both tool sources and document citations
  - When: `citation.response` event is logged
  - Then: Event metadata includes `citation_types: ['tool', 'document']`

- [ ] Test: Citation types for tools only
  - Given: Response with tool sources but no document citations
  - When: `citation.response` event is logged
  - Then: Event metadata includes `citation_types: ['tool']`

- [ ] Test: Citation types for documents only
  - Given: Response with document citations but no tool sources
  - When: `citation.response` event is logged
  - Then: Event metadata includes `citation_types: ['document']`

### Edge Cases
- [ ] Test: No sources or citations
  - Given: Response with no tool sources and no document citations
  - When: `citation.response` event is logged
  - Then: Event logged with `tool_source_count: 0`, `document_citation_count: 0`, `citation_types: []`

- [ ] Test: Event includes traceId
  - Given: Any response with citations
  - When: Event is logged
  - Then: Event is associated with current trace (traceId present)

### Error Handling
- [ ] Test: Langfuse logging failure does not block response
  - Given: Langfuse service unavailable
  - When: Citation event logging fails
  - Then: Error is logged, response still sent to user (best-effort observability)

---

## AC6: Backwards Compatibility

### Happy Path
- [ ] Test: Existing tool-only responses work unchanged
  - Given: Existing code path calling `formatSourcesBlock([toolSource])`
  - When: Updated code executes
  - Then: Output is valid (format may differ, but no errors)

- [ ] Test: API responses without citation blocks handled
  - Given: Claude response with text blocks only (legacy/simple response)
  - When: Citation extraction runs
  - Then: Returns empty citations array, tool sources still work

- [ ] Test: No breaking changes to formatSourcesBlock callers
  - Given: Existing call sites using `formatSourcesBlock(sources)`
  - When: Function signature is updated or deprecated
  - Then: Call sites compile and function (may show deprecation warning)

### Edge Cases
- [ ] Test: Response with citations but called with old formatter
  - Given: Response has citations, but old code path doesn't extract them
  - When: formatSourcesBlock is called with tool sources only
  - Then: Works correctly, citations just not displayed (graceful degradation)

- [ ] Test: Mixed old and new response formats in same thread
  - Given: Thread with older responses (no citations) and newer (with citations)
  - When: Processing continues
  - Then: Each response handled according to its content

### Error Handling
- [ ] Test: Undefined response.content
  - Given: API response where `response.content` is undefined
  - When: Citation parser runs
  - Then: Returns empty array without throwing

---

## AC7: Documentation & Testing

### Unit Tests - Parser
- [ ] Test: Citation parser extracts all fields correctly
  - Given: Well-formed cite block with all fields
  - When: Parser processes it
  - Then: All fields (`cited_text`, `document_index`, `start_char_index`, `end_char_index`) extracted

- [ ] Test: Citation parser handles array of mixed blocks
  - Given: Content array with text, cite, text, cite pattern
  - When: Parser filters for citations
  - Then: Returns array of 2 Citation objects

### Unit Tests - Formatter
- [ ] Test: Formatter produces valid Block Kit structure
  - Given: Tool sources and citations arrays
  - When: `formatReferencesBlock()` returns
  - Then: Result matches Block Kit context block schema

- [ ] Test: Formatter handles special characters in excerpts
  - Given: Citation with `cited_text: "Revenue <grew> 5%"`
  - When: Formatted for Slack
  - Then: Special characters escaped for mrkdwn (`<` and `>`)

- [ ] Test: Formatter truncates long excerpts consistently
  - Given: Citations with varying cited_text lengths (10, 50, 100, 200 chars)
  - When: Formatted
  - Then: All truncated to consistent max length with ellipsis

### Integration Test
- [ ] Test: End-to-end with mock Claude citation response
  - Given: Mock API response with text and cite blocks
  - When: Full flow executes (parse -> format -> render)
  - Then: Slack-ready references block produced correctly

- [ ] Test: Agent loop integration with citations enabled
  - Given: Document block with `citations: { enabled: true }`
  - When: Agent loop completes
  - Then: `AgentLoopResult.documentCitations` populated correctly

### Documentation
- [ ] Test: project-context.md updated with citations section
  - Given: Story completion
  - When: Documentation reviewed
  - Then: Citations configuration, types, and patterns documented

---

## Integration Points

### Coordination with Story 8.2 (Tool Search)
- [ ] Test: Both stories can modify `src/agent/loop.ts` without conflict
  - Given: Story 8.1 adds `documentCitations` to AgentLoopResult
  - When: Story 8.2 adds `defer_loading` to tool definitions
  - Then: Both changes coexist in types and implementation

---

## Non-Functional Requirements

### Performance
- [ ] Test: Citation parsing does not add measurable latency
  - Given: Response with 10 citations
  - When: Parsing and formatting runs
  - Then: Completes in < 10ms

### Error Recovery
- [ ] Test: Partial failures in citation processing
  - Given: 5 citations, 1 with malformed data
  - When: Processing runs
  - Then: 4 valid citations processed, 1 skipped with warning

---

## Test Data Requirements

### Mock Citation Response
```typescript
const mockCitationResponse = {
  content: [
    { type: 'text', text: 'According to the report [1], revenue grew...' },
    {
      type: 'cite',
      cited_text: 'Q3 revenue grew 12% YoY',
      document_index: 0,
      start_char_index: 45,
      end_char_index: 71,
    },
    { type: 'text', text: 'Additionally [2], user retention improved.' },
    {
      type: 'cite',
      cited_text: 'User retention improved 5%',
      document_index: 1,
      start_char_index: 120,
      end_char_index: 146,
    },
  ],
};
```

### Mock Tool Sources
```typescript
const mockToolSources: ToolSource[] = [
  { tool: 'MSCI Reports', action: 'Search', query: 'Hulu' },
  { tool: 'Confluence', action: 'Search Pages', query: 'onboarding' },
];
```

---

## Summary

| AC | Happy Path | Edge Cases | Error Handling | Total |
|----|------------|------------|----------------|-------|
| AC1 | 3 | 4 | 3 | 10 |
| AC2 | 3 | 3 | 1 | 7 |
| AC3 | 5 | 6 | 2 | 13 |
| AC4 | 4 | 3 | 1 | 8 |
| AC5 | 5 | 2 | 1 | 8 |
| AC6 | 3 | 2 | 1 | 6 |
| AC7 | 6 | 0 | 0 | 6 |
| **Total** | **29** | **20** | **9** | **58** |
