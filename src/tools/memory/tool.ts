/**
 * Memory Tool Definition and Registration
 *
 * Registers the memory tool with the agent for persistent storage via GCS.
 * Follows Anthropic's Memory Tool pattern.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see FR44 - Persistent memory via Memory Tool pattern
 * @see AR29-31 - Memory Tool → GCS handler
 */

import type Anthropic from '@anthropic-ai/sdk';
import { toolRegistry } from '../registry.js';
import { handleMemoryTool, type MemoryToolInput } from './handler.js';
import { config } from '../../config/environment.js';
import { logger } from '../../utils/logger.js';

/**
 * Tool name as exposed to Claude.
 */
export const MEMORY_TOOL_NAME = 'memory';

/**
 * Tool definition for Claude's tool_use capability.
 *
 * Operations:
 * - view: Read a file or list a directory (path ending with /)
 * - create: Create a new memory file
 * - update: Update an existing memory file
 * - delete: Remove a memory file
 *
 * @see AC#7 - context-management-2025-06-27 beta enables auto-check
 */
export const memoryToolDefinition: Anthropic.Tool = {
  name: MEMORY_TOOL_NAME,
  description: `Access persistent memory storage.

Operations:
- view: Read a file or list a directory (path ending with /)
- create: Create a new memory file
- update: Update an existing memory file  
- delete: Remove a memory file

Paths must start with /memories/ and follow:
- /memories/global/ - Shared learnings
- /memories/users/{userId}/ - User preferences
- /memories/sessions/{threadTs}/ - Session context`,
  input_schema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        enum: ['view', 'create', 'update', 'delete'],
        description: 'Operation to perform',
      },
      path: {
        type: 'string',
        description: 'Path starting with /memories/',
      },
      content: {
        type: 'string',
        description: 'Content for create/update operations',
      },
    },
    required: ['command', 'path'],
  },
};

// Module-level context storage for traceId
let currentTraceId: string | null = null;

/**
 * Set the trace ID for the current request.
 *
 * @param traceId - The trace ID for observability
 */
export function setMemoryToolContext(traceId: string): void {
  currentTraceId = traceId;
}

/**
 * Clear the memory tool context after request completion.
 */
export function clearMemoryToolContext(): void {
  currentTraceId = null;
}

/**
 * Tool handler wrapper for memory operations.
 * Called by the tool router when Claude invokes the memory tool.
 *
 * @param input - Tool input from Claude
 * @returns JSON string with result or error
 */
export async function handleMemoryToolWrapper(input: unknown): Promise<string> {
  const typedInput = input as MemoryToolInput;
  const bucket = config.gcsMemoriesBucket;

  if (!bucket) {
    logger.error({
      event: 'memory_tool.bucket_missing',
      message: 'GCS_MEMORIES_BUCKET not configured',
      traceId: currentTraceId ?? 'no-trace',
    });
    return JSON.stringify({
      error: 'Memory storage not configured',
      code: 'TOOL_UNAVAILABLE',
    });
  }

  const context = {
    traceId: currentTraceId ?? 'no-trace',
    bucket,
  };

  const result = await handleMemoryTool(typedInput, context);

  if (!result.success) {
    return JSON.stringify({
      error: result.error.message,
      code: result.error.code,
      retryable: result.error.retryable,
    });
  }

  return JSON.stringify({
    content: result.data.content,
    path: result.data.path,
  });
}

/**
 * Register the memory tool with the tool registry.
 * Call this during application initialization.
 */
export function registerMemoryTool(): void {
  toolRegistry.registerStaticTool(
    MEMORY_TOOL_NAME,
    handleMemoryToolWrapper,
    memoryToolDefinition
  );

  logger.info({
    event: 'memory_tool.registered',
    toolName: MEMORY_TOOL_NAME,
  });
}

