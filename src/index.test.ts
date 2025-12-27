/**
 * Tests for Application Startup
 *
 * Verifies:
 * - AC#1: Bolt app starts with Assistant registered
 * - AC#6: Structured logging on startup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock instrumentation first
vi.mock('./instrumentation.js', () => ({}));

// Mock the slack app module
const mockApp = {
  message: vi.fn(),
  assistant: vi.fn(),
  event: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
};

const mockReceiver = {
  router: {
    get: vi.fn(),
  },
};

vi.mock('./slack/app.js', () => ({
  createSlackApp: vi.fn(() => ({ app: mockApp, receiver: mockReceiver })),
  isSocketMode: false,
}));

// Mock the assistant module
const mockAssistant = {};
vi.mock('./slack/assistant.js', () => ({
  assistant: mockAssistant,
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

// Mock langfuse shutdown
vi.mock('./observability/langfuse.js', () => ({
  shutdown: vi.fn().mockResolvedValue(undefined),
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
});
