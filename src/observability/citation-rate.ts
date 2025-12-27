/**
 * Rolling citation-rate tracker (Story 2.7).
 *
 * Purpose: compute a simple rolling window citation rate so we can emit a warning
 * when the rate drops below target (Langfuse-first).
 *
 * NOTE: This is in-memory and per-process. In Cloud Run this is best-effort;
 * Langfuse is still the source of truth for long-term analytics.
 */
const WINDOW_SIZE = 100;
const MIN_WINDOW_TO_WARN = 20;
const TARGET_RATE = 0.9;

// Store only eligible responses (sourcesGatheredCount > 0). Each entry indicates "cited" status.
const eligibleWindow: boolean[] = [];

export interface CitationWindowSnapshot {
  eligibleWindowCount: number;
  citedWindowCount: number;
  rate: number | null;
  belowTarget: boolean;
}

export function recordCitationOutcome(params: {
  eligible: boolean;
  cited: boolean;
}): CitationWindowSnapshot {
  if (params.eligible) {
    eligibleWindow.push(params.cited);
    if (eligibleWindow.length > WINDOW_SIZE) eligibleWindow.shift();
  }

  const eligibleWindowCount = eligibleWindow.length;
  const citedWindowCount = eligibleWindow.filter(Boolean).length;
  const rate = eligibleWindowCount > 0 ? citedWindowCount / eligibleWindowCount : null;

  const belowTarget =
    eligibleWindowCount >= MIN_WINDOW_TO_WARN &&
    rate !== null &&
    rate < TARGET_RATE;

  return { eligibleWindowCount, citedWindowCount, rate, belowTarget };
}

// Test-only escape hatch.
export function resetCitationWindowForTests(): void {
  eligibleWindow.length = 0;
}


