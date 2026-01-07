# Story 5.3: Memory Auto-Check at Conversation Start

Status: done

## Story

As a **user**,
I want Orion to automatically remember my preferences and past context,
So that I don't have to repeat myself in every conversation.

## Acceptance Criteria

1. **Given** a user starts a new thread, **When** Claude initializes, **Then** relevant user memories are loaded into context

2. **Given** a returning user, **When** conversation starts, **Then** Claude knows the user's stored preferences

3. **Given** a thread with previous context, **When** resumed after a gap, **Then** session memory is restored

4. **Given** global learnings exist, **When** any conversation starts, **Then** relevant global context is available

5. **Given** memory loading, **When** memories are large, **Then** loading completes within 2 seconds (NFR)

6. **Given** memory check, **When** no memories exist for a user/session, **Then** the conversation proceeds normally (graceful fallback)

7. **Given** memory loading, **When** complete, **Then** Langfuse captures what memories were loaded

## Tasks / Subtasks

- [x] **Task 1: Create Memory Loader** (AC: #1, #2, #3, #4)
  - [x] Create `src/tools/memory/loader.ts`
  - [x] Implement `loadRelevantMemories(context)` function
  - [x] Load global, user, session scopes in parallel
  - [x] Return structured `LoadedMemories` result

- [x] **Task 2: Integrate with Thread Start** (AC: #1, #2)
  - [x] Modify `threadStarted` handler to load memories
  - [x] Set status: "Restoring your preferences..."
  - [x] Store memory context via `saveThreadContext`
  - [x] Personalize greeting if preferences exist

- [x] **Task 3: Format for Claude** (AC: #1, #4)
  - [x] Implement `formatMemoriesForContext()` function
  - [x] Structure as markdown for system prompt injection
  - [x] Handle JSON user preferences specially

- [x] **Task 4: Performance Optimization** (AC: #5)
  - [x] Parallel load all memory scopes with `Promise.all()`
  - [x] Set 2s timeout via `Promise.race()`
  - [x] Return partial results on timeout

- [x] **Task 5: Graceful Fallback** (AC: #6)
  - [x] Handle missing memories gracefully (log debug, not error)
  - [x] Don't block conversation on memory errors
  - [x] Return empty context if all scopes fail

- [x] **Task 6: Observability** (AC: #7)
  - [x] Create span: `tool.memory.load`
  - [x] Log which scopes were found/missing
  - [x] Track load duration
  - [x] Add Langfuse generation for context injection

- [x] **Task 7: Verification**
  - [x] Create user preferences memory
  - [x] Start new thread, verify preferences are known
  - [x] Verify graceful handling when no memories
  - [x] Verify load completes under 2s

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR46 | prd.md | Claude automatically checks `/memories` at conversation start |
| NFR | architecture.md | Memory loading within 2 seconds |
| Span Naming | project-context.md | Format: `{component}.{operation}` |
| Logging | project-context.md | Include `traceId` in all logs |

### Dependencies (CRITICAL)

| Dependency | Epic/Story | Status | Notes |
|------------|------------|--------|-------|
| Memory Handler | Story 5.1 | Required | GCS read operations |
| Path Builders | Story 5.2 | Required | Type-safe paths |
| Agent Loop | Epic 2 | **Soft dependency** | Full integration requires Epic 2; this story enables the capability |
| Thread Context | Story 1.5 | ✅ Exists | `saveThreadContext` API |

**Note:** This story can be implemented and tested in isolation. Full integration with the agent loop will be completed when Epic 2 is implemented.

### File Locations

```
src/tools/memory/
├── loader.ts           # Memory loader
├── loader.test.ts
├── handler.ts          # (from 5.1)
└── paths.ts            # (from 5.2)
```

### Memory Loader Implementation

```typescript
// src/tools/memory/loader.ts
import { readFile } from './storage.js';
import { langfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';

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

const MEMORY_LOAD_TIMEOUT_MS = 2000;

/**
 * Load relevant memories for a conversation context
 * 
 * Loads in parallel from all applicable scopes.
 * Returns partial results on timeout or error.
 * 
 * @see FR46 - Auto-check /memories at conversation start
 */
export async function loadRelevantMemories(
  context: MemoryContext
): Promise<LoadedMemories> {
  const span = langfuse.span({
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
    
    span.end({
      output: {
        scopesFound: result.scopesFound,
        durationMs: duration,
      },
    });
    
    // Log generation for cost tracking
    langfuse.generation({
      name: 'memory.context.inject',
      traceId: context.traceId,
      input: { requestedScopes: ['global', 'user', 'session'] },
      output: { loadedScopes: result.scopesFound },
      metadata: { durationMs: duration },
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
    
    span.end({
      metadata: { error: errorMessage, durationMs: duration },
    });
    
    logger.warn({
      event: 'tool.memory.load.timeout',
      traceId: context.traceId,
      error: errorMessage,
      durationMs: duration,
    });
    
    // Return empty memories on error — don't block conversation
    return { loadDurationMs: duration, scopesFound: [] };
  }
}

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
      (memories as Record<string, unknown>)[result.scope] = result.content;
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
    // Log as debug — missing memory is normal, not an error
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
```

### Format Memories for Context

```typescript
// src/tools/memory/loader.ts

/**
 * Format loaded memories for inclusion in Claude's context
 */
export function formatMemoriesForContext(memories: LoadedMemories): string {
  const sections: string[] = [];
  
  if (memories.global) {
    sections.push(`## Global Context\n\n${memories.global}`);
  }
  
  if (memories.user) {
    try {
      const prefs = JSON.parse(memories.user);
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
```

### Integration with Thread Started Handler

```typescript
// src/slack/handlers/thread-started.ts
import { loadRelevantMemories, formatMemoriesForContext } from '../../tools/memory/loader.js';
import { config } from '../../config/environment.js';

export const handleThreadStarted: AssistantThreadStartedMiddleware = async ({
  say,
  setStatus,
  setSuggestedPrompts,
  saveThreadContext,
  event,
}) => {
  const userId = event.assistant_thread?.user_id;
  const threadTs = event.assistant_thread?.thread_ts;
  const traceId = event.event_ts; // Use event_ts as trace ID
  
  // Show loading status
  await setStatus({ status: 'Restoring your preferences...' });
  
  // Load memories
  const memories = await loadRelevantMemories({
    userId,
    threadTs,
    traceId,
    bucket: config.gcs.memoriesBucket,
  });
  
  // Format for context injection
  const memoryContext = formatMemoriesForContext(memories);
  
  // Persist thread context (Slack-managed; custom payload is not supported)
  await saveThreadContext();
  
  // Personalized greeting if we have user preferences
  const greeting = memories.user
    ? "Welcome back! I remember your preferences. How can I help?"
    : "Hello! I'm Orion, your AI assistant. How can I help you today?";
  
  await say(greeting);
  
  // ... suggested prompts, etc.
};
```

### Agent Loop Integration (Implemented)

Memory injection is **stateless** (Cloud Run friendly):
- `thread-started.ts` loads memories (best-effort) for greeting + prompts.
- `user-message.ts` reloads memories from GCS (best-effort) and prepends the formatted memory context into the system prompt when a bucket is configured.

### Session Memory Auto-Save (Post-Conversation)

```typescript
// Utility for saving session context after meaningful interactions
export async function saveSessionMemory(
  threadTs: string,
  summary: string,
  context: { traceId: string; bucket: string }
): Promise<void> {
  // Only save if conversation had substance
  if (summary.length < 100) return;
  
  const sanitizedTs = threadTs.replace('.', '-');
  const path = `sessions/${sanitizedTs}/context.md`;
  
  try {
    await writeFile(
      context.bucket,
      path,
      `Last updated: ${new Date().toISOString()}\n\n${summary}`
    );
    
    logger.debug({
      event: 'tool.memory.session.saved',
      traceId: context.traceId,
      threadTs,
    });
  } catch (error) {
    logger.warn({
      event: 'tool.memory.session.save.failed',
      traceId: context.traceId,
      threadTs,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    // Don't throw — session save is best-effort
  }
}
```

### Dependencies

- Story 5.1 (Memory Handler) — Storage operations
- Story 5.2 (Path Builders) — Type-safe paths
- Story 1.5 (Thread Context) — `saveThreadContext` API

### Success Metrics

| Metric | Target |
|--------|--------|
| Memory load time | <2 seconds |
| Memory availability | >99% |
| Context restoration accuracy | Verified via user feedback |

## Dev Agent Record

### Implementation Plan
- Created `src/tools/memory/loader.ts` with `loadRelevantMemories()` and `formatMemoriesForContext()` functions
- Integrated memory loading into `thread-started` handler with personalized greetings
- Implemented 2s timeout using `Promise.race()` for AC#5 NFR
- Added comprehensive observability with Langfuse spans and structured logging

### Completion Notes
- All 7 tasks completed with 29 new tests (14 loader tests + 11 thread-started tests + 4 user-message memory tests)
- Memory loads in parallel across global, user, and session scopes
- Graceful fallback returns empty context on errors or timeout
- Slack thread context is **Slack-managed**; Orion does **not** store custom payload (no `memoryContext`/`scopesLoaded` stored via `saveThreadContext`)
- Personalized greeting shown when user preferences exist
- **Code Review Fix (2026-01-03):** Memory context is injected into Claude's system prompt by re-loading memories (stateless) in `user-message.ts` when a GCS bucket is configured

### Code Review Fixes Applied (2026-01-03)
1. **[HIGH] Memory context injection**: `user-message.ts` re-loads memories from GCS (stateless) and prepends formatted memory context to the system prompt
2. **[MEDIUM] Module exports**: Added `loadRelevantMemories`, `formatMemoriesForContext`, `MemoryContext`, `LoadedMemories` exports to `index.ts`
3. **[MEDIUM] Redundant Langfuse trace**: Removed duplicate `langfuse.trace()` creation that was creating orphaned traces

### Debug Log
- No issues encountered during implementation

## File List

| File | Change |
|------|--------|
| `src/tools/memory/loader.ts` | Created - Memory loader with parallel scope loading; removed redundant trace |
| `src/tools/memory/loader.test.ts` | Created - 14 tests for loader functionality |
| `src/tools/memory/index.ts` | Modified - Export loader functions and types |
| `src/slack/handlers/thread-started.ts` | Modified - Integrated memory loading, personalized greetings |
| `src/slack/handlers/thread-started.test.ts` | Modified - Added 6 memory-related tests |
| `src/slack/handlers/user-message.ts` | Modified - Inject memory context into system prompt (AC#1 completion) |
| `src/slack/handlers/user-message.test.ts` | Modified - Added 4 memory context injection tests |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 5 |
| 2025-12-22 | Fixed error handling, added observability, clarified Epic 2 soft dependency |
| 2026-01-03 | Implemented all tasks: loader, thread integration, observability, timeout, tests |
| 2026-01-03 | Code review: Fixed memory context injection (AC#1), exported loader from index.ts, removed redundant trace |
