# Tech-Spec: Source Citations Fix - Clickable Sources Only

**Created:** 2026-01-02
**Status:** Done
**Reviewed:** 2026-01-02
**Code Review:** ✅ Passed (2026-01-02)
**Updated:** 2026-01-02 (Tool Sources + Multi-line Display)

## Overview

### Problem Statement

Source citations are currently broken and erode user trust:
1. Thread sources show as `Thread message #1` - meaningless index with no URL
2. File sources show raw filenames like `C-verify-test_1702848000.123.md` - unusable
3. Sources appear even when users can't click to verify them
4. The rich metadata (user, timestamp, channel) is stripped before source creation

**Trust is the #1 priority**: If users can't click to verify a source, showing it is worse than showing nothing.

### Solution

Implement a "clickable sources only" policy with tool attribution:
1. **Thread messages** → Generate Slack permalinks; only cite if permalink available; exclude current question
2. **Local files (orion-context/)** → Remove from visible sources (internal context only)
3. **MCP tool results** → Extract URIs from content blocks; show tool name + query as fallback
4. **Memory/preferences** → Special case: "From your preferences" (implicit trust, no URL needed)
5. **Display format** → Multi-line numbered list for better readability

### Scope

**In Scope:**
- [x] Generate Slack permalinks for thread messages
- [x] Filter sources to only include those with URLs (or tool/memory types)
- [x] Pass rich thread metadata through data flow
- [x] Handle memory/preferences as special source type
- [x] Extract URIs from MCP tool results
- [x] Show tool name + search context when no URLs available
- [x] Exclude current question from thread sources (citing "what you just asked" is useless)
- [x] Multi-line display format with numbered sources

**Out of Scope:**
- Confluence/external doc integration (future epic)
- Inline citation markers `[1]` in response body (existing feature, unchanged)
- Citation rate metrics (existing, unchanged)

## Context for Development

### Codebase Patterns

**Key Files:**
- `src/slack/thread-context.ts` - Fetches thread history with rich metadata (`{ user, text, ts, isBot }`)
- `src/agent/gather.ts` - Gathers context, creates sources (currently loses metadata)
- `src/slack/sources-block.ts` - Renders source citations to Block Kit
- `src/slack/handlers/user-message.ts` - Converts rich history to stripped Anthropic format
- `src/slack/handlers/app-mention.ts` - Same pattern as user-message

**Current Data Flow (Broken):**
```
fetchThreadHistory() → { user, text, ts, isBot }  ← RICH
       ↓
anthropicHistory = threadHistory.map(msg => ({ role, content }))  ← STRIPPED!
       ↓
gatherContext({ threadHistory: anthropicHistory })  ← Only role/content
       ↓
Sources created as "Thread message #N"  ← NO permalink possible
```

**Fixed Data Flow:**
```
fetchThreadHistory() → { user, text, ts, isBot }  ← RICH
       ↓
sources created at handler level with full metadata + permalink
       ↓
gatherContext() → contextText only (sources handled separately)
       ↓
Sources filtered: only those with URLs shown
```

### Technical Decisions

1. **Generate permalinks at handler level** - We have `channel`, `threadTs`, and message `ts` there
2. **Use Slack API `chat.getPermalink`** - More reliable than constructing URLs manually
3. **Extend ContextSource type** - Add `sourceType: 'thread' | 'file' | 'tool' | 'memory'`
4. **Filter in sources-block.ts** - Only render sources with URLs (except memory type)

## Implementation Plan

### Task 1: Extend ThreadMessage with Source Metadata

**File:** `src/slack/thread-context.ts`

```typescript
export interface ThreadMessage {
  user: string;
  text: string;
  ts: string;
  isBot: boolean;
  // NEW fields for source generation
  channelId?: string;  // Needed for permalink
  userName?: string;   // Human-readable attribution
}
```

**Acceptance Criteria:**
- [x] ThreadMessage interface extended
- [x] fetchThreadHistory optionally populates channelId
- [x] fetchThreadHistory resolves userName from Slack API (cached via identity.ts)
- [x] No breaking changes to existing callers

### Task 2: Create Slack Permalink Utility

**File:** `src/slack/permalinks.ts` (NEW)

```typescript
import type { WebClient } from '@slack/web-api';

/**
 * Generate Slack permalink for a message.
 * Falls back to constructed URL if API fails.
 */
export async function getMessagePermalink(
  client: WebClient,
  channel: string,
  messageTs: string
): Promise<string | null> {
  try {
    const result = await client.chat.getPermalink({
      channel,
      message_ts: messageTs,
    });
    return result.permalink ?? null;
  } catch {
    // Fallback: construct URL (less reliable but better than nothing)
    // Format: https://slack.com/archives/{channel}/p{ts_without_dot}
    const tsNoDot = messageTs.replace('.', '');
    return `https://slack.com/archives/${channel}/p${tsNoDot}`;
  }
}
```

**Acceptance Criteria:**
- [x] Function created with proper error handling
- [x] Uses Slack API when available
- [x] Falls back to URL construction
- [x] Logs errors at debug level for troubleshooting
- [x] Returns null only on critical failure
- [x] Unit tests added (permalinks.test.ts)

### Task 3: Create Source Builder at Handler Level

**File:** `src/slack/source-builder.ts` (NEW)

```typescript
import type { WebClient } from '@slack/web-api';
import type { ThreadMessage } from './thread-context.js';
import type { ContextSource } from '../agent/gather.js';
import { getMessagePermalink } from './permalinks.js';

export interface ThreadSourceParams {
  client: WebClient;
  channel: string;
  threadTs: string;
  messages: ThreadMessage[];
  /** Max sources to generate (default: 5) */
  maxSources?: number;
}

/**
 * Build sources from thread messages with permalinks.
 * Only returns sources that have valid URLs.
 */
export async function buildThreadSources(
  params: ThreadSourceParams
): Promise<ContextSource[]> {
  const { client, channel, messages, maxSources = 5 } = params;
  const sources: ContextSource[] = [];
  
  // Take most recent relevant messages
  const messagesToSource = messages.slice(-maxSources);
  
  for (const msg of messagesToSource) {
    const permalink = await getMessagePermalink(client, channel, msg.ts);
    if (!permalink) continue; // Skip if no URL available
    
    // Build human-readable title
    const role = msg.isBot ? 'Orion' : (msg.userName ?? 'User');
    const excerpt = msg.text.length > 50 
      ? msg.text.slice(0, 50) + '…' 
      : msg.text;
    const title = `${role}: "${excerpt}"`;
    
    sources.push({
      type: 'thread',
      title,
      reference: `${channel}/${msg.ts}`,
      url: permalink,
      excerpt: msg.text.slice(0, 200),
    });
  }
  
  return sources;
}

/**
 * Filter sources to only include those with URLs.
 * Memory sources are exempt (implicit trust).
 */
export function filterClickableSources(
  sources: ContextSource[]
): ContextSource[] {
  return sources.filter(s => {
    // Memory sources don't need URLs (implicit trust)
    if (s.type === 'memory') return true;
    // All others need URLs
    return !!s.url;
  });
}
```

**Acceptance Criteria:**
- [x] buildThreadSources generates permalinks
- [x] Human-readable titles with attribution (uses userName from ThreadMessage)
- [x] Only sources with URLs are returned
- [x] filterClickableSources utility available
- [x] Unit tests added (source-builder.test.ts)

### Task 4: Update Gather to Skip File Sources from orion-context

**File:** `src/agent/gather.ts`

Modify `scanOrionContext` to NOT create user-visible sources. The context is still gathered for the LLM, but sources are not exposed.

```typescript
// Option A: Remove sources from scanOrionContext return
// The files are still read and used as context, just not cited

async function scanOrionContext(params: {...}): Promise<{ text: string }> {
  // ... existing scanning logic ...
  return { text: lines.join('\n') }; // No sources returned
}
```

OR add a flag:

```typescript
export interface GatherContextParams {
  // ... existing ...
  /** If true, include file sources (default: false - files are context-only) */
  includeFileSources?: boolean;
}
```

**Acceptance Criteria:**
- [x] orion-context files still provide context to LLM
- [x] File sources NOT included in visible citations
- [x] Thread sources removed from gather.ts (built at handler level now)
- [x] No breaking changes to gather contract
- [x] Tests updated (gather.test.ts)

### Task 5: Update Handlers to Use New Source Building

**Files:** 
- `src/slack/handlers/user-message.ts`
- `src/slack/handlers/app-mention.ts`

Replace the current flow:
```typescript
// BEFORE: Sources created inside gatherContext
const { contextText, sources } = await gatherContext({
  userMessage: messageText,
  threadHistory: anthropicHistory,
});
```

With:
```typescript
// AFTER: Sources built at handler level with full metadata
const threadSources = await buildThreadSources({
  client,
  channel: channelId,
  threadTs,
  messages: threadHistory, // Original rich messages
  maxSources: 5,
});

const { contextText } = await gatherContext({
  userMessage: messageText,
  threadHistory: anthropicHistory, // Still needed for LLM
});

// Merge sources: thread + any tool sources from agent result
const allSources = [...threadSources, ...(agentResult?.sources ?? [])];
const clickableSources = filterClickableSources(allSources);
```

**Acceptance Criteria:**
- [x] Thread sources built with permalinks before agent call
- [x] Sources filtered before rendering
- [x] Memory sources preserved (when implemented)
- [x] MCP tool sources extracted (from agentResult)

### Task 6: Update Sources Block to Filter

**File:** `src/slack/sources-block.ts`

Add defensive filtering:

```typescript
export function createSourcesContextBlock(
  sources: SourceCitation[]
): SourcesContextBlock | null {
  // Filter: only sources with URLs (memory exempt)
  const clickable = sources.filter(s => s.url || s.isMemory);
  
  if (clickable.length === 0) return null;
  // ... rest unchanged
}
```

**Acceptance Criteria:**
- [x] Sources without URLs not rendered
- [x] Empty sources array handled gracefully
- [x] Memory sources can appear without URLs
- [x] Unit tests added (sources-block.test.ts)

### Task 7: Add Memory Source Type (Optional - Phase 2)

**Future Enhancement:** When memory is read, create a source:

```typescript
{
  type: 'memory',
  title: 'From your saved preferences',
  reference: 'user-preferences/sid.yaml',
  // No URL needed - implicit trust
}
```

### Acceptance Criteria (Overall)

- [x] **AC1**: Thread sources show human-readable titles: `Sid: "can you tell me about Hulu..."` 
- [x] **AC2**: Thread sources have clickable Slack permalinks
- [x] **AC3**: File sources from orion-context are NOT shown (internal context only)
- [x] **AC4**: Sources block only renders sources with URLs
- [x] **AC5**: If no clickable sources exist, sources block is not shown at all
- [x] **AC6**: Memory sources (when implemented) shown without URL requirement
- [x] **AC7**: No regression in citation rate metrics

## Additional Context

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Thread message from deleted user | Use "User" as fallback |
| Permalink API rate limited | Use constructed URL fallback |
| Very long message text | Truncate to 50 chars in title |
| Bot message | Show "Orion: ..." |
| Thread with 20+ messages | Only source most recent 5 |
| MCP tool with URI | Extract and include as source |
| Private channel permalink | Slack handles access control |

### Testing Strategy

1. **Unit Tests:**
   - `src/slack/permalinks.test.ts` - Permalink generation
   - `src/slack/source-builder.test.ts` - Source building logic
   - `src/slack/sources-block.test.ts` - Filtering behavior

2. **Integration Tests:**
   - Thread sources render with permalinks
   - File sources are NOT rendered
   - Empty sources gracefully hidden

3. **Manual Verification:**
   - Click permalink in Slack → opens correct message
   - Response looks clean without garbage filenames

### Notes

- Slack `chat.getPermalink` is rate limited to ~100/min - should be fine for typical usage
- Constructed URLs work but may not handle private channels correctly
- This change significantly improves trust UX by only showing verifiable sources

## Dependencies

- Slack WebClient for `chat.getPermalink`
- No new packages required

## Risks

| Risk | Mitigation |
|------|------------|
| Permalink API slow | Parallelize calls, add timeout |
| Rate limiting | Fallback to constructed URLs |
| Breaking existing sources | Gradual rollout, feature flag |

---

## Dev Agent Record

### Code Review Phase 1 (2026-01-02)

**Reviewer:** Barry (Quick Flow Solo Dev)

**Issues Found & Fixed:**

| Issue | Severity | Status |
|-------|----------|--------|
| `userName` never populated in `thread-context.ts` | 🔴 CRITICAL | ✅ Fixed |
| Missing unit tests for `permalinks.ts` and `source-builder.ts` | 🔴 CRITICAL | ✅ Fixed |
| Dead code in `gather.ts` (old thread source format) | 🟡 MEDIUM | ✅ Fixed |
| Silent catch in `permalinks.ts` swallows errors | 🟢 LOW | ✅ Fixed |

---

### Enhancements Phase 2 (2026-01-02)

**Additional Features Implemented:**

| Feature | Description |
|---------|-------------|
| **Exclude current question** | Thread sources no longer cite the most recent user message (the current question being answered) |
| **Tool sources with context** | MCP tool calls shown as sources with tool name + search query context |
| **URL extraction from tool results** | Recursively extracts URLs from tool responses (for web search results) |
| **Multi-line source display** | Sources now display on separate lines with numbered format |
| **Tool context summarization** | Extracts query/search parameters from tool input for display |

**New Interfaces/Fields:**

```typescript
// ContextSource (gather.ts)
interface ContextSource {
  // ... existing fields ...
  toolContext?: string;  // NEW: Brief context about tool usage
}

// SourceCitation (sources-block.ts)
interface SourceCitation {
  // ... existing fields ...
  isTool?: boolean;      // NEW: Tool sources show without URL
  toolContext?: string;  // NEW: Search query/context
}
```

**Display Format (Before → After):**

```
BEFORE: 📎 Sources: [1] Source A | [2] Source B | [3] Source C

AFTER:  📎 Sources:
        [1] <link|Thread message>
        [2] 🔧 MSCI Reports: Search Reports — Hulu
        [3] 🔧 Audience Manager: Audience Search — golf
```

---

### Complete File List

| File | Action | Description |
|------|--------|-------------|
| `src/slack/thread-context.ts` | Modified | Extended ThreadMessage with channelId/userName fields |
| `src/slack/permalinks.ts` | Created | Permalink generation with API + fallback |
| `src/slack/permalinks.test.ts` | Created | 4 unit tests |
| `src/slack/source-builder.ts` | Created | Source builder with userName resolution via getUserDisplayName |
| `src/slack/source-builder.test.ts` | Created | 13 unit tests |
| `src/slack/sources-block.ts` | Modified | Multi-line format; isTool/toolContext support; 🔧 emoji |
| `src/slack/sources-block.test.ts` | Modified | 14 tests (added tool source tests) |
| `src/agent/gather.ts` | Modified | Added toolContext to ContextSource; removed dead thread source code |
| `src/agent/gather.test.ts` | Modified | Updated test expectations |
| `src/agent/loop.ts` | Modified | Track tool calls as sources; extract URLs; summarize tool input |
| `src/slack/handlers/user-message.ts` | Modified | Pass isTool/isMemory/toolContext to SourceCitation |
| `src/slack/handlers/app-mention.ts` | Modified | Pass isTool/isMemory/toolContext to SourceCitation |
| `src/slack/handlers/app-mention.test.ts` | Modified | Updated test expectations for new source format |

---

### Key Functions Added

| Function | File | Purpose |
|----------|------|---------|
| `formatToolDisplayName()` | loop.ts | Format "msci-reports__search" → "MSCI Reports: Search" |
| `summarizeToolInput()` | loop.ts | Extract query/search from tool input |
| `extractUrlSourcesFromResult()` | loop.ts | Recursively find URLs in tool responses |

---

### Test Results (Final)

```
 ✓ src/slack/permalinks.test.ts (4 tests)
 ✓ src/slack/source-builder.test.ts (13 tests)
 ✓ src/slack/sources-block.test.ts (14 tests)
 ✓ src/agent/gather.test.ts (2 tests)
 ✓ src/slack/thread-context.test.ts (15 tests)
```

---

## Future Considerations

### Areas Potentially Affected by These Changes

| Area | Impact | What to Check |
|------|--------|---------------|
| **New MCP Tools** | Tool sources will be auto-tracked | Verify `summarizeToolInput()` extracts relevant params for new tools |
| **Citation Rate Metrics** | Tool sources now counted | Update dashboards if tracking source types separately |
| **Memory Integration** | Already supported via `isMemory` flag | When memory is implemented, add `type: 'memory'` to sources |
| **Thread Compaction** | Thread sources exclude current message | Ensure compaction logic aligns with source logic |
| **Slack Block Kit Limits** | Multi-line sources may hit 3000 char limit | Consider truncation if many sources |
| **New Handlers** | Must pass `isTool`/`isMemory`/`toolContext` | Copy pattern from user-message.ts |
| **Web Search Tools** | URL extraction is recursive | If new format, update `extractUrlSourcesFromResult()` |
| **Assistant DM Handler** | Not updated in this change | Apply same pattern if sources needed there |

### Known Limitations

1. **Exa/Web Search URL Extraction**: Currently returns 0 URLs because Exa returns markdown-formatted text, not structured URL objects. URLs appear in the response but aren't extracted as sources. Future enhancement: parse markdown links from text content.

2. **Tool Context Length**: Limited to 50 chars in display to avoid Slack block overflow.

3. **Source Deduplication**: Tool sources are deduped by tool name, meaning if the same tool is called twice with different queries, only the first appears.

### Recommended Verifications for Future Tickets

- [ ] Test source display after adding new MCP server
- [ ] Verify tool sources appear when MCP tools are called
- [ ] Check multi-line format renders correctly in Slack
- [ ] Confirm thread sources don't include current question
- [ ] Validate URL extraction works for new tool response formats

---

## Related Stories

### Story 7-3: Contextual Tool Feedback (Updated 2026-01-02)

This tech spec created utilities that Story 7-3 should **reuse**:

| Utility | Purpose | 7-3 Should |
|---------|---------|------------|
| `formatToolDisplayName()` | Tool name formatting | Import from loop.ts |
| `summarizeToolInput()` | Query extraction | Import from loop.ts |

**Story 7-3 scope was reduced** to focus only on:
1. Passing tool context to `setStatus` callback
2. Enhancing `status-messages.ts` to build rich loading messages
3. Multi-tool parallel display in status bar

See `7-3-contextual-tool-feedback.md` for updated scope.

---

### Code Review Phase 3 (2026-01-02)

**Reviewer:** Barry (Quick Flow Solo Dev)

**Review Outcome:** ✅ PASSED

**Issues Found:** 0 Critical, 3 Medium, 3 Low

**Issues Fixed:**

| Issue | Severity | Fix |
|-------|----------|-----|
| File List incomplete - `app-mention.test.ts` missing | 🟡 MEDIUM | Added to File List |
| Story misstates file action - `permalinks.ts` as "Modified" | 🟡 MEDIUM | Corrected to "Created" |
| Story misstates file action - `source-builder.ts` as "Modified" | 🟡 MEDIUM | Corrected to "Created" |
| No timeout on permalink calls | 🟢 LOW | Added 2s timeout with `Promise.race` |

**Acceptance Criteria Verified:**
- ✅ AC1: Thread sources show human-readable titles
- ✅ AC2: Permalinks generated via API + fallback  
- ✅ AC3: File sources NOT shown
- ✅ AC4: Sources block filters displayable sources
- ✅ AC5: Returns null when no sources
- ✅ AC6: Memory sources exempt from URL requirement
- ✅ AC7: Citation metrics tracked

**Test Results:** 33/33 passing

