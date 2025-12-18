# Story 6.3: Conversation Summarization

Status: ready-for-dev

## Story

As a **user**, I want Orion to summarize our current conversation, So that I can save or share the key points.

## Acceptance Criteria

1. **Given** a conversation thread with Orion, **When** I ask for a summary, **Then** the conversation is analyzed
2. Key questions and answers are extracted
3. Decisions and next steps are highlighted
4. The summary is formatted for sharing
5. The summary supports the Summarization workflow (FR42)

## Tasks / Subtasks

- [ ] **Task 1: Analyze Conversation** (AC: #1) - Parse thread history
- [ ] **Task 2: Extract Q&A** (AC: #2) - Identify questions and answers
- [ ] **Task 3: Highlight Decisions** (AC: #3) - Note decisions made
- [ ] **Task 4: Format for Sharing** (AC: #4) - Shareable format
- [ ] **Task 5: Workflow Integration** (AC: #5) - Part of summarization workflow

## Dev Notes

### Conversation Summary Template

```
*Conversation Summary*

*Questions Discussed:*
1. Q: [question] → A: [answer]

*Key Decisions:*
• Decision 1
• Decision 2

*Next Steps:*
• Action item 1
```

### File List

Files to create: `src/workflows/summarization/conversation.ts`

