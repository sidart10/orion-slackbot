import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('instrumentation', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear any cached imports
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export instrumentationLoaded as true', async () => {
    const { instrumentationLoaded } = await import('./instrumentation.js');
    expect(instrumentationLoaded).toBe(true);
  });

  it('should log structured JSON on initialization', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Re-import to trigger initialization
    vi.resetModules();
    await import('./instrumentation.js');

    // Find the instrumentation log call
    const logCalls = consoleSpy.mock.calls.map((call) => call[0]);
    const instrumentationLog = logCalls.find(
      (log) => typeof log === 'string' && log.includes('instrumentation')
    );

    expect(instrumentationLog).toBeDefined();
  });

  it('should have service name configured as orion-slack-agent', async () => {
    // This will be verified by checking the SDK configuration
    // The actual SDK setup exports config we can check
    const instrumentation = await import('./instrumentation.js');

    // Verify the module exports the expected service name constant
    expect(instrumentation.SERVICE_NAME).toBe('orion-slack-agent');
  });

  it('should have service version configured', async () => {
    const instrumentation = await import('./instrumentation.js');
    expect(instrumentation.SERVICE_VERSION).toBeDefined();
    expect(typeof instrumentation.SERVICE_VERSION).toBe('string');
  });
});

