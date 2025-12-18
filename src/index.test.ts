/**
 * Tests for Application Startup
 *
 * Verifies:
 * - AC#1: Bolt app starts with Assistant registered
 * - AC#5: Startup appears in traces
 * - AC#6: Structured logging on startup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock instrumentation first
vi.mock('./instrumentation.js', () => ({}));

// Mock the slack app module
const mockApp = {
  message: vi.fn(),
  assistant: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./slack/app.js', () => ({
  createSlackApp: vi.fn(() => mockApp),
}));

// Mock the assistant module
const mockAssistant = {};
vi.mock('./slack/assistant.js', () => ({
  assistant: mockAssistant,
}));

// Mock the legacy message handler (Story 1-3 DM flow)
const mockHandleUserMessage = vi.fn();
vi.mock('./slack/handlers/user-message.js', () => ({
  handleUserMessage: mockHandleUserMessage,
}));

// Mock the logger
vi.mock('./utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock tracing
vi.mock('./observability/tracing.js', () => ({
  startActiveObservation: vi.fn(async (context, operation) => {
    const mockTrace = {
      id: 'mock-trace-id',
      update: vi.fn(),
    };
    return operation(mockTrace);
  }),
}));

describe('Application Startup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export startApp function', async () => {
    const { startApp } = await import('./index.js');
    expect(startApp).toBeDefined();
    expect(typeof startApp).toBe('function');
  });

  it('should register assistant with app (AC#1)', async () => {
    const { startApp } = await import('./index.js');

    await startApp();

    expect(mockApp.assistant).toHaveBeenCalledWith(mockAssistant);
  });

  it('should register legacy message handler for DMs (Story 1-3)', async () => {
    const { startApp } = await import('./index.js');

    await startApp();

    expect(mockApp.message).toHaveBeenCalledWith(mockHandleUserMessage);
  });

  it('should start app on configured port', async () => {
    const { startApp } = await import('./index.js');

    await startApp();

    expect(mockApp.start).toHaveBeenCalledWith(expect.any(Number));
  });

  it('should log app started event', async () => {
    const { startApp } = await import('./index.js');
    const { logger } = await import('./utils/logger.js');

    await startApp();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'app_started',
      })
    );
  });

  it('should wrap startup in trace (AC#5)', async () => {
    const { startApp } = await import('./index.js');
    const { startActiveObservation } = await import('./observability/tracing.js');

    await startApp();

    expect(startActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'orion-startup',
      }),
      expect.any(Function)
    );
  });
});
