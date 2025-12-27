/**
 * Tests for Verification Metrics Module
 *
 * @see Story 2.3 - Response Verification & Retry
 * @see AC#5 - Verification pass rate is tracked (target: >95%)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VerificationResult, VerificationIssue } from '../agent/loop.js';

// Hoist mocks
const { mockLogger, mockLangfuse } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockLangfuse: {
    trace: vi.fn(() => ({
      id: 'trace-id',
      update: vi.fn(),
      span: vi.fn(() => ({ end: vi.fn() })),
      generation: vi.fn(),
    })),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('./langfuse.js', () => ({
  getLangfuse: () => mockLangfuse,
}));

describe('Verification Metrics Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Module Exports', () => {
    it('should export VerificationMetrics interface via getMetrics', async () => {
      const metricsModule = await import('./metrics.js');
      // Interface check - getMetrics returns VerificationMetrics shape
      const metrics = metricsModule.getMetrics();
      expect(metrics).toHaveProperty('totalAttempts');
      expect(metrics).toHaveProperty('passedFirstAttempt');
      expect(metrics).toHaveProperty('passedAfterRetry');
      expect(metrics).toHaveProperty('failedAllAttempts');
      expect(metrics).toHaveProperty('issuesByType');
    });

    it('should export trackVerification function', async () => {
      const metricsModule = await import('./metrics.js');
      expect(metricsModule.trackVerification).toBeDefined();
      expect(typeof metricsModule.trackVerification).toBe('function');
    });

    it('should export getMetrics function', async () => {
      const metricsModule = await import('./metrics.js');
      expect(metricsModule.getMetrics).toBeDefined();
      expect(typeof metricsModule.getMetrics).toBe('function');
    });

    it('should export resetMetrics function', async () => {
      const metricsModule = await import('./metrics.js');
      expect(metricsModule.resetMetrics).toBeDefined();
      expect(typeof metricsModule.resetMetrics).toBe('function');
    });
  });

  describe('trackVerification', () => {
    it('should increment totalAttempts on each call', async () => {
      const { trackVerification, getMetrics, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      const result: VerificationResult = {
        passed: true,
        feedback: 'OK',
        issues: [],
      };

      trackVerification(result, 1);
      trackVerification(result, 1);
      trackVerification(result, 1);

      const metrics = getMetrics();
      expect(metrics.totalAttempts).toBe(3);
    });

    it('should increment passedFirstAttempt when passed=true and attempt=1', async () => {
      const { trackVerification, getMetrics, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      const result: VerificationResult = {
        passed: true,
        feedback: 'OK',
        issues: [],
      };

      trackVerification(result, 1);

      const metrics = getMetrics();
      expect(metrics.passedFirstAttempt).toBe(1);
    });

    it('should increment passedAfterRetry when passed=true and attempt>1', async () => {
      const { trackVerification, getMetrics, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      const result: VerificationResult = {
        passed: true,
        feedback: 'OK',
        issues: [],
      };

      trackVerification(result, 2);
      trackVerification(result, 3);

      const metrics = getMetrics();
      expect(metrics.passedAfterRetry).toBe(2);
    });

    it('should increment failedAllAttempts when passed=false and attempt=3', async () => {
      const { trackVerification, getMetrics, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      const result: VerificationResult = {
        passed: false,
        feedback: 'Failed',
        issues: [{ rule: 'not_empty', severity: 'error', feedback: 'Empty' }],
      };

      trackVerification(result, 3);

      const metrics = getMetrics();
      expect(metrics.failedAllAttempts).toBe(1);
    });

    it('should track issuesByType from verification issues', async () => {
      const { trackVerification, getMetrics, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      const issues: VerificationIssue[] = [
        { rule: 'not_empty', severity: 'error', feedback: 'Empty' },
        { rule: 'no_markdown_bold', severity: 'error', feedback: 'Bold' },
        { rule: 'not_empty', severity: 'error', feedback: 'Empty again' },
      ];

      const result: VerificationResult = {
        passed: false,
        feedback: 'Failed',
        issues,
      };

      trackVerification(result, 1);

      const metrics = getMetrics();
      expect(metrics.issuesByType['not_empty']).toBe(2);
      expect(metrics.issuesByType['no_markdown_bold']).toBe(1);
    });

    it('should log verification event', async () => {
      const { trackVerification, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      const result: VerificationResult = {
        passed: true,
        feedback: 'OK',
        issues: [],
      };

      trackVerification(result, 1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'verification_metric',
        })
      );
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics state', async () => {
      const { getMetrics, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      const metrics = getMetrics();

      expect(metrics).toHaveProperty('totalAttempts');
      expect(metrics).toHaveProperty('passedFirstAttempt');
      expect(metrics).toHaveProperty('passedAfterRetry');
      expect(metrics).toHaveProperty('failedAllAttempts');
      expect(metrics).toHaveProperty('issuesByType');
    });

    it('should calculate passRate correctly', async () => {
      const { trackVerification, getMetrics, resetMetrics } = await import('./metrics.js');
      resetMetrics();

      // 3 passes, 1 fail = 75% pass rate
      trackVerification({ passed: true, feedback: '', issues: [] }, 1);
      trackVerification({ passed: true, feedback: '', issues: [] }, 1);
      trackVerification({ passed: true, feedback: '', issues: [] }, 2);
      trackVerification({ passed: false, feedback: '', issues: [] }, 3);

      const metrics = getMetrics();
      expect(metrics.passRate).toBeCloseTo(0.75);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all counters to zero', async () => {
      const { trackVerification, getMetrics, resetMetrics } = await import('./metrics.js');

      // Add some metrics
      trackVerification({ passed: true, feedback: '', issues: [] }, 1);
      trackVerification({ passed: false, feedback: '', issues: [{ rule: 'test', severity: 'error', feedback: '' }] }, 3);

      // Reset
      resetMetrics();

      const metrics = getMetrics();
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.passedFirstAttempt).toBe(0);
      expect(metrics.passedAfterRetry).toBe(0);
      expect(metrics.failedAllAttempts).toBe(0);
      expect(Object.keys(metrics.issuesByType)).toHaveLength(0);
    });
  });
});

/**
 * Tests for Citation Metrics
 *
 * @see Story 2.7 - Source Citations
 * @see AC#3 - Citation rate is tracked (target: >90%)
 */
describe('Citation Metrics Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Module Exports', () => {
    it('should export CITATION_RATE_TARGET as 0.9', async () => {
      const { CITATION_RATE_TARGET } = await import('./metrics.js');
      expect(CITATION_RATE_TARGET).toBe(0.9);
    });

    it('should export trackCitations function', async () => {
      const metricsModule = await import('./metrics.js');
      expect(metricsModule.trackCitations).toBeDefined();
      expect(typeof metricsModule.trackCitations).toBe('function');
    });

    it('should export getCitationMetrics function', async () => {
      const metricsModule = await import('./metrics.js');
      expect(metricsModule.getCitationMetrics).toBeDefined();
      expect(typeof metricsModule.getCitationMetrics).toBe('function');
    });

    it('should export resetCitationMetrics function', async () => {
      const metricsModule = await import('./metrics.js');
      expect(metricsModule.resetCitationMetrics).toBeDefined();
      expect(typeof metricsModule.resetCitationMetrics).toBe('function');
    });
  });

  describe('trackCitations', () => {
    it('should increment responsesWithSources when sources > 0', async () => {
      const { trackCitations, getCitationMetrics, resetCitationMetrics } =
        await import('./metrics.js');
      resetCitationMetrics();

      trackCitations(3, 2);

      const metrics = getCitationMetrics();
      expect(metrics.responsesWithSources).toBe(1);
    });

    it('should not track when no sources gathered', async () => {
      const { trackCitations, getCitationMetrics, resetCitationMetrics } =
        await import('./metrics.js');
      resetCitationMetrics();

      trackCitations(0, 0);

      const metrics = getCitationMetrics();
      expect(metrics.responsesWithSources).toBe(0);
    });

    it('should increment responsesWithCitations when citations > 0', async () => {
      const { trackCitations, getCitationMetrics, resetCitationMetrics } =
        await import('./metrics.js');
      resetCitationMetrics();

      trackCitations(2, 1);
      trackCitations(3, 0); // Sources but no citations

      const metrics = getCitationMetrics();
      expect(metrics.responsesWithSources).toBe(2);
      expect(metrics.responsesWithCitations).toBe(1);
    });

    it('should accumulate totalCitations and totalSourcesGathered', async () => {
      const { trackCitations, getCitationMetrics, resetCitationMetrics } =
        await import('./metrics.js');
      resetCitationMetrics();

      trackCitations(3, 2);
      trackCitations(5, 4);

      const metrics = getCitationMetrics();
      expect(metrics.totalSourcesGathered).toBe(8);
      expect(metrics.totalCitations).toBe(6);
    });

    it('should log citation metric event', async () => {
      const { trackCitations, resetCitationMetrics } = await import('./metrics.js');
      resetCitationMetrics();

      trackCitations(2, 1, 'trace-123');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'citation_metric',
          sourcesGathered: 2,
          citationsUsed: 1,
          traceId: 'trace-123',
        })
      );
    });

    it('should log warning when citation rate falls below 90%', async () => {
      const { trackCitations, resetCitationMetrics } = await import('./metrics.js');
      resetCitationMetrics();

      // 10 responses with sources, only 8 with citations = 80% rate
      for (let i = 0; i < 8; i++) {
        trackCitations(2, 1); // Has citations
      }
      trackCitations(2, 0); // No citations
      trackCitations(2, 0); // No citations - now at 80%

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'citation_rate_below_target',
          target: 0.9,
        })
      );
    });
  });

  describe('getCitationMetrics', () => {
    it('should return current citation metrics state', async () => {
      const { getCitationMetrics, resetCitationMetrics } = await import('./metrics.js');
      resetCitationMetrics();

      const metrics = getCitationMetrics();

      expect(metrics).toHaveProperty('responsesWithSources');
      expect(metrics).toHaveProperty('responsesWithCitations');
      expect(metrics).toHaveProperty('totalCitations');
      expect(metrics).toHaveProperty('totalSourcesGathered');
      expect(metrics).toHaveProperty('citationRate');
    });

    it('should calculate citationRate correctly', async () => {
      const { trackCitations, getCitationMetrics, resetCitationMetrics } =
        await import('./metrics.js');
      resetCitationMetrics();

      // 4 responses with sources, 3 with citations = 75%
      trackCitations(2, 1);
      trackCitations(2, 1);
      trackCitations(2, 1);
      trackCitations(2, 0);

      const metrics = getCitationMetrics();
      expect(metrics.citationRate).toBeCloseTo(0.75);
    });

    it('should return 1 for citationRate when no sources gathered', async () => {
      const { getCitationMetrics, resetCitationMetrics } = await import('./metrics.js');
      resetCitationMetrics();

      const metrics = getCitationMetrics();
      expect(metrics.citationRate).toBe(1);
    });
  });

  describe('resetCitationMetrics', () => {
    it('should reset all citation counters to zero', async () => {
      const { trackCitations, getCitationMetrics, resetCitationMetrics } =
        await import('./metrics.js');

      // Add some metrics
      trackCitations(3, 2);
      trackCitations(2, 1);

      // Reset
      resetCitationMetrics();

      const metrics = getCitationMetrics();
      expect(metrics.responsesWithSources).toBe(0);
      expect(metrics.responsesWithCitations).toBe(0);
      expect(metrics.totalCitations).toBe(0);
      expect(metrics.totalSourcesGathered).toBe(0);
    });
  });
});

