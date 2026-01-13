# Plan: Anthropic API Prompt Caching

## Goal

Implement Anthropic's prompt caching feature to reduce API costs and latency by caching static content (system prompt, tool definitions) that repeats across requests. This can provide up to 90% cost savings on cached tokens and up to 85% latency reduction.

## Technical Choices

- **Cache Strategy**: Use `cache_control: { type: 'ephemeral' }` with 5-minute TTL (free refresh on each hit)
- **What to Cache**: Tools (most stable) → System prompt base (stable) → Dynamic context (not cached)
- **Implementation Approach**: Minimal changes - convert string `system` to content block array
- **No Breaking Changes**: Existing behavior preserved, just add cache control markers

## Current State Analysis

Currently, the agent loop passes system prompt as a **plain string** and tools as an array. This prevents prompt caching because:

1. `system: effectiveSystemPrompt` - String format, not cacheable
2. Tools lack `cache_control` markers on the final tool

### Key Files:

- `src/agent/loop.ts:993-1001` - API call site (needs modification)
- `src/agent/loop.ts:753-756` - System prompt construction (needs modification)
- `src/agent/loop.ts:727-732` - Tools array construction (needs cache marker on last tool)
- `src/agent/loader.ts` - Loads base system prompt (no changes needed)

### Current API Call (line 993):

```typescript
const stream = (await anthropic.messages.create({
  model: config.anthropicModel,
  max_tokens: 8192,
  system: effectiveSystemPrompt,  // ← String, not cacheable
  messages: attemptMessages,
  stream: true,
  ...(tools.length > 0 ? { tools } : {}),  // ← No cache_control
  ...(activeContainer ? { container: activeContainer } : {}),
}))
```

### Target API Call:

```typescript
const stream = (await anthropic.messages.create({
  model: config.anthropicModel,
  max_tokens: 8192,
  system: [
    {
      type: 'text',
      text: systemPrompt,  // Base prompt (stable)
      cache_control: { type: 'ephemeral' }
    },
    ...(contextText.length > 0 ? [{
      type: 'text',
      text: `\n\nContext:\n${contextText}`  // Dynamic (not cached)
    }] : [])
  ],
  messages: attemptMessages,
  stream: true,
  ...(tools.length > 0 ? { tools: toolsWithCacheControl } : {}),
  ...(activeContainer ? { container: activeContainer } : {}),
}))
```

## Tasks

### Task 1: Add Cache Control to Tools Array ✅

Add `cache_control` marker to the **last tool** in the array (caches all tools as a single prefix).

- [x] In `src/agent/loop.ts`, after building `tools` array (~line 732)
- [x] Add cache_control to the last tool in the array
- [x] Only add if tools.length > 0

**Files to modify:**
- `src/agent/loop.ts`

**Implementation:**

```typescript
// Add cache_control to last tool (caches all tools as prefix)
if (tools.length > 0) {
  const lastTool = tools[tools.length - 1];
  tools[tools.length - 1] = {
    ...lastTool,
    cache_control: { type: 'ephemeral' }
  } as typeof lastTool;
}
```

### Task 2: Convert System Prompt to Content Block Array ✅

Change `system` from string to array of content blocks with cache control.

- [x] In `src/agent/loop.ts`, modify system prompt construction (~line 753-756)
- [x] Separate base prompt (cacheable) from dynamic context (not cacheable)
- [x] Add `cache_control` to the base prompt block only

**Files to modify:**
- `src/agent/loop.ts`

**Implementation:**

```typescript
// Build system prompt as content blocks (for caching)
type SystemContentBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

const systemBlocks: SystemContentBlock[] = [
  {
    type: 'text',
    text: systemPrompt,
    cache_control: { type: 'ephemeral' }
  }
];

// Add dynamic context WITHOUT cache_control (changes per request)
if (contextText.length > 0) {
  systemBlocks.push({
    type: 'text',
    text: `\n\nContext:\n${contextText}`
  });
}
```

### Task 3: Update API Call to Use Content Blocks ✅

Modify the `messages.create()` call to use the new system format.

- [x] Replace `system: effectiveSystemPrompt` with `system: systemBlocks`
- [x] Update type annotations if needed

**Files to modify:**
- `src/agent/loop.ts`

### Task 4: Add Cache Performance Logging ✅

Log cache metrics from API response for monitoring.

- [x] Extract `cache_creation_input_tokens` and `cache_read_input_tokens` from `message_start` event
- [x] Log to Langfuse for observability
- [x] Add to existing token logging

**Files to modify:**
- `src/agent/loop.ts`

**Implementation:**

```typescript
// In message_start event handler (~line 1013)
if (event.type === 'message_start') {
  const usage = event.message?.usage as {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  } | undefined;

  if (usage?.cache_read_input_tokens || usage?.cache_creation_input_tokens) {
    logger.info({
      event: 'prompt_cache.metrics',
      traceId: context.traceId,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      inputTokens: usage.input_tokens ?? 0,
    });
  }
}
```

### Task 5: Update Tests ✅

Add/update tests for prompt caching behavior.

- [x] Test that system prompt is formatted as content blocks
- [x] Test that tools array has cache_control on last element
- [x] Test cache metrics logging

**Files to modify:**
- `src/agent/loop.test.ts`

### Task 6: Add Configuration Toggle (Required) ✅

Add environment variable to enable/disable prompt caching for rollback capability.

- [x] Add `PROMPT_CACHING_ENABLED` to config
- [x] Default to `true` (enabled)
- [x] Allow disabling for debugging/rollback

**Files to modify:**
- `src/config/environment.ts`
- `src/agent/loop.ts`

## Success Criteria

### Automated Verification:
- [x] Type check passes: `npm run typecheck` (pre-existing TS errors unrelated to prompt caching)
- [x] Tests pass: `npm test` (86 tests pass including 7 new prompt caching tests)
- [x] Build succeeds: `npm run build`

### Manual Verification:
- [ ] Send a message to Orion, check Langfuse for `prompt_cache.metrics` event
- [ ] Second message within 5 minutes should show `cache_read_input_tokens > 0`
- [ ] Compare Langfuse costs before/after (should see ~90% reduction on cached tokens)

### Observable Metrics:
- [ ] `cache_creation_input_tokens` on first request
- [ ] `cache_read_input_tokens` on subsequent requests
- [ ] Lower `input_tokens` cost in Langfuse

## Risks (Pre-Mortem)

### Tigers:

- **Minimum token requirement not met** (MEDIUM)
  - Claude Sonnet requires 1024 tokens minimum for caching
  - Mitigation: System prompt + tools likely exceeds this, but verify

- **Type compatibility issues** (LOW)
  - SDK types may not expose cache_control properly
  - Mitigation: Use type assertions, test at runtime

### Elephants:

- **Cache invalidation on tool changes** (LOW)
  - Any tool modification invalidates entire tools cache
  - Note: Tools change rarely, impact minimal

## Out of Scope

- Extended cache (1-hour TTL) - not needed, 5-minute free refresh sufficient
- Caching message history - complex, marginal benefit
- Per-tool cache breakpoints - single breakpoint on last tool is simpler

## Cost/Benefit Analysis

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| System prompt tokens | Charged at 100% | Charged at 10% (cache hit) | 90% |
| Tool definition tokens | Charged at 100% | Charged at 10% (cache hit) | 90% |
| First request latency | Baseline | +25% (cache write) | -25% slower |
| Subsequent request latency | Baseline | Up to -85% | 85% faster |

For typical Orion usage with ~3000 token system prompt + tools:
- Cache write: 3000 * $0.00375/1K = $0.01125 (25% premium)
- Cache hit: 3000 * $0.0003/1K = $0.0009 (90% discount)
- Break-even: 2nd request onwards saves money

## References

- [Anthropic Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Current implementation: `src/agent/loop.ts:993-1001`
