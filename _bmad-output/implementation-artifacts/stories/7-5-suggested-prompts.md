# Story 7.5: Suggested Prompts

Status: ready-for-dev

## Story

As a **user**, I want to see suggested prompts, So that I can discover Orion's capabilities.

## Acceptance Criteria

1. **Given** I start a conversation with Orion, **When** the thread begins, **Then** suggested prompts are displayed (FR16)
2. Prompts are relevant to available Skills and Commands
3. Prompts demonstrate key capabilities
4. Clicking/selecting a prompt triggers that action
5. Prompts are configurable via .orion/config.yaml

## Tasks / Subtasks

- [ ] **Task 1: Display on Thread Start** (AC: #1) - Use setSuggestedPrompts
- [ ] **Task 2: Generate from Skills/Commands** (AC: #2) - Dynamic prompts
- [ ] **Task 3: Show Key Capabilities** (AC: #3) - Curated examples
- [ ] **Task 4: Handle Selection** (AC: #4) - Trigger action
- [ ] **Task 5: Make Configurable** (AC: #5) - Read from config

## Dev Notes

### Suggested Prompts in Slack

```typescript
await setSuggestedPrompts({
  title: 'Try asking:',
  prompts: [
    { title: 'Research a prospect', message: 'Research [company name] for my sales call' },
    { title: 'Summarize a thread', message: 'Summarize the discussion in #channel' },
    { title: 'Find audience segments', message: 'Recommend audience segments for [client]' },
  ],
});
```

### File List

Files to modify:
- `src/slack/handlers/thread-started.ts`
- `.orion/config.yaml` (add suggested_prompts section)

