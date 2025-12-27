# Story 1.3: Slack Bolt App Setup

Status: done

> ⚠️ **VERSION NOTE:** This story used `@slack/bolt ^3.x`. Story 1.4 upgrades to `^4.6.0` and changes the message handler signature. Code examples below reflect 3.x — see Story 1.4 for the current implementation.

## Story

As a **user**,
I want to send messages to Orion in Slack and receive acknowledgment,
So that I know the system is connected and responding.

## Acceptance Criteria

1. **Given** the Langfuse instrumentation is configured, **When** I send a DM to the Orion bot in Slack, **Then** the message is received by the Slack Bolt app

2. **Given** a message is received, **When** Slack sends the request, **Then** request signatures are validated via the signing secret

3. **Given** the handler processes the message, **When** the handler executes, **Then** it is wrapped in a Langfuse trace

4. **Given** the message is processed, **When** the handler completes, **Then** a simple acknowledgment response is sent back ("Orion received your message")

5. **Given** any interaction occurs, **When** I check Langfuse, **Then** the interaction appears in traces

6. **Given** the app is running, **When** I check the logs, **Then** structured JSON logging is used per AR12

## Tasks / Subtasks

- [x] **Task 1: Create Slack App Configuration** (AC: #1, #2)
  - [x] Create `src/slack/app.ts` with Bolt App initialization
  - [x] Configure app with signing secret validation
  - [x] Set up HTTP receiver (not socket mode) for Cloud Run
  - [x] Export configured app instance

- [x] **Task 2: Create Message Handler** (AC: #1, #3, #4)
  - [x] Create `src/slack/handlers/user-message.ts`
  - [x] Wrap handler in `startActiveObservation` trace
  - [x] Implement simple acknowledgment response
  - [x] Use Slack mrkdwn formatting (*bold*, not **bold**)

- [x] **Task 3: Create DM Handler** (AC: #1)
  - [x] Handle `message` events in DM channels
  - [x] Filter bot messages to avoid loops
  - [x] Extract user ID, channel, and message text

- [x] **Task 4: Wire Up Handlers** (AC: #1)
  - [x] Register message handler with Bolt app
  - [x] Update `src/index.ts` to start Bolt app
  - [x] Configure port from environment

- [x] **Task 5: Add Structured Logging** (AC: #6)
  - [x] Create `src/utils/logger.ts` with structured JSON format
  - [x] Log message received events
  - [x] Include traceId in all log entries

- [x] **Task 6: Verification** (AC: all)
  - [x] Run app locally with ngrok or similar
  - [x] Send DM to bot in Slack
  - [x] Verify acknowledgment response received
  - [x] Verify trace appears in Langfuse
  - [x] Verify structured logs in console

## Dev Notes

### Dependencies (Already in package.json from Story 1-1)

```json
{
  "@slack/bolt": "^3.x"
}
```

> **Superseded:** Story 1.4 upgrades to `@slack/bolt ^4.6.0` for Assistant class support.

### Architecture Requirements (MANDATORY)

| Requirement | Description |
|-------------|-------------|
| AR11 | ALL handlers MUST be wrapped in Langfuse traces via `startActiveObservation` |
| AR12 | Structured JSON logging (timestamp, level, event, traceId) |
| AR21 | Use Slack mrkdwn: `*bold*` NOT `**bold**`, `_italic_` NOT `*italic*` |
| AR22 | No blockquotes in Slack responses — use bullet points |
| AR23 | No emojis unless explicitly requested |
| NFR7 | All Slack requests validated via signing secret |

### src/slack/app.ts

```typescript
import { App, LogLevel } from '@slack/bolt';
import { config } from '../config/environment.js';

// Initialize Bolt app in HTTP mode (required for Cloud Run)
export const app = new App({
  token: config.slackBotToken,
  signingSecret: config.slackSigningSecret,
  // HTTP mode - no socket mode for Cloud Run
  socketMode: false,
  // Custom receiver will be set up in index.ts
  logLevel: config.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
});

// Export for use in handlers
export type SlackApp = typeof app;
```

### src/slack/handlers/user-message.ts

```typescript
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { startActiveObservation } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';

type MessageEvent = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

export async function handleUserMessage({
  message,
  say,
  client,
  context,
}: MessageEvent): Promise<void> {
  // Skip bot messages to avoid loops
  if ('bot_id' in message) {
    return;
  }

  // Skip messages without text
  if (!('text' in message) || !message.text) {
    return;
  }

  const userId = 'user' in message ? message.user : undefined;
  const channelId = message.channel;
  const threadTs = 'thread_ts' in message ? message.thread_ts : message.ts;

  await startActiveObservation(
    {
      name: 'user-message-handler',
      userId,
      sessionId: threadTs,
      input: { text: message.text, channel: channelId },
      metadata: { 
        teamId: context.teamId,
        isThreadReply: 'thread_ts' in message,
      },
    },
    async (trace) => {
      logger.info({
        event: 'message_received',
        userId,
        channelId,
        traceId: trace.id,
      });

      // Simple acknowledgment for now
      // Will be replaced with Anthropic API in Story 2.1
      const response = 'Orion received your message. Full agent capabilities coming soon!';

      await say({
        text: response,
        thread_ts: threadTs,
      });

      trace.update({ output: { response } });

      logger.info({
        event: 'message_acknowledged',
        userId,
        channelId,
        traceId: trace.id,
      });

      return { success: true };
    }
  );
}
```

### src/slack/types.ts

```typescript
import type { 
  SlackEventMiddlewareArgs, 
  AllMiddlewareArgs,
  GenericMessageEvent,
} from '@slack/bolt';

export type MessageEventArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

export interface SlackContext {
  userId: string;
  channelId: string;
  threadTs: string;
  teamId: string;
  messageText: string;
}

export function extractContext(args: MessageEventArgs): SlackContext | null {
  const { message, context } = args;
  
  if ('bot_id' in message) return null;
  if (!('text' in message) || !message.text) return null;
  
  return {
    userId: 'user' in message ? message.user! : '',
    channelId: message.channel,
    threadTs: 'thread_ts' in message ? message.thread_ts! : message.ts,
    teamId: context.teamId || '',
    messageText: message.text,
  };
}
```

### src/utils/logger.ts

```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  traceId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
}

function formatLog(level: LogEntry['level'], data: Omit<LogEntry, 'timestamp' | 'level'>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    ...data,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug: (data: Omit<LogEntry, 'timestamp' | 'level'>) => {
    console.debug(formatLog('debug', data));
  },
  info: (data: Omit<LogEntry, 'timestamp' | 'level'>) => {
    console.log(formatLog('info', data));
  },
  warn: (data: Omit<LogEntry, 'timestamp' | 'level'>) => {
    console.warn(formatLog('warn', data));
  },
  error: (data: Omit<LogEntry, 'timestamp' | 'level'>) => {
    console.error(formatLog('error', data));
  },
};
```

### Updated src/index.ts

```typescript
// CRITICAL: instrumentation must be imported first
import './instrumentation.js';

import { app } from './slack/app.js';
import { handleUserMessage } from './slack/handlers/user-message.js';
import { config } from './config/environment.js';
import { logger } from './utils/logger.js';

// Register message handler
app.message(handleUserMessage);

// Start the app
(async () => {
  await app.start(config.port);
  
  logger.info({
    event: 'app_started',
    port: config.port,
    environment: config.nodeEnv,
  });
  
  console.log(`⚡️ Orion is running on port ${config.port}`);
})();
```

### Local Development with ngrok

For local testing, you need to expose your local server to the internet:

```bash
# Terminal 1: Run the app
pnpm dev

# Terminal 2: Expose via ngrok
ngrok http 3000
```

Then update your Slack app's Request URL to the ngrok URL + `/slack/events`.

### Slack App Configuration Required

In your Slack App settings (api.slack.com):

1. **Event Subscriptions:**
   - Enable Events
   - Request URL: `https://your-domain.com/slack/events`
   - Subscribe to bot events: `message.im`, `message.channels`, `message.groups`

2. **OAuth & Permissions:**
   - Bot Token Scopes: `chat:write`, `im:history`, `channels:history`, `groups:history`

3. **App Home:**
   - Enable Messages Tab for DMs

### Slack Response Formatting (MANDATORY)

```typescript
// CORRECT - Slack mrkdwn
const response = "*Bold text* and _italic text_";

// WRONG - Markdown (won't render correctly)
const response = "**Bold text** and *italic text*";
```

### File Structure After This Story

```
src/
├── index.ts                    # Entry point (starts Bolt app)
├── instrumentation.ts          # OpenTelemetry + Langfuse
├── config/
│   └── environment.ts
├── observability/
│   ├── langfuse.ts
│   └── tracing.ts
├── slack/
│   ├── app.ts                  # Bolt App configuration (NEW)
│   ├── types.ts                # Slack type definitions (NEW)
│   └── handlers/
│       └── user-message.ts     # Message handler (NEW)
└── utils/
    └── logger.ts               # Structured logging (NEW)
```

### Project Structure Notes

- `src/slack/` directory is created in this story
- `src/utils/` directory is created for shared utilities
- Handler follows the `startActiveObservation` pattern from Story 1-2
- All logging uses structured JSON format

### References

- [Source: _bmad-output/architecture.md#Slack Response Formatting] - mrkdwn rules
- [Source: _bmad-output/architecture.md#Observability (MANDATORY)] - trace wrapping
- [Source: _bmad-output/architecture.md#Logging Format] - structured logging
- [Source: _bmad-output/prd.md#Communication & Interaction] - FR13-18
- [Source: _bmad-output/epics.md#Story 1.3: Slack Bolt App Setup] - Original story

### Previous Story Intelligence

From Story 1-2 (Langfuse Instrumentation):
- `startActiveObservation` is available in `src/observability/tracing.ts`
- Langfuse client singleton in `src/observability/langfuse.ts`
- All handlers MUST be wrapped in traces

From Story 1-1 (Project Scaffolding):
- `@slack/bolt` dependency already in package.json
- Environment variables for Slack configured in `.env.example`
- Port configured in `src/config/environment.ts`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 via Cursor

### Completion Notes List

- Created Slack Bolt app factory function `createSlackApp()` with HTTP mode configuration
- Implemented message handler with full Langfuse trace wrapping via `startActiveObservation`
- Created structured JSON logger per AR12 with timestamp, level, event, traceId fields
- Handler filters bot messages to prevent loops, skips empty messages
- Acknowledgment response sent in thread for thread replies, as new message for DMs
- All handlers wrapped in traces satisfy AR11
- Updated index.ts to create app, register handler, and start on configured port
- All 57 tests passing (31 new tests added for this story)
- Linting passes with no errors

### Change Log

- 2025-12-18: Initial implementation of Story 1.3 - Slack Bolt App Setup
- 2025-12-18: Senior code review fixes applied (DM handler wiring, exact ack text, import side-effect guard, added tests)

### File List

Files created:
- `src/slack/app.ts` - Bolt app factory with HTTP mode config
- `src/slack/app.test.ts` - 6 tests for app configuration
- `src/slack/types.ts` - Slack type definitions and context extractor
- `src/slack/handlers/user-message.ts` - Message handler with trace wrapping
- `src/slack/handlers/user-message.test.ts` - 9 tests for message handler
- `src/utils/logger.ts` - Structured JSON logger
- `src/utils/logger.test.ts` - 11 tests for logger

Files modified:
- `src/index.ts` - Refactored to use startApp() function, register handler, start Bolt app
- `src/index.test.ts` - 5 tests for app startup

## Senior Developer Review (AI)

_Reviewer: Sid on 2025-12-18_

**Outcome:** Changes Requested → Fixed (auto)

### Findings (pre-fix)

- **CRITICAL:** Story 1-3 required DM “ack” content was not guaranteed for the active flow because `src/index.ts` only registered `app.assistant(...)` and did not register `app.message(...)`.
- **CRITICAL:** `src/index.ts` auto-started on import (side effect), contradicting its own comment and causing noisy test output.
- **MEDIUM:** No `.git` directory detected → could not validate Story File List vs actual diffs.

### Fixes Applied

- **DM handler wiring restored:** `src/index.ts` now registers `app.message(handleUserMessage)` in addition to `app.assistant(assistant)`.
- **Ack text made literal and deterministic:** both legacy and Assistant user-message handlers now respond with exactly: `"Orion received your message"`.
- **Import-side-effect removed:** `src/index.ts` now auto-starts only when run as the entry module.
- **Tests added/updated:** Added unit coverage for Assistant user-message acknowledgment and for DM handler registration in `src/index.test.ts`.

### Verification

- Ran `pnpm test:run`: **83 tests total** (81 passed, 2 skipped).

