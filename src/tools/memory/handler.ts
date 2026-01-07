/**
 * Memory Tool Handler
 *
 * Handles Anthropic Memory Tool calls for persistent storage via GCS.
 * Returns ToolResult<MemoryData> — never throws.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see FR44 - Persistent memory via Memory Tool pattern
 * @see AR29-31 - Memory Tool → GCS handler
 */

import { readFile, writeFile, deleteFile, listFiles } from './storage.js';
import { validateMemoryPath, MAX_MEMORY_FILE_SIZE } from './paths.js';
import { getLangfuse, type LangfuseSpan } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import type { ToolResult } from '../../utils/tool-result.js';

/**
 * Input schema for memory tool.
 */
export interface MemoryToolInput {
  command: 'view' | 'create' | 'update' | 'delete';
  path: string;
  content?: string;
}

/**
 * Output data from memory operations.
 */
export interface MemoryData {
  content: string;
  path: string;
}

/**
 * Execution context for memory tool.
 */
export interface MemoryToolContext {
  traceId: string;
  bucket: string;
}

/**
 * Determine if a GCS error is retryable.
 */
function isGcsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // GCS 503 Service Unavailable and UNAVAILABLE are retryable
    return message.includes('503') || message.includes('unavailable');
  }
  return false;
}

/**
 * Handle Anthropic Memory Tool calls.
 *
 * Operations:
 * - view: Read a file or list a directory (path ending with /)
 * - create: Create a new memory file
 * - update: Update an existing memory file
 * - delete: Remove a memory file
 *
 * @param input - Tool input from Claude
 * @param context - Execution context with traceId and bucket
 * @returns ToolResult with success/error discriminated union
 */
export async function handleMemoryTool(
  input: MemoryToolInput,
  context: MemoryToolContext
): Promise<ToolResult<MemoryData>> {
  const spanName = `tool.memory.${input.command}`;
  const langfuse = getLangfuse();
  let span: LangfuseSpan | null = null;

  // M2 fix: Create span on existing trace (not orphan trace)
  // Use traceId to attach span to parent trace hierarchy
  if (langfuse) {
    span = langfuse.span({
      traceId: context.traceId,
      name: spanName,
      input: { command: input.command, path: input.path },
    });
  }

  const startTime = Date.now();

  try {
    // Full path validation via Story 5.2 validateMemoryPath()
    const pathValidation = validateMemoryPath(input.path);
    if (!pathValidation.valid) {
      return {
        success: false,
        error: {
          code: 'MEMORY_NOT_FOUND',
          message: pathValidation.error || 'Invalid memory path',
          retryable: false,
        },
      };
    }

    const gcsPath = input.path.replace('/memories/', '');
    let resultContent: string;

    switch (input.command) {
      case 'view':
        if (input.path.endsWith('/')) {
          const files = await listFiles(context.bucket, gcsPath);
          resultContent = files.map((f) => f.path).join('\n');
        } else {
          resultContent = await readFile(context.bucket, gcsPath);
        }
        break;

      case 'create':
      case 'update':
        if (!input.content) {
          return {
            success: false,
            error: {
              code: 'MEMORY_WRITE_FAILED',
              message: 'Content required for create/update',
              retryable: false,
            },
          };
        }
        // M3 fix: Validate content size (100KB max per project-context.md)
        if (Buffer.byteLength(input.content, 'utf-8') > MAX_MEMORY_FILE_SIZE) {
          return {
            success: false,
            error: {
              code: 'MEMORY_WRITE_FAILED',
              message: `Content exceeds maximum size of ${MAX_MEMORY_FILE_SIZE / 1024}KB`,
              retryable: false,
            },
          };
        }
        await writeFile(context.bucket, gcsPath, input.content);
        resultContent = `File ${input.command}d at ${input.path}`;
        break;

      case 'delete':
        await deleteFile(context.bucket, gcsPath);
        resultContent = `File deleted at ${input.path}`;
        break;

      default:
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Unknown command: ${input.command}`,
            retryable: false,
          },
        };
    }

    const duration = Date.now() - startTime;

    span?.end({
      output: { success: true },
      metadata: { durationMs: duration },
    });

    logger.info({
      event: 'tool.memory.success',
      traceId: context.traceId,
      command: input.command,
      path: input.path,
      durationMs: duration,
    });

    return {
      success: true,
      data: { content: resultContent, path: input.path },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRetryable = isGcsRetryable(error);
    const errorCode = errorMessage.includes('not found') ? 'MEMORY_NOT_FOUND' : 'MEMORY_WRITE_FAILED';

    span?.end({
      metadata: { success: false, error: errorMessage },
    });

    logger.error({
      event: 'tool.memory.failed',
      traceId: context.traceId,
      command: input.command,
      path: input.path,
      error: errorMessage,
    });

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        retryable: isRetryable,
      },
    };
  }
}

