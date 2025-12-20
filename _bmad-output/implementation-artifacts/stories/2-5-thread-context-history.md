# Story 2.5: Thread Context & History

Status: done

## Story

As a **user**,
I want Orion to remember what we discussed earlier in the thread,
So that I don't have to repeat context.

## Acceptance Criteria

1. **Given** a conversation is happening in a Slack thread, **When** the user sends a follow-up message, **Then** thread history is fetched from Slack API

2. **Given** thread history is fetched, **When** context is prepared, **Then** the full thread context is passed to Claude

3. **Given** thread context is available, **When** Orion responds, **Then** Orion references previous messages appropriately

4. **Given** a conversation is in progress, **When** context is managed, **Then** thread context is maintained correctly (FR15)

5. **Given** a user contacts Orion, **When** via @mention or DM, **Then** @mentions and DMs are both handled (FR17)

## Tasks / Subtasks

- [x] **Task 1: Create Thread Context Fetcher** (AC: #1) ✅ *Completed in Epic 1*
  - [x] Create `src/slack/thread-context.ts`
  - [x] Implement `fetchThreadHistory()` function
  - [x] Use `conversations.replies` API
  - [x] Handle pagination for long threads
  - [x] Parse message content and metadata
  - [x] Added token limit handling (maxTokens parameter)

- [x] **Task 2: Build Thread Context Format** (AC: #2) ✅ *Completed in Epic 1*
  - [x] Create `formatThreadHistoryForContext()` function
  - [x] Include sender info (user/bot via isBot flag)
  - [x] Format for LLM consumption (Role: message format)

- [x] **Task 3: Integrate with Agent Loop** (AC: #2, #3)
  - [x] Pass thread context to gather phase
  - [x] Include context in system prompt
  - [x] Enable agent to reference previous messages

- [x] **Task 4: Handle @Mentions** (AC: #5)
  - [x] Listen for `app_mention` event in Slack Bolt (distinct from `message` events)
  - [x] Extract Orion mention and query text (remove `<@BOT_USER_ID>` prefix)
  - [x] Fetch surrounding thread context using `thread_ts` from event payload
  - [x] Respond in thread using `event.thread_ts || event.ts` as thread parent

- [x] **Task 5: Handle DMs** (AC: #5)
  - [x] Listen for `message` events where `event.channel_type === 'im'`
  - [x] DMs create implicit threads—use channel+ts as thread identifier
  - [x] Maintain DM thread context (no `thread_ts` needed, use channel history)

- [x] **Task 6: Verification** (AC: all)
  - [x] Send multi-message conversation
  - [x] Verify Orion references previous messages
  - [x] Test @mention in channel
  - [x] Test DM conversation

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR15 | prd.md | System maintains conversation context within Slack threads |
| FR17 | prd.md | System responds to @mentions and direct messages |
| AR29 | architecture.md | Slack API fetch for thread context (stateless Cloud Run) |

### src/slack/thread-context.ts

```typescript
import type { WebClient } from '@slack/web-api';

interface ThreadMessage {
  user: string;
  text: string;
  ts: string;
  isBot: boolean;
}

interface FetchThreadHistoryOptions {
  client: WebClient;
  channel: string;
  threadTs: string;
  limit?: number;
}

export async function fetchThreadHistory(
  options: FetchThreadHistoryOptions
): Promise<ThreadMessage[]> {
  const { client, channel, threadTs, limit = 50 } = options;
  
  const result = await client.conversations.replies({
    channel,
    ts: threadTs,
    limit,
  });

  if (!result.messages) {
    return [];
  }

  return result.messages.map(msg => ({
    user: msg.user || 'unknown',
    text: msg.text || '',
    ts: msg.ts || '',
    isBot: Boolean(msg.bot_id),
  }));
}

export function formatThreadContext(messages: ThreadMessage[]): string {
  return messages
    .map(msg => {
      const role = msg.isBot ? 'Orion' : 'User';
      return `[${role}]: ${msg.text}`;
    })
    .join('\n');
}
```

### Thread Context in System Prompt

```typescript
const systemPrompt = `
${baseSystemPrompt}

## Current Conversation Context

${formatThreadContext(threadHistory)}

When responding, you may reference previous messages in this thread.
Use phrases like "As I mentioned earlier..." or "Building on what you said about..."
`;
```

### Slack Event Handling (@Mentions vs DMs)

```typescript
import { App } from '@slack/bolt';

// @mentions in channels - fires when someone @mentions the bot
app.event('app_mention', async ({ event, client }) => {
  // event.channel = channel ID
  // event.thread_ts = parent thread (if in thread) OR undefined (if in channel)
  // event.ts = this message's timestamp
  // event.text = "<@U123ABC> what is X?" - includes mention
  
  const query = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const threadTs = event.thread_ts || event.ts; // Reply in thread
  
  await handleOrionMessage({ 
    channel: event.channel, 
    threadTs, 
    query, 
    userId: event.user 
  });
});

// DMs - fires for direct messages to the bot
app.message(async ({ event, message, client }) => {
  // Only handle DMs (channel type 'im')
  if (event.channel_type !== 'im') return;
  
  // In DMs, there's no @mention prefix
  // Thread context is implicit - use conversation history
  const query = (message as any).text || '';
  
  await handleOrionMessage({ 
    channel: event.channel, 
    threadTs: event.ts, // Each DM can be treated as its own thread
    query, 
    userId: event.user 
  });
});
```

### References

- [Source: _bmad-output/epics.md#Story 2.5] — Original story
- [Source: Slack API - conversations.replies](https://api.slack.com/methods/conversations.replies)
- [Source: Slack Bolt - Listening to events](https://slack.dev/bolt-js/concepts#event-listening)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **PARTIAL IMPLEMENTATION**: Tasks 1-2 already completed in Epic 1 (Story 1.5)
- Existing implementation includes pagination and token limit handling
- Thread history limited to 20 messages (THREAD_HISTORY_LIMIT constant)
- DMs create implicit threads in Slack
- ✅ Task 3: Enhanced `buildContextString()` in loop.ts to include "reference previous messages" instructions
- ✅ Task 4: Created `handleAppMention` handler for @mention events with full thread context
- ✅ Task 5: Enhanced `handleUserMessage` to fetch DM conversation history
- ✅ Task 6: Added 5 new tests for thread context, 10 tests for @mentions, 4 tests for DMs
- ✅ Full test suite: 331 passed, 2 skipped, 0 regressions

### File List

Files already created (in Epic 1):
- `src/slack/thread-context.ts` ✅

Files created:
- `src/slack/handlers/app-mention.ts` - Handler for @mention events
- `src/slack/handlers/app-mention.test.ts` - 10 tests for @mention handling

Files modified:
- `src/slack/handlers/user-message.ts` - Added DM context fetching with fetchThreadHistory
- `src/slack/handlers/user-message.test.ts` - Added 4 DM handling tests
- `src/agent/loop.ts` - Enhanced buildContextString() with "reference previous messages" instruction
- `src/agent/loop.test.ts` - Added 5 thread context integration tests
- `src/index.ts` - Registered app_mention event handler
- `src/index.test.ts` - Added mock for app.event() and test for @mention registration

### Change Log

- 2025-12-18: Implemented Story 2.5 - Thread Context & History
  - Task 3: Enhanced loop.ts buildContextString() to include referencing instructions
  - Task 4: Created app-mention.ts handler for @mentions in channels
  - Task 5: Enhanced user-message.ts to fetch DM conversation history
  - Task 6: Added comprehensive tests (5 thread context, 10 @mention, 4 DM tests)

- 2025-12-18: Code Review Fixes (4 MEDIUM, 3 LOW issues resolved)
  - M1: Removed dead code (unused `formattedHistory` variable and import) in app-mention.ts
  - M2: Created shared `THREAD_HISTORY_LIMIT` constant in thread-context.ts (was inconsistent 20 vs 100)
  - M3: Created `formatThreadHistoryForAgent()` shared formatter to eliminate duplicate map logic
  - M4: Added 2 tests for DM thread_ts fallback logic in user-message.test.ts
  - L2: Replaced magic number 20 with THREAD_HISTORY_LIMIT constant
  - L3: Updated threadHistory type to use exported ThreadMessage interface
  - Full test suite: 339 passed (+2 new tests), 2 skipped

