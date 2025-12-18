# Story 9.2: Cost Tracking Per Interaction

Status: ready-for-dev

## Story

As a **platform admin**, I want to see cost per interaction, So that I can monitor spending and optimize.

## Acceptance Criteria

1. **Given** token usage is tracked, **When** costs are calculated, **Then** cost per interaction is computed and logged (FR36)
2. Costs are based on current model pricing
3. Average cost per query is tracked (target: <$0.10, NFR26)
4. Cost data is visible in Langfuse dashboard
5. High-cost interactions are identifiable

## Tasks / Subtasks

- [ ] **Task 1: Define Pricing Table** (AC: #2) - Model costs
- [ ] **Task 2: Calculate Cost** (AC: #1) - From tokens
- [ ] **Task 3: Track Average** (AC: #3) - Rolling average
- [ ] **Task 4: Log to Langfuse** (AC: #4) - Add to trace
- [ ] **Task 5: Flag High Cost** (AC: #5) - Alert on expensive
- [ ] **Task 6: Verification** - Check cost accuracy

## Dev Notes

### Cost Calculation

```typescript
const MODEL_PRICING = {
  'claude-sonnet-4-20250514': {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
  },
};

function calculateCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING[usage.model];
  return (
    (usage.inputTokens / 1000) * pricing.inputPer1k +
    (usage.outputTokens / 1000) * pricing.outputPer1k
  );
}
```

### File List

Files to create: `src/observability/cost-tracking.ts`

