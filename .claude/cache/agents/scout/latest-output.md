# Codebase Report: File Handling, Uploads, Attachments & Media
Generated: 2026-01-12

## Summary

This Slack agent (Orion) has a **complete file ingestion pipeline** that downloads files from Slack and uploads them to Anthropic's Files API for Claude's document understanding. The system supports PDFs, images, CSV, and text files with type-specific size limits.

## Architecture: File Flow

```
Slack Message with Files
         ↓
[Event Handler] ← app-mention.ts / user-message.ts
         ↓
[File Ingestion] ← files/ingestion.ts
         ↓
    ┌────┴────┐
    ↓         ↓
[Download]  [Upload]
slack/files  files/api-client.ts
download.ts  (Anthropic Files API)
         ↓
[Document Blocks] ← agent/document-blocks.ts
         ↓
[Agent Loop] ← agent/loop.ts
         ↓
Claude API (with document blocks)
```

## Key Files

### 1. Slack Message Handlers (Entry Points)

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `src/slack/handlers/app-mention.ts` | Handles @orion mentions in channels | Lines 220-271 (file ingestion) |
| `src/slack/handlers/user-message.ts` | Handles DMs and Assistant messages | Lines 320-370 (file ingestion) |

**How they work:**
- Extract `files` array from Slack message event (line 226 app-mention, similar in user-message)
- Call `ingestSlackFiles()` to process all files
- Build document blocks with citations enabled
- Pass document blocks to `runOrionAgent()`
- Send error messages to user for failed files

### 2. File Ingestion Orchestration

**File:** `src/files/ingestion.ts`

**Key Functions:**
- `ingestSlackFile(slackFile, options)` - Single file: download → upload → return file ID
- `ingestSlackFiles(slackFiles, options)` - Batch: processes files in parallel

**Flow:**
1. Download from Slack using `downloadSlackFile()`
2. Upload buffer to Anthropic using `filesClient.uploadBuffer()`
3. Track success/failure with Langfuse observability
4. Return array of `FileIngestionResult` objects

### 3. Slack File Download

**File:** `src/slack/files/download.ts`

**Function:** `downloadSlackFile(file, options)`

**Features:**
- ✓ VERIFIED: Uses `file.url_private_download` with bot token auth
- ✓ VERIFIED: Validates file size before download
- ✓ VERIFIED: Checks MIME type support
- ✓ VERIFIED: 30s timeout with abort controller
- ✓ VERIFIED: Returns `DownloadedFile` with Buffer content

**Error Handling:**
- `SlackFileDownloadError` with codes:
  - `FILE_TOO_LARGE` - Exceeds type-specific limit
  - `UNSUPPORTED_TYPE` - Not PDF/image/CSV/text
  - `FILE_EXPIRED` - 404/410 from Slack
  - `DOWNLOAD_FAILED` - Auth or network issues
  - `ZERO_BYTE_FILE` - Empty file

### 4. File Type Support

**File:** `src/slack/files/types.ts`

**Supported Types:**

| Category | Extensions | MIME Types | Max Size |
|----------|-----------|------------|----------|
| PDF | `.pdf` | `application/pdf` | 100 MB |
| Images | `.png, .jpg, .jpeg, .gif, .webp` | `image/*` | 20 MB |
| CSV | `.csv` | `text/csv, application/csv` | 100 MB |
| Text | `.txt, .md, .json, .xml, .yaml` | `text/plain, text/markdown, application/json, text/xml, text/yaml` | 100 MB |

**Helper Functions:**
- `isSupportedMimeType(mimetype)` - Check if type is supported
- `getMaxSizeForMimeType(mimetype)` - Get size limit for type
- `formatSupportedTypes()` - Generate user-friendly error message
- `formatFileSize(bytes)` - Human-readable size (e.g., "5.2 MB")

### 5. Anthropic Files API Client

**File:** `src/files/api-client.ts`

**Class:** `FilesApiClient`

**Methods:**
- `uploadFile(filePath, options)` - Upload from disk
- `uploadBuffer(buffer, filename, mimeType, traceId)` - Upload from memory ← **Used by ingestion**
- `downloadFile(fileId, traceId)` - Download file content
- `getFileMetadata(fileId, traceId)` - Get file info
- `deleteFile(fileId, traceId)` - Delete file
- `extractFileIds(response)` - Extract file IDs from code execution responses

**Features:**
- Uses beta header: `files-api-2025-04-14`
- Validates 100MB limit before API call
- Wraps errors with `FilesApiError` codes
- Logs with trace ID for observability

### 6. Document Block Builder

**File:** `src/agent/document-blocks.ts`

**Function:** `buildDocumentBlocks(results, options)`

**Purpose:** Convert `FileIngestionResult[]` → `DocumentBlock[]` for Claude

**Output Structure:**
```typescript
{
  type: 'document',
  source: { type: 'file', file_id: 'file_abc123...' },
  title: 'filename.pdf',
  citations: { enabled: true }
}
```

**Error Handling:**
- Collects user-friendly error messages for failed files
- Returns both successful blocks and error strings
- Handlers send error messages to Slack thread

### 7. Agent Integration

**File:** `src/agent/loop.ts`

**How document blocks are used:**

Line 797-818:
```typescript
const hasDocumentBlocks = documentBlocks.length > 0;

// Prepend document blocks to first user message
if (hasDocumentBlocks) {
  const contentBlocks = [
    ...documentBlocks,
    { type: 'text', text: userMessage }
  ];
  messages.push({ role: 'user', content: contentBlocks });
} else {
  messages.push({ role: 'user', content: userMessage });
}
```

**Integration with Anthropic API:**
- Document blocks are prepended to the first user message
- Claude processes the documents and can cite them
- Citations returned via `message.content[].citations` array
- Agent extracts citations and returns them in `AgentResult.documentCitations`

### 8. Citation Handling

**File:** `src/slack/citations/parser.ts`

**Function:** `parseCitationsWithMetadata(citations, docMetadata)`

**Purpose:** Enrich document citations with file names for display

**Flow:**
1. Agent receives citations from Claude (e.g., `[doc0:12]`)
2. Parser matches citation index to document block metadata
3. Returns enriched citations with file names
4. `formatReferencesBlock()` displays unified references (tool sources + document citations)

### 9. Error Handling

**File:** `src/agent/document-blocks.ts`

**Function:** `formatFileErrors(errors)`

**User-Friendly Messages:**
- File too large → Shows actual size and limit
- Unsupported type → Lists supported formats
- File expired → Explains file no longer available
- Download failed → Auth/network issue
- Upload failed → Processing error

**Display:** Sent as Slack message in thread before agent responds

## Existing Capabilities

### ✓ What Works

1. **File Detection** - Extracts `files` array from Slack events
2. **Multi-file Support** - Processes multiple files in parallel
3. **Type Validation** - Checks MIME types and size limits
4. **Download** - Authenticated fetch from Slack with timeout
5. **Upload** - Sends to Anthropic Files API with proper headers
6. **Document Blocks** - Builds citation-enabled blocks
7. **Agent Integration** - Prepends blocks to first user message
8. **Citation Parsing** - Extracts and enriches document citations
9. **Error Handling** - User-friendly messages for all failure modes
10. **Observability** - Langfuse tracking for all steps

### ✗ What's Missing (for Prompt Caching)

**NO FILE ATTACHMENT SUPPORT IN USER UPLOADS TO CLAUDE**

The current implementation:
- Downloads files from Slack
- Uploads to Anthropic Files API
- Creates document blocks with file IDs
- Sends document blocks in messages

**BUT:** Document blocks are sent in the `content` array of each message, NOT as system prompt attachments.

For prompt caching, Anthropic supports:
- System prompt blocks with document attachments
- These can be cached across requests

**Current structure:**
```typescript
// What we do now (in message content)
messages: [
  {
    role: 'user',
    content: [
      { type: 'document', source: { type: 'file', file_id: '...' } },
      { type: 'text', text: 'user message' }
    ]
  }
]
```

**What's needed for caching:**
```typescript
// System blocks with document attachments
system: [
  { type: 'text', text: 'system prompt', cache_control: { type: 'ephemeral' } },
  { type: 'document', source: { type: 'file', file_id: '...' }, cache_control: { type: 'ephemeral' } }
],
messages: [...]
```

## Unsupported Content Types

The system rejects these with user-friendly errors:

**Binary executables:** `.exe, .dll, .so, .dylib`
**Archives:** `.zip, .tar, .gz, .rar` (could extract but don't)
**Media:** `.mp3, .mp4, .mov, .avi` (audio/video not supported by Claude)
**Office docs:** `.docx, .pptx, .xlsx` (would need conversion to text/PDF)

**Error message includes:**
```
Unsupported file type: application/zip

Supported formats:
  - PDF files (.pdf)
  - Images (.png, .jpg, .jpeg, .gif, .webp)
  - CSV files (.csv)
  - Text files (.txt, .md, .json, .xml, .yaml, .yml)
```

## Code References

### Import Paths

```typescript
// Download
import { downloadSlackFile, SlackFileDownloadError } from '../slack/files/index.js';

// Ingestion
import { ingestSlackFiles, createFilesApiClient } from '../files/index.js';

// Document blocks
import { buildDocumentBlocks, formatFileErrors } from '../agent/document-blocks.js';

// Types
import type { SlackFile, FileIngestionResult } from '../slack/files/types.js';
import type { DocumentBlock } from '../agent/document-blocks.js';
```

### Configuration

```typescript
// From src/config/environment.ts
config.slackBotToken // Used for file download auth
config.anthropicApiKey // Used for Files API upload
```

## Testing

All modules have comprehensive test coverage:

- `src/slack/files/download.test.ts` - Download validation, auth, timeouts
- `src/files/ingestion.test.ts` - End-to-end ingestion flow
- `src/agent/document-blocks.test.ts` - Block building and error formatting
- `src/files/api-client.test.ts` - Files API operations

## Related Stories

| Story | Feature |
|-------|---------|
| 8.3 | Slack File Ingestion for Claude Context |
| 6.5 | Files API Client |
| 8.1 | Citations & Sources Unification |

## Open Questions

1. **Prompt Caching:** How should files be attached to system prompt for caching?
2. **File Lifecycle:** When should uploaded files be deleted from Anthropic?
3. **Size Limits:** Should we support larger files with chunking?
4. **Archive Support:** Extract and process files from .zip archives?
5. **Office Docs:** Convert .docx/.xlsx to text/CSV before upload?

