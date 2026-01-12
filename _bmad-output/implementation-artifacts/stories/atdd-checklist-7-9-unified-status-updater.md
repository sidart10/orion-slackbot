# ATDD Checklist: 7-9-unified-status-updater

## Story Summary

**As a** developer maintaining Orion's codebase,
**I want** a unified StatusUpdater abstraction for status message handling,
**So that** both handlers (user-message and app-mention) share consistent status logic.

---

## AC1: StatusUpdater Interface

### Happy Path
- [ ] Test: Interface exports correctly from types.ts
  - Given: `src/slack/status/types.ts` exists
  - When: Importing `StatusUpdater`, `StatusContext`, `SetStatusFn` types
  - Then: All types are properly exported and usable

- [ ] Test: StatusUpdater interface has required methods
  - Given: StatusUpdater interface definition
  - When: Creating a class that implements StatusUpdater
  - Then: TypeScript requires `update(status: string): Promise<void>`, `cleanup(): Promise<void>`, `isActive(): boolean`

- [ ] Test: StatusContext includes all required fields
  - Given: StatusContext type definition
  - When: Creating a StatusContext object
  - Then: Requires `client: WebClient`, `channel: string`, `thread_ts: string`
  - And: Optionally accepts `setStatus?: SetStatusFn`, `traceId?: string`

### Edge Cases
- [ ] Test: StatusContext with minimal required fields
  - Given: StatusContext with only `client`, `channel`, `thread_ts`
  - When: Passed to factory function
  - Then: Successfully creates a ChannelStatusUpdater (no setStatus = channel mode)

### Type Safety
- [ ] Test: SetStatusFn type matches Slack Assistant API
  - Given: SetStatusFn type definition
  - When: Calling with `{ status: string, loading_messages?: string[] }`
  - Then: Type signature matches expected callback shape

---

## AC2: AssistantStatusUpdater Implementation

### Happy Path
- [ ] Test: update() calls setStatus with loading_messages
  - Given: AssistantStatusUpdater with mock setStatus callback
  - When: Calling `update('Searching...')`
  - Then: setStatus called with `{ status: 'working...', loading_messages: ['Searching...'] }`
  - And: `isActive()` returns true

- [ ] Test: cleanup() calls setStatus with empty string
  - Given: AssistantStatusUpdater that has called `update()` at least once
  - When: Calling `cleanup()`
  - Then: setStatus called with `{ status: '' }`
  - And: `isActive()` returns false

- [ ] Test: isActive() returns correct state
  - Given: New AssistantStatusUpdater instance
  - When: Checking `isActive()` before any calls
  - Then: Returns false
  - When: After `update('status')` call
  - Then: Returns true
  - When: After `cleanup()` call
  - Then: Returns false

- [ ] Test: Handles sync setStatus callback
  - Given: AssistantStatusUpdater with synchronous setStatus (returns void)
  - When: Calling `update('status')`
  - Then: Completes without error

- [ ] Test: Handles async setStatus callback
  - Given: AssistantStatusUpdater with async setStatus (returns Promise)
  - When: Calling `update('status')`
  - Then: Awaits the Promise and completes

### Edge Cases
- [ ] Test: cleanup() without prior update() is no-op
  - Given: New AssistantStatusUpdater (never called update)
  - When: Calling `cleanup()`
  - Then: setStatus is NOT called
  - And: No error thrown

- [ ] Test: Multiple update() calls work correctly
  - Given: AssistantStatusUpdater instance
  - When: Calling `update('Status 1')` then `update('Status 2')`
  - Then: setStatus called twice with respective messages
  - And: `isActive()` remains true

### Error Handling
- [ ] Test: update() catches and logs errors without throwing
  - Given: AssistantStatusUpdater with setStatus that throws
  - When: Calling `update('status')`
  - Then: Does not throw exception
  - And: logger.warn called with `{ event: 'status_update_failed', updater: 'assistant' }`

- [ ] Test: cleanup() catches and logs errors without throwing
  - Given: AssistantStatusUpdater with setStatus that throws on empty string
  - When: Calling `cleanup()` after `update()`
  - Then: Does not throw exception
  - And: logger.warn called with `{ event: 'status_cleanup_failed', updater: 'assistant' }`

- [ ] Test: Error logging includes traceId
  - Given: AssistantStatusUpdater with traceId='trace-123' and failing setStatus
  - When: Error occurs during update/cleanup
  - Then: Log entry includes `traceId: 'trace-123'`

---

## AC3: ChannelStatusUpdater Implementation

### Happy Path
- [ ] Test: update() posts message on first call
  - Given: ChannelStatusUpdater with mock WebClient
  - When: Calling `update('Searching...')` for the first time
  - Then: `client.chat.postMessage()` called with `{ channel, thread_ts, text: 'Searching...' }`
  - And: messageTs stored internally from response.ts

- [ ] Test: update() updates existing message on subsequent calls
  - Given: ChannelStatusUpdater that has already posted a message (messageTs exists)
  - When: Calling `update('Processing...')` after 300ms
  - Then: `client.chat.update()` called with `{ channel, ts: messageTs, text: 'Processing...' }`

- [ ] Test: cleanup() deletes the status message
  - Given: ChannelStatusUpdater with active status message (messageTs exists)
  - When: Calling `cleanup()`
  - Then: `client.chat.delete()` called with `{ channel, ts: messageTs }`
  - And: `isActive()` returns false

- [ ] Test: isActive() reflects message existence
  - Given: New ChannelStatusUpdater
  - When: Before any calls
  - Then: `isActive()` returns false
  - When: After `update()` call
  - Then: `isActive()` returns true
  - When: After `cleanup()` call
  - Then: `isActive()` returns false

### Edge Cases
- [ ] Test: Debounces rapid updates (300ms)
  - Given: ChannelStatusUpdater with posted message
  - When: Calling `update('Status 1')` then immediately `update('Status 2')` (within 300ms)
  - Then: Only first `chat.update()` call is made
  - And: Second call is debounced (skipped)

- [ ] Test: Updates allowed after debounce period
  - Given: ChannelStatusUpdater with posted message
  - When: Calling `update('Status 1')`, waiting 300ms, then `update('Status 2')`
  - Then: Both `chat.update()` calls are made

- [ ] Test: cleanup() without prior update() is no-op
  - Given: New ChannelStatusUpdater (never posted message)
  - When: Calling `cleanup()`
  - Then: `client.chat.delete()` is NOT called
  - And: No error thrown

- [ ] Test: First update is not debounced
  - Given: New ChannelStatusUpdater
  - When: Calling `update('First status')`
  - Then: `client.chat.postMessage()` called immediately (no debounce)

### Error Handling
- [ ] Test: update() catches postMessage errors without throwing
  - Given: ChannelStatusUpdater with client.chat.postMessage that rejects
  - When: Calling `update('status')`
  - Then: Does not throw exception
  - And: logger.debug called with `{ event: 'status_update_failed', updater: 'channel' }`

- [ ] Test: cleanup() catches delete errors without throwing
  - Given: ChannelStatusUpdater with client.chat.delete that rejects
  - When: Calling `cleanup()`
  - Then: Does not throw exception
  - And: logger.debug called with `{ event: 'status_cleanup_failed', updater: 'channel' }`

- [ ] Test: Error logging includes traceId
  - Given: ChannelStatusUpdater with traceId='trace-456' and failing client
  - When: Error occurs during update/cleanup
  - Then: Log entry includes `traceId: 'trace-456'`

### Boundary Conditions
- [ ] Test: Handles 429 rate limit gracefully
  - Given: ChannelStatusUpdater with client that returns 429 error
  - When: Calling `update('status')`
  - Then: Does not throw, logs the error
  - And: Debounce mechanism helps prevent future rate limits

---

## AC4: Factory Function

### Happy Path
- [ ] Test: Returns AssistantStatusUpdater when setStatus provided
  - Given: StatusContext with `setStatus` function defined
  - When: Calling `createStatusUpdater(context)`
  - Then: Returns instance of AssistantStatusUpdater
  - And: Instance correctly wraps the provided setStatus

- [ ] Test: Returns ChannelStatusUpdater when setStatus not provided
  - Given: StatusContext without `setStatus` (undefined)
  - When: Calling `createStatusUpdater(context)`
  - Then: Returns instance of ChannelStatusUpdater
  - And: Instance configured with client, channel, thread_ts

- [ ] Test: Factory is synchronous (no async initialization)
  - Given: StatusContext
  - When: Calling `createStatusUpdater(context)`
  - Then: Returns StatusUpdater immediately (not a Promise)

### Edge Cases
- [ ] Test: Passes traceId to AssistantStatusUpdater
  - Given: StatusContext with `setStatus` and `traceId: 'trace-789'`
  - When: Calling `createStatusUpdater(context)`
  - Then: AssistantStatusUpdater has traceId for error logging

- [ ] Test: Passes traceId to ChannelStatusUpdater
  - Given: StatusContext without `setStatus` but with `traceId: 'trace-789'`
  - When: Calling `createStatusUpdater(context)`
  - Then: ChannelStatusUpdater has traceId for error logging

### Type Safety
- [ ] Test: Factory return type is StatusUpdater interface
  - Given: Any StatusContext
  - When: Calling `createStatusUpdater(context)`
  - Then: Return type is `StatusUpdater` (interface, not concrete class)
  - And: Can call `update()`, `cleanup()`, `isActive()` without type errors

---

## AC5: Refactor user-message.ts

### Happy Path
- [ ] Test: Handler uses StatusUpdater for initial status
  - Given: user-message handler with setStatus callback
  - When: Processing a message
  - Then: `statusUpdater.update()` called (not raw `setStatus()`)

- [ ] Test: Handler calls cleanup on success
  - Given: user-message handler completing successfully
  - When: Response streaming finishes
  - Then: `statusUpdater.cleanup()` called after `streamer.stop()`

- [ ] Test: Handler calls cleanup on error
  - Given: user-message handler that encounters an error
  - When: Error occurs during processing
  - Then: `statusUpdater.cleanup()` called in catch block

### Integration
- [ ] Test: No safeSetStatus function in handler
  - Given: Refactored user-message.ts
  - When: Searching for `safeSetStatus` in file
  - Then: Function definition not found (removed)

- [ ] Test: Import statement correct
  - Given: Refactored user-message.ts
  - When: Checking imports
  - Then: Contains `import { createStatusUpdater } from '../status/index.js'`

### Backward Compatibility
- [ ] Test: Status updates still appear in Assistant DM threads
  - Given: User sends message in Assistant DM
  - When: Handler processes with StatusUpdater
  - Then: Status messages appear identically to before refactor

- [ ] Test: Existing handler tests pass
  - Given: Existing user-message.test.ts tests
  - When: Running `pnpm test src/slack/handlers/user-message.test.ts`
  - Then: All tests pass

---

## AC6: Refactor app-mention.ts

### Happy Path
- [ ] Test: Handler uses StatusUpdater for status messages
  - Given: app-mention handler without setStatus (channel context)
  - When: Processing an @mention
  - Then: `statusUpdater.update()` called (not raw `chat.postMessage`)

- [ ] Test: Handler calls cleanup on success
  - Given: app-mention handler completing successfully
  - When: Response finishes
  - Then: `statusUpdater.cleanup()` called to delete status message

- [ ] Test: Handler calls cleanup on error
  - Given: app-mention handler that encounters an error
  - When: Error occurs during processing
  - Then: `statusUpdater.cleanup()` called to delete status message

### Integration
- [ ] Test: No inline status functions in handler
  - Given: Refactored app-mention.ts
  - When: Searching for `updateStatusMessage` or `deleteStatusMessage`
  - Then: Function definitions not found (removed)

- [ ] Test: No status tracking variables
  - Given: Refactored app-mention.ts
  - When: Searching for `statusMessageTs` or `lastStatusUpdate`
  - Then: Variable declarations not found (removed)

- [ ] Test: Import statement correct
  - Given: Refactored app-mention.ts
  - When: Checking imports
  - Then: Contains `import { createStatusUpdater } from '../status/index.js'`

### Backward Compatibility
- [ ] Test: Status updates still appear in channel threads
  - Given: User @mentions bot in channel
  - When: Handler processes with StatusUpdater
  - Then: Status messages post/update/delete correctly

- [ ] Test: Debouncing still works for rapid tool calls
  - Given: Handler making multiple rapid status updates
  - When: Updates happen within 300ms
  - Then: Slack rate limits not triggered (debounce working)

- [ ] Test: Existing handler tests pass
  - Given: Existing app-mention.test.ts tests
  - When: Running `pnpm test src/slack/handlers/app-mention.test.ts`
  - Then: All tests pass

---

## AC7: Unit Tests

### Test File Structure
- [ ] Test: Test file created at correct location
  - Given: Story requirements
  - When: Creating test file
  - Then: File exists at `src/slack/status/index.test.ts`

### AssistantStatusUpdater Tests
- [ ] Test: update() calls setStatus correctly
  - Vitest mock verifies setStatus called with `{ status: 'working...', loading_messages: [...] }`

- [ ] Test: cleanup() calls setStatus with empty string
  - Vitest mock verifies setStatus called with `{ status: '' }`

- [ ] Test: isActive() state transitions
  - Unit test verifies: false -> true (after update) -> false (after cleanup)

- [ ] Test: Handles both sync and async setStatus
  - Two test cases: one with sync callback, one with Promise-returning callback

- [ ] Test: Catches and logs errors without throwing
  - Mock setStatus to throw, verify no exception and logger.warn called

### ChannelStatusUpdater Tests
- [ ] Test: update() posts message on first call
  - Vitest mock verifies `client.chat.postMessage()` called once

- [ ] Test: update() updates existing message on subsequent calls
  - Vitest mock verifies `client.chat.update()` called with stored messageTs

- [ ] Test: cleanup() deletes message
  - Vitest mock verifies `client.chat.delete()` called with messageTs

- [ ] Test: Debounce coalesces rapid calls
  - Using fake timers, verify only one update within 300ms window

- [ ] Test: Catches and logs errors without throwing
  - Mock client methods to reject, verify no exception and logger.debug called

### Factory Tests
- [ ] Test: Selects AssistantStatusUpdater when setStatus present
  - Factory returns instance that wraps setStatus correctly

- [ ] Test: Selects ChannelStatusUpdater when setStatus absent
  - Factory returns instance that uses WebClient correctly

### Test Coverage
- [ ] Test: All tests pass
  - Running `pnpm test src/slack/status/` passes
  - Minimum 8 distinct test cases as specified in story

---

## AC8: Existing Tests Pass

### Handler Test Suites
- [ ] Test: user-message.test.ts passes
  - Running `pnpm test src/slack/handlers/user-message.test.ts` passes

- [ ] Test: app-mention.test.ts passes
  - Running `pnpm test src/slack/handlers/app-mention.test.ts` passes

### Full Test Suite
- [ ] Test: All slack handler tests pass
  - Running `pnpm test src/slack/handlers/` passes with no failures

### Regression Check
- [ ] Test: No regression in status behavior
  - Manual verification: status messages appear correctly in both DM and channel contexts

---

## Test Data & Fixtures

### Mock WebClient
```typescript
const mockWebClient = {
  chat: {
    postMessage: vi.fn().mockResolvedValue({ ts: '123.456' }),
    update: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  },
} as unknown as WebClient;
```

### Mock setStatus (Sync)
```typescript
const mockSetStatusSync = vi.fn();
```

### Mock setStatus (Async)
```typescript
const mockSetStatusAsync = vi.fn().mockResolvedValue(undefined);
```

### Sample StatusContext (Assistant)
```typescript
const assistantContext: StatusContext = {
  setStatus: mockSetStatusAsync,
  client: mockWebClient,
  channel: 'D123456',
  thread_ts: '1234567890.123456',
  traceId: 'trace-test-001',
};
```

### Sample StatusContext (Channel)
```typescript
const channelContext: StatusContext = {
  client: mockWebClient,
  channel: 'C123456',
  thread_ts: '1234567890.123456',
  traceId: 'trace-test-002',
};
```

---

## Notes

### Debounce Testing
For debounce tests, use Vitest's fake timers:
```typescript
vi.useFakeTimers();
await updater.update('Status 1');
vi.advanceTimersByTime(100); // Within debounce
await updater.update('Status 2'); // Should be skipped
vi.advanceTimersByTime(300); // Past debounce
await updater.update('Status 3'); // Should go through
vi.useRealTimers();
```

### Error Handling Pattern
All error handling tests should verify:
1. No exception thrown
2. Logger called with correct event name
3. Logger called with traceId (if provided)
4. Operation appears to succeed from caller's perspective

### ESM Import Convention
All imports in test files must use `.js` extension per project-context.md:
```typescript
import { createStatusUpdater } from './index.js';
import type { StatusUpdater, StatusContext } from './types.js';
```

---

## Coverage Mapping

| AC | Happy Path | Edge Cases | Error Handling | Total Tests |
|----|------------|------------|----------------|-------------|
| AC1 | 3 | 1 | 1 | 5 |
| AC2 | 5 | 2 | 3 | 10 |
| AC3 | 4 | 4 | 4 | 12 |
| AC4 | 3 | 2 | 1 | 6 |
| AC5 | 3 | 2 | 2 | 7 |
| AC6 | 3 | 3 | 2 | 8 |
| AC7 | 11 | 0 | 0 | 11 |
| AC8 | 4 | 0 | 0 | 4 |
| **Total** | **36** | **14** | **13** | **63** |
