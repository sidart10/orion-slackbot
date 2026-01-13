# ATDD Checklist: Story 8.3 - Slack File Ingestion for Claude Context

**Story:** 8-3-slack-file-ingestion
**Epic:** 8
**Status:** Test scenarios defined

---

## Test Scenario Overview

| Category | Count |
|----------|-------|
| Happy Path Tests | 22 |
| Edge Case Tests | 14 |
| Error Handling Tests | 12 |
| Boundary Condition Tests | 8 |
| Integration Tests | 5 |
| **Total** | **61** |

---

## AC #1: File Detection in Handler

**Given** a message with attached files, **When** the handler processes the message, **Then** the `files` array in the event is detected

### Happy Path

- [ ] **T1.1** Message with single file attachment has `event.files` array detected
- [ ] **T1.2** Handler logs detection with file count

### Edge Cases

- [ ] **T1.3** Message without files has `event.files` as undefined or empty array
- [ ] **T1.4** Message with `files: []` (empty array) is handled gracefully

### Error Handling

- [ ] **T1.5** Malformed files array (non-array type) does not crash handler

---

## AC #2: Batch Processing Multiple Files

**Given** multiple files in a single message, **When** files are ingested, **Then** all files are processed (batch operation)

### Happy Path

- [ ] **T2.1** Two files attached are both processed
- [ ] **T2.2** Five files attached are all processed in parallel
- [ ] **T2.3** BatchIngestionResult contains results for each file

### Edge Cases

- [ ] **T2.4** Mixed success/failure batch (some files succeed, some fail)
- [ ] **T2.5** Single file in batch still uses batch processing path

### Boundary Conditions

- [ ] **T2.6** Ten files processed (reasonable upper bound)

---

## AC #3: Logging File Metadata

**Given** a message with files, **When** files are detected, **Then** a log entry is created with file count, names, and sizes

### Happy Path

- [ ] **T3.1** Log includes `file.ingestion.start` event with traceId
- [ ] **T3.2** Log includes filename, mimetype, and size in metadata
- [ ] **T3.3** Batch completion log includes totalFiles, successCount, failureCount

### Edge Cases

- [ ] **T3.4** Very long filename (255 characters) is logged without truncation issues

---

## AC #4: Download from url_private_download

**Given** a Slack file URL, **When** download is requested, **Then** the content is fetched from `url_private_download`

### Happy Path

- [ ] **T4.1** Download uses `url_private_download` field, not `url_private`
- [ ] **T4.2** Downloaded content matches original file bytes

### Edge Cases

- [ ] **T4.3** File with special characters in name downloads correctly

---

## AC #5: Authentication Header

**Given** a download request, **When** authentication is needed, **Then** the Slack bot token is used in Authorization header

### Happy Path

- [ ] **T5.1** Request includes `Authorization: Bearer {botToken}` header
- [ ] **T5.2** Bot token from config.slack.botToken is used

### Error Handling

- [ ] **T5.3** Missing bot token returns clear error (not crash)
- [ ] **T5.4** Expired token returns 401 with user-friendly message

---

## AC #6: Download Failure Handling

**Given** a download failure, **When** the error is caught, **Then** a user-friendly message is returned (not a crash)

### Happy Path

- [ ] **T6.1** Failed download returns FileIngestionResult with error, not exception
- [ ] **T6.2** Error includes DOWNLOAD_FAILED code

### Error Handling

- [ ] **T6.3** Network timeout (30s) returns timeout error
- [ ] **T6.4** HTTP 404 returns file not found error
- [ ] **T6.5** HTTP 500 from Slack returns service error

---

## AC #7: File Size Validation Before Download

**Given** a file size validation, **When** the file exceeds limits, **Then** download is rejected with size limit error

### Happy Path

- [ ] **T7.1** File under limit proceeds to download
- [ ] **T7.2** File at exact limit (100MB for PDF) proceeds to download

### Boundary Conditions

- [ ] **T7.3** PDF at 100MB (exact limit) passes validation
- [ ] **T7.4** PDF at 100MB + 1 byte fails validation
- [ ] **T7.5** Image at 20MB passes validation
- [ ] **T7.6** Image at 20MB + 1 byte fails validation

### Error Handling

- [ ] **T7.7** FILE_TOO_LARGE error code returned
- [ ] **T7.8** Error message includes actual size and limit

---

## AC #8: Upload to Anthropic Files API

**Given** a downloaded file buffer, **When** upload is requested, **Then** the buffer is uploaded to Anthropic Files API

### Happy Path

- [ ] **T8.1** Buffer is passed to FilesApiClient.uploadBuffer()
- [ ] **T8.2** Upload returns valid file_id starting with "file-"
- [ ] **T8.3** Original filename is preserved in upload

### Error Handling

- [ ] **T8.4** API failure returns UPLOAD_FAILED error code

---

## AC #9: Reuse Existing FilesApiClient

**Given** upload implementation, **When** code is written, **Then** existing `FilesApiClient` is reused (not duplicated)

### Happy Path

- [ ] **T9.1** Import is from `src/files/api-client.ts`
- [ ] **T9.2** No duplicate Files API implementation in slack/files/

---

## AC #10: Langfuse Tracking

**Given** upload success/failure, **When** the operation completes, **Then** outcome is tracked in Langfuse

### Happy Path

- [ ] **T10.1** `file.ingestion.start` event fired at beginning
- [ ] **T10.2** `file.ingestion.success` event includes anthropicFileId and durationMs
- [ ] **T10.3** `file.ingestion.failure` event includes errorCode and error message
- [ ] **T10.4** `file.ingestion.batch_complete` event fired for batch operations

---

## AC #11: Document Block Creation

**Given** a successful upload, **When** the file ID is returned, **Then** a document block is created with `source.type: file` and `file_id`

### Happy Path

- [ ] **T11.1** Document block has `type: 'document'`
- [ ] **T11.2** Document block has `source.type: 'file'`
- [ ] **T11.3** Document block has correct `file_id` from upload

---

## AC #12: Citations Integration

**Given** a document block with file, **When** Citations (Story 8.1) is enabled, **Then** `citations: { enabled: true }` is included

### Happy Path

- [ ] **T12.1** Document block includes `citations: { enabled: true }`
- [ ] **T12.2** Title field is populated with original filename

---

## AC #13: Document Blocks in Agent Loop

**Given** file ingestion results, **When** passed to agent loop, **Then** `buildDocumentBlocks()` adds them to messages array

### Happy Path

- [ ] **T13.1** buildDocumentBlocks() returns array of content blocks
- [ ] **T13.2** Blocks are added to user message content array
- [ ] **T13.3** Empty results array returns empty blocks array

---

## AC #14: Unsupported File Type Error

**Given** an unsupported file type, **When** validation runs, **Then** clear error message lists supported formats

### Happy Path

- [ ] **T14.1** `.exe` file returns UNSUPPORTED_TYPE error
- [ ] **T14.2** Error message includes list of supported formats

### Edge Cases

- [ ] **T14.3** Unknown MIME type `application/octet-stream` is rejected
- [ ] **T14.4** File with no extension but valid MIME type is accepted

---

## AC #15-18: Size Limits by File Type

**AC #15:** PDF max 100MB
**AC #16:** Image max 20MB
**AC #17:** CSV max 100MB
**AC #18:** Text files max 100MB

### Happy Path - PDF

- [ ] **T15.1** PDF at 50MB passes validation
- [ ] **T15.2** PDF at 100MB passes validation
- [ ] **T15.3** PDF at 101MB fails with FILE_TOO_LARGE

### Happy Path - Images

- [ ] **T16.1** PNG at 10MB passes validation
- [ ] **T16.2** JPG at 20MB passes validation
- [ ] **T16.3** GIF at 21MB fails with FILE_TOO_LARGE
- [ ] **T16.4** WebP at 20MB passes validation

### Happy Path - CSV

- [ ] **T17.1** CSV at 50MB passes validation
- [ ] **T17.2** CSV with `text/csv` MIME type passes
- [ ] **T17.3** CSV with `application/csv` MIME type passes

### Happy Path - Text Files

- [ ] **T18.1** `.txt` file at 100MB passes
- [ ] **T18.2** `.md` file at 50MB passes
- [ ] **T18.3** `.json` file at 100MB passes
- [ ] **T18.4** `.xml` file at 100MB passes
- [ ] **T18.5** `.yaml` and `.yml` files pass

---

## AC #19: Supported Formats List

**Given** unsupported file type, **When** error is shown, **Then** supported formats are listed: PDF, PNG, JPG, GIF, CSV, TXT, MD, JSON, XML, YAML

### Happy Path

- [ ] **T19.1** Error message includes "PDF, PNG, JPG, GIF, CSV, TXT, MD, JSON, XML, YAML"
- [ ] **T19.2** formatSupportedTypes() returns correct list

---

## AC #20: Size Error Details

**Given** a file too large, **When** error is shown, **Then** message includes actual size and limit

### Happy Path

- [ ] **T20.1** Error message includes actual file size (e.g., "150 MB")
- [ ] **T20.2** Error message includes limit (e.g., "Maximum for PDF is 100 MB")
- [ ] **T20.3** formatFileSize() correctly formats bytes to human-readable

### Edge Cases

- [ ] **T20.4** Size formatting handles KB (< 1MB)
- [ ] **T20.5** Size formatting handles GB (> 1024MB)

---

## AC #21: Download Failure Suggestions

**Given** download failure, **When** error is shown, **Then** message suggests retry or smaller file

### Happy Path

- [ ] **T21.1** Error message includes "Try again" suggestion
- [ ] **T21.2** Error message includes "smaller file" suggestion for large files

---

## AC #22: End-to-End Pipeline

**Given** the file ingestion flow, **When** complete, **Then** full pipeline works: Slack -> download -> upload -> document block -> Claude

### Integration Tests

- [ ] **T22.1** E2E: PDF file flows through entire pipeline
- [ ] **T22.2** E2E: Image file flows through entire pipeline
- [ ] **T22.3** E2E: Document blocks appear in Claude request
- [ ] **T22.4** E2E: user-message.ts handler processes file attachment
- [ ] **T22.5** E2E: app-mention.ts handler processes file attachment

---

## Additional Edge Cases

### Zero-Byte Files

- [ ] **T-E1** Zero-byte file returns ZERO_BYTE_FILE error
- [ ] **T-E2** Error message indicates "File has no content"

### Expired URLs

- [ ] **T-E3** Expired Slack file URL returns FILE_EXPIRED error
- [ ] **T-E4** Error message suggests re-uploading the file

### Concurrent Processing

- [ ] **T-E5** Multiple files process in parallel (Promise.allSettled behavior)
- [ ] **T-E6** One file failure does not block other files

### Type Detection

- [ ] **T-E7** MIME type detection uses Slack-provided mimetype
- [ ] **T-E8** File extension used as fallback when MIME type missing

---

## Test Implementation Notes

### Mocking Requirements

| Component | Mock Strategy |
|-----------|---------------|
| Slack file download | Mock fetch with test buffers |
| Anthropic Files API | Mock FilesApiClient.uploadBuffer() |
| Langfuse | Spy on event() calls |
| Config | Inject test bot token |

### Test Data Requirements

| File Type | Test Files Needed |
|-----------|-------------------|
| PDF | sample.pdf (small), large.pdf (> 100MB) |
| Images | sample.png, sample.jpg, sample.gif, sample.webp |
| CSV | sample.csv, large.csv |
| Text | sample.txt, sample.md, sample.json |

### Coverage Requirements

- Unit tests: All validation functions in `types.ts`
- Unit tests: Download flow in `download.ts`
- Unit tests: Ingestion orchestration in `ingestion.ts`
- Unit tests: Block builder in `document-blocks.ts`
- Integration tests: Handler file detection

---

## Verification Checklist

Before marking story complete:

- [ ] All happy path tests passing
- [ ] All edge case tests passing
- [ ] All error handling tests passing
- [ ] All boundary condition tests passing
- [ ] Integration tests demonstrate full pipeline
- [ ] Langfuse events verified in test output
- [ ] No console.log statements (use logger)
- [ ] All imports use .js extension
- [ ] Code review completed

---

## References

- [Story 8.3](/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/_bmad-output/implementation-artifacts/stories/story-8-3-slack-file-ingestion.md)
- [Project Context](/Users/sid/Desktop/2-Coding/Active/2025-12 orion-slack-agent/_bmad-output/project-context.md)
- [Anthropic Files API](https://docs.anthropic.com/en/docs/build-with-claude/files)
- [Slack File Object](https://api.slack.com/types/file)
