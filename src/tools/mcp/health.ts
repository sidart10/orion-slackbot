import { logger } from '../../utils/logger.js';
import type { McpServerHealth } from './types.js';

const serverHealth = new Map<string, McpServerHealth>();

/**
 * Mark an MCP server as unavailable after an error
 * Logs structured error per AR12
 */
export function markServerUnavailable(name: string, error: Error): void {
  const existing = serverHealth.get(name) || {
    name,
    available: true,
    failureCount: 0,
  };

  const updated: McpServerHealth = {
    name,
    available: false,
    lastError: error.message,
    lastErrorTime: new Date(),
    failureCount: existing.failureCount + 1,
  };

  serverHealth.set(name, updated);

  // Structured JSON logging per AR12
  logger.error({
    event: 'mcp_server_unavailable',
    server: name,
    error: error.message,
    failureCount: updated.failureCount,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Mark an MCP server as available (recovered)
 */
export function markServerAvailable(name: string): void {
  const existing = serverHealth.get(name);
  if (existing) {
    existing.available = true;
    serverHealth.set(name, existing);
    
    logger.info({
      event: 'mcp_server_recovered',
      server: name,
      previousFailures: existing.failureCount,
    });
  }
}

/**
 * Check if an MCP server is currently available
 */
export function isServerAvailable(name: string): boolean {
  const health = serverHealth.get(name);
  return health?.available ?? true; // Assume available if not tracked
}

/**
 * Get health status for all tracked servers
 */
export function getAllServerHealth(): McpServerHealth[] {
  return Array.from(serverHealth.values());
}
