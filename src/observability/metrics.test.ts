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
    it('should export VerificationMetrics interface', async () => {
      const metricsModule = await import('./metrics.js');
      // Type check - interface exists if we can use it
      const metrics: typeof metricsModule.VerificationMetrics = {
        totalAttempts: 0,
        passedFirstAttempt: 0,
        passedAfterRetry: 0,
        failedAllAttempts: 0,
        issuesByType: {},
      };
      expect(metrics.totalAttempts).toBe(0);
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

