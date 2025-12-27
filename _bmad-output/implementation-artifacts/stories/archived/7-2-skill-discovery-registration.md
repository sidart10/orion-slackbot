# Story 7.2: Skill Discovery & Registration

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: SDK handles skill matching natively

## Story

As an **agent**, I want to discover and use available Skills, So that I can apply them when relevant.

## Acceptance Criteria

1. **Given** Skills are loaded, **When** the agent processes a request, **Then** relevant Skills are matched based on request context
2. Skill instructions augment the agent's capabilities
3. Multiple Skills can be applied to a single request
4. Skill usage is traced in Langfuse
5. Adding a new Skill file is all that's needed to extend (FR24)

## Tasks / Subtasks

- [ ] **Task 1: Match Skills to Requests** (AC: #1) - Pattern matching
- [ ] **Task 2: Augment Agent** (AC: #2) - Add to system prompt
- [ ] **Task 3: Multiple Skills** (AC: #3) - Combine when relevant
- [ ] **Task 4: Trace Usage** (AC: #4) - Log in Langfuse
- [ ] **Task 5: Verify Extension** (AC: #5) - Add skill, verify works

## Dev Notes

### Skill Matching

```typescript
function matchSkills(request: string, skills: Skill[]): Skill[] {
  return skills.filter(skill => 
    skill.triggers.some(trigger => 
      request.toLowerCase().includes(trigger.toLowerCase())
    )
  );
}
```

### File List

Files to create: `src/extensions/skills/matcher.ts`

