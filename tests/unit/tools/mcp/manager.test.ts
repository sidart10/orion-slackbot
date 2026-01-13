/**
 * MCP Client Manager Tests
 *
 * Tests for singleton client caching to maintain session state across calls.
 *
 * @see Story 3.2 - Tool Discovery & Registration (Phase 2)
 * @see AC-C1 - Same client instance returned for same server
 * @see AC-C2 - Session state maintained across calls
 * @see AC-C3 - Independent sessions per server
 * @see AC-C4 - No race condition on concurrent first calls (mutex)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpClientManager, resetMcpClientManager } from '@/tools/mcp/manager.js';
import type { McpClient } from '@/tools/mcp/client.js';

// Mock the McpClient class
vi.mock('@/tools/mcp/client.js', () => {
  return {
    McpClient: vi.fn().mockImplementation((serverName: string, config: { url: string }) => {
      return {
        getServerName: () => serverName,
        getSessionId: () => `session-${serverName}`,
        listTools: vi.fn().mockResolvedValue({ success: true, data: [] }),
        callTool: vi.fn().mockResolvedValue({ success: true, data: { content: [] } }),
        getState: () => ({}),
        _config: config, // For test inspection
      };
    }),
  };
});

describe('McpClientManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton between tests
    resetMcpClientManager();
  });

  afterEach(() => {
    resetMcpClientManager();
  });

  describe('singleton pattern', () => {
    it('returns the same instance on multiple getInstance() calls', () => {
      const instance1 = McpClientManager.getInstance();
      const instance2 = McpClientManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('client caching (AC-C1)', () => {
    it('returns the same client instance for the same server', async () => {
      const manager = McpClientManager.getInstance();

      const client1 = await manager.getClient('rube', {
        url: 'https://rube.example.com',
        bearerToken: 'token',
      });
      const client2 = await manager.getClient('rube', {
        url: 'https://rube.example.com',
        bearerToken: 'token',
      });

      expect(client1).toBe(client2);
    });

    it('creates client only once per server (not per call)', async () => {
      const { McpClient } = await import('@/tools/mcp/client.js');
      const manager = McpClientManager.getInstance();

      await manager.getClient('rube', { url: 'https://rube.example.com' });
      await manager.getClient('rube', { url: 'https://rube.example.com' });
      await manager.getClient('rube', { url: 'https://rube.example.com' });

      // McpClient constructor should be called only once
      expect(McpClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('session persistence (AC-C2)', () => {
    it('cached client maintains session state across calls', async () => {
      const manager = McpClientManager.getInstance();

      const client = await manager.getClient('rube', { url: 'https://rube.example.com' });

      // Session ID should be available (mock returns session-{serverName})
      expect(client.getSessionId()).toBe('session-rube');

      // Get client again - same instance, same session
      const sameClient = await manager.getClient('rube', { url: 'https://rube.example.com' });
      expect(sameClient.getSessionId()).toBe('session-rube');
    });
  });

  describe('independent sessions per server (AC-C3)', () => {
    it('returns different clients for different servers', async () => {
      const manager = McpClientManager.getInstance();

      const rubeClient = await manager.getClient('rube', { url: 'https://rube.example.com' });
      const otherClient = await manager.getClient('other', { url: 'https://other.example.com' });

      expect(rubeClient).not.toBe(otherClient);
      expect(rubeClient.getServerName()).toBe('rube');
      expect(otherClient.getServerName()).toBe('other');
    });

    it('each server maintains its own session', async () => {
      const manager = McpClientManager.getInstance();

      const rubeClient = await manager.getClient('rube', { url: 'https://rube.example.com' });
      const otherClient = await manager.getClient('other', { url: 'https://other.example.com' });

      expect(rubeClient.getSessionId()).toBe('session-rube');
      expect(otherClient.getSessionId()).toBe('session-other');
    });
  });

  describe('concurrency safety (AC-C4)', () => {
    it('concurrent first calls to same server do not race on initialization', async () => {
      const { McpClient } = await import('@/tools/mcp/client.js');
      const manager = McpClientManager.getInstance();

      // Fire 10 concurrent getClient calls for the same server
      const promises = Array.from({ length: 10 }, () =>
        manager.getClient('rube', { url: 'https://rube.example.com' })
      );

      const clients = await Promise.all(promises);

      // All should return the exact same instance
      const firstClient = clients[0];
      for (const client of clients) {
        expect(client).toBe(firstClient);
      }

      // Constructor should only be called ONCE despite 10 concurrent requests
      expect(McpClient).toHaveBeenCalledTimes(1);
    });

    it('concurrent first calls to different servers create separate clients', async () => {
      const { McpClient } = await import('@/tools/mcp/client.js');
      const manager = McpClientManager.getInstance();

      // Concurrent calls to 3 different servers
      const promises = [
        manager.getClient('server-a', { url: 'https://a.example.com' }),
        manager.getClient('server-b', { url: 'https://b.example.com' }),
        manager.getClient('server-c', { url: 'https://c.example.com' }),
      ];

      const [clientA, clientB, clientC] = await Promise.all(promises);

      expect(clientA.getServerName()).toBe('server-a');
      expect(clientB.getServerName()).toBe('server-b');
      expect(clientC.getServerName()).toBe('server-c');

      // Each server should have its own client
      expect(clientA).not.toBe(clientB);
      expect(clientB).not.toBe(clientC);

      // 3 different servers = 3 constructor calls
      expect(McpClient).toHaveBeenCalledTimes(3);
    });
  });

  describe('lazy initialization', () => {
    it('does not create clients until getClient is called', async () => {
      const { McpClient } = await import('@/tools/mcp/client.js');

      // Just creating the manager should not create any clients
      McpClientManager.getInstance();

      expect(McpClient).not.toHaveBeenCalled();

      // First getClient triggers creation
      const manager = McpClientManager.getInstance();
      await manager.getClient('rube', { url: 'https://rube.example.com' });

      expect(McpClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('client removal', () => {
    it('removeClient removes cached client', async () => {
      const { McpClient } = await import('@/tools/mcp/client.js');
      const manager = McpClientManager.getInstance();

      await manager.getClient('rube', { url: 'https://rube.example.com' });
      expect(McpClient).toHaveBeenCalledTimes(1);

      // Remove the client
      manager.removeClient('rube');

      // Getting client again should create a new one
      await manager.getClient('rube', { url: 'https://rube.example.com' });
      expect(McpClient).toHaveBeenCalledTimes(2);
    });

    it('removeClient for non-existent server is a no-op', () => {
      const manager = McpClientManager.getInstance();

      // Should not throw
      expect(() => manager.removeClient('non-existent')).not.toThrow();
    });
  });

  describe('getClientIfCached', () => {
    it('returns undefined for uncached server', () => {
      const manager = McpClientManager.getInstance();

      expect(manager.getClientIfCached('rube')).toBeUndefined();
    });

    it('returns cached client synchronously', async () => {
      const manager = McpClientManager.getInstance();

      // First cache it
      const client = await manager.getClient('rube', { url: 'https://rube.example.com' });

      // Now getClientIfCached should return it
      const cachedClient = manager.getClientIfCached('rube');
      expect(cachedClient).toBe(client);
    });
  });
});

