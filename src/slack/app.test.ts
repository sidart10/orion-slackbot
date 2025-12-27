/**
 * Tests for Slack Bolt App Configuration
 *
 * Verifies:
 * - AC#1: App can receive messages (initialization works)
 * - AC#2: Signing secret validation is configured
 * - Story 1.6: Health endpoint for Cloud Run
 *
 * @see AR11 - All handlers must be wrapped in Langfuse traces
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { App, ExpressReceiver } from '@slack/bolt';

// Mock MCP modules for /health/mcp endpoint tests
vi.mock('../tools/mcp/index.js', () => ({
  getMcpServersConfig: vi.fn(() => ({
    'brave-search': { type: 'http', url: 'https://mcp.example.com', enabled: true },
    'github': { type: 'stdio', command: 'npx', args: ['-y', '@mcp/github'], enabled: true },
  })),
  getAllServerHealth: vi.fn(() => [
    { name: 'brave-search', available: true, failureCount: 0 },
    { name: 'github', available: false, failureCount: 2, lastError: 'Connection refused', lastErrorTime: new Date('2025-01-01T00:00:00Z') },
  ]),
}));

interface CapturedConfig {
  signingSecret?: string;
  socketMode?: boolean;
  logLevel?: string;
  token?: string;
  receiver?: unknown;
}

interface ReceiverConfig {
  signingSecret?: string;
  endpoints?: string;
}

// Track the config passed to constructors
const configHolder: { value: CapturedConfig | null } = { value: null };
const receiverConfigHolder: { value: ReceiverConfig | null } = { value: null };
const routerMock = {
  get: vi.fn(),
};

// Mock @slack/bolt before importing
vi.mock('@slack/bolt', () => {
  const MockApp = vi.fn().mockImplementation((config: unknown) => {
    (globalThis as Record<string, unknown>).__testConfigHolder = config;
    return {
      message: vi.fn(),
      assistant: vi.fn(),
      action: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
    };
  });

  const MockExpressReceiver = vi.fn().mockImplementation((config: unknown) => {
    (globalThis as Record<string, unknown>).__testReceiverConfig = config;
    // Store all registered routes in a map
    const routeHandlers: Record<string, unknown> = {};
    (globalThis as Record<string, unknown>).__routeHandlers = routeHandlers;
    return {
      router: {
        get: vi.fn().mockImplementation((path: string, handler: unknown) => {
          routeHandlers[path] = handler;
          // Also keep legacy behavior for backwards compatibility (use /health specifically)
          if (path === '/health') {
            (globalThis as Record<string, unknown>).__healthHandler = handler;
            (globalThis as Record<string, unknown>).__healthPath = path;
          }
        }),
      },
    };
  });

  const MockLogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
  };

  return {
    // Named exports for compatibility with type imports
    App: MockApp,
    ExpressReceiver: MockExpressReceiver,
    LogLevel: MockLogLevel,
    // Default export for CommonJS interop (import bolt from '@slack/bolt')
    default: {
      App: MockApp,
      ExpressReceiver: MockExpressReceiver,
      LogLevel: MockLogLevel,
    },
  };
});

describe('Slack App Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    configHolder.value = null;
    receiverConfigHolder.value = null;
    (globalThis as Record<string, unknown>).__testConfigHolder = null;
    (globalThis as Record<string, unknown>).__testReceiverConfig = null;
    (globalThis as Record<string, unknown>).__healthHandler = null;
    (globalThis as Record<string, unknown>).__healthPath = null;
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
    const { app, receiver } = createSlackApp();

    expect(app).toBeDefined();
    expect(receiver).toBeDefined();
    expect(App).toHaveBeenCalled();
  });

  it('should use ExpressReceiver with signing secret (AC#2)', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    expect(ExpressReceiver).toHaveBeenCalledWith({
      signingSecret: 'test-signing-secret',
      endpoints: '/slack/events',
    });
  });

  it('should register health endpoint on receiver router', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    const healthPath = (globalThis as Record<string, unknown>).__healthPath;
    expect(healthPath).toBe('/health');
  });

  it('should return healthy status from health endpoint', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    const healthHandler = (globalThis as Record<string, unknown>).__healthHandler as (
      req: unknown,
      res: { status: (code: number) => { json: (data: unknown) => void } }
    ) => void;

    expect(healthHandler).toBeDefined();

    // Mock response object
    let responseData: unknown = null;
    const mockResponse = {
      status: vi.fn().mockReturnValue({
        json: vi.fn().mockImplementation((data) => {
          responseData = data;
        }),
      }),
    };

    // Call the handler
    healthHandler({}, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(responseData).toMatchObject({
      status: 'healthy',
      timestamp: expect.any(String),
      version: expect.any(String),
    });
  });

  it('should pass receiver to App constructor', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    const appConfig = (globalThis as Record<string, unknown>).__testConfigHolder as CapturedConfig;
    expect(appConfig?.receiver).toBeDefined();
  });

  it('should set log level based on environment', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    const appConfig = (globalThis as Record<string, unknown>).__testConfigHolder as CapturedConfig;
    expect(appConfig?.logLevel).toBe('debug'); // development mode
  });

  it('should use INFO log level in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LANGFUSE_PUBLIC_KEY = 'test';
    process.env.LANGFUSE_SECRET_KEY = 'test';
    process.env.ANTHROPIC_API_KEY = 'test';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
    process.env.GCS_MEMORIES_BUCKET = 'test-bucket';

    vi.resetModules();
    (globalThis as Record<string, unknown>).__testConfigHolder = null;

    const appModule = await import('./app.js');
    appModule.createSlackApp();

    const appConfig = (globalThis as Record<string, unknown>).__testConfigHolder as CapturedConfig;
    expect(appConfig).toBeDefined();
    expect(appConfig?.logLevel).toBe('info');
  });

  it('should use bot token from config', async () => {
    const { createSlackApp } = await import('./app.js');
    createSlackApp();

    const appConfig = (globalThis as Record<string, unknown>).__testConfigHolder as CapturedConfig;
    expect(appConfig?.token).toBe('xoxb-test-token');
  });

  it('should register feedback action handler (Story 1.8)', async () => {
    const { createSlackApp } = await import('./app.js');
    const { app } = createSlackApp();

    // Verify app.action was called with 'orion_feedback'
    expect(app.action).toHaveBeenCalledWith('orion_feedback', expect.any(Function));
  });

  describe('/health/mcp endpoint (Story 3.1)', () => {
    it('should register /health/mcp endpoint on receiver router', async () => {
      const { createSlackApp } = await import('./app.js');
      createSlackApp();

      const routeHandlers = (globalThis as Record<string, unknown>).__routeHandlers as Record<string, unknown>;
      expect(routeHandlers['/health/mcp']).toBeDefined();
    });

    it('should return configured servers and health stats', async () => {
      const { createSlackApp } = await import('./app.js');
      createSlackApp();

      const routeHandlers = (globalThis as Record<string, unknown>).__routeHandlers as Record<string, unknown>;
      const healthMcpHandler = routeHandlers['/health/mcp'] as (
        req: unknown,
        res: { status: (code: number) => { json: (data: unknown) => void } }
      ) => void;

      expect(healthMcpHandler).toBeDefined();

      // Mock response object
      let responseData: Record<string, unknown> = {};
      let statusCode = 0;
      const mockResponse = {
        status: vi.fn().mockImplementation((code: number) => {
          statusCode = code;
          return {
            json: vi.fn().mockImplementation((data: Record<string, unknown>) => {
              responseData = data;
            }),
          };
        }),
      };

      // Call the handler
      healthMcpHandler({}, mockResponse);

      expect(statusCode).toBe(200);
      expect(responseData.status).toBe('ok');
      expect(responseData.timestamp).toBeDefined();
      expect(responseData.configuredServers).toEqual(['brave-search', 'github']);
      expect(responseData.serverCount).toBe(2);
      expect(responseData.healthStats).toHaveLength(2);
    });

    it('should return 500 on error', async () => {
      // Re-import with error-throwing mock
      vi.resetModules();
      vi.doMock('../tools/mcp/index.js', () => ({
        getMcpServersConfig: vi.fn(() => {
          throw new Error('Config load failed');
        }),
        getAllServerHealth: vi.fn(() => []),
      }));

      const { createSlackApp } = await import('./app.js');
      createSlackApp();

      const routeHandlers = (globalThis as Record<string, unknown>).__routeHandlers as Record<string, unknown>;
      const healthMcpHandler = routeHandlers['/health/mcp'] as (
        req: unknown,
        res: { status: (code: number) => { json: (data: unknown) => void } }
      ) => void;

      let responseData: Record<string, unknown> = {};
      let statusCode = 0;
      const mockResponse = {
        status: vi.fn().mockImplementation((code: number) => {
          statusCode = code;
          return {
            json: vi.fn().mockImplementation((data: Record<string, unknown>) => {
              responseData = data;
            }),
          };
        }),
      };

      healthMcpHandler({}, mockResponse);

      expect(statusCode).toBe(500);
      expect(responseData.status).toBe('error');
      expect(responseData.error).toBe('Config load failed');
    });
  });
});
