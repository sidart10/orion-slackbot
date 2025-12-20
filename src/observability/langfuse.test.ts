import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the langfuse tracing SDK
// Creates fresh mock functions for each Langfuse instance
vi.mock('langfuse', () => {
  return {
    Langfuse: vi.fn().mockImplementation(() => ({
      trace: vi.fn().mockReturnValue({
        id: 'test-trace-id',
        update: vi.fn(),
      }),
      flushAsync: vi.fn().mockResolvedValue(undefined),
      shutdownAsync: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('langfuse singleton', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');
    vi.stubEnv('LANGFUSE_BASEURL', '');
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should export getLangfuse function', async () => {
    const { getLangfuse } = await import('./langfuse.js');
    expect(getLangfuse).toBeDefined();
    expect(typeof getLangfuse).toBe('function');
  });

  it('should export healthCheck function', async () => {
    const { healthCheck } = await import('./langfuse.js');
    expect(healthCheck).toBeDefined();
    expect(typeof healthCheck).toBe('function');
  });

  it('should export shutdown function', async () => {
    const { shutdown } = await import('./langfuse.js');
    expect(shutdown).toBeDefined();
    expect(typeof shutdown).toBe('function');
  });

  it('should return no-op client from getLangfuse when credentials are missing in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');

    const { getLangfuse } = await import('./langfuse.js');
    const client = getLangfuse();
    // Returns no-op client (not null) for graceful dev mode handling
    expect(client).not.toBeNull();
    expect(client?.trace).toBeDefined();
  });

  it('should throw error when credentials are missing in production (via environment validation)', async () => {
    // In production, environment.ts validates required credentials at startup
    // This test verifies that validation behavior
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
    vi.stubEnv('SLACK_SIGNING_SECRET', 'test-secret');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

    // The langfuse module imports config from environment.ts, which validates on import
    await expect(import('./langfuse.js')).rejects.toThrow(
      'Missing required environment variable for langfusePublicKey'
    );
  });

  it('should return Langfuse client when credentials are provided', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-test');
    vi.stubEnv('NODE_ENV', 'development');

    const { getLangfuse } = await import('./langfuse.js');
    const client = getLangfuse();
    expect(client).not.toBeNull();
  });

  it('should return the same instance on multiple calls (singleton)', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-test');

    const { getLangfuse } = await import('./langfuse.js');
    const client1 = getLangfuse();
    const client2 = getLangfuse();
    expect(client1).toBe(client2);
  });

  it('should return true from healthCheck with no-op client (graceful dev mode)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');

    const { healthCheck } = await import('./langfuse.js');
    const result = await healthCheck();
    // No-op client doesn't throw, so healthCheck passes
    expect(result).toBe(true);
  });

  it('should return true from healthCheck when client is configured', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-test');

    // Reset modules and re-mock to get fresh instance
    vi.resetModules();
    vi.doMock('langfuse', () => ({
      Langfuse: vi.fn().mockImplementation(() => ({
        trace: vi.fn().mockReturnValue({ id: 'test-trace-id', update: vi.fn() }),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        shutdownAsync: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const { healthCheck } = await import('./langfuse.js');
    const result = await healthCheck();
    expect(result).toBe(true);
  });

  it('should call shutdownAsync on shutdown', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-test');

    const mockShutdownAsync = vi.fn().mockResolvedValue(undefined);

    vi.resetModules();
    vi.doMock('langfuse', () => ({
      Langfuse: vi.fn().mockImplementation(() => ({
        trace: vi.fn().mockReturnValue({ id: 'test-trace-id', update: vi.fn() }),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        shutdownAsync: mockShutdownAsync,
      })),
    }));

    const { getLangfuse, shutdown } = await import('./langfuse.js');
    const client = getLangfuse();
    expect(client).not.toBeNull();
    await shutdown();
    expect(mockShutdownAsync).toHaveBeenCalled();
  });
});

describe('getPrompt (Story 2.1)', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should export getPrompt function', async () => {
    const { getPrompt } = await import('./langfuse.js');
    expect(getPrompt).toBeDefined();
    expect(typeof getPrompt).toBe('function');
  });

  it('should throw error when Langfuse client not configured', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');

    const { getPrompt } = await import('./langfuse.js');

    // No-op client doesn't have getPrompt method
    await expect(getPrompt('test-prompt')).rejects.toThrow(
      'Langfuse prompt management not available'
    );
  });
});
