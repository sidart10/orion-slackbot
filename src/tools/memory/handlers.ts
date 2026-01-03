/**
 * Memory Tool Handlers (SDK Interface)
 *
 * Implements MemoryToolHandlers for Anthropic's betaMemoryTool helper.
 * Supports all 6 commands: view, create, str_replace, insert, delete, rename.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#1-6 - Memory operations
 * @see AC#10 - betaMemoryTool integration
 */

import type { MemoryToolHandlers } from '@anthropic-ai/sdk/helpers/beta/memory';
import { readFile, writeFile, deleteFile, listFiles, copyFile } from './storage.js';
import { formatFileWithLineNumbers, formatDirectoryListing } from './format.js';
import { getLangfuse, type LangfuseSpan } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';

/**
 * Maximum content size for memory files (100KB).
 * @see project-context.md - Memory Path Rules / Constraints
 */
const MAX_CONTENT_SIZE_BYTES = 100 * 1024;

/**
 * Convert /memories/ path to GCS path (strip prefix).
 */
function toGcsPath(path: string): string {
  return path.replace(/^\/memories\//, '');
}

/**
 * Validate memory path.
 * @throws Error if path is invalid
 */
function validatePath(path: string): void {
  if (!path.startsWith('/memories/')) {
    throw new Error('Path must start with /memories/');
  }
  if (path.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
}

/**
 * Create a span for memory operations.
 */
function createSpan(traceId: string, command: string): LangfuseSpan | null {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  return langfuse.span({
    traceId,
    name: `tool.memory.${command}`,
  });
}

/**
 * Create MemoryToolHandlers implementation for betaMemoryTool.
 *
 * @param bucket - GCS bucket name
 * @param traceId - Trace ID for observability
 * @returns MemoryToolHandlers implementation
 */
export function createMemoryHandlers(bucket: string, traceId: string): MemoryToolHandlers {
  return {
    /**
     * View file content or list directory.
     * Returns formatted content with line numbers or directory listing.
     */
    async view(command) {
      const span = createSpan(traceId, 'view');
      const startTime = Date.now();

      try {
        validatePath(command.path);
        const gcsPath = toGcsPath(command.path);

        let result: string;

        if (command.path.endsWith('/')) {
          // Directory listing
          const files = await listFiles(bucket, gcsPath);
          result = formatDirectoryListing(files);
        } else {
          // File content with line numbers
          const content = await readFile(bucket, gcsPath);
          // SDK type is Array<number>, convert to tuple for formatting
          const viewRange = command.view_range as [number, number] | undefined;
          result = formatFileWithLineNumbers(content, viewRange);
        }

        logger.info({
          event: 'tool.memory.view.success',
          traceId,
          path: command.path,
          durationMs: Date.now() - startTime,
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({
          event: 'tool.memory.view.failed',
          traceId,
          path: command.path,
          error: message,
        });
        throw error;
      } finally {
        span?.end();
      }
    },

    /**
     * Create a new file.
     */
    async create(command) {
      const span = createSpan(traceId, 'create');
      const startTime = Date.now();

      try {
        validatePath(command.path);
        const gcsPath = toGcsPath(command.path);

        // Validate content size (SDK uses file_text, not content)
        if (Buffer.byteLength(command.file_text, 'utf-8') > MAX_CONTENT_SIZE_BYTES) {
          throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_SIZE_BYTES / 1024}KB`);
        }

        await writeFile(bucket, gcsPath, command.file_text);

        logger.info({
          event: 'tool.memory.create.success',
          traceId,
          path: command.path,
          durationMs: Date.now() - startTime,
        });

        return `File created at ${command.path}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({
          event: 'tool.memory.create.failed',
          traceId,
          path: command.path,
          error: message,
        });
        throw error;
      } finally {
        span?.end();
      }
    },

    /**
     * Replace text in file (str_replace).
     * Reads file, validates old_str exists, replaces, writes back.
     */
    async str_replace(command) {
      const span = createSpan(traceId, 'str_replace');
      const startTime = Date.now();

      try {
        validatePath(command.path);
        const gcsPath = toGcsPath(command.path);

        const content = await readFile(bucket, gcsPath);

        if (!content.includes(command.old_str)) {
          throw new Error(`String not found in file: "${command.old_str.substring(0, 50)}..."`);
        }

        const newContent = content.replace(command.old_str, command.new_str);

        // Validate new content size
        if (Buffer.byteLength(newContent, 'utf-8') > MAX_CONTENT_SIZE_BYTES) {
          throw new Error(`Result exceeds maximum size of ${MAX_CONTENT_SIZE_BYTES / 1024}KB`);
        }

        await writeFile(bucket, gcsPath, newContent);

        logger.info({
          event: 'tool.memory.str_replace.success',
          traceId,
          path: command.path,
          durationMs: Date.now() - startTime,
        });

        return `Replaced text in ${command.path}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({
          event: 'tool.memory.str_replace.failed',
          traceId,
          path: command.path,
          error: message,
        });
        throw error;
      } finally {
        span?.end();
      }
    },

    /**
     * Insert text at specified line number.
     *
     * Line numbering: insert_line is 0-indexed.
     * - insert_line=0 inserts BEFORE line 1 (at the beginning)
     * - insert_line=1 inserts AFTER line 1 (between lines 1 and 2)
     * - insert_line=N inserts AFTER line N
     *
     * This matches the Anthropic SDK memory tool specification.
     */
    async insert(command) {
      const span = createSpan(traceId, 'insert');
      const startTime = Date.now();

      try {
        validatePath(command.path);
        const gcsPath = toGcsPath(command.path);

        const content = await readFile(bucket, gcsPath);
        const lines = content.split('\n');

        // Validate insert_line
        if (command.insert_line < 0 || command.insert_line > lines.length) {
          throw new Error(
            `Invalid insert_line: ${command.insert_line} (file has ${lines.length} lines)`
          );
        }

        // Insert at specified line (0-indexed in array, SDK uses insert_text)
        lines.splice(command.insert_line, 0, command.insert_text);
        const newContent = lines.join('\n');

        // Validate new content size
        if (Buffer.byteLength(newContent, 'utf-8') > MAX_CONTENT_SIZE_BYTES) {
          throw new Error(`Result exceeds maximum size of ${MAX_CONTENT_SIZE_BYTES / 1024}KB`);
        }

        await writeFile(bucket, gcsPath, newContent);

        logger.info({
          event: 'tool.memory.insert.success',
          traceId,
          path: command.path,
          line: command.insert_line,
          durationMs: Date.now() - startTime,
        });

        return `Inserted text at line ${command.insert_line} in ${command.path}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({
          event: 'tool.memory.insert.failed',
          traceId,
          path: command.path,
          error: message,
        });
        throw error;
      } finally {
        span?.end();
      }
    },

    /**
     * Delete file or directory.
     */
    async delete(command) {
      const span = createSpan(traceId, 'delete');
      const startTime = Date.now();

      try {
        validatePath(command.path);
        const gcsPath = toGcsPath(command.path);

        await deleteFile(bucket, gcsPath);

        logger.info({
          event: 'tool.memory.delete.success',
          traceId,
          path: command.path,
          durationMs: Date.now() - startTime,
        });

        return `Deleted ${command.path}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({
          event: 'tool.memory.delete.failed',
          traceId,
          path: command.path,
          error: message,
        });
        throw error;
      } finally {
        span?.end();
      }
    },

    /**
     * Rename (move) file.
     * Implemented as copy + delete.
     */
    async rename(command) {
      const span = createSpan(traceId, 'rename');
      const startTime = Date.now();

      try {
        validatePath(command.old_path);
        validatePath(command.new_path);
        const oldGcsPath = toGcsPath(command.old_path);
        const newGcsPath = toGcsPath(command.new_path);

        // Copy to new location, then delete old
        await copyFile(bucket, oldGcsPath, newGcsPath);
        await deleteFile(bucket, oldGcsPath);

        logger.info({
          event: 'tool.memory.rename.success',
          traceId,
          oldPath: command.old_path,
          newPath: command.new_path,
          durationMs: Date.now() - startTime,
        });

        return `Renamed ${command.old_path} to ${command.new_path}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({
          event: 'tool.memory.rename.failed',
          traceId,
          oldPath: command.old_path,
          newPath: command.new_path,
          error: message,
        });
        throw error;
      } finally {
        span?.end();
      }
    },
  };
}

