/**
 * Verification Metrics Module
 *
 * Tracks verification pass rates and failure reasons for observability.
 * Metrics are logged to Langfuse for dashboard aggregation.
 *
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#5 - Verification pass rate is tracked (target: >95%)
 * @see Story 2.7 - Source Citations
 * @see AC#3 - Citation rate is tracked (target: >90%)
 */

import { logger } from '../utils/logger.js';
import type { VerificationResult } from '../agent/loop.js';
import { MAX_ATTEMPTS } from '../agent/loop.js';

/** Target citation rate threshold (90%) */
export const CITATION_RATE_TARGET = 0.9;

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

/**
 * Citation metrics for tracking source citation usage
 *
 * @see Story 2.7 AC#3 - Citation rate is tracked (target: >90%)
 */
export interface CitationMetrics {
  /** Total responses with sources gathered */
  responsesWithSources: number;
  /** Responses that included citations */
  responsesWithCitations: number;
  /** Total citations used across all responses */
  totalCitations: number;
  /** Total sources gathered across all responses */
  totalSourcesGathered: number;
  /** Calculated citation rate (0-1) */
  citationRate?: number;
}

// In-memory metrics state (reset on service restart)
let metrics: VerificationMetrics = {
  totalAttempts: 0,
  passedFirstAttempt: 0,
  passedAfterRetry: 0,
  failedAllAttempts: 0,
  issuesByType: {},
};

// In-memory citation metrics state (reset on service restart)
let citationMetrics: CitationMetrics = {
  responsesWithSources: 0,
  responsesWithCitations: 0,
  totalCitations: 0,
  totalSourcesGathered: 0,
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

/**
 * Track citation usage for a response
 *
 * Logs warning to Langfuse when citation rate falls below 90% target.
 *
 * @param sourcesGathered - Number of sources gathered during gather phase
 * @param citationsUsed - Number of unique citations in the response
 * @param traceId - Optional trace ID for observability
 *
 * @see Story 2.7 AC#3 - Citation rate is tracked (target: >90%)
 */
export function trackCitations(
  sourcesGathered: number,
  citationsUsed: number,
  traceId?: string
): void {
  // Only track if sources were gathered
  if (sourcesGathered > 0) {
    citationMetrics.responsesWithSources++;
    citationMetrics.totalSourcesGathered += sourcesGathered;

    if (citationsUsed > 0) {
      citationMetrics.responsesWithCitations++;
      citationMetrics.totalCitations += citationsUsed;
    }

    // Calculate current citation rate
    const rate = citationMetrics.responsesWithSources > 0
      ? citationMetrics.responsesWithCitations / citationMetrics.responsesWithSources
      : 1;

    // Log citation metric event
    logger.info({
      event: 'citation_metric',
      sourcesGathered,
      citationsUsed,
      currentRate: rate,
      traceId,
    });

    // Log warning if citation rate falls below target
    if (rate < CITATION_RATE_TARGET) {
      logger.warn({
        event: 'citation_rate_below_target',
        currentRate: rate,
        target: CITATION_RATE_TARGET,
        responsesWithSources: citationMetrics.responsesWithSources,
        responsesWithCitations: citationMetrics.responsesWithCitations,
        traceId,
      });
    }
  }
}

/**
 * Get current citation metrics with calculated rate
 *
 * @returns Current citation metrics
 */
export function getCitationMetrics(): CitationMetrics {
  const rate = citationMetrics.responsesWithSources > 0
    ? citationMetrics.responsesWithCitations / citationMetrics.responsesWithSources
    : 1;

  return {
    ...citationMetrics,
    citationRate: rate,
  };
}

/**
 * Reset citation metrics to zero (for testing)
 */
export function resetCitationMetrics(): void {
  citationMetrics = {
    responsesWithSources: 0,
    responsesWithCitations: 0,
    totalCitations: 0,
    totalSourcesGathered: 0,
  };
}

