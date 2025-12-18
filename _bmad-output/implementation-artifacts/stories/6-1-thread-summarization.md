# Story 6.1: Thread Summarization

Status: ready-for-dev

## Story

As a **user**, I want Orion to summarize Slack threads, So that I can quickly catch up on long discussions.

## Acceptance Criteria

1. **Given** a long Slack thread exists, **When** I ask Orion to summarize it, **Then** the complete thread is fetched (FR18)
2. Key points are extracted and organized
3. Action items are highlighted if present
4. Participants and decisions are noted
5. The summary is concise but comprehensive
6. Source thread link is included

## Tasks / Subtasks

- [ ] **Task 1: Fetch Complete Thread** (AC: #1) - Use conversations.replies API, handle pagination
- [ ] **Task 2: Extract Key Points** (AC: #2) - Identify main topics and decisions
- [ ] **Task 3: Highlight Action Items** (AC: #3) - Pattern match for action items
- [ ] **Task 4: Note Participants** (AC: #4) - List active participants and their contributions
- [ ] **Task 5: Format Summary** (AC: #5, #6) - Structure for Slack, include thread link
- [ ] **Task 6: Verification** - Test with various thread lengths

## Dev Notes

### Summary Structure

```
*Thread Summary*
_From #channel on [date]_

*Key Points:*
• Point 1
• Point 2

*Action Items:*
• @user: Task description

*Participants:* User1, User2, User3

<thread-link|View full thread>
```

### File List

Files to create: `src/workflows/summarization/thread.ts`

