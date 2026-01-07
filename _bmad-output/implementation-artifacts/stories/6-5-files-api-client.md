# Story 6.5: Files API Client

Status: done

## Story

As a **developer**,
I want a Files API client that can upload input files to Anthropic and download generated files from code execution,
So that skills and PTC can work with documents (xlsx, pdf, pptx, etc.) and return file artifacts to Slack users.

## Scope Boundary (Non-Negotiable)

This story implements the **Files API Client** — the interface for Anthropic's Files API.

- **IN SCOPE:**
  - `src/files/api-client.ts` — Files API operations (upload, download, retrieve metadata, delete)
  - `src/files/api-client.test.ts` — unit tests
  - `src/files/types.ts` — file-related types
  - `src/files/index.ts` — module exports
  - Helper functions to extract file IDs from API responses
  - Support for `files-api-2025-04-14` beta header

- **OUT OF SCOPE:**
  - Slack file upload integration (Story 6.6)
  - Container lifecycle management (Story 6.3)
  - Skill execution that produces files (depends on PTC in Story 6.7)
  - Automatic file cleanup (may be added later)

## Critical: Dependencies from Previous Stories

**This story has NO blocking dependencies** — it can be implemented in parallel with Stories 6.2-6.4.

| Dependency | Story | Status | What It Provides |
|------------|-------|--------|------------------|
| `src/config/environment.ts` | 6.1 | ✅ Done | Anthropic API config, `allBetas` array |
| `src/agent/orion.ts` | 2.1 | ✅ Done | Anthropic client singleton |

**Pre-Implementation Checklist:**
- [ ] Verify `config.anthropic.allBetas` includes beta headers
- [ ] Verify Anthropic client is available via `getAnthropicClient()`

## File Operations Summary

| Action | File | Lines Est. | Description |
|--------|------|------------|-------------|
| CREATE | `src/files/api-client.ts` | ~200 | Files API client |
| CREATE | `src/files/api-client.test.ts` | ~250 | Unit tests |
| CREATE | `src/files/types.ts` | ~60 | File-related types |
| CREATE | `src/files/index.ts` | ~10 | Module exports |
| MODIFY | `src/config/environment.ts` | +2 | Add `files-api-2025-04-14` to allBetas if missing |

> **📍 Canonical Location:** `src/files/` — This follows the `src/skills/` pattern established in the codebase. Architecture.md (`src/services/files-api.ts`) and tech-spec (`src/services/anthropic-files.ts`) should be updated to match this location.

## Acceptance Criteria

1. **Given** a local file path, **When** calling `uploadFile(filePath)`, **Then** returns a `FileMetadata` object with `id`, `filename`, `mime_type`, `size_bytes`

2. **Given** a file ID from Anthropic, **When** calling `downloadFile(fileId)`, **Then** returns file content as a `Buffer`

3. **Given** a file ID, **When** calling `getFileMetadata(fileId)`, **Then** returns the `FileMetadata` object

4. **Given** a file ID, **When** calling `deleteFile(fileId)`, **Then** successfully deletes the file and returns `true`

5. **Given** an API response containing `bash_code_execution_tool_result`, **When** calling `extractFileIds(response)`, **Then** returns an array of file IDs from generated files

6. **Given** the `files-api-2025-04-14` beta header, **When** any Files API call is made, **Then** the beta header is included automatically

7. **Given** a file upload/download operation, **When** the operation completes, **Then** appropriate tracing info is logged with `traceId`

8. **Given** an invalid file ID or API error, **When** calling any Files API method, **Then** a meaningful error is thrown with error code

9. **Given** a file larger than 100MB, **When** calling `uploadFile()`, **Then** throw `FilesApiError` with code `FILE_TOO_LARGE` before making API call

## Tasks / Subtasks

### Task 1: Types Definition (AC: #1, #3)

Create `src/files/types.ts`:

- [x] **1.1** Define `FileMetadata` interface matching Anthropic API response
- [x] **1.2** Define `FileUploadOptions` interface for optional parameters
- [x] **1.3** Define `FileContentResult` interface for download results
- [x] **1.4** Define `ExtractedFile` interface for response extraction

### Task 2: Files API Client Core (AC: #1, #2, #3, #4, #6)

Create `src/files/api-client.ts`:

- [x] **2.1** Create `FilesApiClient` class (non-singleton — allows DI for testing)
- [x] **2.2** Accept Anthropic client in constructor
- [x] **2.3** Implement `uploadFile(filePath: string, options?: FileUploadOptions): Promise<FileMetadata>`
- [x] **2.4** Implement `uploadBuffer(buffer: Buffer, filename: string, mimeType: string): Promise<FileMetadata>`
- [x] **2.5** Implement `downloadFile(fileId: string): Promise<Buffer>`
- [x] **2.6** Implement `getFileMetadata(fileId: string): Promise<FileMetadata>`
- [x] **2.7** Implement `deleteFile(fileId: string): Promise<boolean>`
- [x] **2.8** Include `files-api-2025-04-14` beta header on all requests
- [x] **2.9** Add JSDoc with usage examples

### Task 3: Response Extraction Helper (AC: #5)

- [x] **3.1** Implement `extractFileIds(response: BetaMessage): string[]`
- [x] **3.2** Handle nested `bash_code_execution_tool_result` content
- [x] **3.3** Handle `code_execution_tool_result` content (may be renamed)
- [x] **3.4** Return empty array when no files present

### Task 4: Error Handling (AC: #8)

- [x] **4.1** Define `FilesApiError` class with error code
- [x] **4.2** Handle 404 (file not found)
- [x] **4.3** Handle 401/403 (authentication errors)
- [x] **4.4** Handle 429 (rate limited)
- [x] **4.5** Wrap Anthropic SDK errors with meaningful messages

### Task 5: Observability (AC: #7)

- [x] **5.1** Log file upload start/completion with size and duration
- [x] **5.2** Log file download start/completion with size
- [x] **5.3** Log file deletion
- [x] **5.4** Include `traceId` in all log entries
- [x] **5.5** Add span timing for operations

### Task 6: Unit Tests (AC: #1-8)

Create `src/files/api-client.test.ts`:

- [x] **6.1** Test `uploadFile()` with valid file path
- [x] **6.2** Test `uploadFile()` with non-existent file (should throw)
- [x] **6.3** Test `uploadBuffer()` with buffer and metadata
- [x] **6.4** Test `downloadFile()` returns buffer
- [x] **6.5** Test `downloadFile()` with invalid ID (should throw)
- [x] **6.6** Test `getFileMetadata()` returns metadata
- [x] **6.7** Test `deleteFile()` returns true on success
- [x] **6.8** Test `extractFileIds()` with response containing files
- [x] **6.9** Test `extractFileIds()` with response without files
- [x] **6.10** Test `extractFileIds()` with empty response
- [x] **6.11** Test error handling for 404
- [x] **6.12** Test error handling for 429
- [x] **6.13** Mock Anthropic SDK `beta.files.*` methods

### Task 7: Module Export (AC: all)

Create `src/files/index.ts`:

- [x] **7.1** Export `FilesApiClient` class
- [x] **7.2** Export `extractFileIds` helper
- [x] **7.3** Export all types from `types.ts`

## Dev Notes

### ⚠️ Pre-Implementation Requirements

**Install Required Dependencies:**
```bash
pnpm add mime-types
pnpm add -D @types/mime-types
```

**SDK Type Verification (BEFORE implementation):**

Run this verification script to confirm SDK method names:

```typescript
// verify-sdk.ts - Run before implementation
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: 'test-key' });

// Verify all methods exist
console.log('upload:', typeof client.beta.files.upload);        // 'function'
console.log('download:', typeof client.beta.files.download);    // 'function'
console.log('retrieveMetadata:', typeof client.beta.files.retrieveMetadata); // 'function' (NOT retrieve_metadata)
console.log('delete:', typeof client.beta.files.delete);        // 'function'

// Verify BetaMessage import
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/index.js';
console.log('BetaMessage imported successfully');
```

**Timeout Configuration:**

```typescript
// Add to api-client.ts constants
const UPLOAD_TIMEOUT_MS = 60000;   // 60s for 100MB upload
const DOWNLOAD_TIMEOUT_MS = 30000; // 30s for download

// Use AbortController for timeout enforcement:
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
try {
  const result = await this.client.beta.files.upload({ ... });
} finally {
  clearTimeout(timeoutId);
}
```

**Content Validation (Security Note):**

Current implementation: MIME type detection only via `lookup(filePath)`.
For user-uploaded files, consider adding in future stories:
- Magic number verification (first bytes match declared MIME type)
- File extension allowlist
- Malware scanning integration

Story 6.5 scope: MIME type only. Content validation deferred to security hardening phase.

### Types Definition

```typescript
// src/files/types.ts
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/index.js';

/**
 * File metadata from Anthropic Files API.
 * @see https://docs.anthropic.com/claude/docs/files-api
 */
export interface FileMetadata {
  /** File ID (e.g., 'file_01AbCdEf...') */
  id: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'application/pdf') */
  mime_type: string;
  /** File size in bytes */
  size_bytes: number;
  /** Always 'file' */
  type: 'file';
  /** Whether file can be downloaded */
  downloadable?: boolean;
}

/**
 * Options for file upload.
 */
export interface FileUploadOptions {
  /** Override filename for upload */
  filename?: string;
  /** Trace ID for observability */
  traceId?: string;
}

/**
 * Result from file download.
 */
export interface FileContentResult {
  /** File content as buffer */
  content: Buffer;
  /** File metadata */
  metadata: FileMetadata;
}

/**
 * Extracted file info from API response.
 */
export interface ExtractedFile {
  /** File ID */
  fileId: string;
  /** Original filename if available */
  filename?: string;
}

/**
 * Error codes for Files API operations.
 */
export type FilesApiErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'FILE_UPLOAD_FAILED'
  | 'FILE_DOWNLOAD_FAILED'
  | 'FILE_DELETE_FAILED'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ERROR';

/** Max file size: 100MB */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
```

### Files API Client Implementation Pattern

**Class Structure:** Non-singleton (follows Story 6.4 pattern for DI/testing)

```typescript
// src/files/api-client.ts
import Anthropic from '@anthropic-ai/sdk';
import type { FileMetadata, FileUploadOptions, FilesApiErrorCode } from './types.js';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/index.js';

const FILES_API_BETA = 'files-api-2025-04-14';
const UPLOAD_TIMEOUT_MS = 60000;
const DOWNLOAD_TIMEOUT_MS = 30000;

/** Custom error class with error codes */
export class FilesApiError extends Error {
  constructor(
    message: string,
    public code: FilesApiErrorCode,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'FilesApiError';
  }
}

/** Files API client - handles upload, download, metadata, delete */
export class FilesApiClient {
  constructor(private client: Anthropic) {}

  async uploadFile(filePath: string, options?: FileUploadOptions): Promise<FileMetadata>
  async uploadBuffer(buffer: Buffer, filename: string, mimeType: string, traceId?: string): Promise<FileMetadata>
  async downloadFile(fileId: string, traceId?: string): Promise<Buffer>
  async getFileMetadata(fileId: string, traceId?: string): Promise<FileMetadata>
  async deleteFile(fileId: string, traceId?: string): Promise<boolean>
  private wrapError(error: unknown, code: FilesApiErrorCode, message: string): FilesApiError
}

/** Extract file IDs from code execution response */
export function extractFileIds(response: BetaMessage): string[]

/** Factory for creating FilesApiClient */
export function createFilesApiClient(anthropicClient: Anthropic): FilesApiClient
```

**Implementation Patterns:**

1. **File Size Validation (AC#9):** Check `statSync(filePath).size > MAX_FILE_SIZE_BYTES` BEFORE API call
2. **Logging:** All methods log `{ event, traceId, fileId/filename, sizeBytes, durationMs }`
3. **Error Wrapping:** Check `error.status` (404→FILE_NOT_FOUND, 401/403→AUTH_ERROR, 429→RATE_LIMITED)
4. **Beta Header:** Include `betas: [FILES_API_BETA]` on all SDK calls
5. **Buffer Conversion:** Download uses `Buffer.from(await response.arrayBuffer())`
6. **Timeout Enforcement:** Use `AbortController` with timeouts (see Pre-Implementation section)

**Key Methods:**

- `uploadFile()`: Validate size → `createReadStream()` → log start/complete with duration
- `downloadFile()`: Call SDK → convert ArrayBuffer to Buffer → log with size
- `extractFileIds()`: Iterate `response.content`, check for `tool_result` with `file_id` array
- `wrapError()`: Map Anthropic.APIError status codes to FilesApiErrorCode

**Reference:** See full implementation in Appendix A (end of story)

### Module Exports

```typescript
// src/files/index.ts
export { FilesApiClient, FilesApiError, extractFileIds, createFilesApiClient } from './api-client.js';
export { MAX_FILE_SIZE_BYTES } from './types.js';
export type {
  FileMetadata,
  FileUploadOptions,
  FileContentResult,
  ExtractedFile,
  FilesApiErrorCode,
} from './types.js';
```

### Usage Example in Agent Loop

```typescript
// In future integration (Story 6.6)
import { createFilesApiClient, extractFileIds } from '../files/index.js';
import { getAnthropicClient } from '../agent/orion.js';

const filesClient = createFilesApiClient(getAnthropicClient());

// After code execution completes
const fileIds = extractFileIds(response);
for (const fileId of fileIds) {
  const buffer = await filesClient.downloadFile(fileId, traceId);
  // Upload to Slack via slack.files.uploadV2
}
```

### Beta Header Configuration

Ensure `files-api-2025-04-14` is in `config.anthropic.allBetas`:

```typescript
// In src/config/environment.ts (if not already present)
allBetas: [
  'code-execution-2025-08-25',
  'skills-2025-10-02',
  'files-api-2025-04-14',  // <-- Add this
  'context-management-2025-06-27',
],
```

### Error Handling

| Scenario | Error Code | Behavior |
|----------|------------|----------|
| File not found on disk | `FILE_UPLOAD_FAILED` | Throw before API call |
| File exceeds 100MB | `FILE_TOO_LARGE` | Throw before API call (AC#9) |
| File ID not found (404) | `FILE_NOT_FOUND` | Throw with file ID in message |
| Auth error (401/403) | `AUTHENTICATION_ERROR` | Throw - check API key |
| Rate limited (429) | `RATE_LIMITED` | Throw - caller should retry |
| Other API errors | Original code | Wrapped with context |

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR | prd.md | Generated files accessible via Files API |
| AR | architecture.md | Files API for download generated files (xlsx, pdf, pptx) |
| AR | tech-spec | `files-api-2025-04-14` beta header required |
| Logging | project-context.md | ALL logs must include `traceId` |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |
| Test naming | project-context.md:129 | Tests: `kebab-case.test.ts`, co-located |

### Testing Requirements

**Minimum 14 tests** (13 original + 1 for AC#9) — Follow Story 6.4 test pattern:

**Test Setup (same as Story 6.4):**
- Mock `@anthropic-ai/sdk`, `fs`, `logger`
- Use `vi.resetAllMocks()` in `beforeEach`
- Mock `client.beta.files.*` methods

**Unique Tests for Files API:**

1. **uploadFile success** — Verify metadata return, beta header included
2. **uploadFile file not found** — Throws `FilesApiError` with `FILE_UPLOAD_FAILED`
3. **uploadFile size limit (AC#9)** — Throws `FilesApiError` with `FILE_TOO_LARGE` for >100MB
4. **uploadBuffer success** — Verify Blob→File conversion, metadata return
5. **downloadFile success** — Verify ArrayBuffer→Buffer conversion
6. **downloadFile 404** — Throws with `FILE_NOT_FOUND`
7. **getFileMetadata success** — Returns metadata object
8. **deleteFile success** — Returns `true`
9. **extractFileIds with files** — Returns array `['file_01abc', 'file_02def']`
10. **extractFileIds empty** — Returns `[]`
11. **Error 401/403** — Throws with `AUTHENTICATION_ERROR`
12. **Error 429** — Throws with `RATE_LIMITED`
13. **Beta header verification** — All methods call SDK with `betas: ['files-api-2025-04-14']`
14. **Logging verification** — All methods log with `traceId`

**Critical Test Case (AC#9):**
```typescript
it('throws FILE_TOO_LARGE before API call when file exceeds 100MB', async () => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(statSync).mockReturnValue({ size: 101 * 1024 * 1024 } as any);

  await expect(client.uploadFile('./large.csv')).rejects.toMatchObject({
    code: 'FILE_TOO_LARGE',
  });
  // Verify API was NOT called
  expect(mockAnthropic.beta.files.upload).not.toHaveBeenCalled();
});
```

**Reference:** Full test implementation in Appendix B (end of story)

### Success Metrics

| Metric | Target |
|--------|--------|
| Upload 1MB file | <5s |
| Download 1MB file | <3s |
| Metadata retrieval | <500ms |
| Test coverage | >90% |

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Hardcode beta header version | Use constant `FILES_API_BETA` |
| Return raw Response object | Convert to Buffer for downloads |
| Swallow errors silently | Throw `FilesApiError` with code |
| Log file contents | Log only metadata (filename, size) |
| Import without `.js` extension | Always use `.js` extension for ESM |
| Use synchronous file reads | Use streams for large files |

## Previous Story Intelligence

From Story 6.4 (`6-4-skill-registry-service.md`):
- Singleton patterns for services
- Logger import patterns
- Error handling patterns

From existing codebase:
- `src/agent/orion.ts` — Anthropic client management
- `src/tools/mcp/manager.ts` — Client singleton pattern reference
- `src/config/environment.ts` — Beta header configuration

From tech-spec:
- Files API response structure for generated files
- Beta header: `files-api-2025-04-14`
- TypeScript SDK types for FileMetadata

## Git Intelligence

Recent commits:
- `975f6a5` — PTC support for Sonnet 4.5 (beta header patterns)
- `0727798` — Sandbox skills baking (filesystem handling patterns)
- Beta header patterns established in `config.anthropic.allBetas`
- Anthropic SDK v0.71.x patterns in use

## References

- [Source: tech-spec-skills-migration-to-anthropic-container.md#Appendix-A] — Files API TypeScript reference
- [Source: architecture.md#Anthropic-Skills-Files-API-Adoption] — ADR for skills migration
- [Source: project-context.md#TL;DR] — Critical implementation rules
- [Anthropic Files API Docs](https://docs.anthropic.com/claude/docs/files-api)

---

## Appendix A: Full Implementation Reference

<details>
<summary>Complete FilesApiClient implementation (click to expand)</summary>

```typescript
// src/files/api-client.ts - Full implementation for reference
import Anthropic from '@anthropic-ai/sdk';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';
import { logger } from '../utils/logger.js';
import type { FileMetadata, FileUploadOptions, FilesApiErrorCode } from './types.js';
import { MAX_FILE_SIZE_BYTES } from './types.js';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/index.js';

const FILES_API_BETA = 'files-api-2025-04-14';
const UPLOAD_TIMEOUT_MS = 60000;
const DOWNLOAD_TIMEOUT_MS = 30000;

export class FilesApiError extends Error {
  constructor(message: string, public code: FilesApiErrorCode, public cause?: unknown) {
    super(message);
    this.name = 'FilesApiError';
  }
}

export class FilesApiClient {
  constructor(private client: Anthropic) {}

  async uploadFile(filePath: string, options?: FileUploadOptions): Promise<FileMetadata> {
    const { traceId } = options ?? {};
    const startTime = Date.now();

    if (!existsSync(filePath)) {
      throw new FilesApiError(`File not found: ${filePath}`, 'FILE_UPLOAD_FAILED');
    }

    const fileSize = statSync(filePath).size;
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      throw new FilesApiError(
        `File too large: ${fileSize} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`,
        'FILE_TOO_LARGE'
      );
    }

    logger.debug({ event: 'files.upload.start', traceId, filename: basename(filePath), fileSize });

    try {
      const result = await this.client.beta.files.upload({
        file: createReadStream(filePath),
        betas: [FILES_API_BETA],
      });

      logger.info({
        event: 'files.upload.complete',
        traceId,
        fileId: result.id,
        sizeBytes: result.size_bytes,
        durationMs: Date.now() - startTime,
      });

      return result as FileMetadata;
    } catch (error) {
      throw this.wrapError(error, 'FILE_UPLOAD_FAILED', 'Failed to upload file');
    }
  }

  async downloadFile(fileId: string, traceId?: string): Promise<Buffer> {
    const startTime = Date.now();
    logger.debug({ event: 'files.download.start', traceId, fileId });

    try {
      const response = await this.client.beta.files.download(fileId, { betas: [FILES_API_BETA] });
      const buffer = Buffer.from(await response.arrayBuffer());

      logger.info({
        event: 'files.download.complete',
        traceId,
        fileId,
        sizeBytes: buffer.length,
        durationMs: Date.now() - startTime,
      });

      return buffer;
    } catch (error) {
      throw this.wrapError(error, 'FILE_DOWNLOAD_FAILED', `Failed to download file: ${fileId}`);
    }
  }

  async getFileMetadata(fileId: string, traceId?: string): Promise<FileMetadata> {
    logger.debug({ event: 'files.metadata.fetch', traceId, fileId });
    try {
      return (await this.client.beta.files.retrieveMetadata(fileId, {
        betas: [FILES_API_BETA],
      })) as FileMetadata;
    } catch (error) {
      throw this.wrapError(error, 'FILE_NOT_FOUND', `Failed to get metadata: ${fileId}`);
    }
  }

  async deleteFile(fileId: string, traceId?: string): Promise<boolean> {
    logger.debug({ event: 'files.delete.start', traceId, fileId });
    try {
      await this.client.beta.files.delete(fileId, { betas: [FILES_API_BETA] });
      logger.info({ event: 'files.delete.complete', traceId, fileId });
      return true;
    } catch (error) {
      throw this.wrapError(error, 'FILE_DELETE_FAILED', `Failed to delete: ${fileId}`);
    }
  }

  private wrapError(error: unknown, code: FilesApiErrorCode, message: string): FilesApiError {
    if (error instanceof Anthropic.APIError) {
      if (error.status === 404) return new FilesApiError(message, 'FILE_NOT_FOUND', error);
      if (error.status === 401 || error.status === 403)
        return new FilesApiError('Authentication failed', 'AUTHENTICATION_ERROR', error);
      if (error.status === 429) return new FilesApiError('Rate limited', 'RATE_LIMITED', error);
    }
    return new FilesApiError(message, code, error);
  }
}

export function extractFileIds(response: BetaMessage): string[] {
  const fileIds: string[] = [];
  for (const item of response.content) {
    if (item.type === 'tool_result' && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (typeof block === 'object' && 'file_id' in block) {
          fileIds.push(block.file_id as string);
        }
      }
    }
  }
  return fileIds;
}

export function createFilesApiClient(anthropicClient: Anthropic): FilesApiClient {
  return new FilesApiClient(anthropicClient);
}
```

</details>

## Appendix B: Full Test Reference

<details>
<summary>Complete test suite (click to expand)</summary>

```typescript
// src/files/api-client.test.ts - Full test suite for reference
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, statSync } from 'fs';
import { FilesApiClient, FilesApiError, extractFileIds } from './api-client.js';

vi.mock('@anthropic-ai/sdk');
vi.mock('fs');
vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('FilesApiClient', () => {
  let client: FilesApiClient;
  let mockAnthropic: Anthropic;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAnthropic = new Anthropic({ apiKey: 'test' });
    client = new FilesApiClient(mockAnthropic);
  });

  describe('uploadFile', () => {
    it('uploads file and returns metadata', async () => {
      const mockMetadata = {
        id: 'file_01test',
        filename: 'test.csv',
        mime_type: 'text/csv',
        size_bytes: 1024,
        created_at: '2026-01-07T00:00:00Z',
        type: 'file',
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as any);
      mockAnthropic.beta.files.upload = vi.fn().mockResolvedValue(mockMetadata);

      const result = await client.uploadFile('./test.csv');

      expect(result.id).toBe('file_01test');
      expect(mockAnthropic.beta.files.upload).toHaveBeenCalledWith(
        expect.objectContaining({ betas: ['files-api-2025-04-14'] })
      );
    });

    it('throws when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(client.uploadFile('./missing.csv')).rejects.toThrow(FilesApiError);
    });

    it('throws FILE_TOO_LARGE when file exceeds 100MB', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ size: 101 * 1024 * 1024 } as any);

      await expect(client.uploadFile('./large.csv')).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
      });
      expect(mockAnthropic.beta.files.upload).not.toHaveBeenCalled();
    });
  });

  describe('downloadFile', () => {
    it('returns buffer from download', async () => {
      const mockResponse = { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)) };
      mockAnthropic.beta.files.download = vi.fn().mockResolvedValue(mockResponse);

      const result = await client.downloadFile('file_01test');

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('extractFileIds', () => {
    it('extracts file IDs from tool_result content', () => {
      const response = {
        content: [
          {
            type: 'tool_result',
            content: [{ file_id: 'file_01abc' }, { file_id: 'file_02def' }],
          },
        ],
      } as any;

      expect(extractFileIds(response)).toEqual(['file_01abc', 'file_02def']);
    });

    it('returns empty array when no files present', () => {
      const response = { content: [{ type: 'text', text: 'Hello' }] } as any;
      expect(extractFileIds(response)).toEqual([]);
    });
  });
});
```

</details>

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Initial implementation: All 20 tests passing
- Full test suite: 1321 tests passing, 2 skipped

### Completion Notes List

- **FilesApiClient** class created with constructor accepting optional Anthropic client
- **uploadFile()** validates file exists and size <100MB before API call
- **uploadBuffer()** converts Buffer to Blob/File for SDK upload
- **downloadFile()** converts ArrayBuffer response to Buffer
- **extractFileIds()** handles `tool_result`, `bash_code_execution_tool_result`, `code_execution_tool_result`, and `server_tool_use` content types
- **FilesApiError** class with typed error codes for 404, 401, 403, 429 handling
- **Beta header** `files-api-2025-04-14` included on all API calls
- All methods include `traceId` in log entries with `event`, `durationMs`, `sizeBytes`
- Test factory `files-factory.ts` already existed for creating test data

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Story created - Files API Client for upload/download file operations |
| 2026-01-07 | **SM Validation + Improvements Applied:** (1) Added SDK verification script to Pre-Implementation section, (2) Added timeout configuration patterns with AbortController, (3) Added content validation security note (MIME-only scope), (4) Optimized Dev Notes - reduced verbosity by 63% (~525 lines) using interface patterns instead of full implementations, (5) Consolidated test examples - reference Story 6.4 pattern with unique aspects only, (6) Removed redundant SDK uncertainty notes, (7) Added Appendix A (full implementation) and Appendix B (full tests) for reference. Quality improved from 84.7/100 to 93/100. |
| 2026-01-07 | **Dev Complete:** All tasks implemented with 20 passing tests. FilesApiClient created in src/files/ with upload, download, metadata, delete operations. Beta header included. Error handling with typed error codes. |

### File List

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/files/types.ts` | FileMetadata, FileUploadOptions, FileContentResult, ExtractedFile types |
| CREATE | `src/files/api-client.ts` | FilesApiClient class with upload/download/metadata/delete + extractFileIds |
| CREATE | `src/files/api-client.test.ts` | 20 unit tests covering all ACs |
| CREATE | `src/files/index.ts` | Module exports |

