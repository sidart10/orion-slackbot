# Story 7.2: Thread Summarization on Demand

Status: ready-for-dev

## Story

As a **user**,
I want to ask Orion to summarize any Slack thread,
So that I can quickly catch up on long conversations without reading every message.

## Acceptance Criteria

1. **Given** a user asks Orion to summarize a thread, **When** the thread is specified (via link or context), **Then** Orion fetches the thread history and generates a structured summary

2. **Given** Orion is summarizing a thread, **When** the thread has many messages, **Then** the summary highlights key decisions, action items, and participants

3. **Given** a summary is generated, **When** the response is sent, **Then** the summary follows the Research Response pattern (UX spec)

4. **Given** the user is in a thread with Orion, **When** they ask "summarize this", **Then** Orion summarizes the current thread context

5. **Given** summarization is performed, **When** logging occurs, **Then** the summarization task is traced in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Summarization Module** (AC: #1, #2)
  - [ ] Create `src/agent/skills/summarize-thread.ts`
  - [ ] Implement `summarizeThread()` function
  - [ ] Accept thread URL or channel+ts identifier
  - [ ] Fetch full thread history via Slack API

- [ ] **Task 2: Implement Summary Generation** (AC: #2)
  - [ ] Build prompt for Claude that extracts:
    - Key decisions made
    - Action items and owners
    - Main topics discussed
    - Unresolved questions
  - [ ] Format output as structured summary

- [ ] **Task 3: Parse Thread References** (AC: #1, #4)
  - [ ] Create `parseThreadReference()` function
  - [ ] Handle formats:
    - Slack thread URL
    - "this thread" / "this conversation"
    - Channel + timestamp reference
  - [ ] Extract channel ID and thread_ts

- [ ] **Task 4: Format Summary Response** (AC: #3)
  - [ ] Use Research Response pattern from UX spec
  - [ ] Structure:
    ```
    🔍 Summarized [N] messages from #channel

    ## Summary
    [Key takeaway]

    ### Key Decisions
    • Decision 1
    • Decision 2

    ### Action Items
    • @person: Task description

    ### Topics Discussed
    • Topic 1
    • Topic 2
    ```

- [ ] **Task 5: Integrate with Agent Loop** (AC: #1)
  - [ ] Detect summarization intent in user message
  - [ ] Route to summarization skill
  - [ ] Return summary through normal response flow

- [ ] **Task 6: Add Langfuse Tracing** (AC: #5)
  - [ ] Create span for summarization task
  - [ ] Log thread length, summary length
  - [ ] Track summarization latency

- [ ] **Task 7: Verification** (AC: all)
  - [ ] Send "summarize this thread" in conversation
  - [ ] Verify summary generated with structure
  - [ ] Send thread URL, verify external thread summarized
  - [ ] Check Langfuse for summarization spans
  - [ ] Verify summary includes decisions/action items

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR18 | prd.md | System can summarize Slack threads on request |
| FR42 | prd.md | System supports Summarization workflow |
| UX Spec | ux-design-specification.md | Use Research Response pattern |

### Summarization Prompt

```typescript
const SUMMARIZATION_PROMPT = `
You are summarizing a Slack thread. Analyze the conversation and extract:

1. **Key Decisions**: Any decisions made by participants
2. **Action Items**: Tasks assigned with owners (format: @person: task)
3. **Main Topics**: The primary subjects discussed
4. **Unresolved Questions**: Open questions that weren't answered

Format your response as:

## Summary
[One paragraph overview of the conversation]

### Key Decisions
• [Decision 1]
• [Decision 2]

### Action Items
• @[person]: [Task description]

### Topics Discussed
• [Topic 1]
• [Topic 2]

### Unresolved Questions
• [Question 1]

If a section has no items, omit it.
`;
```

### Thread URL Parsing

```typescript
/**
 * Parse Slack thread URL to extract channel and timestamp
 * URL format: https://workspace.slack.com/archives/C123456/p1234567890123456
 */
export function parseSlackThreadUrl(url: string): { channel: string; ts: string } | null {
  const match = url.match(/archives\/([A-Z0-9]+)\/p(\d+)/);
  if (!match) return null;

  const channel = match[1];
  // Convert p-format timestamp to Slack ts format (add decimal)
  const rawTs = match[2];
  const ts = `${rawTs.slice(0, 10)}.${rawTs.slice(10)}`;

  return { channel, ts };
}

/**
 * Detect if user is asking to summarize current thread
 */
export function isCurrentThreadRequest(message: string): boolean {
  const patterns = [
    /summarize (this|the) (thread|conversation)/i,
    /^summarize$/i,
    /what('s| is| was) (this|the) (thread|conversation) about/i,
    /catch me up/i,
    /tldr/i,
  ];
  return patterns.some(p => p.test(message));
}
```

### src/agent/skills/summarize-thread.ts

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { fetchThreadHistory } from '../../slack/thread-context.js';
import { createSpan } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';

const anthropic = new Anthropic();

export interface SummarizeOptions {
  channel: string;
  threadTs: string;
  client: WebClient;
  traceId?: string;
  parentTrace?: any;
}

export interface ThreadSummary {
  summary: string;
  messageCount: number;
  participants: string[];
  decisions: string[];
  actionItems: string[];
  topics: string[];
}

/**
 * Summarize a Slack thread
 */
export async function summarizeThread(options: SummarizeOptions): Promise<ThreadSummary> {
  const { channel, threadTs, client, parentTrace } = options;

  const span = parentTrace ? createSpan(parentTrace, {
    name: 'summarize-thread',
    input: { channel, threadTs },
  }) : null;

  try {
    // Fetch thread history
    const messages = await fetchThreadHistory({
      client,
      channel,
      threadTs,
      limit: 100, // Get up to 100 messages
    });

    logger.info({
      event: 'thread_fetched_for_summary',
      messageCount: messages.length,
      channel,
    });

    // Extract unique participants
    const participants = [...new Set(messages.map(m => m.user))];

    // Format messages for Claude
    const formattedThread = messages
      .map(m => `[${m.isBot ? 'Bot' : m.user}]: ${m.text}`)
      .join('\n\n');

    // Generate summary
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SUMMARIZATION_PROMPT,
      messages: [
        { role: 'user', content: `Summarize this Slack thread:\n\n${formattedThread}` },
      ],
    });

    const summaryText = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Parse structured elements from summary
    const decisions = extractSection(summaryText, 'Key Decisions');
    const actionItems = extractSection(summaryText, 'Action Items');
    const topics = extractSection(summaryText, 'Topics Discussed');

    span?.end({
      output: {
        messageCount: messages.length,
        participantCount: participants.length,
        summaryLength: summaryText.length,
      },
    });

    return {
      summary: summaryText,
      messageCount: messages.length,
      participants,
      decisions,
      actionItems,
      topics,
    };

  } catch (error) {
    span?.end({
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

/**
 * Extract bullet points from a section
 */
function extractSection(text: string, sectionName: string): string[] {
  const regex = new RegExp(`### ${sectionName}\\n([\\s\\S]*?)(?=###|$)`, 'i');
  const match = text.match(regex);
  if (!match) return [];

  return match[1]
    .split('\n')
    .filter(line => line.trim().startsWith('•'))
    .map(line => line.replace(/^•\s*/, '').trim());
}
```

### Response Formatting

```typescript
/**
 * Format thread summary using UX spec Research Response pattern
 */
export function formatThreadSummary(summary: ThreadSummary, channelName: string): string {
  let response = `🔍 Summarized *${summary.messageCount}* messages from #${channelName}\n\n`;
  response += summary.summary;

  // Add feedback prompt
  response += '\n\n_Need more detail on any section?_';

  return response;
}
```

### References

- [Slack API - conversations.replies](https://api.slack.com/methods/conversations.replies)
- [UX Design Specification - Research Response Pattern](../_bmad-output/ux-design-specification.md)

### Dependencies

- Story 2.1 (Anthropic API) — Claude for summarization
- Story 2.5 (Thread Context) — `fetchThreadHistory()` function

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 7 (Slack Polish) |

