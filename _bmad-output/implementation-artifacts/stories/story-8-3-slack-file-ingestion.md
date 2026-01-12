# Story 8.3: Slack File Ingestion for Claude Context

Status: ready-for-dev

## Story

As a Slack user,
I want to upload files (PDFs, images, CSVs, etc.) in my messages to Orion,
so that Claude can read and analyze the file contents as part of my request.

## Background

Currently, Orion can only process text messages from Slack. Users often need to share documents, spreadsheets, or images for analysis. This story enables file ingestion by:

1. Detecting files in Slack message events
2. Downloading files via Slack API
3. Uploading to Anthropic Files API (reusing Story 6.5 client)
4. Including as document blocks with Citations support (pairs with Story 8.1)

**Related Stories:**
- Story 6.5: Files API Client (provides download infrastructure) - DONE
- Story 6.6: Files API Slack Integration (provides upload to Slack) - DONE
- Story 8.1: Citations API (enables document citations) - IN PROGRESS

## Acceptance Criteria

1. **File Detection:**
   - [ ] AC1: Detect `files` array in Slack `message` events (both DM and channel)
   - [ ] AC2: Support multiple files in a single message (process all)
   - [ ] AC3: Log file metadata (name, type, size) to Langfuse for observability

2. **File Download from Slack:**
   - [ ] AC4: Download file content via Slack API using `url_private_download`
   - [ ] AC5: Use bot token for authentication (`Authorization: Bearer ${SLACK_BOT_TOKEN}`)
   - [ ] AC6: Handle download failures gracefully (log error, inform user, continue without file)
   - [ ] AC7: Respect file size limits (max 100MB per file)

3. **File Upload to Anthropic:**
   - [ ] AC8: Upload downloaded file to Anthropic Files API
   - [ ] AC9: Reuse existing `FilesApiClient` from `src/files/api-client.ts` (Story 6.5)
   - [ ] AC10: Track upload success/failure in Langfuse

4. **Document Block Integration:**
   - [ ] AC11: Create document block with `file_id` reference for each uploaded file
   - [ ] AC12: Enable `citations: { enabled: true }` on document blocks (pairs with Story 8.1)
   - [ ] AC13: Include document blocks in messages array before calling agent loop
   - [ ] AC14: Handle unsupported file types gracefully (inform user, skip file)

5. **Supported Formats:**
   - [ ] AC15: PDF files (`.pdf`) - max 100MB
   - [ ] AC16: Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) - max 20MB
   - [ ] AC17: CSV files (`.csv`) - max 100MB
   - [ ] AC18: Text files (`.txt`, `.md`, `.json`, `.xml`, `.yaml`, `.yml`) - max 100MB
   - [ ] AC19: Reject unsupported formats with helpful message listing supported types

6. **Error Handling:**
   - [ ] AC20: File too large: Inform user of size limit
   - [ ] AC21: Download failed: Log error, inform user, continue processing text message
   - [ ] AC22: Upload failed: Log error, inform user, continue processing text message
   - [ ] AC23: Unsupported type: Inform user of supported types

7. **Observability:**
   - [ ] AC24: Track file ingestion metrics in Langfuse (count, types, sizes, success rate)
   - [ ] AC25: Include file metadata in trace for debugging

## Tasks / Subtasks

- [ ] **Task 1: File Detection in Slack Handlers** (AC: 1, 2, 3)
  - [ ] 1.1 Extend `SlackMessageEvent` type to include `files` array
  - [ ] 1.2 Add file detection logic in `user-message.ts` handler
  - [ ] 1.3 Add file detection logic in `app-mention.ts` handler
  - [ ] 1.4 Log file metadata to Langfuse on detection

- [ ] **Task 2: Slack File Download Service** (AC: 4, 5, 6, 7, 20, 21)
  - [ ] 2.1 Create `src/slack/files/download.ts` with `downloadSlackFile()`
  - [ ] 2.2 Implement authenticated download using `url_private_download`
  - [ ] 2.3 Add file size validation before download
  - [ ] 2.4 Return `Buffer` with metadata (filename, mimetype)
  - [ ] 2.5 Write unit tests for download service

- [ ] **Task 3: Anthropic Files API Upload** (AC: 8, 9, 10, 22)
  - [ ] 3.1 Verify `FilesApiClient.uploadBuffer()` from Story 6.5 meets requirements (already exists at `src/files/api-client.ts` lines 145-188 - NO modification needed)
  - [ ] 3.2 Create `src/files/ingestion.ts` to orchestrate download → upload using existing `uploadBuffer()`
  - [ ] 3.3 Add Langfuse tracking for upload operations
  - [ ] 3.4 Write unit tests for upload orchestration

- [ ] **Task 4: Document Block Builder** (AC: 11, 12, 13, 14, 15-18, 19, 23)
  - [ ] 4.1 Create `src/agent/document-blocks.ts` with `buildDocumentBlocks()`
  - [ ] 4.2 Map Slack file to Anthropic document block format
  - [ ] 4.3 Enable citations on document blocks
  - [ ] 4.4 Add format validation (supported vs unsupported types)
  - [ ] 4.5 Return user-friendly error for unsupported types
  - [ ] 4.6 Write unit tests for document block builder

- [ ] **Task 5: Integration with Agent Loop** (AC: 13)
  - [ ] 5.1 Modify `runOrionAgent()` signature in `src/agent/orion.ts` to accept optional `documentBlocks` parameter
  - [ ] 5.2 In agent loop, prepend document blocks to first user message content array (Anthropic requires document blocks in `user` role messages)
  - [ ] 5.3 Update `handleAssistantUserMessage` in `src/slack/handlers/user-message.ts` to call file ingestion and pass document blocks

- [ ] **Task 6: Observability & Testing** (AC: 24, 25)
  - [ ] 6.1 Add Langfuse events for file ingestion flow
  - [ ] 6.2 Include file metadata in trace
  - [ ] 6.3 Write integration tests for complete flow
  - [ ] 6.4 Manual E2E test with Slack file upload

## Dev Notes

### Architecture Compliance

This story follows the established patterns from the architecture document:

**File Structure:**
```
src/
├── slack/
│   └── files/
│       ├── download.ts          # New: Slack file download
│       ├── download.test.ts
│       └── types.ts             # SlackFile type extensions
├── files/
│   ├── api-client.ts            # Existing: Add uploadFile() if needed
│   ├── ingestion.ts             # New: Download → Upload orchestration
│   └── ingestion.test.ts
├── agent/
│   ├── document-blocks.ts       # New: Build document blocks for Claude
│   ├── document-blocks.test.ts
│   └── loop.ts                  # Modify: Accept document blocks
```

**Type Definitions:**

```typescript
// src/slack/files/types.ts
export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private_download: string;
}

export interface DownloadedFile {
  content: Buffer;
  filename: string;
  mimetype: string;
  size: number;
  slackFileId: string;  // For observability tracing back to source
}

// Supported file types and size limits
export const FILE_LIMITS = {
  PDF: { extensions: ['.pdf'], maxSize: 100 * 1024 * 1024 },
  IMAGE: { extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'], maxSize: 20 * 1024 * 1024 },
  CSV: { extensions: ['.csv'], maxSize: 100 * 1024 * 1024 },
  TEXT: { extensions: ['.txt', '.md', '.json', '.xml', '.yaml', '.yml'], maxSize: 100 * 1024 * 1024 },
} as const;
```

**Slack File Download Pattern:**

```typescript
// src/slack/files/download.ts
import { config } from '../../config/environment.js';

export async function downloadSlackFile(file: SlackFile): Promise<DownloadedFile> {
  // Validate file size before download
  const limit = getFileSizeLimit(file.mimetype);
  if (file.size > limit) {
    throw new FileTooLargeError(file.name, file.size, limit);
  }

  // Download with bot token auth
  const response = await fetch(file.url_private_download, {
    headers: {
      Authorization: `Bearer ${config.slack.botToken}`,
    },
  });

  if (!response.ok) {
    throw new FileDownloadError(file.name, response.status);
  }

  return {
    content: Buffer.from(await response.arrayBuffer()),
    filename: file.name,
    mimetype: file.mimetype,
    size: file.size,
  };
}
```

**Document Block Format:**

```typescript
// src/agent/document-blocks.ts
interface DocumentBlock {
  type: 'document';
  source: {
    type: 'file';
    file_id: string;
  };
  title?: string;
  citations?: { enabled: boolean };
}

export function buildDocumentBlock(fileId: string, filename: string): DocumentBlock {
  return {
    type: 'document',
    source: {
      type: 'file',
      file_id: fileId,
    },
    title: filename,
    citations: { enabled: true }, // Pairs with Story 8.1
  };
}
```

**Integration with Agent Loop:**

```typescript
// In handler - user-message.ts
const documentBlocks: DocumentBlock[] = [];

if (event.files && event.files.length > 0) {
  for (const slackFile of event.files) {
    try {
      // 1. Download from Slack
      const downloaded = await downloadSlackFile(slackFile);

      // 2. Upload to Anthropic
      const { file_id } = await filesApi.uploadFile(downloaded);

      // 3. Build document block
      documentBlocks.push(buildDocumentBlock(file_id, slackFile.name));

      logger.info({
        event: 'file.ingestion.success',
        traceId,
        filename: slackFile.name,
        fileId: file_id,
      });
    } catch (error) {
      // Log error, inform user, continue
      logger.error({
        event: 'file.ingestion.failed',
        traceId,
        filename: slackFile.name,
        error: error instanceof Error ? error.message : String(error),
      });

      // Inform user but don't block message processing
      await say(`Unable to process file "${slackFile.name}": ${getErrorMessage(error)}`);
    }
  }
}

// Pass to agent loop
const result = await runAgentLoop(message, documentBlocks);
```

### Project Context Compliance

Per `project-context.md`:

1. **ESM Imports:** Use `.js` extensions on all relative imports
2. **Error Handling:** Never throw from tool handlers; return `ToolResult<T>`
3. **Logging:** Include `traceId` in every log entry
4. **Slack mrkdwn:** Use `*bold*` not `**bold**` in user-facing messages

### Existing Code to Reuse (CRITICAL - Do Not Reinvent)

- **`src/files/api-client.ts`** - Files API client from Story 6.5
  - `uploadBuffer(buffer, filename, mimeType, traceId)` - Already handles Buffer uploads
  - `FilesApiError` - Already handles FILE_TOO_LARGE, etc.
  - MAX_FILE_SIZE_BYTES = 100MB - Already defined in `src/files/types.ts`
- **`src/config/environment.ts`** - `config.slack.botToken` for auth (use `config.slackBotToken`)
- **`src/observability/langfuse.ts`** - Langfuse client for tracking
- **`src/utils/logger.ts`** - Structured logging

### Edge Cases to Handle

1. **Expired Slack URL:** Slack file URLs can expire. If download fails with 404/403, inform user "File no longer available"
2. **Zero-byte file:** Skip files with `size === 0`, log warning, inform user
3. **MIME/Extension mismatch:** Trust Slack's `mimetype` field over file extension for validation
4. **Story 8.1 not ready:** If Citations (Story 8.1) is not yet implemented, set `citations: { enabled: true }` anyway - it's forward compatible

### Project Structure Notes

- New files follow existing patterns in `src/slack/` and `src/files/`
- Tests co-located with source files (`*.test.ts`)
- Types defined in dedicated `types.ts` files

### References

- [Source: _bmad-output/epics.md#Epic-8 - Story 8.3 definition]
- [Source: _bmad-output/architecture.md#Epic-8-File-Ingestion - ADR-2026-01-09]
- [Source: _bmad-output/prd.md#FR51 - File Ingestion requirement]
- [Source: _bmad-output/project-context.md - Implementation rules]
- [Source: src/files/api-client.ts - Existing Files API client]

### Dependencies

- **Story 6.5 (Files API Client):** DONE - Provides download client, need upload method
- **Story 8.1 (Citations API):** IN PROGRESS - Enables citations on document blocks
- **Slack API:** `files.info` and `url_private_download` for file access

### Test Considerations

**Unit Tests:**
- `download.test.ts`: Mock fetch, test auth header, error handling
- `ingestion.test.ts`: Mock download/upload, test orchestration
- `document-blocks.test.ts`: Test block format, type validation

**Integration Tests:**
- Complete flow: Slack file → Download → Upload → Document block
- Error scenarios: Large file, unsupported type, network failure

**Manual E2E Test:**
1. Upload PDF to Slack DM with Orion
2. Verify Claude can read and cite document content
3. Upload multiple files in one message
4. Upload unsupported format (e.g., .zip) - verify error message

## Change Log

| Date | Change |
|------|--------|
| 2026-01-11 | Story validated: Fixed Task 3.1 (FilesApiClient methods already exist), clarified Task 5 with specific file paths and signatures, added slackFileId to DownloadedFile, added edge cases section, documented existing code to reuse |

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

