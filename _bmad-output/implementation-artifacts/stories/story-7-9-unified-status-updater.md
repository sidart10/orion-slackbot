# Story 7.9: Unified Status Updater

## Story

**As a** developer maintaining Orion's codebase,
**I want** a unified StatusUpdater abstraction for status message handling,
**So that** both handlers (user-message and app-mention) share consistent status logic, reducing duplication and improving testability.

## Status

| Field | Value |
|-------|-------|
| Status | done |
| Epic | 7 - Slack Polish |
| Priority | P3 |
| Estimate | 1-2 hours |
| Dependencies | Story 7.3 (Contextual Tool Feedback), Story 3.4 (Channel Tool Feedback) |

---

## Background

The two Slack handlers implement status updates differently:

| Handler | Status API | Debounce | Cleanup |
|---------|------------|----------|---------|
| `user-message.ts` | `setStatus()` via Assistant API | None (Slack handles) | `setStatus('')` |
| `app-mention.ts` | `chat.postMessage/update/delete` | 300ms manual | `chat.delete()` |

This creates:
1. **Code duplication** - Status logic repeated in both handlers
2. **Testing complexity** - Different mocking requirements per handler
3. **Maintenance burden** - Bug fixes must be applied to both implementations

**Architecture Decision (ADR-2026-01-09):**
> "Introduce `StatusUpdater` interface with two implementations and a factory."

---

## Scope

### In Scope

1. **Create StatusUpdater interface** - Unified contract for status operations
2. **AssistantStatusUpdater implementation** - Wraps `setStatus()` from Assistant API
3. **ChannelStatusUpdater implementation** - Uses `chat.postMessage/update/delete` with debounce
4. **Factory function** - Auto-selects implementation based on context
5. **Refactor user-message.ts** - Extract inline status logic to use abstraction
6. **Refactor app-mention.ts** - Extract inline status logic to use abstraction
7. **Unit tests** - Test both implementations and factory

### Out of Scope

- Changing status message content (Story 7.3 already handles)
- New status message types
- Status persistence across requests
- Analytics/metrics for status updates

---

## Acceptance Criteria

### AC1: StatusUpdater Interface

- [x] Create `src/slack/status/types.ts` with StatusUpdater interface
- [x] Interface has three methods: `update(status)`, `cleanup()`, `isActive()`
- [x] StatusContext type includes all required fields for both implementations

```typescript
// Required interface shape
interface StatusUpdater {
  update(status: string): Promise<void>;
  cleanup(): Promise<void>;
  isActive(): boolean;
}

interface StatusContext {
  setStatus?: SetStatusFn;
  client: WebClient;
  channel: string;
  thread_ts: string;
}
```

### AC2: AssistantStatusUpdater Implementation

- [x] Create `src/slack/status/assistant-updater.ts`
- [x] Wraps `setStatus()` callback from Assistant API
- [x] `update()` calls `setStatus({ status, loading_messages: [...] })`
- [x] `cleanup()` calls `setStatus('')` (empty string clears status)
- [x] No debouncing (Slack handles rate limiting for Assistant API)
- [x] Graceful error handling (never throws, logs warnings)

### AC3: ChannelStatusUpdater Implementation

- [x] Create `src/slack/status/channel-updater.ts`
- [x] Uses `chat.postMessage()` for initial status, `chat.update()` for changes
- [x] `cleanup()` calls `chat.delete()` to remove status message
- [x] 300ms debounce on `update()` to avoid Slack rate limits
- [x] Tracks `messageTs` internally for updates/deletes
- [x] Graceful error handling (never throws, logs warnings)

### AC4: Factory Function

- [x] Create `src/slack/status/index.ts` with factory and re-exports
- [x] `createStatusUpdater(context)` returns correct implementation
- [x] If `context.setStatus` exists, returns `AssistantStatusUpdater`
- [x] Otherwise, returns `ChannelStatusUpdater`
- [x] Factory is synchronous (no async initialization)

### AC5: Refactor user-message.ts

- [x] Remove inline `safeSetStatus` function
- [x] Import `createStatusUpdater` from `../status/index.js`
- [x] Create `statusUpdater` at handler start
- [x] Replace all `safeSetStatus()` calls with `statusUpdater.update()`
- [x] Call `statusUpdater.cleanup()` on success (after streamer.stop())
- [x] Call `statusUpdater.cleanup()` on error (in catch block)

### AC6: Refactor app-mention.ts

- [x] Remove inline `updateStatusMessage` and `deleteStatusMessage` functions
- [x] Remove `statusMessageTs` and `lastStatusUpdate` tracking variables
- [x] Import `createStatusUpdater` from `../status/index.js`
- [x] Create `statusUpdater` at handler start (after streamer.start())
- [x] Replace all status calls with `statusUpdater.update()`
- [x] Call `statusUpdater.cleanup()` on success and error

### AC7: Unit Tests

- [x] Create `src/slack/status/index.test.ts`
- [x] Test `AssistantStatusUpdater.update()` calls setStatus correctly
- [x] Test `AssistantStatusUpdater.cleanup()` calls setStatus with empty string
- [x] Test `ChannelStatusUpdater.update()` posts/updates messages
- [x] Test `ChannelStatusUpdater.cleanup()` deletes message
- [x] Test `ChannelStatusUpdater` debounce (rapid calls coalesced)
- [x] Test factory selects correct implementation
- [x] All tests pass: `pnpm test src/slack/status/` (31 tests passing)

### AC8: Existing Tests Pass

- [x] All existing handler tests pass: `pnpm test src/slack/handlers/` (101 tests passing)
- [x] No regression in status behavior

---

## Technical Design

### 1. File Structure

```
src/slack/status/
├── types.ts              # StatusUpdater interface, StatusContext
├── assistant-updater.ts  # AssistantStatusUpdater class
├── channel-updater.ts    # ChannelStatusUpdater class
├── index.ts              # Factory + re-exports
└── index.test.ts         # Unit tests
```

### 2. Interface Definition

**src/slack/status/types.ts**
```typescript
/**
 * Status updater interface for unified status management.
 *
 * @see Story 7.9 - Unified Status Updater
 * @see ADR-2026-01-09 - StatusUpdater Abstraction
 */
import type { WebClient } from '@slack/web-api';

/**
 * Unified interface for status updates across handler types.
 * Abstracts the difference between Assistant API setStatus and channel messages.
 */
export interface StatusUpdater {
  /**
   * Update the current status message.
   * @param status - Status text to display (e.g., "Using MSCI Reports...")
   */
  update(status: string): Promise<void>;

  /**
   * Clean up the status message (clear or delete).
   * Should be called on success AND on error.
   */
  cleanup(): Promise<void>;

  /**
   * Check if a status message is currently active.
   */
  isActive(): boolean;
}

/**
 * Callback type for Assistant API setStatus.
 */
export type SetStatusFn = (payload: {
  status: string;
  loading_messages?: string[];
}) => Promise<void> | void;

/**
 * Context required to create a StatusUpdater.
 */
export interface StatusContext {
  /** Assistant API setStatus callback (if available) */
  setStatus?: SetStatusFn;
  /** Slack Web API client */
  client: WebClient;
  /** Channel ID */
  channel: string;
  /** Thread timestamp */
  thread_ts: string;
  /** Trace ID for logging */
  traceId?: string;
}
```

### 3. AssistantStatusUpdater Implementation

**src/slack/status/assistant-updater.ts**
```typescript
/**
 * Status updater for Assistant API (DM threads).
 * Wraps the setStatus() callback provided by Slack's Assistant class.
 *
 * @see Story 7.9 - Unified Status Updater
 */
import type { StatusUpdater, SetStatusFn } from './types.js';
import { buildLoadingMessages } from '../status-messages.js';
import { logger } from '../../utils/logger.js';

export class AssistantStatusUpdater implements StatusUpdater {
  private active = false;
  private traceId?: string;

  constructor(
    private setStatus: SetStatusFn,
    traceId?: string
  ) {
    this.traceId = traceId;
  }

  async update(status: string): Promise<void> {
    try {
      // Slack's setStatus may be sync or async
      const result = this.setStatus({
        status: 'working...',
        loading_messages: [status],
      });
      if (result && typeof result.then === 'function') {
        await result;
      }
      this.active = true;
    } catch (error) {
      logger.warn({
        event: 'status_update_failed',
        updater: 'assistant',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
    }
  }

  async cleanup(): Promise<void> {
    if (!this.active) return;
    try {
      const result = this.setStatus({ status: '' });
      if (result && typeof result.then === 'function') {
        await result;
      }
      this.active = false;
    } catch (error) {
      logger.warn({
        event: 'status_cleanup_failed',
        updater: 'assistant',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
    }
  }

  isActive(): boolean {
    return this.active;
  }
}
```

### 4. ChannelStatusUpdater Implementation

**src/slack/status/channel-updater.ts**
```typescript
/**
 * Status updater for channel @mentions.
 * Posts/updates/deletes a status message in the thread.
 *
 * @see Story 7.9 - Unified Status Updater
 * @see Story 3.4 - Channel Tool Feedback
 */
import type { WebClient } from '@slack/web-api';
import type { StatusUpdater } from './types.js';
import { logger } from '../../utils/logger.js';

const DEBOUNCE_MS = 300;

export class ChannelStatusUpdater implements StatusUpdater {
  private messageTs?: string;
  private lastUpdate = 0;
  private traceId?: string;

  constructor(
    private client: WebClient,
    private channel: string,
    private threadTs: string,
    traceId?: string
  ) {
    this.traceId = traceId;
  }

  async update(status: string): Promise<void> {
    const now = Date.now();

    // Debounce rapid updates
    if (this.messageTs && now - this.lastUpdate < DEBOUNCE_MS) {
      return;
    }
    this.lastUpdate = now;

    try {
      if (!this.messageTs) {
        // First update: post new message
        const result = await this.client.chat.postMessage({
          channel: this.channel,
          thread_ts: this.threadTs,
          text: status,
        });
        this.messageTs = result.ts;
      } else {
        // Subsequent updates: update existing message
        await this.client.chat.update({
          channel: this.channel,
          ts: this.messageTs,
          text: status,
        });
      }
    } catch (error) {
      logger.debug({
        event: 'status_update_failed',
        updater: 'channel',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
    }
  }

  async cleanup(): Promise<void> {
    if (!this.messageTs) return;
    try {
      await this.client.chat.delete({
        channel: this.channel,
        ts: this.messageTs,
      });
      this.messageTs = undefined;
    } catch (error) {
      logger.debug({
        event: 'status_cleanup_failed',
        updater: 'channel',
        error: error instanceof Error ? error.message : String(error),
        traceId: this.traceId,
      });
    }
  }

  isActive(): boolean {
    return !!this.messageTs;
  }
}
```

### 5. Factory Function

**src/slack/status/index.ts**
```typescript
/**
 * Unified status updater factory and exports.
 *
 * @see Story 7.9 - Unified Status Updater
 */
export type { StatusUpdater, StatusContext, SetStatusFn } from './types.js';
export { AssistantStatusUpdater } from './assistant-updater.js';
export { ChannelStatusUpdater } from './channel-updater.js';

import type { StatusUpdater, StatusContext } from './types.js';
import { AssistantStatusUpdater } from './assistant-updater.js';
import { ChannelStatusUpdater } from './channel-updater.js';

/**
 * Create the appropriate StatusUpdater based on context.
 *
 * @param context - Handler context with setStatus (if Assistant API)
 * @returns StatusUpdater implementation
 *
 * @example
 * // In user-message.ts (has setStatus)
 * const statusUpdater = createStatusUpdater({ setStatus, client, channel, thread_ts });
 *
 * // In app-mention.ts (no setStatus)
 * const statusUpdater = createStatusUpdater({ client, channel, thread_ts });
 */
export function createStatusUpdater(context: StatusContext): StatusUpdater {
  if (context.setStatus) {
    return new AssistantStatusUpdater(context.setStatus, context.traceId);
  }
  return new ChannelStatusUpdater(
    context.client,
    context.channel,
    context.thread_ts,
    context.traceId
  );
}
```

---

## Handler Refactoring Examples

### user-message.ts (Before/After)

**Before:**
```typescript
const safeSetStatus = (payload: unknown): Promise<void> => {
  try {
    const result = (setStatus as unknown as (p: unknown) => unknown)(payload);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>).then(() => {}).catch(() => {});
    }
    return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
};

// FR47: dynamic status messages
const initialStatusPromise = safeSetStatus({
  status: 'working...',
  loading_messages: buildLoadingMessages(),
});
```

**After:**
```typescript
import { createStatusUpdater } from '../status/index.js';

const statusUpdater = createStatusUpdater({
  setStatus,
  client,
  channel: channelId,
  thread_ts: threadTs ?? '',
  traceId: trace.id,
});

// FR47: dynamic status messages
await statusUpdater.update('Gathering context...');
```

### app-mention.ts (Before/After)

**Before:**
```typescript
let statusMessageTs: string | undefined;
let lastStatusUpdate = 0;
const STATUS_DEBOUNCE_MS = 300;

const updateStatusMessage = async (params: {...}): Promise<void> => {
  if (!statusMessageTs) return;
  const now = Date.now();
  if (now - lastStatusUpdate < STATUS_DEBOUNCE_MS) return;
  lastStatusUpdate = now;
  // ... chat.update logic
};

const deleteStatusMessage = async (): Promise<void> => {
  if (!statusMessageTs) return;
  // ... chat.delete logic
};
```

**After:**
```typescript
import { createStatusUpdater } from '../status/index.js';

const statusUpdater = createStatusUpdater({
  client,
  channel: channelId,
  thread_ts: threadTs,
  traceId: trace.id,
});

// Status updates via unified interface
await statusUpdater.update('Searching...');
// ... on completion or error
await statusUpdater.cleanup();
```

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `src/slack/status/types.ts` | CREATE | Interface and type definitions |
| `src/slack/status/assistant-updater.ts` | CREATE | AssistantStatusUpdater class |
| `src/slack/status/channel-updater.ts` | CREATE | ChannelStatusUpdater class |
| `src/slack/status/index.ts` | CREATE | Factory function + re-exports |
| `src/slack/status/index.test.ts` | CREATE | Unit tests for all components |
| `src/slack/handlers/user-message.ts` | MODIFY | Replace inline status logic |
| `src/slack/handlers/app-mention.ts` | MODIFY | Replace inline status logic |

---

## Test Cases

### Unit Tests (src/slack/status/index.test.ts)

1. **AssistantStatusUpdater**
   - `update()` calls setStatus with loading_messages
   - `cleanup()` calls setStatus with empty string
   - `isActive()` returns true after update, false after cleanup
   - Handles sync and async setStatus callbacks
   - Catches and logs errors without throwing

2. **ChannelStatusUpdater**
   - `update()` posts message on first call
   - `update()` updates existing message on subsequent calls
   - Debounces rapid updates (300ms)
   - `cleanup()` deletes the status message
   - `isActive()` returns true when message exists
   - Catches and logs errors without throwing

3. **Factory**
   - Returns AssistantStatusUpdater when setStatus provided
   - Returns ChannelStatusUpdater when setStatus not provided

### Integration Tests

- Existing handler tests continue to pass
- Status messages appear and disappear correctly in Slack

---

## Dev Notes

### Key Patterns from project-context.md

- **ESM imports:** All imports use `.js` extension
- **Error handling:** Never throw from utility functions, log warnings
- **Logging:** Include `traceId` in all log entries

### Architecture Compliance

From ADR-2026-01-09 in architecture.md (lines 978-1084):
- Interface with `update()`, `cleanup()`, `isActive()`
- AssistantStatusUpdater wraps setStatus
- ChannelStatusUpdater uses post/update/delete with 300ms debounce
- Factory selects based on setStatus presence

### Previous Story Learnings

From Story 7.3 (Contextual Tool Feedback):
- `buildLoadingMessages()` generates status text based on phase/tool
- Status updates should include tool context where available

From Story 3.4 (Channel Tool Feedback):
- 300ms debounce prevents Slack rate limits
- Status message deleted on completion to keep thread clean

---

## Definition of Done

- [x] `src/slack/status/` directory created with all files
- [x] StatusUpdater interface defined with update/cleanup/isActive
- [x] AssistantStatusUpdater wraps setStatus correctly
- [x] ChannelStatusUpdater handles post/update/delete with debounce
- [x] Factory function returns correct implementation
- [x] user-message.ts refactored to use StatusUpdater
- [x] app-mention.ts refactored to use StatusUpdater
- [x] Unit tests cover all components (31 tests)
- [x] All existing tests pass (1511 tests, 2 skipped)
- [x] Build succeeds

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing status behavior | Unit tests for both implementations; integration tests |
| Debounce timing issues | Copy exact 300ms from existing app-mention.ts |
| Type mismatches with Slack SDK | Use `as unknown as` casts where needed (existing pattern) |
| Error swallowing hiding bugs | Debug logging for all caught errors |

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation clean, no debugging required

### Completion Notes List

- Story 7.9 implemented as the final story in Epic 7 (Slack Polish)
- StatusUpdater abstraction provides unified interface for status message handling
- Both handlers (user-message.ts and app-mention.ts) now use createStatusUpdater factory
- 31 unit tests cover both implementations, factory selection, debounce behavior, and error handling
- All 1511 tests pass (2 skipped for unrelated reasons)
- Build succeeds

### File List

**Created:**
- `src/slack/status/types.ts` - StatusUpdater interface, SetStatusFn type, StatusContext interface
- `src/slack/status/assistant-updater.ts` - AssistantStatusUpdater class
- `src/slack/status/channel-updater.ts` - ChannelStatusUpdater class with 300ms debounce
- `src/slack/status/index.ts` - Factory function + re-exports
- `src/slack/status/index.test.ts` - 31 unit tests

**Modified:**
- `src/slack/handlers/user-message.ts` - Replaced safeSetStatus with createStatusUpdater
- `src/slack/handlers/app-mention.ts` - Replaced inline status functions with createStatusUpdater

---

## References

- [Source: _bmad-output/architecture.md#StatusUpdater-Abstraction-Story-7.9]
- [Source: _bmad-output/project-context.md#Tool-Handler-Pattern]
- [Source: src/slack/handlers/user-message.ts - safeSetStatus implementation]
- [Source: src/slack/handlers/app-mention.ts - updateStatusMessage/deleteStatusMessage]
- [Source: src/slack/status-messages.ts - buildLoadingMessages]
