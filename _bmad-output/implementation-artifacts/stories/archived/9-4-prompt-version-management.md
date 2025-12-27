# Story 9.4: Prompt Version Management

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: Langfuse prompt management feature provides this

## Story

As a **platform admin**, I want to manage prompt versions via Langfuse, So that I can iterate on prompts without code changes.

## Acceptance Criteria

1. **Given** Langfuse prompt management is available, **When** I create or update a prompt version, **Then** prompts can be versioned and managed in Langfuse (FR38)
2. The application fetches prompts from Langfuse
3. Prompt caching respects 5-minute TTL (AR32)
4. Prompt changes take effect without restart
5. Prompt performance can be compared across versions

## Tasks / Subtasks

- [ ] **Task 1: Create Prompts in Langfuse** (AC: #1) - Set up prompts
- [ ] **Task 2: Fetch at Runtime** (AC: #2) - Use getPrompt()
- [ ] **Task 3: Implement Caching** (AC: #3) - 5-minute TTL
- [ ] **Task 4: No Restart Required** (AC: #4) - Cache refresh
- [ ] **Task 5: Track Performance** (AC: #5) - Link prompts to traces
- [ ] **Task 6: Verification** - Change prompt, verify effect

## Dev Notes

### Prompt Caching

```typescript
const PROMPT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class PromptCache {
  private cache = new Map<string, { prompt: Prompt; expires: number }>();

  async getPrompt(name: string): Promise<Prompt> {
    const cached = this.cache.get(name);
    if (cached && Date.now() < cached.expires) {
      return cached.prompt;
    }
    
    const prompt = await langfuse.getPrompt(name);
    this.cache.set(name, {
      prompt,
      expires: Date.now() + PROMPT_CACHE_TTL,
    });
    return prompt;
  }
}
```

### File List

Files to modify: `src/observability/langfuse.ts`

