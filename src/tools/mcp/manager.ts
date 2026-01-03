/**
 * MCP Client Manager - Singleton for caching MCP clients per server.
 *
 * Maintains session state by reusing the same McpClient instance for each server
 * instead of creating a new client per call.
 *
 * Features:
 * - Singleton pattern (one manager per process)
 * - Client caching per server name
 * - Lazy initialization on first call
 * - Mutex/lock for concurrent first-call safety
 * - Session persistence across tool calls
 *
 * @see Story 3.2 - Tool Discovery & Registration (Phase 2)
 * @see AC-C1 - Same client instance returned for same server
 * @see AC-C2 - Session state maintained across calls
 * @see AC-C3 - Independent sessions per server
 * @see AC-C4 - No race condition on concurrent first calls
 */

import { McpClient } from './client.js';
import type { McpClientConfig } from './types.js';
import { logger } from '../../utils/logger.js';

/** Singleton instance */
let instance: McpClientManager | null = null;

/**
 * MCP Client Manager singleton.
 *
 * Caches McpClient instances per server to maintain session state.
 *
 * @example
 * const manager = McpClientManager.getInstance();
 * const client = await manager.getClient('rube', { url: '...', bearerToken: '...' });
 * // Subsequent calls return the same client instance
 * const sameClient = await manager.getClient('rube', { url: '...' });
 * console.log(client === sameClient); // true
 */
export class McpClientManager {
  /** Cached clients by server name */
  private readonly clients: Map<string, McpClient> = new Map();

  /** Pending initialization promises for mutex (AC-C4) */
  private readonly pendingInit: Map<string, Promise<McpClient>> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): McpClientManager {
    if (!instance) {
      instance = new McpClientManager();
    }
    return instance;
  }

  /**
   * Get or create a cached MCP client for the given server.
   *
   * Thread-safe: concurrent first calls to the same server will not race
   * on initialization (uses mutex pattern via Promise).
   *
   * @param serverName - Server identifier (used as cache key)
   * @param config - Client configuration (URL, bearer token, timeouts)
   * @param traceId - Optional trace ID for structured logging
   * @returns Cached or newly created McpClient
   *
   * @see AC-C1 - Same client returned for same server
   * @see AC-C4 - Mutex prevents race on concurrent first calls
   */
  async getClient(serverName: string, config: McpClientConfig, traceId?: string): Promise<McpClient> {
    // Fast path: client already cached
    const cached = this.clients.get(serverName);
    if (cached) {
      return cached;
    }

    // Check if initialization is in progress (mutex)
    const pending = this.pendingInit.get(serverName);
    if (pending) {
      // Wait for the in-progress initialization
      return pending;
    }

    // Start initialization with mutex
    const initPromise = this.createClient(serverName, config, traceId);
    this.pendingInit.set(serverName, initPromise);

    try {
      const client = await initPromise;
      return client;
    } finally {
      // Clean up pending promise
      this.pendingInit.delete(serverName);
    }
  }

  /**
   * Get a cached client synchronously (returns undefined if not cached).
   *
   * Useful for checking if a client exists without triggering creation.
   *
   * @param serverName - Server identifier
   * @returns Cached client or undefined
   */
  getClientIfCached(serverName: string): McpClient | undefined {
    return this.clients.get(serverName);
  }

  /**
   * Remove a cached client.
   *
   * Called when a server is disabled or needs to be re-initialized.
   *
   * @param serverName - Server identifier
   * @param traceId - Optional trace ID for structured logging
   */
  removeClient(serverName: string, traceId?: string): void {
    const removed = this.clients.delete(serverName);
    if (removed) {
      logger.info({
        event: 'mcp.manager.client.removed',
        serverName,
        traceId,
      });
    }
  }

  /**
   * Create and cache a new client.
   *
   * @internal
   */
  private async createClient(serverName: string, config: McpClientConfig, traceId?: string): Promise<McpClient> {
    logger.info({
      event: 'mcp.manager.client.creating',
      serverName,
      hasAuth: !!config.bearerToken,
      traceId,
    });

    const client = new McpClient(serverName, config);

    // Cache the client
    this.clients.set(serverName, client);

    logger.info({
      event: 'mcp.manager.client.created',
      serverName,
      traceId,
    });

    return client;
  }
}

/**
 * Reset the singleton instance (for testing only).
 *
 * @internal
 */
export function resetMcpClientManager(): void {
  instance = null;
}

