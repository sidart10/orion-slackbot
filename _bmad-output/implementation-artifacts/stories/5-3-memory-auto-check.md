# Story 5.3: Memory Auto-Check at Conversation Start

Status: ready-for-dev

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

- [ ] **Task 1: Create Memory Loader** (AC: #1, #2, #3, #4)
  - [ ] Create `src/tools/memory/loader.ts`
  - [ ] Implement `loadRelevantMemories(context)` function
  - [ ] Load global, user, session scopes in parallel
  - [ ] Return structured `LoadedMemories` result

- [ ] **Task 2: Integrate with Thread Start** (AC: #1, #2)
  - [ ] Modify `threadStarted` handler to load memories
  - [ ] Set status: "Restoring your preferences..."
  - [ ] Store memory context via `saveThreadContext`
  - [ ] Personalize greeting if preferences exist

- [ ] **Task 3: Format for Claude** (AC: #1, #4)
  - [ ] Implement `formatMemoriesForContext()` function
  - [ ] Structure as markdown for system prompt injection
  - [ ] Handle JSON user preferences specially

- [ ] **Task 4: Performance Optimization** (AC: #5)
  - [ ] Parallel load all memory scopes with `Promise.all()`
  - [ ] Set 2s timeout via `Promise.race()`
  - [ ] Return partial results on timeout

- [ ] **Task 5: Graceful Fallback** (AC: #6)
  - [ ] Handle missing memories gracefully (log debug, not error)
  - [ ] Don't block conversation on memory errors
  - [ ] Return empty context if all scopes fail

- [ ] **Task 6: Observability** (AC: #7)
  - [ ] Create span: `tool.memory.load`
  - [ ] Log which scopes were found/missing
  - [ ] Track load duration
  - [ ] Add Langfuse generation for context injection

- [ ] **Task 7: Verification**
  - [ ] Create user preferences memory
  - [ ] Start new thread, verify preferences are known
  - [ ] Verify graceful handling when no memories
  - [ ] Verify load completes under 2s

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
  
  // Store in thread context for agent loop
  await saveThreadContext({
    memoryContext,
    memoryLoadedAt: new Date().toISOString(),
    scopesLoaded: memories.scopesFound,
  });
  
  // Personalized greeting if we have user preferences
  const greeting = memories.user
    ? "Welcome back! I remember your preferences. How can I help?"
    : "Hello! I'm Orion, your AI assistant. How can I help you today?";
  
  await say(greeting);
  
  // ... suggested prompts, etc.
};
```

### Agent Loop Integration (Epic 2)

When Epic 2 (Agent Loop) is implemented, integrate memory context:

```typescript
// src/agent/loop.ts (future implementation)
export async function runAgentLoop(params: {
  message: string;
  threadContext?: { memoryContext?: string };
  traceId: string;
}) {
  const { message, threadContext, traceId } = params;
  
  const messages: Anthropic.MessageParam[] = [];
  
  // Inject memory context if available
  if (threadContext?.memoryContext) {
    messages.push({
      role: 'user',
      content: `${threadContext.memoryContext}\n\n---\n\nUser message: ${message}`,
    });
  } else {
    messages.push({ role: 'user', content: message });
  }
  
  // ... agent loop implementation
}
```

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

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 5 |
| 2025-12-22 | Fixed error handling, added observability, clarified Epic 2 soft dependency |
