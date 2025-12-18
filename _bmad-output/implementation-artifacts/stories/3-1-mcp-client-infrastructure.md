# Story 3.1: MCP Client Infrastructure

Status: ready-for-dev

## Story

As a **developer**,
I want a robust MCP integration layer that connects Claude Agent SDK to external tool servers,
So that Orion can use external tools via the Model Context Protocol.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 1.1 Project Scaffolding | ✅ done | Project structure, `.orion/config.yaml` exists |
| 1.2 Langfuse Instrumentation | ✅ done | Tracing infrastructure for MCP operations |
| 2.1 Claude Agent SDK Integration | required | `query()` function working, system prompt loading |
| 2.2 Agent Loop Implementation | required | Agent loop in place to invoke MCP tools |

## Acceptance Criteria

1. **Given** the Claude Agent SDK is integrated (Story 2.1), **When** the application initializes, **Then** MCP server configurations are loaded from `.orion/config.yaml` and passed to `query()` options

2. **Given** MCP servers are configured, **When** a query is executed, **Then** the Claude SDK automatically discovers available tools from connected MCP servers

3. **Given** an MCP server connection fails, **When** the error is caught, **Then** the failure is logged via Langfuse with structured JSON, the server is marked unavailable, and the agent continues with remaining servers (NFR14: graceful degradation)

4. **Given** MCP servers are configured, **When** the config file is modified, **Then** new servers can be added without code changes (changes take effect on restart)

5. **Given** an MCP tool is executed, **When** the call completes, **Then** the execution is traced in Langfuse with tool name, duration, and success/failure status

6. **Given** the MCP 1.0 protocol is required (NFR17), **When** servers are configured, **Then** both stdio (local) and HTTP (remote) transports are supported

## Tasks / Subtasks

- [ ] **Task 1: Create MCP Configuration Schema** (AC: #1, #4, #6)
  - [ ] Define TypeScript interface for MCP server config in `src/tools/mcp/types.ts`
  - [ ] Support both `stdio` type (command + args) and `http` type (url)
  - [ ] Add `enabled` boolean for admin control
  - [ ] Add `description` for tool discovery context

- [ ] **Task 2: Create MCP Config Loader** (AC: #1, #4)
  - [ ] Create `src/tools/mcp/config.ts`
  - [ ] Load MCP server definitions from `.orion/config.yaml`
  - [ ] Filter to only enabled servers
  - [ ] Transform to Claude SDK `McpServerConfig` format
  - [ ] Validate config on load (throw clear errors for invalid configs)

- [ ] **Task 3: Update Agent Tools Module** (AC: #1, #2)
  - [ ] Update `src/agent/tools.ts` to use the new config loader
  - [ ] Export `getMcpServersConfig()` function for use in `query()` calls
  - [ ] Ensure lazy loading pattern (config loaded once, cached)

- [ ] **Task 4: Integrate MCP with Claude SDK Query** (AC: #2)
  - [ ] Update `src/agent/orion.ts` to pass `mcpServers` to `query()` options
  - [ ] Add `'mcp'` to `allowedTools` array
  - [ ] Verify tool discovery works by checking SDK message types

- [ ] **Task 5: Implement Connection Error Handling** (AC: #3)
  - [ ] Create `src/tools/mcp/health.ts` for tracking server availability
  - [ ] Implement `markServerUnavailable(name: string, error: Error)`
  - [ ] Implement `isServerAvailable(name: string): boolean`
  - [ ] Log errors with structured JSON format per AR12

- [ ] **Task 6: Add MCP Execution Tracing** (AC: #5)
  - [ ] Create wrapper function that traces MCP tool calls
  - [ ] Capture: tool name, arguments (sanitized), result, duration
  - [ ] Use `startActiveObservation` from Langfuse
  - [ ] Add `metadata.mcpServer` to identify source server

- [ ] **Task 7: Update .orion/config.yaml** (AC: #1, #6)
  - [ ] Add `mcp_servers` section with Rube (Composio) as primary
  - [ ] Add example disabled custom server
  - [ ] Document configuration options in comments

- [ ] **Task 8: Create Tests** (AC: all)
  - [ ] Create `src/tools/mcp/config.test.ts`
  - [ ] Test config loading and validation
  - [ ] Test enabled/disabled filtering
  - [ ] Test error handling for malformed config
  - [ ] Mock MCP server for integration tests

- [ ] **Task 9: Verification** (AC: all)
  - [ ] Start Orion with Rube MCP server configured
  - [ ] Send a message that triggers tool discovery (e.g., "search for X")
  - [ ] Verify MCP tools appear in Langfuse trace
  - [ ] Verify graceful degradation when server is unavailable
  - [ ] Verify structured logging on connection errors

## Dev Notes

### Critical: Claude SDK Native MCP Support

**DO NOT build a custom MCP client.** The Claude Agent SDK has **native MCP support** via the `mcpServers` option in `query()`.

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: userMessage,
  options: {
    systemPrompt,
    mcpServers: {
      "rube": {
        command: "npx",
        args: ["-y", "@composio/mcp", "start"]
      },
      "custom-server": {
        command: "node",
        args: ["./mcp-servers/custom.js"]
      }
    },
    allowedTools: ['mcp', 'Read', 'Bash', 'Grep']
  }
});
```

[Source: _bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md#2.4 MCP Server Configuration]

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR14 | architecture.md | MCP servers initialize lazily after Claude SDK ready |
| AR17 | architecture.md | Agent discovers available tools dynamically (minimal preload) |
| AR19 | architecture.md | Graceful degradation for tool failures |
| NFR14 | prd.md | Graceful degradation when MCP server unavailable |
| NFR17 | prd.md | Support MCP 1.0 protocol |

### src/tools/mcp/types.ts

```typescript
/**
 * MCP Server Configuration Types
 * 
 * Defines the structure for MCP server configurations loaded from .orion/config.yaml
 * Supports both stdio (local process) and http (remote) transports per MCP 1.0 spec.
 */

export interface McpServerConfigBase {
  enabled: boolean;
  description?: string;
}

export interface McpServerStdioConfig extends McpServerConfigBase {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerHttpConfig extends McpServerConfigBase {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpServerStdioConfig | McpServerHttpConfig;

export interface McpServersConfig {
  mcp_servers: Record<string, McpServerConfig>;
}

/**
 * Claude SDK McpServerConfig format
 * This is what the SDK actually expects - we transform our config to this format
 */
export interface ClaudeSdkMcpConfig {
  command?: string;
  args?: string[];
  url?: string;
}

/**
 * MCP server health status
 */
export interface McpServerHealth {
  name: string;
  available: boolean;
  lastError?: string;
  lastErrorTime?: Date;
  failureCount: number;
}
```

### src/tools/mcp/config.ts

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
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
    console.warn(`MCP config not found at ${configPath}, using empty config`);
    cachedConfig = {};
    return cachedConfig;
  }

  const config = parseYaml(content) as McpServersConfig;
  
  if (!config.mcp_servers) {
    console.warn('No mcp_servers section in .orion/config.yaml');
    cachedConfig = {};
    return cachedConfig;
  }

  cachedConfig = {};

  for (const [name, serverConfig] of Object.entries(config.mcp_servers)) {
    if (!serverConfig.enabled) {
      console.log(`MCP server '${name}' is disabled, skipping`);
      continue;
    }

    cachedConfig[name] = transformToSdkConfig(name, serverConfig);
  }

  console.log(`Loaded ${Object.keys(cachedConfig).length} MCP server(s):`, 
    Object.keys(cachedConfig).join(', '));

  return cachedConfig;
}

function transformToSdkConfig(name: string, config: McpServerConfig): ClaudeSdkMcpConfig {
  if (config.type === 'stdio') {
    if (!config.command) {
      throw new Error(`MCP server '${name}' is stdio type but missing 'command'`);
    }
    return {
      command: config.command,
      args: config.args || [],
    };
  }

  if (config.type === 'http') {
    if (!config.url) {
      throw new Error(`MCP server '${name}' is http type but missing 'url'`);
    }
    return {
      url: config.url,
    };
  }

  throw new Error(`MCP server '${name}' has invalid type: ${(config as any).type}`);
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
```

### src/tools/mcp/health.ts

```typescript
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
```

### src/agent/tools.ts (Updated)

```typescript
import { getMcpServersConfig } from '../tools/mcp/config.js';
import type { ClaudeSdkMcpConfig } from '../tools/mcp/types.js';

/**
 * Tool configuration for Claude Agent SDK
 * 
 * MCP servers are loaded from .orion/config.yaml (lazy initialization per AR14)
 * Only enabled servers are included in the config
 */
export interface ToolConfig {
  mcpServers: Record<string, ClaudeSdkMcpConfig>;
  allowedTools: string[];
}

/**
 * Get the complete tool configuration for query() options
 * Includes MCP servers and allowed tool types
 */
export function getToolConfig(): ToolConfig {
  return {
    mcpServers: getMcpServersConfig(),
    allowedTools: [
      'mcp',     // MCP tool calls
      'Read',    // File reading for agentic search
      'Bash',    // Bash for agentic search
      'Grep',    // Grep for searching
      'Glob',    // File discovery
    ],
  };
}
```

### src/agent/orion.ts Integration

```typescript
// In the query() call, add MCP configuration:
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getToolConfig } from './tools.js';
import { startActiveObservation } from '@langfuse/tracing';

export async function runOrionAgent(
  userMessage: string, 
  context: AgentContext
): Promise<AsyncGenerator<SDKMessage>> {
  const toolConfig = getToolConfig();

  return await startActiveObservation('orion-agent', async (trace) => {
    trace.update({
      input: userMessage,
      metadata: {
        mcpServers: Object.keys(toolConfig.mcpServers),
        userId: context.userId,
      },
    });

    const response = query({
      prompt: userMessage,
      options: {
        systemPrompt: context.systemPrompt,
        mcpServers: toolConfig.mcpServers,
        allowedTools: toolConfig.allowedTools,
        settingSources: ['user', 'project'], // Enable Skills
      },
    });

    return response;
  });
}
```

### .orion/config.yaml MCP Section

```yaml
# MCP Server Configuration
# =========================
# Define external tool servers that Orion can connect to via Model Context Protocol.
# Servers can be stdio (local process) or http (remote endpoint).
#
# Each server has:
#   enabled: boolean - Set to false to disable without removing config
#   type: 'stdio' | 'http' - Transport type
#   description: string - Helps agent understand when to use this server
#
# For stdio servers:
#   command: string - The command to run (e.g., 'npx', 'node')
#   args: string[] - Arguments to pass to the command
#
# For http servers:
#   url: string - The HTTP endpoint URL

mcp_servers:
  # Rube (Composio) - Primary MCP server providing 500+ app integrations
  # Includes: GitHub, Atlassian, Slack, Google, and many more
  rube:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@composio/mcp", "start"]
    description: "500+ app integrations via Composio - use for GitHub, Jira, Confluence, Google, Slack, and other external services"

  # Example custom MCP server (disabled by default)
  # Uncomment and modify for internal tools
  # custom-tools:
  #   enabled: false
  #   type: stdio
  #   command: node
  #   args: ["./mcp-servers/custom-tools.js"]
  #   description: "Internal company tools and APIs"
```

### src/tools/mcp/config.test.ts

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadMcpServersConfig, clearMcpConfigCache } from './config.js';
import { readFileSync } from 'fs';

vi.mock('fs');

describe('MCP Config Loader', () => {
  beforeEach(() => {
    clearMcpConfigCache();
    vi.resetAllMocks();
  });

  it('loads and transforms stdio server config', () => {
    const mockYaml = `
mcp_servers:
  rube:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@composio/mcp", "start"]
    description: "Test server"
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    const config = loadMcpServersConfig('/test/path');

    expect(config).toEqual({
      rube: {
        command: 'npx',
        args: ['-y', '@composio/mcp', 'start'],
      },
    });
  });

  it('filters out disabled servers', () => {
    const mockYaml = `
mcp_servers:
  enabled-server:
    enabled: true
    type: stdio
    command: node
    args: ["server.js"]
  disabled-server:
    enabled: false
    type: stdio
    command: node
    args: ["other.js"]
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    const config = loadMcpServersConfig('/test/path');

    expect(Object.keys(config)).toEqual(['enabled-server']);
    expect(config['disabled-server']).toBeUndefined();
  });

  it('returns empty config when file is missing', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const config = loadMcpServersConfig('/test/path');

    expect(config).toEqual({});
  });

  it('throws on invalid server type', () => {
    const mockYaml = `
mcp_servers:
  bad-server:
    enabled: true
    type: invalid
    command: node
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    expect(() => loadMcpServersConfig('/test/path')).toThrow(
      "MCP server 'bad-server' has invalid type: invalid"
    );
  });

  it('throws on missing command for stdio type', () => {
    const mockYaml = `
mcp_servers:
  bad-server:
    enabled: true
    type: stdio
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    expect(() => loadMcpServersConfig('/test/path')).toThrow(
      "MCP server 'bad-server' is stdio type but missing 'command'"
    );
  });

  it('caches config after first load', () => {
    const mockYaml = `
mcp_servers:
  test:
    enabled: true
    type: stdio
    command: node
    args: []
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    loadMcpServersConfig('/test/path');
    loadMcpServersConfig('/test/path');

    expect(readFileSync).toHaveBeenCalledTimes(1);
  });
});
```

### Project Structure Notes

Files created:
- `src/tools/mcp/types.ts` — Type definitions
- `src/tools/mcp/config.ts` — Config loader
- `src/tools/mcp/health.ts` — Server health tracking
- `src/tools/mcp/config.test.ts` — Tests

Files modified:
- `src/agent/tools.ts` — Uses new MCP config
- `src/agent/orion.ts` — Passes MCP to query()
- `.orion/config.yaml` — Add mcp_servers section

### Common Mistakes to Avoid

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| Building custom MCP client | Claude SDK has native support | Use `mcpServers` in query() options |
| Hardcoding server configs | Violates config-driven principle | Load from .orion/config.yaml |
| Throwing on MCP errors | Blocks entire request | Graceful degradation, continue with other tools |
| Not tracing MCP calls | Violates AR11 | Wrap in startActiveObservation |

### References

- [Source: _bmad-output/architecture.md#Tool Layer Architecture] — MCP lazy initialization
- [Source: _bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md#2.4] — Claude SDK MCP config
- [Source: _bmad-output/prd.md#FR26] — MCP server connection requirement
- [Source: _bmad-output/prd.md#NFR17] — MCP 1.0 protocol support
- [External: MCP Specification](https://modelcontextprotocol.io/)

## Dev Agent Record

### Agent Model Used

_To be filled by implementing agent_

### Completion Notes List

_To be filled during implementation_

### Debug Log

_To be filled during implementation_

### File List

Files to create:
- `src/tools/mcp/types.ts`
- `src/tools/mcp/config.ts`
- `src/tools/mcp/health.ts`
- `src/tools/mcp/config.test.ts`

Files to modify:
- `src/agent/tools.ts`
- `src/agent/orion.ts`
- `.orion/config.yaml`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story created with full implementation guidance |
