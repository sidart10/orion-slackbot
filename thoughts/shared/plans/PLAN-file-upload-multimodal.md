# Plan: File Upload & Multimodal Support for Orion

## Goal

Enable users to upload files (images, PDFs, Excel, CSV) in Slack and have Orion:
1. Analyze the files using Claude's multimodal capabilities
2. Pass files to MCP tools when appropriate (e.g., genmedia's Imagen for image editing)

Currently, file uploads fail with an error. This plan addresses the root causes and adds proper multimodal support.

## Technical Choices

- **Images**: Use Anthropic Files API + `image` content blocks with `file_id` reference
  - Rationale: Files API now supports images (April 2025 beta). Provides consistency with PDF handling, 500MB limit vs 5MB for base64, better for reuse.
  - Alternative considered: base64 encoding - rejected due to 5MB limit and payload overhead

- **PDFs**: Continue using Files API + `document` blocks (current approach works)
  - Rationale: Existing implementation is correct

- **Excel/CSV**: Extract text content, send as text block
  - Rationale: Anthropic API doesn't support Excel/CSV as content blocks. Must parse to text/CSV string.

- **MCP Tool Integration**: Store base64 data in file context for MCP tools
  - Rationale: MCP tools receive text parameters, not Anthropic file_ids. Base64 is the only way to pass image data to tools like genmedia.
  - Note: This requires base64 conversion even when using Files API for Claude analysis

## Current State Analysis

### What Exists:
- `src/files/ingestion.ts` - Downloads from Slack, uploads to Files API
- `src/files/api-client.ts` - Files API client with beta header `files-api-2025-04-14`
- `src/agent/document-blocks.ts` - Creates `document` blocks from file IDs
- `src/slack/files/types.ts` - Defines supported MIME types (includes images)
- `src/agent/loop.ts:800-820` - Injects document blocks into messages

### The Problem:
1. **Images sent as `document` blocks** - Wrong block type. Images need `image` blocks with `type: 'file'` source.
2. **No image block support** - Current code only creates `document` blocks, no `image` block path.
3. **Excel/CSV unsupported by API** - These are in `SUPPORTED_MIME_TYPES` but Anthropic can't process them as content blocks.
4. **MCP tools can't access files** - Model has `file_id` but can't pass actual image data to MCP tools.

### Key Files:
- `src/files/ingestion.ts` - Main ingestion orchestration
- `src/files/api-client.ts` - Anthropic Files API client (already has beta header)
- `src/agent/document-blocks.ts` - Block creation logic (needs image support)
- `src/slack/files/types.ts` - MIME type definitions and limits
- `src/slack/files/download.ts` - Slack file download
- `src/agent/loop.ts` - Message construction with content blocks

## Tasks

### Task 1: Add Image Block Support to Document Blocks Builder

Extend the existing `document-blocks.ts` to also create `image` content blocks.

- [ ] Add `ImageBlock` interface matching Anthropic SDK's `BetaImageBlockParam`:
  ```typescript
  // Use SDK types: BetaImageBlockParam, BetaFileImageSource
  interface ImageBlock {
    type: 'image';
    source: { type: 'file'; file_id: string } | { type: 'base64'; media_type: string; data: string };
  }
  ```
- [ ] Add `buildImageBlock(fileId: string): ImageBlock` function
- [ ] Add `isImageMimeType(mimeType: string): boolean` helper
- [ ] Update `buildDocumentBlocks()` to route images → `ImageBlock`, PDFs → `DocumentBlock`
- [ ] Rename result type to `BuildContentBlocksResult` with `contentBlocks` array
- [ ] **Citation behavior verification:**
  - [ ] Test if `image` blocks accept `citations` field (documents do)
  - [ ] If API errors with citations on images, omit for image blocks only
  - [ ] Document the difference in code comments

**Files to modify:**
- `src/agent/document-blocks.ts`

### Task 2: Update Ingestion to Track File Category

Modify ingestion to preserve file category for proper block routing.

- [ ] Add `category: 'image' | 'document' | 'text'` to `FileIngestionResult`
- [ ] Populate category based on MIME type during ingestion
- [ ] Images still upload to Files API (same as PDFs)
- [ ] Store raw buffer in result for MCP tool usage (base64 conversion)

**Files to modify:**
- `src/files/ingestion.ts`
- `src/slack/files/types.ts` (add category helper if needed)

### Task 3: Handle Excel/CSV as Text

Add text extraction for Excel and CSV files.

- [ ] Create `src/files/text-extraction.ts` with:
  - `extractTextFromCsv(buffer: Buffer): string` - Parse CSV to formatted text
  - `extractTextFromExcel(buffer: Buffer): string` - Extract cell values as text (using `xlsx` or `exceljs`)
- [ ] Add Excel MIME types to FILE_LIMITS:
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)
  - `application/vnd.ms-excel` (.xls)
- [ ] Route Excel/CSV in ingestion: skip Files API, return text content
- [ ] Add `TextBlock` to content block union

**Files to modify/create:**
- `src/files/text-extraction.ts` (new)
- `src/slack/files/types.ts` (add Excel MIME types)
- `src/files/ingestion.ts` (route Excel/CSV)

### Task 4: Update Agent Loop for Mixed Content

Modify agent loop to handle mixed content block types.

- [ ] Update `AgentLoopOptions` to accept `contentBlocks` (rename from `documentBlocks`)
- [ ] Ensure proper ordering: images → documents → text content → user message text
- [ ] Update logging to distinguish block types
- [ ] **REQUIRED (Rollback Safety):** Backward compatibility for `documentBlocks`:
  - [ ] Accept both `documentBlocks` (deprecated) AND `contentBlocks`
  - [ ] If `documentBlocks` provided, log deprecation warning
  - [ ] Merge both into single content array if both provided
  - [ ] Existing callers continue working without changes
- [ ] Add tests for backward compatibility

**Files to modify:**
- `src/agent/loop.ts`

### Task 5: Enable MCP Tool File Access

Allow model to reference uploaded files in MCP tool calls.

**⚠️ SPIKE REQUIRED FIRST (see Elephants in Risks):**
Before implementing, validate the approach works:
1. [ ] Check genmedia tool schema - what parameters accept image input?
2. [ ] Test manually: can genmedia tools accept base64 image data?
3. [ ] Prototype: does system prompt guidance result in correct tool calls?
4. [ ] **GATE:** Only proceed if spike succeeds. If not, revise approach.

**Implementation (after spike passes):**
- [ ] Create `FileContext` interface:
  ```typescript
  interface FileContext {
    filename: string;
    mimeType: string;
    base64Data?: string;  // For images (MCP tools need this)
    fileId?: string;      // For Claude API reference
    textContent?: string; // For extracted text
  }
  ```
- [ ] Store base64 data during ingestion for images (in addition to Files API upload)
- [ ] Pass `FileContext[]` to agent loop options
- [ ] Add to system prompt: guidance for referencing files in tool calls
  ```
  ## Available Files
  The user has uploaded the following files. When using tools that need image data,
  reference the file by name and the base64 data will be provided:
  - image.png (image/png) - available for genmedia tools
  ```
- [ ] Model can reference by filename in tool arguments

**Files to modify:**
- `src/files/ingestion.ts` (store base64)
- `src/agent/loop.ts` (pass file context)
- `src/agent/orion.ts` (system prompt guidance)

### Task 6: Update Slack Handlers

Update Slack handlers to use new content block flow.

- [ ] Update `handleAssistantUserMessage` to use new content block builder
- [ ] Update `handleAppMention` similarly
- [ ] Pass file context for MCP usage
- [ ] Update error messages for new file types (Excel)

**Files to modify:**
- `src/slack/handlers/user-message.ts`
- `src/slack/handlers/app-mention.ts`

### Task 7: Add Tests

Add comprehensive tests for new functionality.

- [ ] Unit tests for image block creation in `document-blocks.test.ts`
- [ ] Unit tests for `text-extraction.ts` (CSV and Excel parsing)
- [ ] Update ingestion tests for category tracking
- [ ] Integration test: image upload → image block → Claude response
- [ ] Integration test: Excel upload → text extraction → Claude response
- [ ] Test file context passing for MCP tools

**Files to create/modify:**
- `src/agent/document-blocks.test.ts` (update)
- `src/files/text-extraction.test.ts` (new)
- `src/files/ingestion.test.ts` (update)

## Success Criteria

### Automated Verification:
- [ ] Build passes: `npm run build`
- [ ] Type check: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Lint passes: `npm run lint`

### Manual Verification:
- [ ] Upload PNG image → Orion describes image content accurately
- [ ] Upload JPEG photo → Orion analyzes the photo
- [ ] Upload PDF → Orion analyzes PDF (existing behavior preserved)
- [ ] Upload CSV → Orion can read and summarize CSV data
- [ ] Upload Excel (.xlsx) → Orion can read spreadsheet data
- [ ] Upload image + ask "generate a variation of this image" with genmedia → tool receives base64 data
- [ ] Upload multiple files of different types → all processed correctly
- [ ] Upload unsupported file type (e.g., .zip) → clear error message
- [ ] Upload image >5MB → works (Files API supports up to 500MB)

## Out of Scope

- **Video files** - Anthropic doesn't support video analysis
- **Audio files** - Not supported by API
- **Image resizing** - Just reject if >500MB (rare edge case)
- **OCR for scanned PDFs** - Use existing PDF support (Claude handles this)
- **Direct Excel formula evaluation** - Just extract cell values as text
- **Complex Excel features** - Multiple sheets, charts, pivot tables (extract what we can)

## Risks (Pre-Mortem)

### Tigers:

- **No rollback strategy - breaking API change** (HIGH) ⚠️
  - Task 4 changes `documentBlocks` → `contentBlocks` in agent loop
  - If this breaks existing PDF handling, no quick fix path
  - **Mitigation (REQUIRED):** Backward compatibility is mandatory, not optional:
    - Accept both `documentBlocks` (deprecated) AND `contentBlocks`
    - Log deprecation warning when `documentBlocks` used
    - Add to Task 4 checklist as blocking requirement

- **Image citation behavior unknown** (MEDIUM)
  - Documents have `citations: { enabled: true }` - works for PDFs
  - Unclear if Anthropic supports citations on `image` blocks
  - **Mitigation:** Add to Task 1:
    - Test image blocks with citations enabled first
    - If API errors, omit citations field for images only
    - Document behavior difference between images and documents

- **Excel parsing complexity** (MEDIUM)
  - Complex Excel files with formulas, multiple sheets, merged cells
  - Mitigation: Start with simple cell value extraction, document limitations
  - Use `xlsx` library which handles most common cases

- **MCP tool argument passing** (MEDIUM)
  - How does the model know to pass base64 data to tools?
  - Mitigation: Clear system prompt guidance, test with genmedia tools

### Elephants:

- **MCP tool integration is speculative** (MEDIUM) 🐘
  - Plan assumes genmedia tools accept base64 in arguments
  - No verification this actually works end-to-end
  - **Mitigation:** Phase 3 must start with spike:
    1. Check genmedia tool schema for image input parameters
    2. Test if tool accepts base64 data manually
    3. Prototype prompt guidance with real tool call
    4. Only proceed with full implementation if spike succeeds

- **Large image memory** (LOW)
  - Storing base64 for MCP tools doubles memory for images
  - Note: Only an issue for very large images; typical Slack uploads are small
  - Can optimize later by storing base64 only when MCP tools are available

## Dependencies

- `xlsx` npm package for Excel parsing (add to package.json)
- Files API beta header already present in `api-client.ts`

## Implementation Order

**Phase 1 (MVP - Get Images Working):**
1. Task 1: Image block support in document-blocks.ts
2. Task 2: Ingestion category tracking
3. Task 4: Agent loop mixed content
4. Task 6: Update handlers
5. Task 7: Tests for Phase 1

**Phase 2 (Excel/CSV Support):**
3. Task 3: Text extraction for Excel/CSV
- Update tests

**Phase 3 (MCP Tool Integration):**
5. Task 5: File context for MCP tools
- Update tests

Each phase is independently deployable and testable.
