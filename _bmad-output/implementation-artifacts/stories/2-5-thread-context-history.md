# Story 2.5: Thread Context & History

Status: ready-for-dev

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

- [ ] **Task 1: Create Thread Context Fetcher** (AC: #1)
  - [ ] Create `src/slack/thread-context.ts`
  - [ ] Implement `fetchThreadHistory()` function
  - [ ] Use `conversations.replies` API
  - [ ] Handle pagination for long threads
  - [ ] Parse message content and metadata

- [ ] **Task 2: Build Thread Context Format** (AC: #2)
  - [ ] Create `formatThreadContext()` function
  - [ ] Include sender info (user/bot)
  - [ ] Include timestamps
  - [ ] Format for LLM consumption

- [ ] **Task 3: Integrate with Agent Loop** (AC: #2, #3)
  - [ ] Pass thread context to gather phase
  - [ ] Include context in system prompt
  - [ ] Enable agent to reference previous messages

- [ ] **Task 4: Handle @Mentions** (AC: #5)
  - [ ] Listen for `app_mention` event in Slack Bolt (distinct from `message` events)
  - [ ] Extract Orion mention and query text (remove `<@BOT_USER_ID>` prefix)
  - [ ] Fetch surrounding thread context using `thread_ts` from event payload
  - [ ] Respond in thread using `event.thread_ts || event.ts` as thread parent

- [ ] **Task 5: Handle DMs** (AC: #5)
  - [ ] Listen for `message` events where `event.channel_type === 'im'`
  - [ ] DMs create implicit threads—use channel+ts as thread identifier
  - [ ] Maintain DM thread context (no `thread_ts` needed, use channel history)

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Send multi-message conversation
  - [ ] Verify Orion references previous messages
  - [ ] Test @mention in channel
  - [ ] Test DM conversation

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

Claude Opus 4

### Completion Notes List

- Thread history should be limited to avoid context overflow
- Consider caching recent thread history for performance
- DMs create implicit threads in Slack

### File List

Files to create:
- `src/slack/thread-context.ts`

Files to modify:
- `src/slack/handlers/user-message.ts`
- `src/agent/loop.ts`

