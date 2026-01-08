# Story 6.11: Prompt Builder Cleanup

Status: in-review

## Story

As a **platform developer**,
I want to simplify the skill hint in the prompt builder to remove transitional warning text,
So that the system prompt is clean and minimal now that PTC skills are fully operational.

## Scope Boundary (Non-Negotiable)

This story implements **simplification** of the prompt builder output.

- **IN SCOPE:**
  - Simplify `buildSkillsHint()` output — remove verbose transitional text
  - Update JSDoc comments to reflect current PTC-based architecture
  - Update tests to match simplified output
  - Keep skill listing functionality (name, description, tools)

- **OUT OF SCOPE:**
  - Modifying `loader.ts`, `runtime.ts`, `sync-service.ts`, `container-builder.ts`
  - Removing `buildSkillsPrompt()` (keep for backwards compatibility)
  - Removing GKE sandbox infrastructure (Story 6.12)
  - Documentation updates (Story 6.13)

## Context: Current State (Verified 2026-01-08)

**Previous migration work already updated `buildSkillsHint()`** to remove the `orion_sandbox({ skill_doc })` instruction. The current implementation (lines 81-89) outputs:

```typescript
return `
# Available Skills

${hints.join('\n')}

Skills are pre-loaded in your code execution environment. When a task matches a skill, write Python code directly to accomplish the task - the skill's libraries and capabilities are already available.

IMPORTANT: Do NOT use orion_sandbox for skills. Use your built-in code execution capability instead.
`;
```

**What remains:** The transitional warning text ("IMPORTANT: Do NOT use orion_sandbox...") is no longer needed since:
1. Skills are loaded via `container: { skills }` in `messages.create()` (Story 6.3)
2. Claude auto-loads skills from container — no prompt instruction needed
3. Tests already assert the correct behavior

## Pre-Implementation Checklist (Verified)

- [x] Skills loaded via `container: { skills }` in agent loop — confirmed in `src/agent/loop.ts`
- [x] `orion_sandbox` NOT the primary skill loading mechanism — confirmed, PTC is primary
- [x] Slack handlers use `buildSkillsHint()` — confirmed at `app-mention.ts:288`, `user-message.ts:347`
- [x] Tests already check for "code execution environment" and "Do NOT use orion_sandbox" — see `prompt-builder.test.ts:153-156`

## File Operations Summary

| Action | File | Lines Est. | Description |
|--------|------|------------|-------------|
| MODIFY | `src/skills/prompt-builder.ts` | ~10 | Simplify output, update JSDoc |
| MODIFY | `src/skills/prompt-builder.test.ts` | ~10 | Update test expectations |

## Acceptance Criteria

1. **Given** `buildSkillsHint()` is called, **When** output is generated, **Then** it contains ONLY the skills list header and skill entries (no instructional text)

2. **Given** `buildSkillsHint()` is called with skills, **When** output is generated, **Then** it still lists skill names, descriptions, and available tools

3. **Given** all tests pass, **When** running `pnpm test`, **Then** prompt builder tests pass with simplified output

4. **Given** `buildSkillsPrompt()` exists, **When** called, **Then** it continues to work (backwards compatibility maintained)

## Tasks / Subtasks

### Task 1: Simplify buildSkillsHint() Output (AC: #1, #2)

**File:** `src/skills/prompt-builder.ts`

**Current implementation (lines 68-90):**
```typescript
export function buildSkillsHint(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return '';
  }

  const hints = skills.map((skill) => {
    const toolsList = skill.tools?.length
      ? ` (tools: ${skill.tools.map((t) => t.name).join(', ')})`
      : '';

    return `- *${skill.name}*: ${skill.description}${toolsList}`;
  });

  return `
# Available Skills

${hints.join('\n')}

Skills are pre-loaded in your code execution environment. When a task matches a skill, write Python code directly to accomplish the task - the skill's libraries and capabilities are already available.

IMPORTANT: Do NOT use orion_sandbox for skills. Use your built-in code execution capability instead.
`;
}
```

**Target implementation:**
```typescript
export function buildSkillsHint(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return '';
  }

  const hints = skills.map((skill) => {
    const toolsList = skill.tools?.length
      ? ` (tools: ${skill.tools.map((t) => t.name).join(', ')})`
      : '';

    return `- *${skill.name}*: ${skill.description}${toolsList}`;
  });

  return `
# Available Skills

${hints.join('\n')}
`;
}
```

**Subtasks:**
- [ ] **1.1** Remove lines 86-89 (the transitional instructional text)
- [ ] **1.2** Update JSDoc (lines 52-67) to reflect PTC-based architecture

**Current JSDoc (lines 52-67):**
```typescript
/**
 * Build system prompt hint from skill metadata (TOKEN EFFICIENT).
 *
 * This is the preferred function for system prompt injection.
 * Only includes name, description, and available tool names.
 * Full instructions are loaded on-demand when the skill is invoked.
 *
 * Returns empty string if no skills loaded.
 * Used by Slack handlers when building the system prompt.
 *
 * @param skills - Array of skill metadata (no instructions)
 * @returns Formatted skills hint for system prompt (~100 tokens per skill)
 *
 * @see Story 6.1 AC#4 - Skills hint injected (not full content)
 * @see Story 6.1 AC#9 - On-demand instruction loading
 */
```

**Target JSDoc:**
```typescript
/**
 * Build system prompt hint from skill metadata (TOKEN EFFICIENT).
 *
 * This is the preferred function for system prompt injection.
 * Only includes name, description, and available tool names.
 * Skills are loaded via container parameter in messages.create().
 *
 * Returns empty string if no skills loaded.
 * Used by Slack handlers when building the system prompt.
 *
 * @param skills - Array of skill metadata (no instructions)
 * @returns Formatted skills hint for system prompt (~100 tokens per skill)
 *
 * @see Story 6.1 AC#4 - Skills hint injected (not full content)
 * @see Story 6.3 - Skills loaded via container parameter
 */
```

### Task 2: Update Tests (AC: #3)

**File:** `src/skills/prompt-builder.test.ts`

**Current test (lines 153-156):**
```typescript
// Story 6.10: Skills now use PTC container, not orion_sandbox on-demand loading
expect(result).toContain('code execution environment');
expect(result).toContain('Do NOT use orion_sandbox');
```

**Target test:**
```typescript
// Story 6.11: Simplified output - just skills list, no instructions
expect(result).not.toContain('orion_sandbox');
expect(result).not.toContain('code execution environment');
// Skills list is sufficient - Claude auto-loads via container parameter
```

**Subtasks:**
- [ ] **2.1** Update test at lines 153-156 to expect simplified output
- [ ] **2.2** Verify all other `buildSkillsHint` tests still pass
- [ ] **2.3** Run `pnpm test` to confirm

### Task 3: Verify No Regressions (AC: #4)

- [ ] **3.1** Run full test suite: `pnpm test`
- [ ] **3.2** Verify `buildSkillsPrompt()` tests still pass (unchanged function)

## Dev Notes

### buildSkillsPrompt Status

`buildSkillsPrompt()` is:
- Marked `@deprecated` in JSDoc
- Exported from `src/skills/index.ts` (public API)
- Used only in tests (`integration.test.ts:81`, `prompt-builder.test.ts`)
- **Keep as-is** for backwards compatibility — removal is out of scope

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| ESM imports | project-context.md | ALL imports MUST use `.js` extension |
| No breaking changes | — | Keep function signatures unchanged |
| Test coverage | — | Update affected test assertions |

### Success Metrics

| Metric | Target |
|--------|--------|
| Tests passing | 100% |
| Instructional text in hint | 0 lines |
| Function signature changes | 0 |
| Files modified | 2 (prompt-builder.ts, prompt-builder.test.ts) |

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Remove skill listing | Keep names, descriptions, tools |
| Change function signatures | Only change output content |
| Remove `buildSkillsPrompt()` | Keep for backwards compatibility |
| Add new instructional text | Keep output minimal |

## Previous Story Intelligence

From Story 6.3 (`container-builder.ts`):
- Skills loaded via `container: { skills: [...] }` parameter
- Claude auto-loads from `/skills/` in container — no prompt instruction needed

From Story 6.10:
- All skills validated working in Anthropic container
- PTC file extraction working correctly

## References

- [Source: src/skills/prompt-builder.ts] — Current implementation
- [Source: src/skills/prompt-builder.test.ts] — Current tests
- [Source: project-context.md#PTC-Skills] — PTC architecture

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - straightforward implementation

### Completion Notes List

- Removed transitional instructional text from `buildSkillsHint()` output
- Updated JSDoc to reference PTC container loading (Story 6.3)
- Updated test assertions to verify simplified output (no orion_sandbox, no "code execution environment")
- All 12 prompt-builder tests pass
- Full test suite passes

### File List

- `src/skills/prompt-builder.ts` - Simplified output, updated JSDoc
- `src/skills/prompt-builder.test.ts` - Updated test expectations

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Story created - Prompt Builder Cleanup |
| 2026-01-08 | SM validation: Updated to reflect actual current state. Scope reduced from ~90 lines to ~20 lines. Removed outdated code examples, clarified remaining work is simplification only. |
| 2026-01-08 | SM validation: Added target JSDoc content for Task 1.2 to prevent dev agent guessing. |
| 2026-01-08 | Implementation complete - Commit 12035e0 |
