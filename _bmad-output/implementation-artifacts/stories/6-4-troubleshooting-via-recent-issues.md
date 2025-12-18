# Story 6.4: Troubleshooting via Recent Issues

Status: ready-for-dev

## Story

As a **user**, I want Orion to help me troubleshoot by finding similar issues, So that I can solve problems faster.

## Acceptance Criteria

1. **Given** I describe a problem or error, **When** I ask Orion for help, **Then** Orion searches for similar recent issues (FR34)
2. Slack history is searched for relevant discussions
3. Known solutions are surfaced
4. Links to previous discussions are included
5. The troubleshooting guidance is verified before delivery

## Tasks / Subtasks

- [ ] **Task 1: Parse Problem Description** (AC: #1) - Extract error/issue keywords
- [ ] **Task 2: Search Slack History** (AC: #2) - Find similar discussions
- [ ] **Task 3: Surface Solutions** (AC: #3) - Extract resolution patterns
- [ ] **Task 4: Include Links** (AC: #4) - Link to original discussions
- [ ] **Task 5: Verify Guidance** (AC: #5) - Run through verification

## Dev Notes

### Troubleshooting Flow

```
User: "I'm getting a 403 error when calling the API"
    │
    ▼
[Extract: "403 error", "API"]
    │
    ▼
[Search Slack for similar issues]
    │
    ▼
[Find previous discussions with solutions]
    │
    ▼
[Format: Problem → Solution → Links]
```

### File List

Files to create: `src/workflows/troubleshooting.ts`

