# Story 2.6: Context Compaction

Status: done

## Story

As a **user**,
I want to have long conversations without hitting limits,
So that complex discussions can continue uninterrupted.

## Acceptance Criteria

1. **Given** a conversation exceeds the context window, **When** the 200k token limit is approached (NFR24), **Then** manual compaction via summarization is triggered (AR30)

2. **Given** compaction is triggered, **When** summarization runs, **Then** older context is summarized to free up space

> **Note:** Claude Agent SDK does NOT have a built-in compaction API. AR30 is satisfied via manual implementation using Claude to summarize older messages.

3. **Given** context is being compacted, **When** summarization completes, **Then** key information is preserved in the compacted context

4. **Given** compaction occurs, **When** the user continues, **Then** the conversation continues without user interruption

5. **Given** compaction events occur, **When** logging is active, **Then** compaction events are logged in Langfuse

## Tasks / Subtasks

- [x] **Task 1: Detect Context Limit Approach** (AC: #1)
  - [x] Create `src/agent/compaction.ts`
  - [x] Implement `shouldTriggerCompaction()` function
  - [x] Calculate token count for current context
  - [x] Set threshold at 80% of 200k limit

- [x] **Task 2: Implement Manual Summarization-Based Compaction** (AC: #1)
  - [x] Implement `compactConversation()` function
  - [x] Call Claude API directly to summarize older context
  - [x] Strategy: When threshold hit, summarize oldest 50% of messages
  - [x] Replace old messages with summary in context window
  - [x] Use claude-sonnet-4-20250514 for summarization (cost-effective)

- [x] **Task 3: Preserve Key Information** (AC: #3)
  - [x] Include in summarization prompt: "Preserve user preferences, key facts, and decisions"
  - [x] Keep most recent N messages (e.g., last 10) in full detail
  - [x] Structure summary with sections: Preferences, Facts, Previous Discussion

- [x] **Task 4: Seamless Continuation** (AC: #4)
  - [x] Ensure response streaming continues
  - [x] No visible interruption to user
  - [x] Maintain conversation coherence

- [x] **Task 5: Add Compaction Logging** (AC: #5)
  - [x] Create Langfuse span for compaction
  - [x] Log pre/post token counts
  - [x] Log preserved information summary
  - [x] Track compaction frequency

- [x] **Task 6: Verification** (AC: all)
  - [x] Simulate long conversation (many messages)
  - [x] Verify compaction triggers
  - [x] Verify key info preserved
  - [x] Check conversation continues smoothly

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| NFR24 | prd.md | Support 200k token context window |
| AR30 | architecture.md | Claude Agent SDK compaction for long threads |

### src/agent/compaction.ts

```typescript
const TOKEN_LIMIT = 200_000;
const COMPACTION_THRESHOLD = 0.8; // 80% of limit

export function shouldTriggerCompaction(tokenCount: number): boolean {
  return tokenCount > TOKEN_LIMIT * COMPACTION_THRESHOLD;
}

export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export interface CompactionResult {
  originalTokens: number;
  compactedTokens: number;
  preservedItems: string[];
}

/**
 * Compact conversation history by summarizing older messages.
 * Claude SDK does NOT have automatic compaction - we implement it manually.
 */
export async function compactConversation(
  messages: ConversationMessage[],
  client: Anthropic
): Promise<{ summary: string; recentMessages: ConversationMessage[] }> {
  const splitPoint = Math.floor(messages.length / 2);
  const olderMessages = messages.slice(0, splitPoint);
  const recentMessages = messages.slice(splitPoint);

  // Use Claude to summarize older conversation
  const summaryResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Summarize this conversation history, preserving:
- User preferences mentioned
- Key facts and decisions
- Important context for continuing the conversation

Conversation:
${olderMessages.map(m => `${m.role}: ${m.content}`).join('\n\n')}

Provide a concise summary in 2-3 paragraphs.`,
      },
    ],
  });

  const summary = summaryResponse.content[0].type === 'text' 
    ? summaryResponse.content[0].text 
    : '';

  return { summary, recentMessages };
}
```

### References

- [Source: _bmad-output/epics.md#Story 2.6] — Original story
- [Source: technical-research#2.6 Compaction] — Compaction details

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Completion Notes List

- **IMPORTANT**: Claude SDK does NOT have automatic compaction—implement manually via summarization
- Monitor compaction frequency as a health metric
- Consider storing compacted summaries in orion-context/
- Implemented `TOKEN_LIMIT = 200_000` and `COMPACTION_THRESHOLD = 0.8` (triggers at 160k tokens)
- Added `@anthropic-ai/sdk` dependency for direct Claude API calls
- `compactConversation()` supports configurable `minRecentMessages` option (default: 10)
- Structured summarization prompt with Preferences, Facts, Previous Discussion sections
- `buildCompactedContext()` prepends summary as context for seamless continuation
- `compactWithLogging()` creates Langfuse spans and logs compaction metrics
- 32 unit tests covering all acceptance criteria

### File List

Files created:
- `src/agent/compaction.ts`
- `src/agent/compaction.test.ts`

Files modified:
- `package.json` (added @anthropic-ai/sdk dependency)
- `src/agent/loop.ts` (integrated compaction into agent loop)

## Change Log

| Date | Change |
|------|--------|
| 2025-12-18 | Story implementation complete - all 6 tasks done, 32 tests passing |
| 2025-12-18 | Code Review: Fixed H1 (integration), H2 (error tests), M1-M3. 38 tests passing |
