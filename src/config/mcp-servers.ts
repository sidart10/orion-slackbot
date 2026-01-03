/**
 * MCP server configuration loader.
 *
 * Story 3.2: Tool Discovery & Registration
 *
 * Loads MCP servers from .orion/config.yaml (file-based)
 * with fallback to legacy env vars for backward compatibility.
 *
 * File-based config: .orion/config.yaml
 * Legacy env vars: RUBE_MCP_URL, RUBE_API_KEY, RUBE_MCP_ENABLED
 */

import { loadMcpServersConfig, clearMcpConfigCache } from '../tools/mcp/config.js';
import type { ClaudeSdkMcpConfig } from '../tools/mcp/types.js';

export type McpServerConfig = {
  name: string;
  url: string;
  enabled: boolean;
  bearerToken?: string;
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Default arguments to merge into tool calls for this server */
  defaults?: Record<string, unknown>;
};

function parseEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

/**
 * Extract URL from Claude SDK config format
 */
function extractUrl(config: ClaudeSdkMcpConfig): string | undefined {
  if ('url' in config) {
    return config.url;
  }
  // stdio configs don't have URLs - skip for now
  return undefined;
}

/**
 * Extract bearer token from headers if present
 */
function extractBearerToken(config: ClaudeSdkMcpConfig): string | undefined {
  if ('headers' in config && config.headers) {
    const authHeader = config.headers['Authorization'] || config.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
  }
  return undefined;
}

/**
 * Extract defaults from config if present
 */
function extractDefaults(config: ClaudeSdkMcpConfig): Record<string, unknown> | undefined {
  if ('defaults' in config && config.defaults && typeof config.defaults === 'object') {
    return config.defaults as Record<string, unknown>;
  }
  return undefined;
}

// Test override: set to true to skip file-based config loading
let __skipFileConfigForTests = false;

export function __setSkipFileConfigForTests(skip: boolean): void {
  __skipFileConfigForTests = skip;
}

export function getMcpServerConfigs(): McpServerConfig[] {
  const configs: McpServerConfig[] = [];

  // Load file-based config from .orion/config.yaml (unless test override)
  if (!__skipFileConfigForTests) {
    try {
      const fileConfig = loadMcpServersConfig();
      
      for (const [name, sdkConfig] of Object.entries(fileConfig)) {
        const url = extractUrl(sdkConfig);
        if (url) {
          configs.push({
            name,
            url,
            enabled: true, // Already filtered to enabled servers by loadMcpServersConfig
            bearerToken: extractBearerToken(sdkConfig),
            connectionTimeoutMs: 5000,
            requestTimeoutMs: 30000,
            defaults: extractDefaults(sdkConfig),
          });
        }
      }
    } catch {
      // File config failed, continue with legacy env vars
    }
  }

  // Legacy: RUBE env vars (backward compatibility)
  // Always include rube entry if RUBE_MCP_ENABLED is set (even if 'false')
  // so discovery can remove disabled server tools (AC#6).
  const rubeEnabledEnv = process.env.RUBE_MCP_ENABLED;
  const rubeUrl = process.env.RUBE_MCP_URL ?? '';
  
  // Only add rube if env var is explicitly set AND not already in file config
  if (rubeEnabledEnv !== undefined && !configs.some(c => c.name === 'rube')) {
    configs.push({
      name: 'rube',
      url: rubeUrl,
      enabled: parseEnabled(rubeEnabledEnv),
      bearerToken: process.env.RUBE_API_KEY ?? '',
      connectionTimeoutMs: 5000,
      requestTimeoutMs: 30000,
    });
  }

  return configs;
}

/**
 * Clear config cache (for testing or config reload)
 */
export { clearMcpConfigCache };


