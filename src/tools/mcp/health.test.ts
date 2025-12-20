import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  markServerUnavailable, 
  markServerAvailable, 
  isServerAvailable, 
  getAllServerHealth 
} from './health.js';
import { logger } from '../../utils/logger.js';

vi.mock('../../utils/logger.js');

describe('MCP Health Monitor', () => {
  beforeEach(() => {
    // Reset internal state by clearing map? 
    // The module uses a module-level Map. We can't easily reset it without an export.
    // However, we can use new server names for each test.
    vi.resetAllMocks();
  });

  it('tracks server failure', () => {
    const server = 'test-server-1';
    const error = new Error('Connection failed');

    markServerUnavailable(server, error);

    expect(isServerAvailable(server)).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      event: 'mcp_server_unavailable',
      server,
      error: 'Connection failed',
      failureCount: 1
    }));
  });

  it('tracks server recovery', () => {
    const server = 'test-server-2';
    markServerUnavailable(server, new Error('Fail'));
    expect(isServerAvailable(server)).toBe(false);

    markServerAvailable(server);
    expect(isServerAvailable(server)).toBe(true);
    
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: 'mcp_server_recovered',
      server
    }));
  });

  it('assumes unknown servers are available', () => {
    expect(isServerAvailable('unknown-server')).toBe(true);
  });

  it('increments failure count', () => {
    const server = 'test-server-3';
    markServerUnavailable(server, new Error('Fail 1'));
    markServerUnavailable(server, new Error('Fail 2'));

    const health = getAllServerHealth().find(h => h.name === server);
    expect(health?.failureCount).toBe(2);
  });
});
