/**
 * Unit tests for file ingestion orchestration.
 *
 * @see Story 8.3 - Slack File Ingestion for Claude Context
 * @see Task 3.4 - Write unit tests for upload orchestration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestSlackFile, ingestSlackFiles } from '@/files/ingestion.js';
import type { SlackFile } from '@/slack/files/types.js';

// Mock download service
vi.mock('@/slack/files/index.js', () => ({
  downloadSlackFile: vi.fn(),
  SlackFileDownloadError: class SlackFileDownloadError extends Error {
    code: string;
    filename: string;
    constructor(message: string, code: string, filename: string) {
      super(message);
      this.code = code;
      this.filename = filename;
    }
  },
}));

// Mock Files API client
vi.mock('@/files/api-client.js', () => ({
  FilesApiClient: vi.fn().mockImplementation(() => ({
    uploadBuffer: vi.fn(),
  })),
  FilesApiError: class FilesApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock Langfuse
vi.mock('@/observability/langfuse.js', () => ({
  getLangfuse: vi.fn(() => ({
    event: vi.fn(),
  })),
}));

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ingestSlackFile', () => {
  const createMockSlackFile = (overrides: Partial<SlackFile> = {}): SlackFile => ({
    id: 'F12345',
    name: 'test-document.pdf',
    mimetype: 'application/pdf',
    filetype: 'pdf',
    size: 1024,
    url_private_download: 'https://files.slack.com/test.pdf',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully ingest a file', async () => {
    const { downloadSlackFile } = await import('@/slack/files/index.js');
    const { FilesApiClient } = await import('@/files/api-client.js');

    const slackFile = createMockSlackFile();
    const downloadedContent = Buffer.from('PDF content');

    // Mock download
    vi.mocked(downloadSlackFile).mockResolvedValueOnce({
      content: downloadedContent,
      filename: 'test-document.pdf',
      mimetype: 'application/pdf',
      size: downloadedContent.length,
      slackFileId: 'F12345',
    });

    // Mock upload
    const mockUploadBuffer = vi.fn().mockResolvedValueOnce({
      id: 'file_anthropic_123',
      filename: 'test-document.pdf',
      mime_type: 'application/pdf',
      size_bytes: downloadedContent.length,
    });

    vi.mocked(FilesApiClient).mockImplementationOnce(() => ({
      uploadBuffer: mockUploadBuffer,
    }) as unknown as InstanceType<typeof FilesApiClient>);

    const result = await ingestSlackFile(slackFile, { traceId: 'test-trace' });

    expect(result.success).toBe(true);
    expect(result.fileId).toBe('file_anthropic_123');
    expect(result.slackFile).toBe(slackFile);
    expect(result.error).toBeUndefined();

    expect(mockUploadBuffer).toHaveBeenCalledWith(
      downloadedContent,
      'test-document.pdf',
      'application/pdf',
      'test-trace'
    );
  });

  it('should handle download failure', async () => {
    const { downloadSlackFile, SlackFileDownloadError } = await import('@/slack/files/index.js');

    const slackFile = createMockSlackFile();

    // Mock download failure
    vi.mocked(downloadSlackFile).mockRejectedValueOnce(
      new SlackFileDownloadError('File too large', 'FILE_TOO_LARGE', 'test-document.pdf')
    );

    const result = await ingestSlackFile(slackFile);

    expect(result.success).toBe(false);
    expect(result.fileId).toBeUndefined();
    expect(result.errorCode).toBe('FILE_TOO_LARGE');
    expect(result.error).toContain('File too large');
  });

  it('should handle upload failure', async () => {
    const { downloadSlackFile } = await import('@/slack/files/index.js');
    const { FilesApiClient, FilesApiError } = await import('@/files/api-client.js');

    const slackFile = createMockSlackFile();
    const downloadedContent = Buffer.from('PDF content');

    // Mock successful download
    vi.mocked(downloadSlackFile).mockResolvedValueOnce({
      content: downloadedContent,
      filename: 'test-document.pdf',
      mimetype: 'application/pdf',
      size: downloadedContent.length,
      slackFileId: 'F12345',
    });

    // Mock upload failure
    const mockUploadBuffer = vi.fn().mockRejectedValueOnce(
      new FilesApiError('Upload failed', 'FILE_UPLOAD_FAILED')
    );

    vi.mocked(FilesApiClient).mockImplementationOnce(() => ({
      uploadBuffer: mockUploadBuffer,
    }) as unknown as InstanceType<typeof FilesApiClient>);

    const result = await ingestSlackFile(slackFile);

    expect(result.success).toBe(false);
    expect(result.fileId).toBeUndefined();
    expect(result.errorCode).toBe('UPLOAD_FAILED');
  });

  it('should handle unexpected errors', async () => {
    const { downloadSlackFile } = await import('@/slack/files/index.js');

    const slackFile = createMockSlackFile();

    // Mock unexpected error
    vi.mocked(downloadSlackFile).mockRejectedValueOnce(
      new Error('Unexpected error')
    );

    const result = await ingestSlackFile(slackFile);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UNKNOWN_ERROR');
    expect(result.error).toContain('Unexpected error');
  });
});

describe('ingestSlackFiles', () => {
  const createMockSlackFile = (id: string, name: string): SlackFile => ({
    id,
    name,
    mimetype: 'application/pdf',
    filetype: 'pdf',
    size: 1024,
    url_private_download: `https://files.slack.com/${name}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle empty file array', async () => {
    const result = await ingestSlackFiles([]);

    expect(result.results).toEqual([]);
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(0);
    expect(result.totalBytes).toBe(0);
  });

  it('should process multiple files in parallel', async () => {
    const { downloadSlackFile } = await import('@/slack/files/index.js');
    const { FilesApiClient } = await import('@/files/api-client.js');

    const files = [
      createMockSlackFile('F1', 'doc1.pdf'),
      createMockSlackFile('F2', 'doc2.pdf'),
      createMockSlackFile('F3', 'doc3.pdf'),
    ];

    // Mock downloads
    vi.mocked(downloadSlackFile)
      .mockResolvedValueOnce({
        content: Buffer.from('content1'),
        filename: 'doc1.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        slackFileId: 'F1',
      })
      .mockResolvedValueOnce({
        content: Buffer.from('content2'),
        filename: 'doc2.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        slackFileId: 'F2',
      })
      .mockResolvedValueOnce({
        content: Buffer.from('content3'),
        filename: 'doc3.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        slackFileId: 'F3',
      });

    // Mock uploads
    const mockUploadBuffer = vi.fn()
      .mockResolvedValueOnce({ id: 'file_1' })
      .mockResolvedValueOnce({ id: 'file_2' })
      .mockResolvedValueOnce({ id: 'file_3' });

    vi.mocked(FilesApiClient).mockImplementationOnce(() => ({
      uploadBuffer: mockUploadBuffer,
    }) as unknown as InstanceType<typeof FilesApiClient>);

    const result = await ingestSlackFiles(files, { traceId: 'batch-test' });

    expect(result.results).toHaveLength(3);
    expect(result.successCount).toBe(3);
    expect(result.failureCount).toBe(0);
    expect(result.totalBytes).toBe(3072); // 3 * 1024
  });

  it('should handle partial failures', async () => {
    const { downloadSlackFile, SlackFileDownloadError } = await import('@/slack/files/index.js');
    const { FilesApiClient } = await import('@/files/api-client.js');

    const files = [
      createMockSlackFile('F1', 'doc1.pdf'),
      createMockSlackFile('F2', 'doc2.pdf'),
    ];

    // First file succeeds, second fails
    vi.mocked(downloadSlackFile)
      .mockResolvedValueOnce({
        content: Buffer.from('content1'),
        filename: 'doc1.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        slackFileId: 'F1',
      })
      .mockRejectedValueOnce(
        new SlackFileDownloadError('Download failed', 'DOWNLOAD_FAILED', 'doc2.pdf')
      );

    // Mock upload for first file
    const mockUploadBuffer = vi.fn().mockResolvedValueOnce({ id: 'file_1' });

    vi.mocked(FilesApiClient).mockImplementationOnce(() => ({
      uploadBuffer: mockUploadBuffer,
    }) as unknown as InstanceType<typeof FilesApiClient>);

    const result = await ingestSlackFiles(files);

    expect(result.results).toHaveLength(2);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.results[0]?.success).toBe(true);
    expect(result.results[1]?.success).toBe(false);
  });

  it('should track Langfuse events', async () => {
    const { downloadSlackFile } = await import('@/slack/files/index.js');
    const { FilesApiClient } = await import('@/files/api-client.js');
    const { getLangfuse } = await import('@/observability/langfuse.js');

    const mockEvent = vi.fn();
    vi.mocked(getLangfuse).mockReturnValue({
      event: mockEvent,
    } as ReturnType<typeof getLangfuse>);

    const files = [createMockSlackFile('F1', 'doc1.pdf')];

    vi.mocked(downloadSlackFile).mockResolvedValueOnce({
      content: Buffer.from('content1'),
      filename: 'doc1.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      slackFileId: 'F1',
    });

    const mockUploadBuffer = vi.fn().mockResolvedValueOnce({ id: 'file_1' });
    vi.mocked(FilesApiClient).mockImplementationOnce(() => ({
      uploadBuffer: mockUploadBuffer,
    }) as unknown as InstanceType<typeof FilesApiClient>);

    await ingestSlackFiles(files, { traceId: 'langfuse-test' });

    // Should have batch_start and batch_complete events
    expect(mockEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'file.ingestion.batch_start',
      })
    );
    expect(mockEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'file.ingestion.batch_complete',
      })
    );
  });
});
