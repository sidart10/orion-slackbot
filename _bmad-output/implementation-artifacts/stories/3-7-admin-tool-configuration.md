# Story 3.7: Admin Tool Configuration

Status: ready-for-dev

## Story

As a **platform admin**,
I want to enable or disable MCP servers,
So that I can control which integrations are available.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3.1 MCP Client Infrastructure | required | MCP server configuration loading |
| 3.4 Multiple MCP Servers | required | Multi-server support in config |
| 1.2 Langfuse Instrumentation | ✅ done | Logging for config changes |

## Acceptance Criteria

1. **Given** MCP servers are configured, **When** an admin modifies `.orion/config.yaml`, **Then** MCP servers can be enabled or disabled via the `enabled` field (FR29)

2. **Given** a server is disabled (`enabled: false`), **When** the agent loads, **Then** disabled servers are not connected and their tools are not available

3. **Given** configuration exists, **When** the app starts, **Then** tool availability configuration is loaded and validated at startup (FR40)

4. **Given** MVP requirements, **When** configuration changes are made, **Then** changes take effect on next application restart (no hot reload required)

5. **Given** configuration is loaded, **When** servers are enabled/disabled, **Then** configuration state is logged for audit purposes

6. **Given** invalid configuration exists, **When** app starts, **Then** validation errors are logged and app fails fast with clear error message

## Tasks / Subtasks

- [ ] **Task 1: Define Configuration Schema** (AC: #1, #3)
  - [ ] Create `src/config/mcp-config.schema.ts`
  - [ ] Define TypeScript interface for MCP server config
  - [ ] Add Zod schema for validation
  - [ ] Support `enabled`, `type`, `command`, `args`, `env`, `description`

- [ ] **Task 2: Implement Configuration Loader** (AC: #3)
  - [ ] Create `src/config/mcp-loader.ts`
  - [ ] Load `.orion/config.yaml` at startup
  - [ ] Parse and validate against schema
  - [ ] Return typed configuration object

- [ ] **Task 3: Implement Enabled/Disabled Filtering** (AC: #2)
  - [ ] Filter servers where `enabled: true`
  - [ ] Skip connection for disabled servers
  - [ ] Exclude disabled server tools from registry

- [ ] **Task 4: Add Configuration Validation** (AC: #6)
  - [ ] Validate required fields per server type
  - [ ] Validate environment variable references
  - [ ] Fail fast with clear error message on invalid config
  - [ ] Log validation errors with specifics

- [ ] **Task 5: Log Configuration State** (AC: #5)
  - [ ] Log enabled servers at startup
  - [ ] Log disabled servers at startup
  - [ ] Include server descriptions in logs
  - [ ] Use structured JSON format (AR12)

- [ ] **Task 6: Integrate with MCP Client** (AC: #2)
  - [ ] Update `getMcpServersConfig()` to filter by enabled
  - [ ] Pass only enabled servers to Claude SDK
  - [ ] Handle case where all servers disabled

- [ ] **Task 7: Create Tests** (AC: all)
  - [ ] Create `src/config/mcp-loader.test.ts`
  - [ ] Test loading valid config
  - [ ] Test filtering disabled servers
  - [ ] Test validation error handling
  - [ ] Test missing config file handling

- [ ] **Task 8: Verification** (AC: all)
  - [ ] Create config with 2 servers (1 enabled, 1 disabled)
  - [ ] Start app, verify only enabled server connected
  - [ ] Verify disabled server tools not available
  - [ ] Change enabled status, restart, verify change applied

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR29 | prd.md | Platform admin can enable or disable MCP servers |
| FR40 | prd.md | Platform admin can configure which tools are available |
| AR12 | architecture.md | Structured JSON logging |

### Configuration Schema

```yaml
# .orion/config.yaml
mcp_servers:
  rube:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@composio/mcp", "start"]
    env:
      COMPOSIO_API_KEY: "${COMPOSIO_API_KEY}"
    description: "500+ app integrations via Composio"
    
  github:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
    description: "GitHub repository access"
    
  atlassian:
    enabled: false  # Disabled - not needed for MVP
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-atlassian"]
    env:
      ATLASSIAN_API_KEY: "${ATLASSIAN_API_KEY}"
    description: "Jira and Confluence access"

  internal-tools:
    enabled: false  # Disabled - HTTP server not ready
    type: http
    url: "https://internal-mcp.company.com"
    headers:
      Authorization: "Bearer ${INTERNAL_API_KEY}"
    description: "Internal company tools (future)"
```

### src/config/mcp-config.schema.ts

```typescript
import { z } from 'zod';

/**
 * MCP Server types supported
 */
export const McpServerTypeSchema = z.enum(['stdio', 'http']);
export type McpServerType = z.infer<typeof McpServerTypeSchema>;

/**
 * Configuration for a stdio-based MCP server
 */
export const StdioServerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string()).optional().default({}),
  description: z.string().optional(),
  priority: z.number().int().positive().optional().default(100),
});

/**
 * Configuration for an HTTP-based MCP server
 */
export const HttpServerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string()).optional().default({}),
  description: z.string().optional(),
  priority: z.number().int().positive().optional().default(100),
});

/**
 * Union of server configurations
 */
export const McpServerConfigSchema = z.discriminatedUnion('type', [
  StdioServerConfigSchema,
  HttpServerConfigSchema,
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * Complete MCP configuration
 */
export const McpConfigSchema = z.object({
  mcp_servers: z.record(McpServerConfigSchema),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;

/**
 * Validated and typed server entry
 */
export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  enabled: boolean;
}

/**
 * Result of loading MCP configuration
 */
export interface McpConfigLoadResult {
  servers: McpServerEntry[];
  enabledServers: McpServerEntry[];
  disabledServers: McpServerEntry[];
  errors: string[];
}
```

### src/config/mcp-loader.ts

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { 
  McpConfigSchema, 
  McpServerEntry, 
  McpConfigLoadResult,
  type McpServerConfig 
} from './mcp-config.schema.js';
import { logger } from '../utils/logger.js';

const CONFIG_PATH = '.orion/config.yaml';

/**
 * Load and validate MCP configuration from .orion/config.yaml
 * 
 * @throws Error if config is missing or invalid
 */
export function loadMcpConfig(): McpConfigLoadResult {
  const configPath = path.resolve(process.cwd(), CONFIG_PATH);
  
  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    logger.warn({
      event: 'mcp_config_not_found',
      path: configPath,
      message: 'No MCP configuration found. No external tools will be available.',
    });
    
    return {
      servers: [],
      enabledServers: [],
      disabledServers: [],
      errors: [],
    };
  }

  // Read and parse YAML
  let rawConfig: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    rawConfig = yaml.parse(content);
  } catch (error) {
    const message = `Failed to parse ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`;
    logger.error({
      event: 'mcp_config_parse_error',
      path: configPath,
      error: message,
    });
    throw new Error(message);
  }

  // Validate against schema
  const parsed = McpConfigSchema.safeParse(rawConfig);
  
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    const message = `Invalid MCP configuration:\n${issues.join('\n')}`;
    
    logger.error({
      event: 'mcp_config_validation_error',
      issues,
    });
    
    throw new Error(message);
  }

  // Convert to typed entries
  const servers: McpServerEntry[] = [];
  const errors: string[] = [];

  for (const [name, config] of Object.entries(parsed.data.mcp_servers)) {
    // Resolve environment variables in config
    const resolvedConfig = resolveEnvVars(config, name, errors);
    
    servers.push({
      name,
      config: resolvedConfig,
      enabled: resolvedConfig.enabled,
    });
  }

  // Separate enabled and disabled
  const enabledServers = servers.filter(s => s.enabled);
  const disabledServers = servers.filter(s => !s.enabled);

  // Log configuration state
  logConfigurationState(enabledServers, disabledServers);

  return {
    servers,
    enabledServers,
    disabledServers,
    errors,
  };
}

/**
 * Resolve ${ENV_VAR} references in config
 */
function resolveEnvVars(
  config: McpServerConfig,
  serverName: string,
  errors: string[]
): McpServerConfig {
  const envVarPattern = /\$\{([^}]+)\}/g;

  const resolveValue = (value: string): string => {
    return value.replace(envVarPattern, (_, varName) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        errors.push(`Server "${serverName}": Environment variable ${varName} is not set`);
        return ''; // Continue with empty value
      }
      return envValue;
    });
  };

  const resolved = { ...config };

  // Resolve env vars in env field (for stdio)
  if ('env' in resolved && resolved.env) {
    const resolvedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(resolved.env)) {
      resolvedEnv[key] = resolveValue(value);
    }
    resolved.env = resolvedEnv;
  }

  // Resolve env vars in headers (for http)
  if ('headers' in resolved && resolved.headers) {
    const resolvedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(resolved.headers)) {
      resolvedHeaders[key] = resolveValue(value);
    }
    resolved.headers = resolvedHeaders;
  }

  // Resolve env vars in url (for http)
  if ('url' in resolved) {
    resolved.url = resolveValue(resolved.url);
  }

  return resolved;
}

/**
 * Log configuration state for audit trail
 */
function logConfigurationState(
  enabledServers: McpServerEntry[],
  disabledServers: McpServerEntry[]
): void {
  logger.info({
    event: 'mcp_config_loaded',
    totalServers: enabledServers.length + disabledServers.length,
    enabledCount: enabledServers.length,
    disabledCount: disabledServers.length,
    enabled: enabledServers.map(s => ({
      name: s.name,
      type: s.config.type,
      description: s.config.description,
    })),
    disabled: disabledServers.map(s => s.name),
  });
}

/**
 * Get MCP servers config for Claude SDK
 * 
 * Returns only enabled servers in the format expected by the SDK
 */
export function getMcpServersForSdk(): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
  const { enabledServers, errors } = loadMcpConfig();

  if (errors.length > 0) {
    logger.warn({
      event: 'mcp_config_warnings',
      warnings: errors,
    });
  }

  const sdkConfig: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};

  for (const server of enabledServers) {
    if (server.config.type === 'stdio') {
      sdkConfig[server.name] = {
        command: server.config.command,
        args: server.config.args,
        env: server.config.env,
      };
    }
    // Note: HTTP servers need different handling - may need SDK adapter
  }

  return sdkConfig;
}

/**
 * Check if a specific server is enabled
 */
export function isServerEnabled(serverName: string): boolean {
  const { servers } = loadMcpConfig();
  const server = servers.find(s => s.name === serverName);
  return server?.enabled ?? false;
}
```

### src/config/mcp-loader.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { loadMcpConfig, getMcpServersForSdk, isServerEnabled } from './mcp-loader.js';

vi.mock('fs');

describe('MCP Configuration Loader', () => {
  const mockFs = vi.mocked(fs);

  const validConfig = `
mcp_servers:
  rube:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@composio/mcp", "start"]
    env:
      COMPOSIO_API_KEY: "\${COMPOSIO_API_KEY}"
    description: "Composio integrations"

  github:
    enabled: false
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    description: "GitHub access (disabled)"
`;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPOSIO_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
  });

  describe('loadMcpConfig', () => {
    it('loads and parses valid config', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(validConfig);

      const result = loadMcpConfig();

      expect(result.servers).toHaveLength(2);
      expect(result.enabledServers).toHaveLength(1);
      expect(result.disabledServers).toHaveLength(1);
      expect(result.enabledServers[0].name).toBe('rube');
    });

    it('resolves environment variables', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(validConfig);

      const result = loadMcpConfig();
      const rubeServer = result.enabledServers[0];

      expect(rubeServer.config.type).toBe('stdio');
      if (rubeServer.config.type === 'stdio') {
        expect(rubeServer.config.env?.COMPOSIO_API_KEY).toBe('test-api-key');
      }
    });

    it('reports missing environment variables as errors', () => {
      delete process.env.COMPOSIO_API_KEY;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(validConfig);

      const result = loadMcpConfig();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('COMPOSIO_API_KEY');
    });

    it('returns empty config when file not found', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = loadMcpConfig();

      expect(result.servers).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('throws on invalid YAML', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid: yaml: content:');

      expect(() => loadMcpConfig()).toThrow();
    });

    it('throws on schema validation failure', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
mcp_servers:
  invalid:
    type: unknown_type
`);

      expect(() => loadMcpConfig()).toThrow('Invalid MCP configuration');
    });
  });

  describe('getMcpServersForSdk', () => {
    it('returns only enabled servers in SDK format', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(validConfig);

      const sdkConfig = getMcpServersForSdk();

      expect(Object.keys(sdkConfig)).toEqual(['rube']);
      expect(sdkConfig.rube).toEqual({
        command: 'npx',
        args: ['-y', '@composio/mcp', 'start'],
        env: { COMPOSIO_API_KEY: 'test-api-key' },
      });
    });
  });

  describe('isServerEnabled', () => {
    it('returns true for enabled server', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(validConfig);

      expect(isServerEnabled('rube')).toBe(true);
    });

    it('returns false for disabled server', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(validConfig);

      expect(isServerEnabled('github')).toBe(false);
    });

    it('returns false for unknown server', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(validConfig);

      expect(isServerEnabled('nonexistent')).toBe(false);
    });
  });
});
```

### Project Structure Notes

Files created:
- `src/config/mcp-config.schema.ts` — Configuration schema
- `src/config/mcp-loader.ts` — Configuration loader
- `src/config/mcp-loader.test.ts` — Tests
- `.orion/config.yaml` — Default configuration template

Files modified:
- `src/tools/mcp/config.ts` — Use new loader

### References

- [Source: _bmad-output/prd.md#FR29] — Enable/disable MCP servers
- [Source: _bmad-output/prd.md#FR40] — Tool availability configuration
- [Source: _bmad-output/architecture.md#AR12] — Structured JSON logging

## Dev Agent Record

### Agent Model Used

_To be filled by implementing agent_

### Completion Notes List

_To be filled during implementation_

### Debug Log

_To be filled during implementation_

### File List

Files to create:
- `src/config/mcp-config.schema.ts`
- `src/config/mcp-loader.ts`
- `src/config/mcp-loader.test.ts`
- `.orion/config.yaml`

Files to modify:
- `src/tools/mcp/config.ts`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story enhanced with full implementation guidance |
