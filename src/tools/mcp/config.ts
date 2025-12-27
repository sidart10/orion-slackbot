import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { logger } from '../../utils/logger.js';
import type { 
  McpServersConfig, 
  McpServerConfig, 
  ClaudeSdkMcpConfig 
} from './types.js';

let cachedConfig: Record<string, ClaudeSdkMcpConfig> | null = null;

/**
 * Load MCP server configurations from .orion/config.yaml
 * Transforms to Claude SDK format, filtering to enabled servers only.
 * 
 * @throws Error if config file is missing or malformed
 */
export function loadMcpServersConfig(basePath: string = process.cwd()): Record<string, ClaudeSdkMcpConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = join(basePath, '.orion', 'config.yaml');
  
  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch (error) {
    logger.warn({
      event: 'mcp_config_not_found',
      path: configPath,
      message: 'MCP config not found, using empty config',
    });
    cachedConfig = {};
    return cachedConfig;
  }

  const config = parseYaml(content) as McpServersConfig;
  
  if (!config.mcp_servers) {
    logger.warn({
      event: 'mcp_config_empty',
      message: 'No mcp_servers section in .orion/config.yaml',
    });
    cachedConfig = {};
    return cachedConfig;
  }

  cachedConfig = {};

  for (const [name, serverConfig] of Object.entries(config.mcp_servers)) {
    if (!serverConfig.enabled) {
      logger.debug({
        event: 'mcp_server_disabled',
        server: name,
        message: `MCP server '${name}' is disabled, skipping`,
      });
      continue;
    }

    cachedConfig[name] = transformToSdkConfig(name, serverConfig);
  }

  logger.info({
    event: 'mcp_config_loaded',
    serverCount: Object.keys(cachedConfig).length,
    servers: Object.keys(cachedConfig),
  });

  return cachedConfig;
}

function transformToSdkConfig(name: string, config: McpServerConfig): ClaudeSdkMcpConfig {
  if (config.type === 'stdio') {
    if (!config.command) {
      throw new Error(`MCP server '${name}' is stdio type but missing 'command'`);
    }
    // SDK defaults to stdio, so we omit type field for cleaner config
    const sdkConfig: ClaudeSdkMcpConfig = {
      command: config.command,
      args: config.args,
    };
    if (config.env) {
      (sdkConfig as { env?: Record<string, string> }).env = config.env;
    }
    return sdkConfig;
  }

  if (config.type === 'http') {
    if (!config.url) {
      throw new Error(`MCP server '${name}' is http type but missing 'url'`);
    }
    const sdkConfig: ClaudeSdkMcpConfig = {
      type: 'http',
      url: config.url,
    };
    if (config.headers) {
      (sdkConfig as { headers?: Record<string, string> }).headers = config.headers;
    }
    return sdkConfig;
  }

  if (config.type === 'sse') {
    if (!config.url) {
      throw new Error(`MCP server '${name}' is sse type but missing 'url'`);
    }
    const sdkConfig: ClaudeSdkMcpConfig = {
      type: 'sse',
      url: config.url,
    };
    if (config.headers) {
      (sdkConfig as { headers?: Record<string, string> }).headers = config.headers;
    }
    return sdkConfig;
  }

  throw new Error(`MCP server '${name}' has invalid type: ${(config as { type: string }).type}`);
}

/**
 * Get MCP servers config for Claude SDK query() options
 * Returns cached config (loads once on first call)
 */
export function getMcpServersConfig(): Record<string, ClaudeSdkMcpConfig> {
  return loadMcpServersConfig();
}

/**
 * Clear cached config (for testing or config reload)
 */
export function clearMcpConfigCache(): void {
  cachedConfig = null;
}
