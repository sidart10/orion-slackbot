# Story 6.3: Skills Container Configuration

Status: done

## Story

As a **developer**,
I want the agent loop to configure the container parameter with uploaded skills and manage container lifecycle across conversation turns,
So that Claude can access custom skills in the code execution environment with container reuse for performance.

## ⚠️ BLOCKING DEPENDENCY — Story 6.2 Required

**🛑 DO NOT START** until Story 6.2 **Task 3 (Container Parameter Builder)** is complete.

**Before starting 6.3, verify these exist:**
- [x] `src/skills/container-builder.ts` — File exists
- [x] `buildContainerParameter()` — Function is implemented
- [x] `config.anthropic.allBetas` — Array exists in `src/config/environment.ts`

Story 6.2 provides:
- `config.anthropic.allBetas` (consolidated beta headers)
- `buildContainerParameter()` base function in `container-builder.ts`
- Skills API client for getting uploaded skill IDs

**This story ADDS:**
- Container lifecycle manager (cross-request persistence by threadTs)
- TTL-based cleanup and memory management
- Integration with agent loop for lifecycle tracking

## ⚠️ IMPORTANT: Existing PTC Container Code

The agent loop **ALREADY** has container tracking for PTC at lines 569-572:

```typescript
let activeContainer: string | undefined;
let ptcToolCallCount = 0;
let ptcContainerStartTime: number | undefined;
```

**DO NOT DUPLICATE** — extend the existing `activeContainer` tracking with lifecycle manager integration.

## Scope Boundary (Non-Negotiable)

This story EXTENDS existing container support in `loop.ts` to add lifecycle management.

- **IN SCOPE:**
  - Container lifecycle management (`src/skills/container-lifecycle.ts`) — NEW file
  - Type definitions — ADD to existing `src/skills/types.ts` (NOT new file)
  - EXTEND `src/agent/loop.ts` existing container handling
  - Container timeout/cleanup logic per conversation
  - Graceful shutdown integration

- **OUT OF SCOPE:**
  - Skills API client (Story 6.2)
  - Container parameter builder (Story 6.2 — Task 3)
  - Beta header consolidation (Story 6.2 — Task 6)
  - Skill upload/sync logic (Story 6.2)
  - Files API integration (Story 6.5)
  - PTC/allowed_callers configuration (Story 6.7)
  - Skill registry service (Story 6.4)

## Critical: Existing Code to Understand

**⚠️ MANDATORY: Read these files BEFORE implementation:**

| File | Lines | What Exists |
|------|-------|-------------|
| `src/agent/loop.ts` | 569-572 | `activeContainer`, `ptcToolCallCount`, `ptcContainerStartTime` — **DO NOT DUPLICATE** |
| `src/agent/loop.ts` | 639-647 | `messages.create()` call — container param added by Story 6.2 |
| `src/agent/loop.ts` | 662-672 | Container ID extraction from `message_start` event |
| `src/skills/types.ts` | ALL | Existing skill types — ADD container types HERE |
| `src/tools/mcp/manager.ts` | 25-59 | Singleton pattern reference |

**NOTE:** Line numbers based on commit `975f6a5`. Verify before implementation — lines may shift if Story 6.2 commits first.

## File Operations Summary

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/skills/container-lifecycle.ts` | Lifecycle manager with TTL (~80 lines) |
| CREATE | `src/skills/container-lifecycle.test.ts` | Unit tests (~150 lines) |
| MODIFY | `src/skills/types.ts` | Add `ContainerState`, `ContainerLifecycleConfig` |
| MODIFY | `src/skills/index.ts` | Re-export lifecycle manager |
| MODIFY | `src/agent/loop.ts` | Integrate lifecycle manager |
| MODIFY | `src/index.ts` | Register graceful shutdown |

## Acceptance Criteria

1. **Given** a multi-turn conversation, **When** receiving a response with `container.id`, **Then** subsequent requests reuse that container ID via lifecycle manager

2. **Given** a new Slack thread, **When** starting the agent loop, **Then** lifecycle manager returns undefined (fresh container)

3. **Given** container reuse, **When** Claude returns a new `container.id`, **Then** the lifecycle manager is updated for future turns

4. **Given** a conversation timeout (>30 min idle), **When** next message arrives, **Then** lifecycle manager returns undefined (fresh container)

5. **Given** observability requirements, **When** container is created/reused, **Then** Langfuse captures point-in-time event `container.lifecycle.create` or `container.lifecycle.reuse`

6. **Given** >1000 active containers, **When** new container needed, **Then** oldest expired entries are pruned first

7. **Given** process shutdown (SIGTERM), **When** cleanup runs, **Then** lifecycle manager cleanup timer is cleared

## Tasks / Subtasks

### Task 1: Container Lifecycle Types (AC: #1)

ADD to existing `src/skills/types.ts`:

- [x] **1.1** Add `ContainerState` interface: `{ containerId: string; lastUsed: number }`
- [x] **1.2** Add `ContainerLifecycleConfig` interface for constants
- [x] **1.3** Export types from `src/skills/index.ts`
- [x] **1.4** Verify `AgentContext` (in `src/agent/orion.ts`) includes `threadTs?: string` field — add if missing

### Task 2: Container Lifecycle Manager (AC: #1, #2, #3, #4, #6, #7)

Create `src/skills/container-lifecycle.ts`:

- [x] **2.1** Create `ContainerLifecycleManager` class with singleton pattern (see pattern below)
- [x] **2.2** Implement `getContainerId(threadTs: string): string | undefined` — returns ID if exists and not expired, updates `lastUsed` on hit
- [x] **2.3** Implement `setContainerId(threadTs: string, containerId: string): void` — stores with max entries enforcement
- [x] **2.4** Implement `clearContainerId(threadTs: string): void` — removes entry
- [x] **2.5** Implement `pruneExpired()` — removes expired entries, enforces max 1000
- [x] **2.6** Use constants: `CONTAINER_TTL_MS = 30 * 60 * 1000`, `MAX_ENTRIES = 1000`, `CLEANUP_INTERVAL_MS = 5 * 60 * 1000`
- [x] **2.7** Implement `destroy()` method — clears interval timer for graceful shutdown
- [x] **2.8** Use `Map<string, ContainerState>` (NOT WeakMap — threadTs keys are strings)
- [x] **2.9** Implement `_clear()` method — test isolation, clears all entries

### Task 3: Agent Loop Integration (AC: #1, #3, #5)

MODIFY `src/agent/loop.ts` (extend existing code):

- [x] **3.1** Import `containerLifecycle` singleton from `../skills/container-lifecycle.js`
- [x] **3.2** Extract `threadTs` from `options.context.threadTs` at loop start (see access pattern below)
- [x] **3.3** Check `containerLifecycle.getContainerId(threadTs)` for existing container — skip if `threadTs` undefined
- [x] **3.4** Extend existing container ID extraction (lines 662-672) to call `containerLifecycle.setContainerId(threadTs, container)`
- [x] **3.5** Add Langfuse point-in-time event: `container.lifecycle.reuse` or `container.lifecycle.create`

### Task 4: Graceful Shutdown Integration (AC: #7)

MODIFY `src/index.ts`:

- [x] **4.1** Import `containerLifecycle` singleton
- [x] **4.2** Add to existing SIGTERM handler: `containerLifecycle.destroy()`
- [x] **4.3** Ensure cleanup runs BEFORE `process.exit(0)` — insert after Langfuse shutdown, before OTel shutdown

### Task 5: Unit Tests (AC: #1-7)

Create `src/skills/container-lifecycle.test.ts`:

- [x] **5.1** Test: `getContainerId` returns undefined for unknown threadTs
- [x] **5.2** Test: `setContainerId` then `getContainerId` returns same ID
- [x] **5.3** Test: TTL expiry — advance timers past TTL, returns undefined
- [x] **5.4** Test: `lastUsed` updates on each successful `getContainerId` call
- [x] **5.5** Test: `clearContainerId` removes entry
- [x] **5.6** Test: Max entries — oldest entry pruned when adding beyond limit
- [x] **5.7** Test: `pruneExpired()` removes only expired entries, keeps valid ones
- [x] **5.8** Test: `destroy()` clears cleanup interval timer
- [x] **5.9** Test: Concurrent access — rapid set/get calls don't corrupt state
- [x] **5.10** Test: `_clear()` empties all entries (for test isolation)

## Dev Notes

### Types to Add to `src/skills/types.ts`

```typescript
// =============================================================================
// CONTAINER LIFECYCLE TYPES (Story 6.3)
// =============================================================================

/**
 * Container state for lifecycle tracking.
 *
 * @see Story 6.3 - Container Lifecycle Manager
 */
export interface ContainerState {
  containerId: string;
  lastUsed: number;  // Date.now() timestamp
}

/**
 * Configuration constants for container lifecycle.
 */
export interface ContainerLifecycleConfig {
  ttlMs: number;           // 30 minutes default
  maxEntries: number;      // 1000 max
  cleanupIntervalMs: number; // 5 minutes
}
```

### Singleton Pattern (EXACT — from manager.ts:25-59)

```typescript
// src/skills/container-lifecycle.ts
import { logger } from '../utils/logger.js';
import type { ContainerState } from './types.js';

const CONTAINER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Singleton instance */
let instance: ContainerLifecycleManager | null = null;

/**
 * Manages container ID persistence across conversation turns.
 * Uses Map (not WeakMap) because threadTs keys are strings.
 *
 * @see Story 6.3 - Container Lifecycle Manager
 * @see src/tools/mcp/manager.ts for singleton pattern reference
 */
class ContainerLifecycleManager {
  private containers = new Map<string, ContainerState>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.cleanupTimer = setInterval(() => this.pruneExpired(), CLEANUP_INTERVAL_MS);
  }

  /** Get the singleton instance. */
  static getInstance(): ContainerLifecycleManager {
    if (!instance) {
      instance = new ContainerLifecycleManager();
    }
    return instance;
  }

  /** Get container ID if exists and not expired. Updates lastUsed on hit. */
  getContainerId(threadTs: string): string | undefined {
    const state = this.containers.get(threadTs);
    if (!state) return undefined;

    // Check TTL
    if (Date.now() - state.lastUsed > CONTAINER_TTL_MS) {
      this.containers.delete(threadTs);
      return undefined;
    }

    // Update lastUsed (touch)
    state.lastUsed = Date.now();
    return state.containerId;
  }

  /** Store container ID for thread. Enforces max entries. */
  setContainerId(threadTs: string, containerId: string): void {
    // Enforce max entries — prune oldest if at limit
    if (this.containers.size >= MAX_ENTRIES && !this.containers.has(threadTs)) {
      this.pruneExpired();
      // If still at limit, remove oldest
      if (this.containers.size >= MAX_ENTRIES) {
        const oldest = this.findOldest();
        if (oldest) this.containers.delete(oldest);
      }
    }

    this.containers.set(threadTs, {
      containerId,
      lastUsed: Date.now(),
    });
  }

  /** Remove container ID for thread. */
  clearContainerId(threadTs: string): void {
    this.containers.delete(threadTs);
  }

  /** Clear cleanup timer. Call on SIGTERM. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** For testing only — clear all entries and reset instance. */
  _clear(): void {
    this.containers.clear();
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [threadTs, state] of this.containers) {
      if (now - state.lastUsed > CONTAINER_TTL_MS) {
        this.containers.delete(threadTs);
      }
    }
  }

  private findOldest(): string | undefined {
    let oldest: string | undefined;
    let oldestTime = Infinity;
    for (const [threadTs, state] of this.containers) {
      if (state.lastUsed < oldestTime) {
        oldestTime = state.lastUsed;
        oldest = threadTs;
      }
    }
    return oldest;
  }
}

export const containerLifecycle = ContainerLifecycleManager.getInstance();
```

### Thread TS Access Pattern

The `threadTs` value is accessible via `options.context.threadTs` (from Slack thread_ts).
If undefined (DM without thread), skip lifecycle tracking — each message gets fresh container.

```typescript
// In src/agent/loop.ts - extract threadTs from context
const threadTs = options.context?.threadTs; // May be undefined for non-threaded DMs

// Only use lifecycle manager if we have a thread to track
const existingContainerId = threadTs
  ? containerLifecycle.getContainerId(threadTs)
  : undefined;
```

### Agent Loop Integration Pattern

```typescript
// In src/agent/loop.ts - ADD to existing code

import { containerLifecycle } from '../skills/container-lifecycle.js';

// At start of executeAgentLoop(), after extracting options:
const threadTs = options.context?.threadTs;
const existingContainerId = threadTs
  ? containerLifecycle.getContainerId(threadTs)
  : undefined;

// In message_start event handler (lines 662-672), EXTEND existing code:
const container = (event.message as unknown as { container?: string })?.container;
if (container) {
  activeContainer = container;  // EXISTING
  // NEW: Persist for cross-request reuse
  if (threadTs) {
    containerLifecycle.setContainerId(threadTs, container);
  }
  // NEW: Observability (point-in-time event, not duration span)
  createAgentSpan(trace,
    existingContainerId ? 'container.lifecycle.reuse' : 'container.lifecycle.create',
    { containerId: container, threadTs, wasReused: !!existingContainerId }
  )?.end();
}
```

### Langfuse Import Pattern

```typescript
// Required imports for observability
import { getLangfuse } from '../observability/langfuse.js';

// Span creation follows existing pattern in loop.ts:43-72
// For container lifecycle, use point-in-time events (create → end immediately)
// The actual container execution duration is tracked by Anthropic, not us
```

### Graceful Shutdown Integration

```typescript
// In src/index.ts - ADD to existing SIGTERM handler (lines 73-81)

import { containerLifecycle } from './skills/container-lifecycle.js';

process.on('SIGTERM', async () => {
  logger.info({ event: 'server.shutdown.started' });
  // Shutdown Langfuse client first (flushes pending traces)
  await shutdownLangfuse();
  // NEW: Clear container lifecycle cleanup timer
  containerLifecycle.destroy();
  // Then shutdown OTel SDK (stops span processor)
  await shutdownInstrumentation();
  logger.info({ event: 'server.shutdown.complete' });
  process.exit(0);
});
```

### Error Handling

| Scenario | Action |
|----------|--------|
| Container 404 (API) | Clear from lifecycle manager, API creates new one |
| Memory pressure | Prune expired + remove oldest when at MAX_ENTRIES |
| Process crash | Containers lost (OK — API creates new on next request) |

### Test Isolation Pattern

Use underscore prefix (`_clear()`) to indicate test-only methods.

```typescript
// In tests
import { containerLifecycle } from '../skills/container-lifecycle.js';

beforeEach(() => {
  containerLifecycle._clear();
});
```

### Testing Requirements

**Minimum: 10 tests for `container-lifecycle.test.ts`**

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Use fake timers for TTL testing
vi.useFakeTimers();

describe('ContainerLifecycleManager', () => {
  beforeEach(() => {
    // Clear singleton state between tests
    const { containerLifecycle } = await import('../skills/container-lifecycle.js');
    containerLifecycle._clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('returns undefined for unknown threadTs', () => { /* ... */ });
  it('returns stored containerId after set', () => { /* ... */ });
  it('returns undefined after TTL expires', () => {
    // vi.advanceTimersByTime(30 * 60 * 1000 + 1);
  });
  it('updates lastUsed on get', () => { /* ... */ });
  it('clears entry on clearContainerId', () => { /* ... */ });
  it('prunes oldest when at max entries', () => { /* ... */ });
  it('prunes only expired entries', () => { /* ... */ });
  it('clears timer on destroy', () => { /* ... */ });
  it('handles concurrent access', () => { /* ... */ });
  it('clears all entries on _clear', () => { /* ... */ });
});
```

## Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| Logging | project-context.md | Include `traceId` in all logs — use existing pattern |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |
| Test naming | project-context.md:129 | Tests: `kebab-case.test.ts`, co-located |
| Span naming | project-context.md:176-179 | Format: `{component}.{operation}` — use `container.lifecycle.*` |
| Graceful shutdown | project-context.md:265-271 | Register with SIGTERM handler |
| Singleton pattern | src/tools/mcp/manager.ts:25-59 | Follow existing pattern EXACTLY |

## Success Metrics

| Metric | Target |
|--------|--------|
| Container reuse rate | >90% within same thread |
| Memory usage | <1MB for 1000 threads (~1KB per entry) |
| Test coverage | >90% for container-lifecycle.ts |
| Cold start impact | ~0ms (no async init needed) |

## Dependencies (Story Prerequisites)

| Dependency | Story | Status | What It Provides |
|------------|-------|--------|------------------|
| Container Builder | 6.2 Task 3 | pending | `buildContainerParameter()` function |
| Beta Headers | 6.2 Task 6 | pending | `config.anthropic.allBetas` consolidation |
| Agent Loop | 2.2 | done | Base loop to integrate with |
| Langfuse | 1.2 | done | Observability for container events |

## Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Create `container-types.ts` | Add types to existing `src/skills/types.ts` |
| Duplicate container-builder.ts | Story 6.2 owns this — extend, don't duplicate |
| Modify beta headers | Story 6.2 owns beta consolidation |
| Use WeakMap | Use Map — threadTs keys are strings |
| Import without `.js` | Always use `.js` extension for ESM |
| Skip graceful shutdown | Register `destroy()` with SIGTERM |
| Use `skills.container.*` spans | Use `container.lifecycle.*` per naming convention |
| Duplicate `activeContainer` | Extend existing variable at loop.ts:569 |
| Create duration spans | Use point-in-time events (create span → end immediately) |

## Previous Story Intelligence

From Story 6.2 (`6-2-skills-api-client.md`):
- `config.anthropic.allBetas` consolidates ALL beta headers
- `buildContainerParameter()` created in Task 3
- `pause_turn` stop reason handling documented

From existing codebase:
- `src/agent/loop.ts:569-572` — existing container tracking (`activeContainer`, `ptcToolCallCount`, `ptcContainerStartTime`)
- `src/skills/loader.test.ts` — test patterns to follow
- `src/tools/mcp/manager.ts:25-59` — singleton pattern reference
- `src/index.ts:73-81` — graceful shutdown pattern

## Git Intelligence

Recent commits:
- `975f6a5` — PTC support for Sonnet 4.5 (adds `advanced-tool-use-2025-11-20` beta)
- Beta header patterns established in codebase
- Anthropic SDK v0.71.x patterns in use

## References

- [Source: architecture.md#Anthropic-Skills-Files-API-Adoption] — ADR for skills migration
- [Source: tech-spec-skills-migration-to-anthropic-container.md] — Full tech spec
- [Source: project-context.md#TL;DR] — Critical implementation rules
- [Source: src/agent/loop.ts:569-572] — Existing container handling
- [Source: src/tools/mcp/manager.ts:25-59] — Singleton pattern

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Story created - Container configuration and lifecycle management |
| 2026-01-07 | Validation review: Added existing code references, file operations summary, memory leak prevention, error handling, test requirements |
| 2026-01-07 | **SM Validation Fixes:** (1) Clarified 6.2 dependency — don't duplicate container-builder, (2) Types go in existing types.ts not new file, (3) Updated span names to `container.lifecycle.*` per project pattern, (4) Added graceful shutdown integration, (5) Added note about line number verification, (6) Removed duplicate Dev Notes sections, (7) Added singleton pattern reference, (8) Clarified Map vs WeakMap rationale, (9) Added cold start impact estimate (~0ms), (10) Added specific test scenarios |
| 2026-01-07 | **SM Thorough Validation (Round 2):** (C1) Added explicit warning about existing PTC container code at loop.ts:569-572 — DO NOT DUPLICATE, (C2) Added Thread TS Access Pattern section explaining `options.context.threadTs`, (C3) Added blocking dependency checklist — verify 6.2 artifacts before starting, (E1) Added Task 1.4 to verify AgentContext includes threadTs, (E2) Added complete singleton pattern code from manager.ts, (E3) Added Langfuse import pattern, (E4) Added test isolation pattern documentation, (O1) Consolidated similar subtasks, (O2) Clarified point-in-time events vs duration spans, (L1) Removed redundant sections, (L2) Simplified file operations table |
