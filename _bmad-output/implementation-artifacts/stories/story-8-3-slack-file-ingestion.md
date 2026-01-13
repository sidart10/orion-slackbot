# Story 8.3: Slack File Ingestion for Claude Context

Status: done

<!-- Note: Story completed. Created as documentation of implementation. -->

## Story

As a **Slack user**,
I want to upload files (PDFs, images, CSV, text) in my message to Orion,
So that Claude can read, analyze, and reference the file content in its response.

## Background

When users upload files to Slack messages addressed to Orion, the files should be ingested into Claude's context. This enables document analysis, data extraction, image understanding, and file-based Q&A. The implementation downloads files from Slack (authenticated), uploads to Anthropic Files API, and includes as document blocks in the Claude request.

**FR51:** System ingests files uploaded in Slack messages - downloads via Slack API, uploads to Anthropic Files API, includes as document blocks in Claude context.

## Acceptance Criteria

1. **Given** a message with attached files, **When** the handler processes the message, **Then** the `files` array in the event is detected

2. **Given** multiple files in a single message, **When** files are ingested, **Then** all files are processed (batch operation)

3. **Given** a message with files, **When** files are detected, **Then** a log entry is created with file count, names, and sizes

4. **Given** a Slack file URL, **When** download is requested, **Then** the content is fetched from `url_private_download`

5. **Given** a download request, **When** authentication is needed, **Then** the Slack bot token is used in Authorization header

6. **Given** a download failure, **When** the error is caught, **Then** a user-friendly message is returned (not a crash)

7. **Given** a file size validation, **When** the file exceeds limits, **Then** download is rejected with size limit error

8. **Given** a downloaded file buffer, **When** upload is requested, **Then** the buffer is uploaded to Anthropic Files API

9. **Given** upload implementation, **When** code is written, **Then** existing `FilesApiClient` is reused (not duplicated)

10. **Given** upload success/failure, **When** the operation completes, **Then** outcome is tracked in Langfuse

11. **Given** a successful upload, **When** the file ID is returned, **Then** a document block is created with `source.type: file` and `file_id`

12. **Given** a document block with file, **When** Citations (Story 8.1) is enabled, **Then** `citations: { enabled: true }` is included

13. **Given** file ingestion results, **When** passed to agent loop, **Then** `buildDocumentBlocks()` adds them to messages array

14. **Given** an unsupported file type, **When** validation runs, **Then** clear error message lists supported formats

15. **Given** a PDF file, **When** size is checked, **Then** max 100MB is enforced

16. **Given** an image file, **When** size is checked, **Then** max 20MB is enforced

17. **Given** a CSV file, **When** size is checked, **Then** max 100MB is enforced

18. **Given** a text file (.txt, .md, .json), **When** size is checked, **Then** max 100MB is enforced

19. **Given** unsupported file type, **When** error is shown, **Then** supported formats are listed: PDF, PNG, JPG, GIF, CSV, TXT, MD, JSON, XML, YAML

20. **Given** a file too large, **When** error is shown, **Then** message includes actual size and limit

21. **Given** download failure, **When** error is shown, **Then** message suggests retry or smaller file

22. **Given** the file ingestion flow, **When** complete, **Then** full pipeline works: Slack -> download -> upload -> document block -> Claude

## Tasks / Subtasks

- [x] **Task 1: File Type Definitions** (AC: #14-19)
  - [x] Create `src/slack/files/types.ts` with SlackFile, DownloadedFile, FileIngestionResult interfaces
  - [x] Define FILE_LIMITS constant with size limits per category (PDF: 100MB, Image: 20MB, CSV: 100MB, Text: 100MB)
  - [x] Implement `getFileCategory()`, `getMaxSizeForMimeType()`, `isSupportedMimeType()` helpers
  - [x] Create `formatSupportedTypes()` and `formatFileSize()` for user-friendly messages

- [x] **Task 2: Slack File Download** (AC: #4-7, #20-21)
  - [x] Create `src/slack/files/download.ts` with `downloadSlackFile()` function
  - [x] Implement `SlackFileDownloadError` custom error class with code categorization
  - [x] Add `validateFile()` for size and type validation before download
  - [x] Use fetch with `Authorization: Bearer {botToken}` header
  - [x] Handle timeout (30s) with AbortController
  - [x] Add comprehensive logging for download start/success/failure

- [x] **Task 3: File Ingestion Orchestration** (AC: #1-3, #8-10)
  - [x] Create `src/files/ingestion.ts` with `ingestSlackFile()` and `ingestSlackFiles()` functions
  - [x] Orchestrate: download from Slack -> upload to Anthropic -> return file ID
  - [x] Implement `BatchIngestionResult` for multi-file operations
  - [x] Track ingestion events in Langfuse (start, success, failure, batch summary)

- [x] **Task 4: Document Block Builder** (AC: #11-13)
  - [x] Create `src/agent/document-blocks.ts` with `buildDocumentBlocks()` function
  - [x] Convert FileIngestionResult[] to Anthropic document content blocks
  - [x] Include `citations: { enabled: true }` for Citations integration
  - [x] Support `source.type: 'file'` with `file_id` reference

- [x] **Task 5: Handler Integration** (AC: #1, #22)
  - [x] Update `src/slack/handlers/user-message.ts` to detect and process files
  - [x] Update `src/slack/handlers/app-mention.ts` to detect and process files
  - [x] Call `ingestSlackFiles()` when files detected
  - [x] Pass document blocks to agent loop via `buildDocumentBlocks()`

- [x] **Task 6: Unit Tests**
  - [x] Create `src/slack/files/download.test.ts` with download validation and fetch mocking
  - [x] Create `src/files/ingestion.test.ts` with orchestration tests
  - [x] Create `src/agent/document-blocks.test.ts` with block builder tests

## Dev Notes

### File Flow Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Slack Message with Files                                         │
│  └─ event.files: [ { id, name, mimetype, size, url_private } ]   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Handler Detection (user-message.ts / app-mention.ts)            │
│  └─ Extracts files array from event                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  ingestSlackFiles() - src/files/ingestion.ts                     │
│  └─ Orchestrates batch processing                                │
└──────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         (per file)      (per file)     (per file)
              │               │               │
              ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│  downloadSlackFile() - src/slack/files/download.ts               │
│  └─ Validates file → Downloads via url_private_download          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  FilesApiClient.uploadBuffer() - src/files/api-client.ts         │
│  └─ Uploads to Anthropic Files API                               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  buildDocumentBlocks() - src/agent/document-blocks.ts            │
│  └─ Creates document content blocks with file_id reference       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Agent Loop - src/agent/loop.ts                                  │
│  └─ Claude receives documents, can cite content (Story 8.1)      │
└──────────────────────────────────────────────────────────────────┘
```

### Supported File Formats

| Category | Extensions | MIME Types | Max Size |
|----------|------------|------------|----------|
| **PDF** | `.pdf` | `application/pdf` | 100 MB |
| **Images** | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | `image/png`, `image/jpeg`, `image/gif`, `image/webp` | 20 MB |
| **CSV** | `.csv` | `text/csv`, `application/csv` | 100 MB |
| **Text** | `.txt`, `.md`, `.json`, `.xml`, `.yaml`, `.yml` | `text/plain`, `text/markdown`, `application/json`, `text/xml`, `application/xml`, `text/yaml` | 100 MB |

### Error Codes

| Code | Meaning | User Message |
|------|---------|--------------|
| `FILE_TOO_LARGE` | Exceeds size limit | "File is too large (X MB). Maximum for Y is Z MB." |
| `UNSUPPORTED_TYPE` | Unknown MIME type | "Unsupported file type. Supported: PDF, images, CSV, text." |
| `DOWNLOAD_FAILED` | Slack download error | "Could not download file. Try again or use a smaller file." |
| `UPLOAD_FAILED` | Anthropic API error | "Could not process file. Try again." |
| `ZERO_BYTE_FILE` | Empty file | "File has no content." |
| `FILE_EXPIRED` | Slack URL expired | "File download link expired. Re-upload the file." |

### Architecture Compliance

| Requirement | Implementation |
|-------------|----------------|
| ESM imports | All imports use `.js` extension |
| Error handling | Never throws - returns `FileIngestionResult` with error |
| Logging | Uses `logger.*` with traceId, never console.log |
| Observability | Langfuse events for ingestion start/success/failure |
| Config | Uses `config.slack.botToken` from environment.ts |
| Types | All interfaces in `src/slack/files/types.ts` |

### Project Structure

```
src/
  slack/
    files/
      types.ts          # SlackFile, DownloadedFile, FILE_LIMITS
      download.ts       # downloadSlackFile(), SlackFileDownloadError
      download.test.ts  # Unit tests for download
      index.ts          # Barrel exports
    handlers/
      user-message.ts   # Detects files, calls ingestSlackFiles
      app-mention.ts    # Detects files, calls ingestSlackFiles
  files/
    api-client.ts       # FilesApiClient (reused from Story 6.5)
    ingestion.ts        # ingestSlackFile(), ingestSlackFiles()
    ingestion.test.ts   # Unit tests for ingestion
    index.ts            # Barrel exports
  agent/
    document-blocks.ts      # buildDocumentBlocks()
    document-blocks.test.ts # Unit tests for blocks
```

### Integration with Story 8.1 (Citations)

When document blocks are created, citations are enabled:

```typescript
const documentBlock = {
  type: 'document',
  source: {
    type: 'file',
    file_id: 'file-abc123',
  },
  title: 'uploaded_document.pdf',
  citations: { enabled: true },  // Enables Story 8.1 Citations
};
```

Claude can then cite specific passages from the uploaded document, which appear in the unified References footer.

### Observability

```typescript
// Langfuse events
langfuse.event({
  name: 'file.ingestion.start',
  metadata: { traceId, slackFileId, filename, mimetype, size }
});

langfuse.event({
  name: 'file.ingestion.success',
  metadata: { traceId, slackFileId, anthropicFileId, durationMs, size }
});

langfuse.event({
  name: 'file.ingestion.failure',
  metadata: { traceId, slackFileId, errorCode, error, durationMs }
});

langfuse.event({
  name: 'file.ingestion.batch_complete',
  metadata: { traceId, totalFiles, successCount, failureCount, totalBytes, durationMs }
});
```

### Project Context Reference

From `project-context.md`:
- **ESM imports:** All imports use `.js` extension
- **Tool errors:** Never throw, return result with success/error
- **Logging:** Include `traceId` in every log entry

### References

- [Source: _bmad-output/epics.md#Story 8.3] - Story definition
- [Source: _bmad-output/architecture.md#8.3 Slack File Ingestion] - Architecture decision
- [Source: _bmad-output/prd.md#FR51] - Functional requirement
- [Source: _bmad-output/project-context.md] - Implementation patterns
- [Source: https://docs.anthropic.com/en/docs/build-with-claude/files] - Anthropic Files API
- [Source: https://api.slack.com/types/file] - Slack file object reference

## Dev Agent Record

### Agent Model Used

claude-opus-4-5-20250514 (Story documentation)

### Debug Log References

- Story 8.3 implementation completed as part of Epic 8 sprint
- Full integration tested with user-message.ts and app-mention.ts handlers

### Completion Notes List

- File type definitions created in `src/slack/files/types.ts`
- Slack download service implemented in `src/slack/files/download.ts`
- File ingestion orchestration in `src/files/ingestion.ts`
- Document block builder in `src/agent/document-blocks.ts`
- Handler integration complete in both user-message.ts and app-mention.ts
- Unit tests created for all components
- Langfuse observability integrated throughout pipeline
- Citations integration enabled for document blocks

### File List

Files created/modified:
- `src/slack/files/types.ts` - Type definitions and FILE_LIMITS
- `src/slack/files/download.ts` - downloadSlackFile()
- `src/slack/files/download.test.ts` - Unit tests
- `src/slack/files/index.ts` - Barrel exports
- `src/files/ingestion.ts` - ingestSlackFile(), ingestSlackFiles()
- `src/files/ingestion.test.ts` - Unit tests
- `src/files/index.ts` - Updated exports
- `src/agent/document-blocks.ts` - buildDocumentBlocks()
- `src/agent/document-blocks.test.ts` - Unit tests
- `src/slack/handlers/user-message.ts` - File detection integration
- `src/slack/handlers/app-mention.ts` - File detection integration
