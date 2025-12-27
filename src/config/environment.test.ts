import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('environment config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load configuration with defaults', async () => {
    process.env.NODE_ENV = 'development'; // Ensure not production for this test
    const { config } = await import('./environment.js');

    expect(config).toBeDefined();
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(['debug', 'info', 'warn', 'error']).toContain(config.logLevel);
  });

  it('should have new configuration fields', async () => {
     process.env.NODE_ENV = 'development';
     process.env.ANTHROPIC_MODEL = 'test-model';
     process.env.GCS_MEMORIES_BUCKET = 'test-bucket';

     const { config } = await import('./environment.js');

     expect(config.anthropicModel).toBe('test-model');
     expect(config.gcsMemoriesBucket).toBe('test-bucket');
  });

  it('should default anthropicModel from .orion/config.yaml when env var not set', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ANTHROPIC_MODEL;

    const { config } = await import('./environment.js');
    expect(config.anthropicModel).toBe('claude-sonnet-4-20250514');
  });

  it('should validate required variables in production', async () => {
    process.env.NODE_ENV = 'production';
    // Missing required variables
    process.env.SLACK_BOT_TOKEN = '';

    await expect(import('./environment.js')).rejects.toThrow();
  });

  it('should pass validation in production with all variables', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.SLACK_SIGNING_SECRET = 'test-secret';
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.ANTHROPIC_MODEL = 'claude-test';
    process.env.GCS_MEMORIES_BUCKET = 'memories-test';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';

    const { config } = await import('./environment.js');
    expect(config.nodeEnv).toBe('production');
  });
});
