# Story 6.6: Files API Slack Integration

Status: complete

## Story

As a **Slack user**,
I want generated files (xlsx, pdf, pptx, etc.) from Skills and code execution to be automatically uploaded to my Slack thread,
So that I can download, share, and use the documents created by Orion without any manual steps.

## Scope Boundary (Non-Negotiable)

This story implements the **Files API ↔ Slack Integration** — the bridge that downloads files from Anthropic's container and uploads them to Slack.

- **IN SCOPE:**
  - `src/slack/utils/file-uploader.ts` — Download from Anthropic Files API, upload to Slack
  - `src/slack/utils/file-uploader.test.ts` — Unit tests
  - Integration point in agent loop to handle generated files
  - Automatic file cleanup after successful Slack upload
  - File type validation and MIME type handling
  - Support for multiple files per response

- **OUT OF SCOPE:**
  - Files API client (Story 6.5 — dependency)
  - Skill execution that produces files (depends on PTC in Story 6.7)
  - Container lifecycle management (Story 6.3)
  - User file uploads TO Anthropic (future enhancement)

## Critical: Dependencies from Previous Stories

**This story REQUIRES Story 6.5 to be complete (or in parallel with mocked client).**

| Dependency | Story | Status | What It Provides |
|------------|-------|--------|------------------|
| `src/files/api-client.ts` | 6.5 | ready-for-dev | `FilesApiClient`, `extractFileIds()` |
| `src/slack/utils/image-upload.ts` | 7.3 | ✅ Done | Slack file upload patterns |
| `src/agent/loop.ts` | 2.2 | ✅ Done | Agent loop for integration point |
| `src/config/environment.ts` | 6.1 | ✅ Done | Anthropic + Slack config |

**Pre-Implementation Checklist:**
- [x] Verify Story 6.5 Files API client is available or mock it for parallel development
- [x] Review existing `image-upload.ts` for Slack upload patterns
- [x] Verify Slack bot has `files:write` scope in app manifest

## File Operations Summary

| Action | File | Lines Est. | Description |
|--------|------|------------|-------------|
| CREATE | `src/slack/utils/file-uploader.ts` | ~220 | Files API → Slack uploader |
| CREATE | `src/slack/utils/file-uploader.test.ts` | ~300 | Unit tests |
| MODIFY | `src/agent/loop.ts` | +30 | Add file upload handling after tool execution |
| MODIFY | `src/slack/utils/index.ts` | +2 | Export new module |

## Acceptance Criteria

1. **Given** an API response with generated file IDs, **When** calling `uploadFilesToSlack(fileIds, channel, threadTs)`, **Then** all files are downloaded from Anthropic and uploaded to the Slack thread

2. **Given** a generated xlsx/pdf/pptx file, **When** uploaded to Slack, **Then** the correct MIME type and filename are preserved

3. **Given** multiple files in a single response, **When** calling `uploadFilesToSlack()`, **Then** all files are uploaded (in parallel where possible)

4. **Given** a file upload completes successfully, **When** `deleteAfterUpload: true` is set, **Then** the file is deleted from Anthropic's storage

5. **Given** a file download or upload fails, **When** an error occurs, **Then** the error is logged with `traceId` and a partial success result is returned (don't fail all files on one failure)

6. **Given** a file larger than Slack's limit (typically 1GB), **When** attempting upload, **Then** an appropriate error is returned with file size information

7. **Given** the agent loop receives a response with `bash_code_execution_tool_result` containing file IDs, **When** processing completes, **Then** files are automatically uploaded to the user's thread

8. **Given** a file with unknown MIME type, **When** uploading to Slack, **Then** a sensible default is used (`application/octet-stream`)

## Tasks / Subtasks

### Task 1: Types Definition (AC: #1, #2)

Add types to existing file or create `src/slack/utils/file-uploader-types.ts`:

- [x] **1.1** Define `FileUploadRequest` interface (fileId, channel, threadTs, options)
- [x] **1.2** Define `FileUploadResult` interface (success, slackFileId, error?)
- [x] **1.3** Define `FileUploadOptions` interface (deleteAfterUpload, initialComment?)
- [x] **1.4** Define `BatchUploadResult` interface for multiple files

### Task 2: File Uploader Core (AC: #1, #2, #3, #6, #8)

Create `src/slack/utils/file-uploader.ts`:

- [x] **2.1** Create `SlackFileUploader` class
- [x] **2.2** Accept `FilesApiClient` and Slack `WebClient` in constructor
- [x] **2.3** Implement `uploadFile(fileId, channel, threadTs, options?): Promise<FileUploadResult>`
- [x] **2.4** Implement `uploadFiles(fileIds, channel, threadTs, options?): Promise<BatchUploadResult>`
- [x] **2.5** Download file from Anthropic Files API using `client.downloadFile()`
- [x] **2.6** Get file metadata for filename and MIME type using `client.getFileMetadata()`
- [x] **2.7** Upload to Slack using `slack.files.uploadV2()`
- [x] **2.8** Handle MIME type fallback for unknown types
- [x] **2.9** Validate file size before Slack upload (Slack limit check)
- [x] **2.10** Add JSDoc with usage examples

### Task 3: Automatic Cleanup (AC: #4)

- [x] **3.1** Implement `deleteAfterUpload` option handling
- [x] **3.2** Call `client.deleteFile()` after successful Slack upload
- [x] **3.3** Log cleanup success/failure (don't fail upload on cleanup failure)
- [x] **3.4** Add cleanup as async fire-and-forget to not block response

### Task 4: Error Handling (AC: #5, #6)

- [x] **4.1** Define `FileUploadError` class with error code
- [x] **4.2** Handle partial failures (some files succeed, others fail)
- [x] **4.3** Return `BatchUploadResult` with per-file status
- [x] **4.4** Handle Anthropic download failures gracefully
- [x] **4.5** Handle Slack upload failures (rate limits, permissions)
- [x] **4.6** Log all errors with `traceId`

### Task 5: Agent Loop Integration (AC: #7)

Modify `src/agent/loop.ts`:

- [x] **5.1** Import `extractFileIds` from files module
- [x] **5.2** Import `SlackFileUploader` or uploader function
- [x] **5.3** After tool execution, check for file IDs in response
- [x] **5.4** If files present, trigger upload to user's thread
- [x] **5.5** Handle upload results (log success, report errors to user)
- [x] **5.6** Don't block main response on file uploads (async/background)

### Task 6: Observability (AC: #5)

- [x] **6.1** Log file download start/completion with size and duration
- [x] **6.2** Log Slack upload start/completion with file ID
- [x] **6.3** Log cleanup operations
- [x] **6.4** Include `traceId` in all log entries
- [x] **6.5** Add span timing for download + upload operations
- [x] **6.6** Track total file size uploaded per conversation

### Task 7: Unit Tests (AC: #1-8)

Create `src/slack/utils/file-uploader.test.ts`:

- [x] **7.1** Test `uploadFile()` downloads and uploads successfully
- [x] **7.2** Test `uploadFile()` preserves filename and MIME type
- [x] **7.3** Test `uploadFile()` with `deleteAfterUpload: true`
- [x] **7.4** Test `uploadFile()` handles download failure
- [x] **7.5** Test `uploadFile()` handles Slack upload failure
- [x] **7.6** Test `uploadFiles()` with multiple files
- [x] **7.7** Test `uploadFiles()` partial failure (some succeed, some fail)
- [x] **7.8** Test MIME type fallback for unknown types
- [x] **7.9** Test file size validation
- [x] **7.10** Test agent loop integration calls uploader when files present
- [x] **7.11** Test agent loop skips upload when no files present
- [x] **7.12** Mock FilesApiClient and Slack WebClient

### Task 8: Export and Integration (AC: all)

- [x] **8.1** Export from `src/slack/utils/index.ts`
- [x] **8.2** Create factory function `createSlackFileUploader()`
- [x] **8.3** Document integration pattern in JSDoc

## Dev Notes

### Types Definition

```typescript
// src/slack/utils/file-uploader.ts (types section)
import type { FileMetadata } from '../../files/types.js';

/**
 * Options for file upload to Slack.
 */
export interface FileUploadOptions {
  /** Delete file from Anthropic after successful Slack upload */
  deleteAfterUpload?: boolean;
  /** Initial comment to include with file */
  initialComment?: string;
  /** Trace ID for observability */
  traceId?: string;
}

/**
 * Result of a single file upload.
 */
export interface FileUploadResult {
  /** Whether upload succeeded */
  success: boolean;
  /** Original Anthropic file ID */
  anthropicFileId: string;
  /** Slack file ID if successful */
  slackFileId?: string;
  /** Filename uploaded */
  filename?: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Error details if failed */
  error?: {
    code: FileUploaderErrorCode;
    message: string;
  };
}

/**
 * Result of batch file upload.
 */
export interface BatchUploadResult {
  /** Number of files successfully uploaded */
  successCount: number;
  /** Number of files that failed */
  failureCount: number;
  /** Total bytes uploaded */
  totalBytes: number;
  /** Per-file results */
  results: FileUploadResult[];
}

/**
 * Error codes for file upload operations.
 */
export type FileUploaderErrorCode =
  | 'DOWNLOAD_FAILED'
  | 'UPLOAD_FAILED'
  | 'FILE_TOO_LARGE'
  | 'MISSING_PERMISSIONS'
  | 'RATE_LIMITED'
  | 'CLEANUP_FAILED'
  | 'UNKNOWN_ERROR';
```

### File Uploader Implementation

```typescript
// src/slack/utils/file-uploader.ts
import type { WebClient } from '@slack/web-api';
import { logger } from '../../utils/logger.js';
import { FilesApiClient } from '../../files/api-client.js';
import type {
  FileUploadOptions,
  FileUploadResult,
  BatchUploadResult,
  FileUploaderErrorCode,
} from './file-uploader.js';

// Slack file upload limit (1GB for most plans)
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB

/**
 * Error thrown by file upload operations.
 */
export class FileUploaderError extends Error {
  constructor(
    message: string,
    public code: FileUploaderErrorCode,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'FileUploaderError';
  }
}

/**
 * Downloads files from Anthropic Files API and uploads to Slack.
 *
 * @example
 * const uploader = new SlackFileUploader(filesClient, slackClient);
 *
 * // Upload a single file
 * const result = await uploader.uploadFile(
 *   'file_01abc',
 *   'C1234567',
 *   '1234567890.123456',
 *   { deleteAfterUpload: true, traceId }
 * );
 *
 * // Upload multiple files from response
 * const fileIds = extractFileIds(response);
 * const batch = await uploader.uploadFiles(fileIds, channel, threadTs, { traceId });
 */
export class SlackFileUploader {
  constructor(
    private filesClient: FilesApiClient,
    private slackClient: WebClient
  ) {}

  /**
   * Upload a single file from Anthropic to Slack.
   */
  async uploadFile(
    fileId: string,
    channel: string,
    threadTs: string,
    options?: FileUploadOptions
  ): Promise<FileUploadResult> {
    const { deleteAfterUpload, initialComment, traceId } = options ?? {};
    const startTime = Date.now();

    logger.debug({
      event: 'slack.file.upload.start',
      traceId,
      fileId,
      channel,
      threadTs,
    });

    try {
      // Step 1: Get file metadata
      const metadata = await this.filesClient.getFileMetadata(fileId, traceId);

      // Step 2: Validate file size
      if (metadata.size_bytes > MAX_FILE_SIZE_BYTES) {
        return {
          success: false,
          anthropicFileId: fileId,
          filename: metadata.filename,
          sizeBytes: metadata.size_bytes,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File ${metadata.filename} (${formatBytes(metadata.size_bytes)}) exceeds Slack's 1GB limit`,
          },
        };
      }

      // Step 3: Download file content
      const content = await this.filesClient.downloadFile(fileId, traceId);

      // Step 4: Upload to Slack
      const slackResult = await this.slackClient.files.uploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        filename: metadata.filename,
        file: content,
        initial_comment: initialComment,
      });

      const slackFileId = slackResult.file?.id;

      const duration = Date.now() - startTime;
      logger.info({
        event: 'slack.file.upload.complete',
        traceId,
        fileId,
        slackFileId,
        filename: metadata.filename,
        sizeBytes: metadata.size_bytes,
        durationMs: duration,
      });

      // Step 5: Cleanup (async, don't block)
      if (deleteAfterUpload) {
        this.cleanupFile(fileId, traceId).catch((error) => {
          logger.warn({
            event: 'slack.file.cleanup.failed',
            traceId,
            fileId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      return {
        success: true,
        anthropicFileId: fileId,
        slackFileId,
        filename: metadata.filename,
        sizeBytes: metadata.size_bytes,
      };
    } catch (error) {
      const code = this.categorizeError(error);
      const message = error instanceof Error ? error.message : String(error);

      logger.error({
        event: 'slack.file.upload.failed',
        traceId,
        fileId,
        errorCode: code,
        error: message,
      });

      return {
        success: false,
        anthropicFileId: fileId,
        error: { code, message },
      };
    }
  }

  /**
   * Upload multiple files from Anthropic to Slack.
   * Handles partial failures — one file failing doesn't stop others.
   */
  async uploadFiles(
    fileIds: string[],
    channel: string,
    threadTs: string,
    options?: FileUploadOptions
  ): Promise<BatchUploadResult> {
    const { traceId } = options ?? {};

    logger.info({
      event: 'slack.files.batch.start',
      traceId,
      fileCount: fileIds.length,
      channel,
      threadTs,
    });

    // Upload files in parallel (with concurrency limit to avoid rate limits)
    const results = await Promise.all(
      fileIds.map((fileId) => this.uploadFile(fileId, channel, threadTs, options))
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const totalBytes = results.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);

    logger.info({
      event: 'slack.files.batch.complete',
      traceId,
      successCount,
      failureCount,
      totalBytes,
    });

    return {
      successCount,
      failureCount,
      totalBytes,
      results,
    };
  }

  /**
   * Delete file from Anthropic storage (cleanup after upload).
   */
  private async cleanupFile(fileId: string, traceId?: string): Promise<void> {
    try {
      await this.filesClient.deleteFile(fileId, traceId);
      logger.debug({
        event: 'slack.file.cleanup.complete',
        traceId,
        fileId,
      });
    } catch (error) {
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Categorize error for consistent error codes.
   */
  private categorizeError(error: unknown): FileUploaderErrorCode {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('not found') || message.includes('404')) {
        return 'DOWNLOAD_FAILED';
      }
      if (message.includes('rate limit') || message.includes('429')) {
        return 'RATE_LIMITED';
      }
      if (message.includes('permission') || message.includes('401') || message.includes('403')) {
        return 'MISSING_PERMISSIONS';
      }
    }
    return 'UNKNOWN_ERROR';
  }
}

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Create a SlackFileUploader instance.
 */
export function createSlackFileUploader(
  filesClient: FilesApiClient,
  slackClient: WebClient
): SlackFileUploader {
  return new SlackFileUploader(filesClient, slackClient);
}
```

### Agent Loop Integration

```typescript
// In src/agent/loop.ts — add after tool execution block

import { extractFileIds } from '../files/index.js';
import { createSlackFileUploader } from '../slack/utils/file-uploader.js';

// After processing tool results...

// Check for generated files and upload to Slack
const fileIds = extractFileIds(response);
if (fileIds.length > 0 && slackContext) {
  const { channel, threadTs, traceId } = slackContext;

  logger.info({
    event: 'agent.files.detected',
    traceId,
    fileCount: fileIds.length,
  });

  // Upload files asynchronously (don't block main response)
  uploadGeneratedFiles(fileIds, channel, threadTs, traceId).catch((error) => {
    logger.error({
      event: 'agent.files.upload.failed',
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

// Helper function
async function uploadGeneratedFiles(
  fileIds: string[],
  channel: string,
  threadTs: string,
  traceId?: string
): Promise<void> {
  const uploader = createSlackFileUploader(
    createFilesApiClient(getAnthropicClient()),
    slackApp.client
  );

  const result = await uploader.uploadFiles(fileIds, channel, threadTs, {
    deleteAfterUpload: true,
    traceId,
  });

  if (result.failureCount > 0) {
    // Log but don't throw — partial success is acceptable
    logger.warn({
      event: 'agent.files.partial.failure',
      traceId,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  }
}
```

### Existing Pattern Reference

From `src/slack/utils/image-upload.ts` (Story 7.3):

```typescript
// Key pattern: Using files.uploadV2 with buffer
const result = await slackApp.client.files.uploadV2({
  channel_id: channelId,
  thread_ts: threadTs,
  filename: 'generated-image.png',
  file: imageBuffer,
  initial_comment: 'Here\'s your generated image:',
});
```

### Error Handling Strategy

| Scenario | Error Code | Behavior |
|----------|------------|----------|
| Anthropic file not found | `DOWNLOAD_FAILED` | Return failure for that file, continue others |
| Slack upload fails | `UPLOAD_FAILED` | Return failure, don't cleanup Anthropic file |
| File too large | `FILE_TOO_LARGE` | Skip upload, return with size info |
| Slack rate limited | `RATE_LIMITED` | Return failure, suggest retry |
| Cleanup fails | `CLEANUP_FAILED` | Log warning, don't fail overall upload |
| Permissions error | `MISSING_PERMISSIONS` | Return failure with clear message |

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR | prd.md | Generated files accessible to Slack users |
| FR24 | epics.md | Skills produce file artifacts |
| AR | tech-spec | Files downloaded via Files API, uploaded to Slack |
| AR | architecture.md | Slack file upload using `files.uploadV2` |
| Logging | project-context.md | ALL logs must include `traceId` |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |
| Test naming | project-context.md:129 | Tests: `kebab-case.test.ts`, co-located |

### Testing Requirements

**Minimum 12 tests:**

```typescript
// src/slack/utils/file-uploader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackFileUploader, FileUploaderError } from './file-uploader.js';
import type { FilesApiClient } from '../../files/api-client.js';
import type { WebClient } from '@slack/web-api';

vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SlackFileUploader', () => {
  let uploader: SlackFileUploader;
  let mockFilesClient: FilesApiClient;
  let mockSlackClient: WebClient;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFilesClient = {
      downloadFile: vi.fn(),
      getFileMetadata: vi.fn(),
      deleteFile: vi.fn(),
    } as unknown as FilesApiClient;

    mockSlackClient = {
      files: {
        uploadV2: vi.fn(),
      },
    } as unknown as WebClient;

    uploader = new SlackFileUploader(mockFilesClient, mockSlackClient);
  });

  describe('uploadFile', () => {
    it('downloads from Anthropic and uploads to Slack', async () => {
      const mockMetadata = {
        id: 'file_01test',
        filename: 'report.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size_bytes: 1024,
      };
      const mockBuffer = Buffer.from('test content');

      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(mockBuffer);
      vi.mocked(mockSlackClient.files.uploadV2).mockResolvedValue({
        ok: true,
        file: { id: 'F12345' },
      });

      const result = await uploader.uploadFile(
        'file_01test',
        'C1234567',
        '1234567890.123456',
        { traceId: 'test-trace' }
      );

      expect(result.success).toBe(true);
      expect(result.slackFileId).toBe('F12345');
      expect(result.filename).toBe('report.xlsx');
      expect(mockSlackClient.files.uploadV2).toHaveBeenCalledWith({
        channel_id: 'C1234567',
        thread_ts: '1234567890.123456',
        filename: 'report.xlsx',
        file: mockBuffer,
        initial_comment: undefined,
      });
    });

    it('preserves filename and MIME type', async () => {
      const mockMetadata = {
        id: 'file_01test',
        filename: 'document.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
      };

      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('pdf content'));
      vi.mocked(mockSlackClient.files.uploadV2).mockResolvedValue({ ok: true, file: { id: 'F123' } });

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.filename).toBe('document.pdf');
      expect(mockSlackClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'document.pdf' })
      );
    });

    it('deletes file from Anthropic when deleteAfterUpload is true', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue({
        id: 'file_01test', filename: 'test.xlsx', mime_type: 'application/xlsx', size_bytes: 100,
      });
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.files.uploadV2).mockResolvedValue({ ok: true, file: { id: 'F123' } });
      vi.mocked(mockFilesClient.deleteFile).mockResolvedValue(true);

      await uploader.uploadFile('file_01test', 'C123', '123.456', { deleteAfterUpload: true });

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockFilesClient.deleteFile).toHaveBeenCalledWith('file_01test', undefined);
    });

    it('returns error when download fails', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue({
        id: 'file_01test', filename: 'test.xlsx', mime_type: 'application/xlsx', size_bytes: 100,
      });
      vi.mocked(mockFilesClient.downloadFile).mockRejectedValue(new Error('File not found'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOWNLOAD_FAILED');
    });

    it('returns error when Slack upload fails', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue({
        id: 'file_01test', filename: 'test.xlsx', mime_type: 'application/xlsx', size_bytes: 100,
      });
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.files.uploadV2).mockRejectedValue(new Error('Upload failed'));

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Upload failed');
    });

    it('rejects files larger than 1GB', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue({
        id: 'file_01test',
        filename: 'huge.zip',
        mime_type: 'application/zip',
        size_bytes: 2 * 1024 * 1024 * 1024, // 2GB
      });

      const result = await uploader.uploadFile('file_01test', 'C123', '123.456');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILE_TOO_LARGE');
      expect(mockFilesClient.downloadFile).not.toHaveBeenCalled();
    });
  });

  describe('uploadFiles', () => {
    it('uploads multiple files successfully', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue({
        id: 'file_01test', filename: 'test.xlsx', mime_type: 'application/xlsx', size_bytes: 100,
      });
      vi.mocked(mockFilesClient.downloadFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(mockSlackClient.files.uploadV2).mockResolvedValue({ ok: true, file: { id: 'F123' } });

      const result = await uploader.uploadFiles(
        ['file_01', 'file_02', 'file_03'],
        'C123',
        '123.456'
      );

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(3);
    });

    it('handles partial failures gracefully', async () => {
      vi.mocked(mockFilesClient.getFileMetadata).mockResolvedValue({
        id: 'file_test', filename: 'test.xlsx', mime_type: 'application/xlsx', size_bytes: 100,
      });
      vi.mocked(mockFilesClient.downloadFile)
        .mockResolvedValueOnce(Buffer.from('content'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(Buffer.from('content'));
      vi.mocked(mockSlackClient.files.uploadV2).mockResolvedValue({ ok: true, file: { id: 'F123' } });

      const result = await uploader.uploadFiles(
        ['file_01', 'file_02', 'file_03'],
        'C123',
        '123.456'
      );

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results[1].success).toBe(false);
    });
  });
});
```

### Success Metrics

| Metric | Target |
|--------|--------|
| Single file upload (1MB) | <5s total (download + upload) |
| Batch upload (5 files, 1MB each) | <15s |
| Cleanup latency | <1s (non-blocking) |
| Test coverage | >90% |
| Partial failure handling | All files attempted, partial results returned |

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Block response on file uploads | Use async fire-and-forget for uploads |
| Fail entire batch on one error | Return partial success with per-file results |
| Log file contents | Log only metadata (filename, size, IDs) |
| Hardcode file size limits | Use configurable constant |
| Import without `.js` extension | Always use `.js` extension for ESM |
| Retry infinitely on rate limits | Return error, let caller decide retry |
| Cleanup before confirming upload | Cleanup only after successful Slack upload |

### Slack API Notes

**`files.uploadV2` Parameters:**

```typescript
await client.files.uploadV2({
  channel_id: string,      // Channel to upload to
  thread_ts?: string,      // Thread timestamp (for thread replies)
  filename: string,        // Filename shown in Slack
  file: Buffer,            // File content as buffer
  initial_comment?: string, // Message to accompany file
});
```

**Required Scopes:** `files:write` (already in Orion's app manifest)

**Rate Limits:** ~20 uploads per minute (Slack tier 2)

### MIME Type Handling

Common types from Skills:
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx)
- `application/pdf`
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` (pptx)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx)
- `image/png`
- `text/csv`

Fallback for unknown: `application/octet-stream`

## Previous Story Intelligence

From Story 6.5 (`6-5-files-api-client.md`):
- `FilesApiClient` class structure
- `extractFileIds()` helper function
- Error handling patterns (`FilesApiError`)
- Observability patterns (logging with `traceId`)

From Story 7.3 (`7-3-contextual-tool-feedback.md`):
- `src/slack/utils/image-upload.ts` — Slack file upload patterns
- `files.uploadV2` usage with buffers

From existing codebase:
- `src/agent/loop.ts` — Agent loop structure for integration point
- `src/slack/app.ts` — Slack client access patterns
- Logger patterns from various handlers

## Git Intelligence

Recent commits:
- `975f6a5` — PTC support for Sonnet 4.5 (response handling patterns)
- `0727798` — Sandbox skills baking (filesystem patterns)
- File upload patterns established in `src/slack/utils/image-upload.ts`
- Agent loop tool result handling patterns

## References

- [Source: tech-spec-skills-migration-to-anthropic-container.md#Files-API] — Files API integration details
- [Source: architecture.md#Anthropic-Skills-Files-API-Adoption] — ADR for skills migration
- [Source: 6-5-files-api-client.md] — Files API client implementation
- [Source: project-context.md#TL;DR] — Critical implementation rules
- [Slack Files API Docs](https://api.slack.com/methods/files.uploadV2)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 107 related tests pass (file-uploader: 19, loop: 68, files: 20)

### Completion Notes List

- Created `SlackFileUploader` class with full type definitions
- Implemented single file and batch upload with parallel execution
- Added `deleteAfterUpload` async cleanup (fire-and-forget)
- Added `generatedFileIds` to `AgentLoopResult` and `AgentResult`
- Integrated file extraction from `code_execution_tool_result` in loop
- Added file upload integration to both `app-mention.ts` and `user-message.ts` handlers
- Created barrel export at `src/slack/utils/index.ts`
- 19 unit tests covering all acceptance criteria

### File List

| File | Action | Description |
|------|--------|-------------|
| `src/slack/utils/file-uploader.ts` | CREATE | SlackFileUploader class with types |
| `src/slack/utils/file-uploader.test.ts` | CREATE | 19 unit tests |
| `src/slack/utils/index.ts` | CREATE | Barrel export |
| `src/agent/loop.ts` | MODIFY | Added `generatedFileIds` + extraction |
| `src/agent/orion.ts` | MODIFY | Added `generatedFileIds` to `AgentResult` |
| `src/slack/handlers/app-mention.ts` | MODIFY | Added file upload integration |
| `src/slack/handlers/user-message.ts` | MODIFY | Added file upload integration |

