/**
 * Memory Tool Registration (SDK Helper)
 *
 * Uses Anthropic's betaMemoryTool helper for correct tool type (memory_20250818).
 * This tool bypasses ToolRegistry — pass directly to messages.create() tools array.
 *
 * @see Story 5.1 - Memory Tool Handler
 * @see AC#10 - betaMemoryTool integration
 */

import { betaMemoryTool } from '@anthropic-ai/sdk/helpers/beta/memory';
import { createMemoryHandlers } from './handlers.js';
import { logger } from '../../utils/logger.js';

/**
 * Module-level context for memory tool.
 * Set before each request, cleared after.
 */
let memoryToolContext: { bucket: string; traceId: string } | null = null;

/**
 * Set the context for memory tool operations.
 * Call this at the start of each request before getting the memory tool.
 *
 * @param bucket - GCS bucket name
 * @param traceId - Trace ID for observability
 */
export function setMemoryToolContext(bucket: string, traceId: string): void {
  memoryToolContext = { bucket, traceId };
}

/**
 * Clear the memory tool context after request completion.
 */
export function clearMemoryToolContext(): void {
  memoryToolContext = null;
}

/**
 * Get the memory tool for inclusion in messages.create().
 *
 * Returns SDK helper tool with type: 'memory_20250818'.
 * This tool bypasses ToolRegistry — pass directly to tools array.
 *
 * @returns betaMemoryTool configured with current context
 * @throws Error if context not set
 *
 * @example
 * ```typescript
 * setMemoryToolContext(config.gcsMemoriesBucket, traceId);
 * try {
 *   const memoryTool = getMemoryTool();
 *   const response = await anthropic.messages.create({
 *     tools: [memoryTool, ...mcpTools],
 *     betas: ['context-management-2025-06-27'],  // Required for auto-check
 *   });
 * } finally {
 *   clearMemoryToolContext();
 * }
 * ```
 */
export function getMemoryTool() {
  if (!memoryToolContext) {
    throw new Error('Memory tool context not set - call setMemoryToolContext() first');
  }

  const handlers = createMemoryHandlers(memoryToolContext.bucket, memoryToolContext.traceId);

  logger.debug({
    event: 'memory_tool.created',
    traceId: memoryToolContext.traceId,
    bucket: memoryToolContext.bucket,
  });

  return betaMemoryTool(handlers);
}

/**
 * Tool name as exposed to Claude.
 * Note: When using betaMemoryTool, the name is fixed by the SDK.
 */
export const MEMORY_TOOL_NAME = 'memory';
