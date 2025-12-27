# Story 7.1: Dynamic Suggested Prompts

Status: ready-for-dev

## Story

As a **user**,
I want suggested prompts that adapt to my context and history,
So that I discover Orion's capabilities naturally and get relevant suggestions.

## Acceptance Criteria

1. **Given** a user opens a new thread with Orion, **When** the thread starts, **Then** suggested prompts reflect the current context (channel, user role, time of day)

2. **Given** a user completes a research task, **When** the response is sent, **Then** follow-up prompts suggest related actions ("Ask me to dig deeper into...")

3. **Given** a user has used Orion multiple times, **When** prompts are generated, **Then** prompts evolve based on user's typical use patterns

4. **Given** Orion cannot fulfill a request, **When** an error occurs, **Then** suggested prompts offer alternative approaches

5. **Given** prompts are displayed, **When** the user views them, **Then** maximum 4 prompts are shown (Slack API limit)

## Tasks / Subtasks

- [ ] **Task 1: Create Prompt Factory** (AC: #1, #5)
  - [ ] Create `src/slack/prompts/prompt-factory.ts`
  - [ ] Implement `generateSuggestedPrompts()` function
  - [ ] Accept context: channel type, user ID, thread history
  - [ ] Return max 4 prompts (Slack limit)

- [ ] **Task 2: Implement Context-Aware Prompts** (AC: #1)
  - [ ] Create prompt sets for different contexts:
    - DM context (personal assistance)
    - Channel context (team collaboration)
    - Time-based (morning standup, EOD summary)
  - [ ] Detect channel type from thread context
  - [ ] Select appropriate prompt set

- [ ] **Task 3: Implement Follow-Up Prompts** (AC: #2)
  - [ ] Create `generateFollowUpPrompts()` function
  - [ ] Analyze response content to suggest next steps
  - [ ] Examples:
    - After research: "Dig deeper into [topic]"
    - After action: "Check status of [item]"
    - After summary: "Expand on [section]"

- [ ] **Task 4: Implement Error Recovery Prompts** (AC: #4)
  - [ ] Create prompt suggestions for each error type
  - [ ] Suggest alternatives based on what failed
  - [ ] Integrate with OrionError (Story 2.4)

- [ ] **Task 5: Add User Pattern Learning** (AC: #3) *(Optional/Future)*
  - [ ] Track prompt selections in Langfuse
  - [ ] Store user preferences in memory (Epic 5)
  - [ ] Weight prompts by user's typical patterns

- [ ] **Task 6: Integrate with Handlers** (AC: all)
  - [ ] Update `handleThreadStarted` to use prompt factory
  - [ ] Update `handleUserMessage` to set follow-up prompts
  - [ ] Ensure prompts called via `setSuggestedPrompts()`

- [ ] **Task 7: Verification** (AC: all)
  - [ ] Open thread in DM → verify DM-specific prompts
  - [ ] Open thread in channel → verify channel-specific prompts
  - [ ] Complete research task → verify follow-up prompts appear
  - [ ] Trigger error → verify alternative prompts shown
  - [ ] Verify max 4 prompts displayed

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR16 | prd.md | System provides suggested prompts to help users discover capabilities |
| UX Spec | ux-design-specification.md | Dynamic prompts based on context, not static |

### UX Spec Guidance

From UX Design Specification:

> **Anti-Pattern:** Static/repetitive prompts — reduces trust, feels disconnected
> **What To Do:** Dynamic prompts based on context

> **Progressive Discovery:** Suggested prompts that evolve with user behavior

### Slack setSuggestedPrompts API

```typescript
await setSuggestedPrompts({
  title: 'Try asking me to:',  // Optional title
  prompts: [
    {
      title: 'Short button text',      // Max ~25 chars
      message: 'Full message to send', // What gets sent when clicked
    },
    // ... up to 4 prompts
  ],
});
```

### src/slack/prompts/prompt-factory.ts

```typescript
import type { SuggestedPrompt } from '@slack/bolt';

export interface PromptContext {
  channelType: 'im' | 'channel' | 'group';
  channelId?: string;
  userId: string;
  threadHistory?: string[];
  lastResponseType?: 'research' | 'action' | 'error' | 'clarification';
  errorCode?: string;
}

/**
 * Generate context-aware suggested prompts
 * Per UX spec: Never static, always relevant
 */
export function generateSuggestedPrompts(context: PromptContext): SuggestedPrompt[] {
  // Start with context-appropriate base prompts
  let prompts = getBasePrompts(context.channelType);

  // If we just completed a response, add follow-up prompts
  if (context.lastResponseType === 'research') {
    prompts = getResearchFollowUpPrompts(context);
  } else if (context.lastResponseType === 'action') {
    prompts = getActionFollowUpPrompts(context);
  } else if (context.lastResponseType === 'error') {
    prompts = getErrorRecoveryPrompts(context);
  }

  // Enforce Slack limit
  return prompts.slice(0, 4);
}

function getBasePrompts(channelType: string): SuggestedPrompt[] {
  if (channelType === 'im') {
    // DM context: personal assistance
    return [
      { title: 'Research a topic', message: 'Research the latest developments in...' },
      { title: 'Summarize a thread', message: 'Summarize the conversation in #channel' },
      { title: 'Find documentation', message: 'Find our documentation about...' },
      { title: 'Help with a task', message: 'Help me draft a...' },
    ];
  } else {
    // Channel context: team collaboration
    return [
      { title: 'Summarize this thread', message: 'Summarize this conversation' },
      { title: 'Research for the team', message: 'Research...' },
      { title: 'Find related docs', message: 'Find documentation about...' },
      { title: 'Answer a question', message: 'What is our policy on...' },
    ];
  }
}

function getResearchFollowUpPrompts(context: PromptContext): SuggestedPrompt[] {
  return [
    { title: 'Dig deeper', message: 'Dig deeper into the key findings' },
    { title: 'Compare options', message: 'Compare the alternatives you found' },
    { title: 'Summarize for sharing', message: 'Create a summary I can share with my team' },
    { title: 'Find more sources', message: 'Find additional sources on this topic' },
  ];
}

function getActionFollowUpPrompts(context: PromptContext): SuggestedPrompt[] {
  return [
    { title: 'Check status', message: 'Check the status of what you just did' },
    { title: 'Make adjustments', message: 'Make the following adjustments...' },
    { title: 'Do something similar', message: 'Do the same thing for...' },
    { title: 'Undo or rollback', message: 'Can you undo that?' },
  ];
}

function getErrorRecoveryPrompts(context: PromptContext): SuggestedPrompt[] {
  return [
    { title: 'Try again', message: 'Try that again' },
    { title: 'Different approach', message: 'Try a different approach to...' },
    { title: 'Simpler request', message: 'Let me simplify: ...' },
    { title: 'Get help', message: 'What can you help me with?' },
  ];
}
```

### Integration Points

```typescript
// In handleThreadStarted
await setSuggestedPrompts({
  title: 'Try asking me to:',
  prompts: generateSuggestedPrompts({
    channelType: event.channel_type,
    userId: event.user,
  }),
});

// After response in handleUserMessage
await setSuggestedPrompts({
  title: 'What next?',
  prompts: generateSuggestedPrompts({
    channelType: context.channelType,
    userId: context.userId,
    lastResponseType: 'research', // or 'action', 'error'
  }),
});
```

### References

- [Slack AI Apps - Suggested Prompts](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/#suggested-prompts)
- [UX Design Specification - Progressive Discovery](../_bmad-output/ux-design-specification.md)

### Dependencies

- Story 1.4 (Assistant Class) — `setSuggestedPrompts` available
- Story 2.4 (Error Handling) — Error codes for recovery prompts

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 7 (Slack Polish) |

