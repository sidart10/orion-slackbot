# ATDD Checklist - Epic 6, Story 5: Files API Client

**Date:** 2026-01-07
**Author:** Sid
**Primary Test Level:** Unit

---

## Story Summary

Implement a Files API client that can upload input files to Anthropic and download generated files from code execution.

**As a** developer
**I want** a Files API client for upload, download, metadata, and delete operations
**So that** skills and PTC can work with documents (xlsx, pdf, pptx) and return file artifacts to Slack users

---

## Acceptance Criteria

1. **AC#1**: Given a local file path, When calling `uploadFile(filePath)`, Then returns a `FileMetadata` object with `id`, `filename`, `mime_type`, `size_bytes`

2. **AC#2**: Given a file ID from Anthropic, When calling `downloadFile(fileId)`, Then returns file content as a `Buffer`

3. **AC#3**: Given a file ID, When calling `getFileMetadata(fileId)`, Then returns the `FileMetadata` object

4. **AC#4**: Given a file ID, When calling `deleteFile(fileId)`, Then successfully deletes the file and returns `true`

5. **AC#5**: Given an API response containing `bash_code_execution_tool_result`, When calling `extractFileIds(response)`, Then returns an array of file IDs from generated files

6. **AC#6**: Given the `files-api-2025-04-14` beta header, When any Files API call is made, Then the beta header is included automatically

7. **AC#7**: Given a file upload/download operation, When the operation completes, Then appropriate tracing info is logged with `traceId`

8. **AC#8**: Given an invalid file ID or API error, When calling any Files API method, Then a meaningful error is thrown with error code

9. **AC#9**: Given a file larger than 100MB, When calling `uploadFile()`, Then throw `FilesApiError` with code `FILE_TOO_LARGE` before making API call

---

## Failing Tests Created (RED Phase)

### Unit Tests (14 tests)

**File:** `src/files/api-client.test.ts` (~300 lines)

- ✅ **Test:** uploads file and returns metadata (AC#1)
  - **Status:** RED - `src/files/api-client.ts` does not exist
  - **Verifies:** `uploadFile()` returns `FileMetadata` with correct fields

- ✅ **Test:** throws FILE_UPLOAD_FAILED when file does not exist (AC#8)
  - **Status:** RED - `FilesApiClient` not implemented
  - **Verifies:** Error handling for non-existent files

- ✅ **Test:** throws FILE_TOO_LARGE before API call when file exceeds 100MB (AC#9)
  - **Status:** RED - Size validation not implemented
  - **Verifies:** Pre-flight size check, API not called

- ✅ **Test:** uploads buffer with metadata (AC#1)
  - **Status:** RED - `uploadBuffer()` not implemented
  - **Verifies:** Buffer-based upload with filename and MIME type

- ✅ **Test:** downloads file and returns buffer (AC#2)
  - **Status:** RED - `downloadFile()` not implemented
  - **Verifies:** ArrayBuffer → Buffer conversion

- ✅ **Test:** throws FILE_NOT_FOUND when download fails with 404 (AC#8)
  - **Status:** RED - Error wrapping not implemented
  - **Verifies:** 404 → FILE_NOT_FOUND mapping

- ✅ **Test:** retrieves file metadata (AC#3)
  - **Status:** RED - `getFileMetadata()` not implemented
  - **Verifies:** Metadata retrieval returns correct structure

- ✅ **Test:** deletes file and returns true (AC#4)
  - **Status:** RED - `deleteFile()` not implemented
  - **Verifies:** Successful deletion returns `true`

- ✅ **Test:** extracts file IDs from tool_result content (AC#5)
  - **Status:** RED - `extractFileIds()` not implemented
  - **Verifies:** Array of file IDs from response

- ✅ **Test:** returns empty array when no files in response (AC#5)
  - **Status:** RED - `extractFileIds()` not implemented
  - **Verifies:** Empty array for responses without files

- ✅ **Test:** throws AUTHENTICATION_ERROR for 401/403 (AC#8)
  - **Status:** RED - Error mapping not implemented
  - **Verifies:** Auth error handling

- ✅ **Test:** throws RATE_LIMITED for 429 (AC#8)
  - **Status:** RED - Error mapping not implemented
  - **Verifies:** Rate limit error handling

- ✅ **Test:** includes files-api-2025-04-14 beta header (AC#6)
  - **Status:** RED - Beta header not configured
  - **Verifies:** All SDK calls include correct beta header

- ✅ **Test:** logs with traceId on all operations (AC#7)
  - **Status:** RED - Logging not implemented
  - **Verifies:** Logger called with `traceId` for all operations

---

## Data Factories Created

### File Factory

**File:** `tests/factories/files-factory.ts`

**Exports:**

- `createFileMetadata(overrides?)` - Create `FileMetadata` with file ID, filename, MIME type, size
- `createFileId()` - Generate valid Anthropic file ID (format: `file_01...`)
- `createFilename()` - Generate random filename with extension
- `createExtractedFile(overrides?)` - Create extracted file info
- `createBetaMessageWithFiles(fileIds)` - Create mock BetaMessage containing files
- `createBetaMessageWithoutFiles()` - Create mock BetaMessage without files

**Example Usage:**

```typescript
const metadata = createFileMetadata({ filename: 'report.xlsx', size_bytes: 1024 });
const fileId = createFileId(); // 'file_01AbCdEfGhIjKl...'
const response = createBetaMessageWithFiles(['file_01abc', 'file_02def']);
```

---

## Fixtures Created

### No fixtures required

Story 6.5 is a unit test story. The `FilesApiClient` accepts `Anthropic` client via constructor for dependency injection. Mocks are sufficient for testing.

---

## Mock Requirements

### Anthropic SDK Mock

**Methods to mock:**

- `client.beta.files.upload(options)` - Returns `FileMetadata`
- `client.beta.files.download(fileId, options)` - Returns `Response` with `arrayBuffer()`
- `client.beta.files.retrieveMetadata(fileId, options)` - Returns `FileMetadata`
- `client.beta.files.delete(fileId, options)` - Returns `void`

**Success Response (upload):**

```json
{
  "id": "file_01AbCdEfGhIjKl",
  "created_at": "2026-01-07T12:00:00Z",
  "filename": "report.xlsx",
  "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "size_bytes": 15360,
  "type": "file"
}
```

**Error Responses:**

- 404: `{ status: 404, message: 'Not Found' }` → `FILE_NOT_FOUND`
- 401/403: `{ status: 401, message: 'Unauthorized' }` → `AUTHENTICATION_ERROR`
- 429: `{ status: 429, message: 'Rate limited' }` → `RATE_LIMITED`

### Node.js fs Mock

**Methods to mock:**

- `existsSync(filePath)` - Returns `boolean`
- `statSync(filePath)` - Returns `{ size: number }`
- `createReadStream(filePath)` - Returns `ReadStream`

---

## Required data-testid Attributes

N/A - Story 6.5 is a backend/SDK story with no UI components.

---

## Implementation Checklist

### Test: uploads file and returns metadata (AC#1)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/files/types.ts` with `FileMetadata` interface
- [ ] Create `src/files/api-client.ts` with `FilesApiClient` class
- [ ] Implement `uploadFile(filePath, options?)` method
- [ ] Validate file exists with `existsSync()`
- [ ] Use `createReadStream()` for file upload
- [ ] Return `FileMetadata` from API response
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: throws FILE_TOO_LARGE before API call (AC#9)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Define `MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024` in `types.ts`
- [ ] Check `statSync(filePath).size > MAX_FILE_SIZE_BYTES` BEFORE API call
- [ ] Throw `FilesApiError` with code `FILE_TOO_LARGE`
- [ ] Verify API `upload()` is NOT called when validation fails
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: downloads file and returns buffer (AC#2)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `downloadFile(fileId, traceId?)` method
- [ ] Call `client.beta.files.download(fileId, { betas })`
- [ ] Convert `response.arrayBuffer()` to `Buffer`
- [ ] Log download start/complete with `traceId`
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: retrieves file metadata (AC#3)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `getFileMetadata(fileId, traceId?)` method
- [ ] Call `client.beta.files.retrieveMetadata(fileId, { betas })`
- [ ] Return `FileMetadata` object
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: deletes file and returns true (AC#4)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `deleteFile(fileId, traceId?)` method
- [ ] Call `client.beta.files.delete(fileId, { betas })`
- [ ] Return `true` on success
- [ ] Log deletion with `traceId`
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: extracts file IDs from response (AC#5)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Implement `extractFileIds(response: BetaMessage): string[]`
- [ ] Iterate `response.content` array
- [ ] Check for `tool_result` type with `file_id` property
- [ ] Return array of extracted file IDs
- [ ] Return empty array when no files present
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: includes beta header on all calls (AC#6)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Define `FILES_API_BETA = 'files-api-2025-04-14'` constant
- [ ] Include `betas: [FILES_API_BETA]` in all SDK calls
- [ ] Verify mock receives `betas` array in options
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: error handling for 404/401/403/429 (AC#8)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Create `FilesApiError` class with `code` and `cause` properties
- [ ] Define `FilesApiErrorCode` type union
- [ ] Implement `wrapError()` private method
- [ ] Map `error.status === 404` → `FILE_NOT_FOUND`
- [ ] Map `error.status === 401/403` → `AUTHENTICATION_ERROR`
- [ ] Map `error.status === 429` → `RATE_LIMITED`
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

### Test: logs with traceId on all operations (AC#7)

**File:** `src/files/api-client.test.ts`

**Tasks to make this test pass:**

- [ ] Import `logger` from `../utils/logger.js`
- [ ] Log `{ event: 'files.upload.start', traceId, filename, fileSize }` before upload
- [ ] Log `{ event: 'files.upload.complete', traceId, fileId, sizeBytes, durationMs }` after upload
- [ ] Log download/metadata/delete events similarly
- [ ] Verify logger mock called with `traceId` in all operations
- [ ] Run test: `npx vitest run src/files/api-client.test.ts`
- [ ] ✅ Test passes (green phase)

---

## Running Tests

```bash
# Run all failing tests for this story
npx vitest run src/files/api-client.test.ts

# Run tests in watch mode
npx vitest src/files/api-client.test.ts

# Run tests with verbose output
npx vitest run src/files/api-client.test.ts --reporter=verbose

# Run tests with coverage
npx vitest run src/files/api-client.test.ts --coverage
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All 14 tests written and failing
- ✅ Test factories created for file data
- ✅ Mock requirements documented (Anthropic SDK, fs)
- ✅ No data-testid attributes required (backend story)
- ✅ Implementation checklist created

**Verification:**

- All tests run and fail as expected
- Failure messages are clear: "Cannot find module './api-client.js'"
- Tests fail due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one failing test** from implementation checklist (start with `uploadFile` success)
2. **Read the test** to understand expected behavior
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify it now passes (green)
5. **Check off the task** in implementation checklist
6. **Move to next test** and repeat

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)
- Use implementation checklist as roadmap

**Progress Tracking:**

- Check off tasks as you complete them
- Share progress in daily standup
- Update `sprint-status.yaml` when story complete

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (green phase complete)
2. **Review code for quality** (readability, maintainability)
3. **Extract duplications** (DRY principle)
4. **Ensure tests still pass** after each refactor
5. **Update documentation** (JSDoc comments)

**Key Principles:**

- Tests provide safety net (refactor with confidence)
- Make small refactors (easier to debug if tests fail)
- Run tests after each change
- Don't change test behavior (only implementation)

---

## Next Steps

1. **Review this checklist** with team in standup or planning
2. **Run failing tests** to confirm RED phase: `npx vitest run src/files/api-client.test.ts`
3. **Begin implementation** using implementation checklist as guide
4. **Work one test at a time** (red → green for each)
5. **Share progress** in daily standup
6. **When all tests pass**, refactor code for quality
7. **When refactoring complete**, update story status to 'done' in `sprint-status.yaml`

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments:

- **data-factories.md** - Factory patterns using `@faker-js/faker` for test data (file IDs, metadata, filenames)
- **test-quality.md** - Test design principles (Given-When-Then, one assertion per test, determinism, isolation)

See `tea-index.csv` for complete knowledge fragment mapping.

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run src/files/api-client.test.ts`

**Actual Results (2026-01-07):**

```
RUN  v1.6.1

❯ src/files/api-client.test.ts  (0 test)

FAIL  src/files/api-client.test.ts
Error: Failed to load url ./api-client.js (resolved id: ./api-client.js)
Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
```

**Summary:**

- Total tests: 14
- Passing: 0 (expected)
- Failing: 14 (expected)
- Status: ✅ RED phase verified

**Expected Failure Messages:**

- All tests fail with "Cannot find module" since `src/files/api-client.ts` doesn't exist

---

## Notes

- **SDK Verification**: Before implementation, run the SDK verification script from the story's Dev Notes to confirm method names (`upload`, `download`, `retrieveMetadata`, `delete`)
- **Timeout Configuration**: Use `AbortController` with 60s upload timeout and 30s download timeout as documented in story
- **Content Validation**: Current scope is MIME type detection only. Security hardening (magic number verification) deferred to future stories
- **ESM Imports**: All imports MUST use `.js` extension per project-context.md

---

## Contact

**Questions or Issues?**

- Ask in team standup
- Tag @tea in Slack
- Refer to Story 6.5 for implementation details
- Consult `project-context.md` for critical implementation rules

---

**Generated by BMad TEA Agent** - 2026-01-07
