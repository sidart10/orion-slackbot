# ATDD Checklist: 8-3-slack-file-ingestion

Status: pending
Story: [Story 8.3: Slack File Ingestion for Claude Context](/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/_bmad-output/implementation-artifacts/stories/story-8-3-slack-file-ingestion.md)

---

## AC1: Detect `files` array in Slack `message` events (both DM and channel)

### Happy Path
- [ ] Test: Detect files in DM message event
  - Given: A Slack `message` event with `files` array containing one file
  - When: `user-message.ts` handler processes the event
  - Then: Files are detected and extraction logic is invoked

- [ ] Test: Detect files in channel mention event
  - Given: A Slack `app_mention` event with `files` array containing one file
  - When: `app-mention.ts` handler processes the event
  - Then: Files are detected and extraction logic is invoked

### Edge Cases
- [ ] Test: Empty files array
  - Given: A message event with `files: []`
  - When: Handler processes the event
  - Then: No file processing is attempted, message proceeds normally

- [ ] Test: Missing files property
  - Given: A message event without `files` property
  - When: Handler processes the event
  - Then: No file processing is attempted, message proceeds normally

### Error Handling
- [ ] Test: Malformed files array (non-array value)
  - Given: A message event with `files` as non-array (e.g., `null`, string)
  - When: Handler processes the event
  - Then: Files property is safely ignored, message proceeds normally

---

## AC2: Support multiple files in a single message (process all)

### Happy Path
- [ ] Test: Process all files in multi-file message
  - Given: A message event with 3 files attached
  - When: Handler processes the event
  - Then: All 3 files are processed sequentially

- [ ] Test: Create document blocks for all files
  - Given: 3 valid files successfully uploaded to Anthropic
  - When: Document blocks are built
  - Then: 3 document blocks are created with correct file_ids

### Edge Cases
- [ ] Test: Mixed valid and invalid files
  - Given: 3 files where file[0] is valid, file[1] is unsupported type, file[2] is valid
  - When: Handler processes the event
  - Then: Files 0 and 2 produce document blocks, file 1 produces user-friendly error message

- [ ] Test: Maximum files in single message (10 files)
  - Given: A message with 10 attached files
  - When: Handler processes the event
  - Then: All 10 files are processed without timeout or memory issues

### Error Handling
- [ ] Test: Partial failure scenario
  - Given: 3 files where file[1] fails download
  - When: Handler processes the event
  - Then: Files 0 and 2 succeed, error logged for file 1, user informed about file 1 failure

---

## AC3: Log file metadata to Langfuse for observability

### Happy Path
- [ ] Test: Log file metadata on detection
  - Given: A file with name="report.pdf", type="application/pdf", size=1048576
  - When: File is detected in handler
  - Then: Langfuse event logged with file metadata including name, type, size

- [ ] Test: Include traceId in log entry
  - Given: A request with traceId="abc123"
  - When: File metadata is logged
  - Then: Log entry includes traceId="abc123"

### Edge Cases
- [ ] Test: Log metadata for files with special characters in name
  - Given: File with name="quarterly report (Q4).pdf"
  - When: Metadata is logged
  - Then: Filename logged correctly without escaping issues

---

## AC4: Download file content via Slack API using `url_private_download`

### Happy Path
- [ ] Test: Successful file download
  - Given: SlackFile with valid `url_private_download`
  - When: `downloadSlackFile()` is called
  - Then: Returns `DownloadedFile` with Buffer content, filename, mimetype, size, slackFileId

- [ ] Test: Download returns correct buffer content
  - Given: A 10KB test file at url_private_download
  - When: Download completes
  - Then: Buffer contains exact bytes from source, size matches expected

### Edge Cases
- [ ] Test: Large file download (50MB)
  - Given: A 50MB PDF file
  - When: Download is initiated
  - Then: Download completes successfully without memory issues

- [ ] Test: Download with slow connection (simulate latency)
  - Given: URL responds with 2-second delay
  - When: Download is initiated
  - Then: Download completes successfully, no premature timeout

---

## AC5: Use bot token for authentication (`Authorization: Bearer ${SLACK_BOT_TOKEN}`)

### Happy Path
- [ ] Test: Request includes correct Authorization header
  - Given: config.slackBotToken = "xoxb-test-token"
  - When: `downloadSlackFile()` calls fetch
  - Then: Request headers include `Authorization: Bearer xoxb-test-token`

### Error Handling
- [ ] Test: Invalid bot token returns 401
  - Given: Invalid or expired bot token
  - When: Download is attempted
  - Then: FileDownloadError thrown with status 401, logged, user informed

- [ ] Test: Token lacks file access scope
  - Given: Bot token without `files:read` scope
  - When: Download is attempted
  - Then: FileDownloadError thrown with status 403, logged, user informed

---

## AC6: Handle download failures gracefully (log error, inform user, continue without file)

### Happy Path
- [ ] Test: Single file download failure does not block message
  - Given: Message with 1 file that fails to download
  - When: Handler processes message
  - Then: Error logged, user informed via Slack, text message still processed

### Error Handling
- [ ] Test: Network timeout during download
  - Given: url_private_download times out after 30s
  - When: Download is attempted
  - Then: FileDownloadError logged, user informed "File no longer available or download timed out"

- [ ] Test: HTTP 404 from Slack (file deleted)
  - Given: url_private_download returns 404
  - When: Download is attempted
  - Then: Error logged, user informed "File no longer available"

- [ ] Test: HTTP 500 from Slack (server error)
  - Given: url_private_download returns 500
  - When: Download is attempted
  - Then: Error logged, user informed "Failed to download file, please try again"

---

## AC7: Respect file size limits (max 100MB per file)

### Happy Path
- [ ] Test: Accept file at exactly 100MB
  - Given: SlackFile with size = 104857600 (100MB exact)
  - When: Size validation runs
  - Then: File passes validation, download proceeds

### Edge Cases
- [ ] Test: Reject file at 100MB + 1 byte
  - Given: SlackFile with size = 104857601
  - When: Size validation runs
  - Then: FileTooLargeError thrown, download not attempted

### Error Handling
- [ ] Test: Size validation before download (don't download then reject)
  - Given: SlackFile with size = 200MB in metadata
  - When: `downloadSlackFile()` is called
  - Then: FileTooLargeError thrown immediately without initiating download

---

## AC8: Upload downloaded file to Anthropic Files API

### Happy Path
- [ ] Test: Successful upload to Anthropic
  - Given: DownloadedFile with valid content, filename, mimetype
  - When: `FilesApiClient.uploadBuffer()` is called
  - Then: Returns file object with `id` field

- [ ] Test: Upload preserves filename
  - Given: DownloadedFile with filename="report.pdf"
  - When: Upload completes
  - Then: Anthropic file metadata includes original filename

### Edge Cases
- [ ] Test: Upload file with unicode filename
  - Given: filename = "rapport_annuel_2025.pdf"
  - When: Upload completes
  - Then: Filename preserved correctly in Anthropic response

---

## AC9: Reuse existing `FilesApiClient` from `src/files/api-client.ts` (Story 6.5)

### Happy Path
- [ ] Test: Use existing uploadBuffer method signature
  - Given: Existing `FilesApiClient.uploadBuffer(buffer, filename, mimeType, traceId)`
  - When: File ingestion calls upload
  - Then: Calls match existing method signature without modification

### Integration
- [ ] Test: FilesApiClient instantiation uses config.anthropic.apiKey
  - Given: Valid API key in config
  - When: FilesApiClient is used
  - Then: API calls authenticate successfully

---

## AC10: Track upload success/failure in Langfuse

### Happy Path
- [ ] Test: Log successful upload event
  - Given: Successful upload returning file_id="file_abc123"
  - When: Upload completes
  - Then: Langfuse event logged with event="file.ingestion.success", fileId="file_abc123"

### Error Handling
- [ ] Test: Log failed upload event
  - Given: Upload fails with error "RATE_LIMIT"
  - When: Upload throws error
  - Then: Langfuse event logged with event="file.ingestion.failed", error="RATE_LIMIT"

---

## AC11: Create document block with `file_id` reference for each uploaded file

### Happy Path
- [ ] Test: Build document block with correct structure
  - Given: file_id="file_abc123", filename="report.pdf"
  - When: `buildDocumentBlock()` is called
  - Then: Returns `{ type: 'document', source: { type: 'file', file_id: 'file_abc123' }, title: 'report.pdf', citations: { enabled: true } }`

- [ ] Test: Multiple files produce multiple document blocks
  - Given: 3 uploaded files with file_ids
  - When: `buildDocumentBlocks()` processes all
  - Then: Returns array of 3 document blocks with matching file_ids

---

## AC12: Enable `citations: { enabled: true }` on document blocks (pairs with Story 8.1)

### Happy Path
- [ ] Test: Citations enabled by default
  - Given: Any valid file upload
  - When: Document block is built
  - Then: Block includes `citations: { enabled: true }`

### Edge Cases
- [ ] Test: Forward compatibility with Story 8.1
  - Given: Story 8.1 Citations API not yet active
  - When: Document block with citations is sent to Anthropic
  - Then: API accepts request without error (citations field is ignored if feature not enabled)

---

## AC13: Include document blocks in messages array before calling agent loop

### Happy Path
- [ ] Test: Document blocks prepended to first user message
  - Given: User message "Analyze this file" with 1 document block
  - When: Agent loop messages are constructed
  - Then: First user message content array starts with document block, followed by text

- [ ] Test: Agent can reference document content
  - Given: PDF document block included in messages
  - When: Claude processes the message
  - Then: Claude can summarize/quote content from the document

### Edge Cases
- [ ] Test: Message with only document blocks (no text)
  - Given: User uploads file with no accompanying text
  - When: Messages are constructed
  - Then: User message contains only document blocks, request proceeds

---

## AC14: Handle unsupported file types gracefully (inform user, skip file)

### Happy Path
- [ ] Test: Skip unsupported type, continue with supported
  - Given: Message with [file.pdf, file.zip, file.txt]
  - When: Processing runs
  - Then: PDF and TXT processed, ZIP skipped with user message

### Error Handling
- [ ] Test: Inform user of unsupported type
  - Given: User uploads file.zip
  - When: Type validation fails
  - Then: User sees Slack message: "Unable to process file.zip: Unsupported file type. Supported types: PDF, images (PNG, JPG, GIF, WebP), CSV, text files (TXT, MD, JSON, XML, YAML)"

---

## AC15: PDF files (`.pdf`) - max 100MB

### Happy Path
- [ ] Test: Accept valid PDF file
  - Given: File with name="report.pdf", mimetype="application/pdf", size=5MB
  - When: Format validation runs
  - Then: File accepted, processing continues

### Edge Cases
- [ ] Test: Accept PDF with uppercase extension
  - Given: File with name="REPORT.PDF"
  - When: Format validation runs
  - Then: File accepted (case-insensitive extension check)

- [ ] Test: Reject oversized PDF (>100MB)
  - Given: PDF file with size=150MB
  - When: Size validation runs
  - Then: FileTooLargeError with message indicating 100MB limit for PDFs

---

## AC16: Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) - max 20MB

### Happy Path
- [ ] Test: Accept valid PNG image
  - Given: File with name="chart.png", mimetype="image/png", size=2MB
  - When: Validation runs
  - Then: File accepted

- [ ] Test: Accept valid JPEG image
  - Given: File with name="photo.jpg", mimetype="image/jpeg", size=5MB
  - When: Validation runs
  - Then: File accepted

### Edge Cases
- [ ] Test: Accept WebP image
  - Given: File with name="animation.webp", mimetype="image/webp", size=1MB
  - When: Validation runs
  - Then: File accepted

- [ ] Test: Reject oversized image (>20MB)
  - Given: PNG file with size=25MB
  - When: Size validation runs
  - Then: FileTooLargeError with message indicating 20MB limit for images

---

## AC17: CSV files (`.csv`) - max 100MB

### Happy Path
- [ ] Test: Accept valid CSV file
  - Given: File with name="data.csv", mimetype="text/csv", size=10MB
  - When: Validation runs
  - Then: File accepted

### Edge Cases
- [ ] Test: Accept CSV with alternate mimetype
  - Given: File with name="export.csv", mimetype="application/csv", size=5MB
  - When: Validation runs
  - Then: File accepted (check extension as fallback)

---

## AC18: Text files (`.txt`, `.md`, `.json`, `.xml`, `.yaml`, `.yml`) - max 100MB

### Happy Path
- [ ] Test: Accept TXT file
  - Given: File with name="notes.txt", mimetype="text/plain", size=100KB
  - When: Validation runs
  - Then: File accepted

- [ ] Test: Accept Markdown file
  - Given: File with name="README.md", mimetype="text/markdown", size=50KB
  - When: Validation runs
  - Then: File accepted

- [ ] Test: Accept JSON file
  - Given: File with name="config.json", mimetype="application/json", size=1MB
  - When: Validation runs
  - Then: File accepted

- [ ] Test: Accept YAML file
  - Given: File with name="config.yaml", mimetype="application/x-yaml", size=500KB
  - When: Validation runs
  - Then: File accepted

### Edge Cases
- [ ] Test: Accept .yml extension (alias for YAML)
  - Given: File with name="docker-compose.yml"
  - When: Validation runs
  - Then: File accepted

---

## AC19: Reject unsupported formats with helpful message listing supported types

### Happy Path
- [ ] Test: Reject .zip file with helpful message
  - Given: File with name="archive.zip", mimetype="application/zip"
  - When: Validation runs
  - Then: UnsupportedFileTypeError with message listing all supported types

- [ ] Test: Reject .exe file with helpful message
  - Given: File with name="program.exe", mimetype="application/octet-stream"
  - When: Validation runs
  - Then: UnsupportedFileTypeError with clear guidance

### Edge Cases
- [ ] Test: Reject .docx file (Word not supported yet)
  - Given: File with name="document.docx"
  - When: Validation runs
  - Then: UnsupportedFileTypeError, message suggests converting to PDF

---

## AC20: File too large - Inform user of size limit

### Happy Path
- [ ] Test: User message specifies correct limit for file type
  - Given: 150MB PDF file rejected
  - When: Error message sent to user
  - Then: Message includes "File is too large (150MB). Maximum size for PDFs: 100MB"

- [ ] Test: Image size limit communicated correctly
  - Given: 30MB PNG image rejected
  - When: Error message sent to user
  - Then: Message includes "File is too large (30MB). Maximum size for images: 20MB"

---

## AC21: Download failed - Log error, inform user, continue processing text message

### Happy Path
- [ ] Test: Text message processed despite download failure
  - Given: Message "Analyze this report" with 1 file that fails download
  - When: Handler processes message
  - Then: Claude receives text message, user informed about file failure, agent responds

### Error Handling
- [ ] Test: Error logged with full context
  - Given: Download fails with HTTP 503
  - When: Error is caught
  - Then: Log includes traceId, filename, HTTP status, "file.ingestion.failed" event

---

## AC22: Upload failed - Log error, inform user, continue processing text message

### Happy Path
- [ ] Test: Text message processed despite upload failure
  - Given: Message with file that downloads but fails Anthropic upload
  - When: Handler processes message
  - Then: Claude receives text message, user informed about file failure

### Error Handling
- [ ] Test: Anthropic rate limit handled gracefully
  - Given: Anthropic Files API returns 429
  - When: Upload fails
  - Then: User informed "File upload temporarily unavailable, please try again", text processed

---

## AC23: Unsupported type - Inform user of supported types

### Happy Path
- [ ] Test: Clear error message for unsupported type
  - Given: User uploads file.pptx
  - When: Type validation fails
  - Then: User sees "Unsupported file type '.pptx'. Supported: PDF, images (PNG, JPG, JPEG, GIF, WebP), CSV, text (TXT, MD, JSON, XML, YAML, YML)"

---

## AC24: Track file ingestion metrics in Langfuse (count, types, sizes, success rate)

### Happy Path
- [ ] Test: Track file count per request
  - Given: Message with 3 files
  - When: Processing completes
  - Then: Langfuse trace includes metadata: fileCount=3

- [ ] Test: Track file types distribution
  - Given: 2 PDFs, 1 PNG
  - When: Processing completes
  - Then: Langfuse metadata includes: fileTypes=["pdf", "pdf", "png"]

- [ ] Test: Track total size uploaded
  - Given: Files totaling 15MB
  - When: Processing completes
  - Then: Langfuse metadata includes: totalSize=15728640

### Error Handling
- [ ] Test: Track success rate
  - Given: 3 files, 2 succeed, 1 fails
  - When: Processing completes
  - Then: Langfuse includes: successCount=2, failureCount=1

---

## AC25: Include file metadata in trace for debugging

### Happy Path
- [ ] Test: Trace includes per-file metadata
  - Given: File "report.pdf" uploaded as file_abc123
  - When: Trace is recorded
  - Then: Trace includes: { slackFileId, filename, mimetype, size, anthropicFileId, status }

- [ ] Test: Failed files include error details in trace
  - Given: File "large.zip" rejected as unsupported
  - When: Trace is recorded
  - Then: Trace includes: { filename: "large.zip", status: "failed", error: "unsupported_type" }

---

## Integration Tests

### End-to-End Flow
- [ ] Test: Complete flow - Slack file to document block
  - Given: User uploads PDF in Slack DM
  - When: Full pipeline executes
  - Then: Document block with file_id reaches agent loop, Claude can reference content

- [ ] Test: Multi-file message end-to-end
  - Given: User uploads PDF + PNG + CSV in single message
  - When: Full pipeline executes
  - Then: 3 document blocks created, all accessible to Claude

### Error Recovery
- [ ] Test: Graceful degradation on Anthropic API outage
  - Given: Anthropic Files API is unavailable
  - When: User uploads file
  - Then: Text message still processed, user informed files couldn't be processed

- [ ] Test: Continue on Slack API rate limit
  - Given: Slack rate limits file downloads mid-batch
  - When: 5 file batch is processing
  - Then: Successfully downloaded files processed, rate-limited ones logged with retry guidance

---

## Summary

| Category | Test Count |
|----------|------------|
| File Detection (AC1-3) | 11 |
| File Download (AC4-7) | 15 |
| File Upload (AC8-10) | 7 |
| Document Blocks (AC11-14) | 10 |
| Supported Formats (AC15-19) | 17 |
| Error Handling (AC20-23) | 8 |
| Observability (AC24-25) | 7 |
| Integration | 4 |
| **Total** | **79** |

---

## Test Implementation Notes

Per `project-context.md`:

1. **Test Framework:** Vitest 1.6.0 with co-located test files (`*.test.ts`)
2. **Mocking:** Use Vitest mocks for fetch, FilesApiClient, Langfuse
3. **ESM Imports:** All test imports must use `.js` extension
4. **traceId:** Include in all test scenarios for observability verification
5. **Error Messages:** Use Slack mrkdwn format (`*bold*` not `**bold**`)

### Mock Patterns

```typescript
// Mock Slack file download
vi.spyOn(global, 'fetch').mockResolvedValue(
  new Response(Buffer.from('test content'), { status: 200 })
);

// Mock Files API client
vi.mock('../files/api-client.js', () => ({
  FilesApiClient: vi.fn().mockImplementation(() => ({
    uploadBuffer: vi.fn().mockResolvedValue({ id: 'file_test123' }),
  })),
}));

// Mock Langfuse
vi.mock('../observability/langfuse.js', () => ({
  langfuse: {
    event: vi.fn(),
    trace: vi.fn(),
  },
}));
```

### Test Data Fixtures

```typescript
// src/slack/files/__fixtures__/slack-file.ts
export const mockSlackFile: SlackFile = {
  id: 'F1234567890',
  name: 'test-report.pdf',
  mimetype: 'application/pdf',
  filetype: 'pdf',
  size: 1048576, // 1MB
  url_private_download: 'https://files.slack.com/files-pri/T123-F123/download/test-report.pdf',
};
```
