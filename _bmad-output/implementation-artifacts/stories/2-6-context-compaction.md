# Story 2.6: Context Compaction

Status: ready-for-dev

## Story

As a **user**,
I want to have long conversations without hitting limits,
So that complex discussions can continue uninterrupted.

## Acceptance Criteria

1. **Given** a conversation exceeds the context window, **When** the 200k token limit is approached (NFR24), **Then** Claude Agent SDK compaction is triggered (AR30)

2. **Given** compaction is triggered, **When** summarization runs, **Then** older context is summarized to free up space

3. **Given** context is being compacted, **When** summarization completes, **Then** key information is preserved in the compacted context

4. **Given** compaction occurs, **When** the user continues, **Then** the conversation continues without user interruption

5. **Given** compaction events occur, **When** logging is active, **Then** compaction events are logged in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Detect Context Limit Approach** (AC: #1)
  - [ ] Create `src/agent/compaction.ts`
  - [ ] Implement `shouldTriggerCompaction()` function
  - [ ] Calculate token count for current context
  - [ ] Set threshold at 80% of 200k limit

- [ ] **Task 2: Implement Summarization-Based Compaction** (AC: #1)
  - [ ] Claude SDK does NOT have a built-in compaction API
  - [ ] Implement manual compaction: call Claude to summarize older context
  - [ ] Strategy: When threshold hit, summarize oldest 50% of messages
  - [ ] Replace old messages with summary in context window

- [ ] **Task 3: Preserve Key Information** (AC: #3)
  - [ ] Include in summarization prompt: "Preserve user preferences, key facts, and decisions"
  - [ ] Keep most recent N messages (e.g., last 10) in full detail
  - [ ] Structure summary with sections: Preferences, Facts, Previous Discussion

- [ ] **Task 4: Seamless Continuation** (AC: #4)
  - [ ] Ensure response streaming continues
  - [ ] No visible interruption to user
  - [ ] Maintain conversation coherence

- [ ] **Task 5: Add Compaction Logging** (AC: #5)
  - [ ] Create Langfuse span for compaction
  - [ ] Log pre/post token counts
  - [ ] Log preserved information summary
  - [ ] Track compaction frequency

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Simulate long conversation (many messages)
  - [ ] Verify compaction triggers
  - [ ] Verify key info preserved
  - [ ] Check conversation continues smoothly

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

### File List

Files to create:
- `src/agent/compaction.ts`

Files to modify:
- `src/agent/loop.ts` (integrate compaction check)

