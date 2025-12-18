# Story 9.5: Budget Alerts & Limits

Status: ready-for-dev

## Story

As a **platform admin**, I want budget alerts and spending limits, So that costs stay within acceptable bounds.

## Acceptance Criteria

1. **Given** cost tracking is working, **When** spending approaches limits, **Then** configurable budget alerts are triggered (NFR27)
2. Alerts can be configured via environment variables
3. Spending limits can be enforced if needed
4. Alert history is logged
5. Monthly cost reports are available in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Define Budget Config** (AC: #2) - Environment variables
- [ ] **Task 2: Track Cumulative Spend** (AC: #1) - Running total
- [ ] **Task 3: Trigger Alerts** (AC: #1) - At threshold
- [ ] **Task 4: Enforce Limits** (AC: #3) - Optional hard limit
- [ ] **Task 5: Log Alert History** (AC: #4) - Structured logs
- [ ] **Task 6: Monthly Reports** (AC: #5) - Aggregate in Langfuse
- [ ] **Task 7: Verification** - Test alert triggers

## Dev Notes

### Budget Configuration

```bash
# Environment variables
ORION_BUDGET_MONTHLY_LIMIT=500     # USD
ORION_BUDGET_ALERT_THRESHOLD=0.8  # 80% of limit
ORION_BUDGET_ENFORCE_LIMIT=false  # Hard vs soft limit
ORION_BUDGET_ALERT_SLACK_CHANNEL=#orion-alerts
```

### Budget Tracking

```typescript
interface BudgetStatus {
  currentSpend: number;
  limit: number;
  threshold: number;
  percentUsed: number;
  alertTriggered: boolean;
}

async function checkBudget(newCost: number): Promise<BudgetStatus> {
  // Track cumulative, check threshold, trigger if needed
}
```

### File List

Files to create: `src/observability/budget.ts`

