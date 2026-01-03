# Tech-Spec: Source Citations v2 — Fix Footer Display Logic

**Created:** 2026-01-02
**Status:** ✅ Completed (2026-01-02)

## Overview

### Problem Statement

The source citations implementation from the previous tech spec is broken:

1. **Tool sources with URLs appear in footer** — They shouldn't. Claude cites URLs inline; showing them in footer is redundant.
2. **Exa/web search URLs not extracted** — Exa returns markdown-formatted links (`[title](url)`) in text, but extraction only looks for structured `{ url, title }` objects.
3. **Tool source deduplication broken** — Same tool called twice with different queries only shows first call (keyed by tool name only).
4. **Empty tool context** — When no query params found, tool sources show with no context (e.g., just "🔧 Audience Manager").

**Evidence:** Screenshots show:
- Audience Manager query → Footer shows `🔧 Audience Manager: Audience Search — college football` ✅ (correct)
- Polymarket query → Footer shows `🔧 Exa: Web Search Exa — Polymarket...` but URLs are inline in Claude's response (duplicate/wrong)
- Inline Chatbot Arena link exists but wasn't extracted as a source

### Solution

Fix the display logic and URL extraction:

1. **Invert filter logic** — Tool sources should only appear in footer if they have NO URLs
2. **Parse markdown links** — Extract `[title](url)` patterns from text content blocks
3. **Dedupe by tool + query** — Key sources by `toolName::queryHash` not just `toolName`
4. **Fallback context** — Show "data lookup" when no query params found

### Scope

**In Scope:**
- [x] Fix `sources-block.ts` filter: `isTool && !url` instead of just `isTool`
- [x] Add markdown link extraction to `loop.ts` `extractUrlSourcesFromResult()`
- [x] Fix deduplication key in `loop.ts` toolSourcesMap
- [x] Add fallback context for empty tool queries

**Out of Scope:**
- Thread source deduplication with Claude's inline citations (future enhancement)
- Changing how Claude cites sources inline (that works fine)

## Context for Development

### Codebase Patterns

**Key Files:**
- `src/slack/sources-block.ts` — Filter logic for displayable sources
- `src/agent/loop.ts` — URL extraction + tool source tracking
- `src/slack/source-builder.ts` — `filterClickableSources()` utility

### Current Flow (Broken)

```
Tool call returns response
    ↓
extractUrlSourcesFromResult() — looks for {url, title} objects only
    ↓
If no URLs found → add tool as source (type: 'tool', no url, with toolContext)
If URLs found → add sources (type: 'tool', with url)
    ↓
sources-block.ts filter: s.url || s.isMemory || s.isTool
    ↓
ALL tool sources appear in footer (both with and without URLs) ❌
```

### Fixed Flow

```
Tool call returns response
    ↓
extractUrlSourcesFromResult() — looks for {url, title} objects AND parses markdown [title](url)
    ↓
If URLs extracted → DON'T add to footer (Claude cites inline)
If no URLs extracted → add tool as source (type: 'tool', with toolContext)
    ↓
sources-block.ts filter: (s.isTool && !s.url) || s.isMemory || (s.url && !s.isTool)
    ↓
Only tool sources WITHOUT URLs appear in footer ✅
```

### Technical Decisions

1. **Markdown regex** — Use `/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g` to extract links
2. **Dedup key** — `${toolName}::${toolContext.slice(0, 20)}` for meaningful differentiation
3. **Fallback context** — "data lookup" when summarizeToolInput returns empty

## Implementation Plan

### Task 1: Fix Filter Logic in sources-block.ts

**File:** `src/slack/sources-block.ts`

```typescript
// BEFORE (line 97):
const displayable = sources.filter((s) => s.url || s.isMemory || s.isTool);

// AFTER:
const displayable = sources.filter((s) => {
  // Memory sources: always show (implicit trust)
  if (s.isMemory) return true;
  // Tool sources: only show if they DON'T have URLs
  // (Claude cites URLs inline; footer is for "what tool was called" transparency)
  if (s.isTool) return !s.url;
  // Thread/file/other: only show if they have clickable URLs
  return !!s.url;
});
```

**Acceptance Criteria:**
- [ ] AC1: Tool sources WITH URLs do NOT appear in footer
- [ ] AC2: Tool sources WITHOUT URLs appear in footer with context
- [ ] AC3: Memory sources still appear without URLs
- [ ] AC4: Thread sources with permalinks still appear

---

### Task 2: Add Markdown Link Extraction

**File:** `src/agent/loop.ts`

Add new function and integrate with `extractUrlSourcesFromResult()`:

```typescript
/**
 * Extract URLs from markdown-formatted text.
 * Handles patterns like: [Chatbot Arena](https://lmarena.ai)
 */
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;

function extractMarkdownLinks(text: string): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = [];
  let match;
  while ((match = MARKDOWN_LINK_REGEX.exec(text)) !== null) {
    if (match[1] && match[2]) {
      links.push({ title: match[1], url: match[2] });
    }
  }
  return links;
}

// In extractUrlSourcesFromResult(), add after recursive extract():
// Also extract from text content blocks
if (typeof data === 'object' && data !== null) {
  const extractTextContent = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    const o = obj as Record<string, unknown>;
    
    // Check for MCP content blocks: { type: 'text', text: '...' }
    if (o.type === 'text' && typeof o.text === 'string') {
      const mdLinks = extractMarkdownLinks(o.text);
      for (const link of mdLinks) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          sources.push({
            type: 'tool',
            title: link.title.slice(0, 80),
            reference: toolName,
            url: link.url,
          });
        }
      }
    }
    
    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
      for (const item of obj) extractTextContent(item);
    } else {
      for (const val of Object.values(o)) extractTextContent(val);
    }
  };
  
  extractTextContent(data);
}
```

**Acceptance Criteria:**
- [ ] AC1: Markdown links `[title](url)` extracted from text content
- [ ] AC2: Exa search results now produce URL sources
- [ ] AC3: URL sources with extracted URLs do NOT appear in footer (per Task 1)
- [ ] AC4: No duplicate URLs extracted (deduped by `seen` Set)

---

### Task 3: Fix Deduplication Key

**File:** `src/agent/loop.ts`

```typescript
// BEFORE (around line 709-718):
if (urlSources.length === 0 && !toolSourcesMap.has(toolUse.name)) {
  const displayName = formatToolDisplayName(toolUse.name);
  const toolContext = summarizeToolInput(toolUse.input);
  toolSourcesMap.set(toolUse.name, {
    // ...
  });
}

// AFTER:
if (urlSources.length === 0) {
  const displayName = formatToolDisplayName(toolUse.name);
  const toolContext = summarizeToolInput(toolUse.input);
  // Key by tool name + query context to allow multiple calls with different queries
  const dedupKey = `${toolUse.name}::${toolContext.slice(0, 20)}`;
  
  if (!toolSourcesMap.has(dedupKey)) {
    toolSourcesMap.set(dedupKey, {
      type: 'tool',
      title: displayName,
      reference: toolUse.name,
      toolContext: toolContext || 'data lookup',  // Fallback for empty context
    });
  }
}
```

**Acceptance Criteria:**
- [ ] AC1: Same tool called twice with different queries → both appear in footer
- [ ] AC2: Same tool called twice with same query → only appears once (deduped)
- [ ] AC3: Empty tool context shows "data lookup" fallback

---

### Task 4: Update source-builder.ts Filter

**File:** `src/slack/source-builder.ts`

```typescript
// BEFORE (line 138-146):
export function filterClickableSources(sources: ContextSource[]): ContextSource[] {
  return sources.filter((s) => {
    if (s.type === 'memory') return true;
    if (s.type === 'tool') return true;  // ← BUG: all tools pass
    return !!s.url;
  });
}

// AFTER:
export function filterClickableSources(sources: ContextSource[]): ContextSource[] {
  return sources.filter((s) => {
    // Memory sources: always show (implicit trust)
    if (s.type === 'memory') return true;
    // Tool sources: only show if NO URL (Claude cites URLs inline)
    if (s.type === 'tool') return !s.url;
    // Thread/file: must have URL to be clickable
    return !!s.url;
  });
}
```

**Acceptance Criteria:**
- [ ] AC1: Consistent with sources-block.ts filter logic
- [ ] AC2: Tool sources with URLs filtered out
- [ ] AC3: Tool sources without URLs pass through

---

### Task 5: Update Tests

**Files:**
- `src/slack/sources-block.test.ts`
- `src/slack/source-builder.test.ts`
- `src/agent/loop.test.ts` (if exists for URL extraction)

Add test cases:
1. Tool source WITH URL → NOT displayed in footer
2. Tool source WITHOUT URL → displayed with context
3. Markdown links extracted from text content
4. Same tool, different queries → both appear
5. Empty tool context → shows "data lookup"

---

## Acceptance Criteria (Overall)

- [x] **AC1**: Tool sources with extracted URLs do NOT appear in footer
- [x] **AC2**: Tool sources without URLs appear with tool context
- [x] **AC3**: Exa/web search markdown links are extracted as URL sources
- [x] **AC4**: Same tool called multiple times with different queries → all appear
- [x] **AC5**: Empty tool context shows "data lookup" fallback
- [x] **AC6**: Memory sources still work (implicit trust)
- [x] **AC7**: Thread sources with permalinks still work
- [x] **AC8**: All existing tests pass + new tests added

## Additional Context

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Exa returns 10 markdown URLs | All extracted, none in footer (Claude cites inline) |
| Audience Manager has no URLs | Shows in footer: "🔧 Audience Manager: Audience Search — college football" |
| Tool called 3x with same query | Only 1 entry in footer (deduped) |
| Tool called 3x with diff queries | All 3 entries in footer |
| Malformed markdown `[broken](` | Regex doesn't match, skipped |
| Tool input is empty object `{}` | Shows "🔧 Tool Name — data lookup" |

### Testing Strategy

1. **Unit Tests:**
   - `sources-block.test.ts` — Filter logic for tool+URL combo
   - `source-builder.test.ts` — Updated filter function
   - New: `loop.test.ts` — Markdown extraction + dedup key

2. **Manual Verification:**
   - Ask Orion about Polymarket → Check NO footer source for Exa (URLs inline)
   - Ask Orion about audiences → Check footer shows Audience Manager with context
   - Ask same question twice → Check both tool calls appear if different queries

### Dependencies

- No new packages required
- Regex is pure TypeScript

### Risks

| Risk | Mitigation |
|------|------------|
| Regex misses edge cases | Add test cases for malformed markdown |
| Breaking existing citations | Run full test suite before merge |
| Performance of regex on large responses | Cap at 50 extracted links per response |

---

## Related

- Previous spec: `tech-spec-source-citations-fix.md` (this fixes bugs from that implementation)
- Story 2.7: Source Citations (original feature)

---

## Code Review Record (2026-01-02)

### Review Findings & Fixes Applied

**Reviewer:** Barry (Quick Flow Solo Dev)

| Issue | Severity | Status | Fix Applied |
|-------|----------|--------|-------------|
| Missing tests for `extractMarkdownLinks()` | HIGH | ✅ Fixed | Added 7 unit tests in `loop.test.ts` |
| Missing test for dedup with different queries | MEDIUM | ✅ Fixed | Added integration test |
| Module-level regex with `g` flag (code smell) | MEDIUM | ✅ Fixed | Refactored to use `String.matchAll()` |
| Missing "data lookup" fallback test | MEDIUM | ✅ Fixed | Added integration test |
| Spec doc inconsistency (8 vs 20 chars) | LOW | ✅ Fixed | Updated to match implementation |

### Files Modified in Review

- `src/agent/loop.ts` — Exported `extractMarkdownLinks`, refactored regex to use `matchAll()`
- `src/agent/loop.test.ts` — Added 18 new tests for Source Citations v2 functionality
- `tech-spec-source-citations-v2.md` — Fixed dedup key documentation

### Test Results Post-Review

```
Test Files  3 passed (3)
Tests  69 passed (69)
```

### Verification

All HIGH and MEDIUM issues fixed. Story status: **done**

