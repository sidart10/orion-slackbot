/**
 * Tests for Slack Bolt App Configuration
 *
 * Verifies:
 * - AC#1: App can receive messages (initialization works)
 * - AC#2: Signing secret validation is configured
 *
 * @see AR11 - All handlers must be wrapped in Langfuse traces
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from '@slack/bolt';

interface CapturedConfig {
  signingSecret?: string;
  socketMode?: boolean;
  logLevel?: string;
  token?: string;
}

// Track the config passed to App constructor using an object wrapper
// to avoid TypeScript narrowing issues
const configHolder: { value: CapturedConfig | null } = { value: null };

// Mock @slack/bolt before importing
vi.mock('@slack/bolt', () => {
  const mockApp = vi.fn().mockImplementation((config: CapturedConfig) => {
    configHolder.value = config;
    return {
      message: vi.fn(),
      assistant: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
    };
  });
  return {
    App: mockApp,
    LogLevel: {
      DEBUG: 'debug',
      INFO: 'info',
    },
  };
});

describe('Slack App Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    configHolder.value = null;
    process.env = {
      ...originalEnv,
      SLACK_BOT_TOKEN: 'xoxb-test-token',
      SLACK_SIGNING_SECRET: 'test-signing-secret',
      NODE_ENV: 'development',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should initialize Bolt App with required configuration', async () => {
    const { createSlackApp } = await import('./app.js');
    const app = createSlackApp();

    expect(app).toBeDefined();
    expect(App).toHaveBeenCalled();
  });

  it('should configure app with signing secret validation (AC#2)', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    expect(configHolder.value?.signingSecret).toBe('test-signing-secret');
  });

  it('should configure app in HTTP mode (not socket mode) for Cloud Run', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    expect(configHolder.value?.socketMode).toBe(false);
  });

  it('should set log level based on environment', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    expect(configHolder.value?.logLevel).toBe('debug'); // development mode
  });

  it('should use INFO log level in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LANGFUSE_PUBLIC_KEY = 'test';
    process.env.LANGFUSE_SECRET_KEY = 'test';
    process.env.ANTHROPIC_API_KEY = 'test';

    vi.resetModules();
    configHolder.value = null;

    const appModule = await import('./app.js');
    appModule.createSlackApp();

    // Access through the holder to avoid TypeScript narrowing issues
    const config = configHolder.value as unknown as CapturedConfig;
    expect(config).toBeDefined();
    expect(config.logLevel).toBe('info');
  });

  it('should use bot token from config', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    expect(configHolder.value?.token).toBe('xoxb-test-token');
  });
});
