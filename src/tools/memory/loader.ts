/**
 * Memory Loader
 *
 * Loads relevant memories for conversation context at thread start.
 * Supports global, user, and session scopes with parallel loading.
 *
 * @see Story 5.3 - Memory Auto-Check at Conversation Start
 * @see FR46 - Claude automatically checks /memories at conversation start
 * @see AC#1-4 - Memory loading for all scopes
 * @see AC#5 - NFR: Loading within 2 seconds
 * @see AC#6 - Graceful fallback when no memories
 */

import { readFile } from './storage.js';
import { logger } from '../../utils/logger.js';
import { getLangfuse } from '../../observability/langfuse.js';

// =============================================================================
// Types
// =============================================================================

export interface MemoryContext {
  userId?: string;
  threadTs?: string;
  traceId: string;
  bucket: string;
}

export interface LoadedMemories {
  global?: string;
  user?: string;
  session?: string;
  loadDurationMs: number;
  scopesFound: string[];
}

// =============================================================================
// Constants
// =============================================================================

const MEMORY_LOAD_TIMEOUT_MS = 2000;

// =============================================================================
// Memory Loader
// =============================================================================

/**
 * Load relevant memories for a conversation context.
 *
 * Loads in parallel from all applicable scopes:
 * - global: Shared learnings (always attempted)
 * - user: Per-user preferences (if userId provided)
 * - session: Per-thread context (if threadTs provided)
 *
 * Returns partial results on timeout or individual scope errors.
 * Never throws — conversation proceeds even if memory load fails.
 *
 * @see FR46 - Auto-check /memories at conversation start
 * @see AC#5 - NFR: Loading within 2 seconds
 */
export async function loadRelevantMemories(context: MemoryContext): Promise<LoadedMemories> {
  const langfuse = getLangfuse();
  const span = langfuse?.span({
    name: 'tool.memory.load',
    traceId: context.traceId,
    input: { userId: context.userId, threadTs: context.threadTs },
  });

  const startTime = Date.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Memory load timeout')), MEMORY_LOAD_TIMEOUT_MS);
    });

    const loadPromise = loadAllScopes(context);
    const result = await Promise.race([loadPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    result.loadDurationMs = duration;

    span?.end({
      output: {
        scopesFound: result.scopesFound,
        durationMs: duration,
      },
    });

    logger.info({
      event: 'tool.memory.load.success',
      traceId: context.traceId,
      scopesFound: result.scopesFound,
      durationMs: duration,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    span?.end({
      metadata: { error: errorMessage, durationMs: duration },
    });

    logger.warn({
      event: 'tool.memory.load.timeout',
      traceId: context.traceId,
      error: errorMessage,
      durationMs: duration,
    });

    // Return empty memories on error — don't block conversation (AC#6)
    return { loadDurationMs: duration, scopesFound: [] };
  }
}

// =============================================================================
// Internal Functions
// =============================================================================

async function loadAllScopes(context: MemoryContext): Promise<LoadedMemories> {
  const promises: Promise<{ scope: string; content?: string }>[] = [];

  // Always try global
  promises.push(loadScopeMemory(context, 'global', 'global/context.md'));

  // User scope if userId provided
  if (context.userId) {
    promises.push(loadScopeMemory(context, 'user', `users/${context.userId}/preferences.json`));
  }

  // Session scope if threadTs provided
  if (context.threadTs) {
    const sanitizedTs = context.threadTs.replace('.', '-');
    promises.push(loadScopeMemory(context, 'session', `sessions/${sanitizedTs}/context.md`));
  }

  const results = await Promise.all(promises);

  const memories: LoadedMemories = { loadDurationMs: 0, scopesFound: [] };

  for (const result of results) {
    if (result.content) {
      (memories as unknown as Record<string, unknown>)[result.scope] = result.content;
      memories.scopesFound.push(result.scope);
    }
  }

  return memories;
}

async function loadScopeMemory(
  context: MemoryContext,
  scope: string,
  path: string
): Promise<{ scope: string; content?: string }> {
  try {
    const content = await readFile(context.bucket, path);
    return { scope, content };
  } catch (error) {
    // Log as debug — missing memory is normal, not an error (AC#6)
    logger.debug({
      event: 'tool.memory.scope.miss',
      traceId: context.traceId,
      scope,
      path,
      reason: error instanceof Error ? error.message : 'Unknown',
    });
    return { scope };
  }
}

// =============================================================================
// Format Memories for Context
// =============================================================================

/**
 * Format loaded memories for inclusion in Claude's context.
 *
 * Structures memories as markdown sections for system prompt injection.
 * Parses JSON user preferences into readable format.
 *
 * @see AC#1 - Memories loaded into context
 * @see AC#4 - Global context available
 */
export function formatMemoriesForContext(memories: LoadedMemories): string {
  const sections: string[] = [];

  if (memories.global) {
    sections.push(`## Global Context\n\n${memories.global}`);
  }

  if (memories.user) {
    try {
      const prefs = JSON.parse(memories.user) as Record<string, unknown>;
      sections.push(`## User Preferences\n\n${formatPreferences(prefs)}`);
    } catch {
      sections.push(`## User Context\n\n${memories.user}`);
    }
  }

  if (memories.session) {
    sections.push(`## Session Context\n\n${memories.session}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return `# Restored Memory\n\n${sections.join('\n\n---\n\n')}`;
}

function formatPreferences(prefs: Record<string, unknown>): string {
  return Object.entries(prefs)
    .map(([key, value]) => `- *${key}*: ${value}`)
    .join('\n');
}

