import { describe, it, expect } from 'vitest';

describe('environment config', () => {
  it('should load configuration with defaults', async () => {
    const { config } = await import('./environment.js');

    expect(config).toBeDefined();
    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
  });
});

