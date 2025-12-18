/**
 * Verification Metrics Module
 *
 * Tracks verification pass rates and failure reasons for observability.
 * Metrics are logged to Langfuse for dashboard aggregation.
 *
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#5 - Verification pass rate is tracked (target: >95%)
 */

import { logger } from '../utils/logger.js';
import type { VerificationResult } from '../agent/loop.js';
import { MAX_ATTEMPTS } from '../agent/loop.js';

/**
 * Verification metrics for tracking pass rates and failure reasons
 */
export interface VerificationMetrics {
  /** Total verification attempts */
  totalAttempts: number;
  /** Passed on first attempt */
  passedFirstAttempt: number;
  /** Passed after retry (attempt > 1) */
  passedAfterRetry: number;
  /** Failed all MAX_ATTEMPTS attempts */
  failedAllAttempts: number;
  /** Count of issues by rule name */
  issuesByType: Record<string, number>;
  /** Calculated pass rate (0-1) */
  passRate?: number;
}

// In-memory metrics state (reset on service restart)
let metrics: VerificationMetrics = {
  totalAttempts: 0,
  passedFirstAttempt: 0,
  passedAfterRetry: 0,
  failedAllAttempts: 0,
  issuesByType: {},
};

/**
 * Track a verification result for metrics
 *
 * @param result - The verification result
 * @param attempt - The attempt number (1-indexed)
 */
export function trackVerification(result: VerificationResult, attempt: number): void {
  metrics.totalAttempts++;

  if (result.passed) {
    if (attempt === 1) {
      metrics.passedFirstAttempt++;
    } else {
      metrics.passedAfterRetry++;
    }
  } else if (attempt === MAX_ATTEMPTS) {
    metrics.failedAllAttempts++;
  }

  // Track issues by rule type
  for (const issue of result.issues) {
    metrics.issuesByType[issue.rule] = (metrics.issuesByType[issue.rule] || 0) + 1;
  }

  // Log verification metric event
  logger.info({
    event: 'verification_metric',
    passed: result.passed,
    attempt,
    issueCount: result.issues.length,
    issues: result.issues.map((i) => i.rule),
  });
}

/**
 * Get current metrics state with calculated pass rate
 *
 * @returns Current verification metrics
 */
export function getMetrics(): VerificationMetrics {
  const passed = metrics.passedFirstAttempt + metrics.passedAfterRetry;
  const total = passed + metrics.failedAllAttempts;

  return {
    ...metrics,
    passRate: total > 0 ? passed / total : 1,
  };
}

/**
 * Reset all metrics to zero (for testing)
 */
export function resetMetrics(): void {
  metrics = {
    totalAttempts: 0,
    passedFirstAttempt: 0,
    passedAfterRetry: 0,
    failedAllAttempts: 0,
    issuesByType: {},
  };
}

