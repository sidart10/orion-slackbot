# Story 6.2: Document Summarization

Status: ready-for-dev

## Story

As a **user**, I want Orion to summarize documents, So that I can quickly understand long content.

## Acceptance Criteria

1. **Given** a document (Confluence page, file, etc.), **When** I ask Orion to summarize it, **Then** the document content is retrieved
2. Key points and structure are extracted
3. The summary preserves important details
4. Links to the source document are included
5. Long documents are handled via chunking if needed

## Tasks / Subtasks

- [ ] **Task 1: Retrieve Document** (AC: #1) - Support Confluence, shared docs
- [ ] **Task 2: Extract Structure** (AC: #2) - Parse headings, sections
- [ ] **Task 3: Preserve Details** (AC: #3) - Keep important specifics
- [ ] **Task 4: Include Source Links** (AC: #4) - Format for Slack
- [ ] **Task 5: Handle Long Docs** (AC: #5) - Chunk if > context limit
- [ ] **Task 6: Verification** - Test with various document types

## Dev Notes

### Chunking Strategy

```typescript
const MAX_CHARS_PER_CHUNK = 50000; // ~12.5k tokens

function chunkDocument(content: string): string[] {
  // Split by sections/headings when possible
  // Summarize each chunk, then synthesize
}
```

### File List

Files to create: `src/workflows/summarization/document.ts`

