# Story 3.2: Tool Discovery & Registration

Status: ready-for-dev

## Story

As an **agent**,
I want to discover available tools dynamically from connected MCP servers,
So that I know what capabilities are available and can select the right tools for each task.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3.1 MCP Client Infrastructure | required | MCP servers configured and loadable from `.orion/config.yaml` |
| 2.1 Claude Agent SDK Integration | required | `query()` function working |
| 1.2 Langfuse Instrumentation | ✅ done | Tracing for tool discovery operations |

## Acceptance Criteria

1. **Given** MCP servers are configured (Story 3.1), **When** a query is executed with MCP tools enabled, **Then** the Claude SDK automatically discovers available tools from connected servers

2. **Given** tools are discovered, **When** the agent needs tool information, **Then** tool schemas (name, description, input schema) are available for tool selection

3. **Given** tools are being loaded, **When** context is prepared, **Then** only a minimal set of essential tool descriptions are preloaded in the system prompt (AR17: minimal tools in context)

4. **Given** tool discovery completes, **When** the same tools are needed again, **Then** tool schemas are cached in memory to avoid repeated discovery (5 minute TTL)

5. **Given** a new MCP server is added to `.orion/config.yaml`, **When** the application restarts, **Then** tools from the new server are discovered without code changes

6. **Given** tool discovery is executed, **When** the discovery completes, **Then** the discovered tools are logged and traced in Langfuse for debugging

## Tasks / Subtasks

- [ ] **Task 1: Create Tool Registry Module** (AC: #2, #4)
  - [ ] Create `src/tools/registry.ts`
  - [ ] Define `ToolSchema` interface matching MCP tool format
  - [ ] Implement `ToolRegistry` class with in-memory storage
  - [ ] Add `registerTool(schema: ToolSchema)` method
  - [ ] Add `getToolSchema(name: string)` method
  - [ ] Add `listTools()` method returning all registered tools
  - [ ] Add `clear()` method for cache invalidation

- [ ] **Task 2: Implement Schema Caching** (AC: #4)
  - [ ] Add cache timestamp tracking to registry
  - [ ] Implement 5-minute TTL for cached schemas
  - [ ] Add `isExpired()` check method
  - [ ] Add `refresh()` method to force re-discovery
  - [ ] Log cache hits/misses for debugging

- [ ] **Task 3: Create Tool Discovery Handler** (AC: #1, #6)
  - [ ] Create `src/tools/mcp/discovery.ts`
  - [ ] Implement `discoverTools()` function that queries MCP servers
  - [ ] Parse tool schemas from MCP `tools/list` response
  - [ ] Register discovered tools in the registry
  - [ ] Trace discovery in Langfuse with tool count and server source

- [ ] **Task 4: Implement Minimal Context Strategy** (AC: #3)
  - [ ] Create `src/tools/context.ts` for tool context management
  - [ ] Define essential tools list (high-frequency tools to always mention)
  - [ ] Implement `getToolContextSummary()` returning condensed tool descriptions
  - [ ] Keep summary under 500 tokens to preserve context window
  - [ ] Exclude detailed schemas from initial context (load on-demand)

- [ ] **Task 5: Integrate Discovery with Agent** (AC: #1, #5)
  - [ ] Update `src/agent/orion.ts` to trigger discovery on first query
  - [ ] Pass tool context summary to system prompt
  - [ ] Ensure discovery runs after MCP servers are connected
  - [ ] Handle discovery errors gracefully (continue without tools)

- [ ] **Task 6: Add Discovery Tracing** (AC: #6)
  - [ ] Wrap discovery in `startActiveObservation`
  - [ ] Log: server name, tool count, discovery duration
  - [ ] Log individual tool names discovered
  - [ ] Track cache hit/miss ratio in traces

- [ ] **Task 7: Create Tests** (AC: all)
  - [ ] Create `src/tools/registry.test.ts`
  - [ ] Test tool registration and retrieval
  - [ ] Test cache expiration after TTL
  - [ ] Test cache refresh behavior
  - [ ] Create `src/tools/context.test.ts`
  - [ ] Test minimal context generation

- [ ] **Task 8: Verification** (AC: all)
  - [ ] Start Orion with Rube MCP server
  - [ ] Trigger a query that uses MCP tools
  - [ ] Verify tools are discovered in Langfuse trace
  - [ ] Verify cache prevents re-discovery within TTL
  - [ ] Add new server to config, restart, verify new tools discovered

## Dev Notes

### Critical: Claude SDK Handles Tool Discovery

The Claude Agent SDK **automatically discovers tools** from MCP servers when you pass them to `query()`. Our job is to:
1. **Track** what tools were discovered (for logging/debugging)
2. **Cache** tool schemas (to avoid repeated discovery)
3. **Summarize** tools for the system prompt (minimal context per AR17)

We do NOT implement the MCP `tools/list` protocol ourselves — the SDK does this internally.

### How Tool Discovery Works in Claude SDK

```
1. query() is called with mcpServers config
2. SDK connects to each MCP server
3. SDK sends tools/list request per MCP protocol
4. SDK receives tool schemas (name, description, inputSchema)
5. SDK makes tools available for tool_use during the conversation
```

We hook into this by:
- Observing SDK messages for tool_use events
- Extracting tool information from those events
- Building our registry for caching and context

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR17 | architecture.md | Minimal tools in context — agent discovers dynamically |
| FR26 | prd.md | System can connect to MCP servers for external tool access |
| FR28 | prd.md | System selects appropriate tools from available options |

### src/tools/registry.ts

```typescript
/**
 * Tool Registry - Tracks discovered MCP tools with caching
 * 
 * Tools are discovered by Claude SDK automatically. This registry:
 * 1. Caches tool schemas to avoid repeated discovery
 * 2. Provides lookup by tool name
 * 3. Supports TTL-based expiration
 */

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  server: string; // Which MCP server provides this tool
}

interface CacheEntry {
  tools: Map<string, ToolSchema>;
  timestamp: Date;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class ToolRegistry {
  private cache: CacheEntry | null = null;

  /**
   * Register a discovered tool
   */
  registerTool(schema: ToolSchema): void {
    if (!this.cache || this.isExpired()) {
      this.cache = {
        tools: new Map(),
        timestamp: new Date(),
      };
    }
    this.cache.tools.set(schema.name, schema);
  }

  /**
   * Register multiple tools at once (batch registration)
   */
  registerTools(schemas: ToolSchema[]): void {
    for (const schema of schemas) {
      this.registerTool(schema);
    }
  }

  /**
   * Get tool schema by name
   */
  getToolSchema(name: string): ToolSchema | undefined {
    if (!this.cache || this.isExpired()) {
      return undefined;
    }
    return this.cache.tools.get(name);
  }

  /**
   * List all registered tools
   */
  listTools(): ToolSchema[] {
    if (!this.cache || this.isExpired()) {
      return [];
    }
    return Array.from(this.cache.tools.values());
  }

  /**
   * Get tool names grouped by server
   */
  listToolsByServer(): Record<string, string[]> {
    const byServer: Record<string, string[]> = {};
    for (const tool of this.listTools()) {
      if (!byServer[tool.server]) {
        byServer[tool.server] = [];
      }
      byServer[tool.server].push(tool.name);
    }
    return byServer;
  }

  /**
   * Check if cache is expired
   */
  isExpired(): boolean {
    if (!this.cache) return true;
    const age = Date.now() - this.cache.timestamp.getTime();
    return age > CACHE_TTL_MS;
  }

  /**
   * Check if cache is valid (not expired and has tools)
   */
  isValid(): boolean {
    return this.cache !== null && !this.isExpired() && this.cache.tools.size > 0;
  }

  /**
   * Get cache age in seconds
   */
  getCacheAge(): number {
    if (!this.cache) return -1;
    return Math.floor((Date.now() - this.cache.timestamp.getTime()) / 1000);
  }

  /**
   * Clear the cache (force re-discovery on next query)
   */
  clear(): void {
    this.cache = null;
  }

  /**
   * Get cache stats for debugging
   */
  getStats(): { toolCount: number; cacheAge: number; expired: boolean } {
    return {
      toolCount: this.cache?.tools.size ?? 0,
      cacheAge: this.getCacheAge(),
      expired: this.isExpired(),
    };
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
```

### src/tools/mcp/discovery.ts

```typescript
import { startActiveObservation } from '@langfuse/tracing';
import { toolRegistry, type ToolSchema } from '../registry.js';
import { getMcpServersConfig } from './config.js';
import { logger } from '../../utils/logger.js';

/**
 * Discovery result from parsing SDK messages
 */
interface DiscoveryResult {
  tools: ToolSchema[];
  serverName: string;
  duration: number;
}

/**
 * Extract tool schemas from SDK tool_use messages
 * 
 * The Claude SDK handles MCP tool discovery internally. We observe
 * the SDK's behavior to build our registry for caching and context.
 * 
 * This function is called when we observe tool-related SDK messages.
 */
export function extractToolFromSdkMessage(
  message: { type: string; tool?: { name: string; description?: string; input_schema?: unknown } },
  serverName: string
): ToolSchema | null {
  if (message.type !== 'tool_use' || !message.tool) {
    return null;
  }

  return {
    name: message.tool.name,
    description: message.tool.description || '',
    inputSchema: (message.tool.input_schema as Record<string, unknown>) || {},
    server: serverName,
  };
}

/**
 * Register tools discovered during a query
 * Call this after observing SDK messages that include tool usage
 */
export async function registerDiscoveredTools(
  tools: ToolSchema[]
): Promise<void> {
  if (tools.length === 0) return;

  await startActiveObservation('tool-discovery', async (trace) => {
    const byServer = tools.reduce((acc, tool) => {
      acc[tool.server] = (acc[tool.server] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    trace.update({
      metadata: {
        toolCount: tools.length,
        byServer,
        toolNames: tools.map(t => t.name),
      },
    });

    toolRegistry.registerTools(tools);

    logger.info({
      event: 'tools_registered',
      count: tools.length,
      servers: Object.keys(byServer),
    });
  });
}

/**
 * Check if tool discovery is needed (cache expired or empty)
 */
export function needsDiscovery(): boolean {
  return !toolRegistry.isValid();
}

/**
 * Get available MCP servers for discovery
 */
export function getConfiguredServers(): string[] {
  const config = getMcpServersConfig();
  return Object.keys(config);
}

/**
 * Log discovery stats for debugging
 */
export function logDiscoveryStats(): void {
  const stats = toolRegistry.getStats();
  const byServer = toolRegistry.listToolsByServer();

  logger.debug({
    event: 'tool_registry_stats',
    ...stats,
    byServer,
  });
}
```

### src/tools/context.ts

```typescript
import { toolRegistry, type ToolSchema } from './registry.js';

/**
 * Essential tools that should always be mentioned in context
 * These are high-frequency tools that users commonly need
 */
const ESSENTIAL_TOOL_PATTERNS = [
  'search',
  'github',
  'slack',
  'confluence',
  'jira',
  'calendar',
  'email',
];

/**
 * Generate a minimal tool context summary for the system prompt
 * 
 * Per AR17: Minimal tools in context. We provide a high-level summary
 * rather than detailed schemas. The agent discovers specifics on-demand.
 * 
 * Target: Under 500 tokens to preserve context window
 */
export function getToolContextSummary(): string {
  const tools = toolRegistry.listTools();
  
  if (tools.length === 0) {
    return `You have access to external tools via MCP servers. Tools will be discovered when you attempt to use them.`;
  }

  const byServer = toolRegistry.listToolsByServer();
  const serverSummaries: string[] = [];

  for (const [server, toolNames] of Object.entries(byServer)) {
    // Categorize tools for this server
    const essential = toolNames.filter(name => 
      ESSENTIAL_TOOL_PATTERNS.some(pattern => 
        name.toLowerCase().includes(pattern)
      )
    );
    const otherCount = toolNames.length - essential.length;

    if (essential.length > 0) {
      let summary = `• ${server}: ${essential.slice(0, 5).join(', ')}`;
      if (essential.length > 5) {
        summary += ` (+${essential.length - 5} more)`;
      }
      if (otherCount > 0) {
        summary += ` and ${otherCount} other tools`;
      }
      serverSummaries.push(summary);
    } else {
      serverSummaries.push(`• ${server}: ${toolNames.length} tools available`);
    }
  }

  return `You have access to external tools via MCP:
${serverSummaries.join('\n')}

When you need to perform actions like searching, creating issues, sending messages, or accessing external services, use the appropriate MCP tool. Tool details are available when you invoke them.`;
}

/**
 * Get detailed schema for a specific tool (on-demand loading)
 */
export function getToolDetails(toolName: string): ToolSchema | undefined {
  return toolRegistry.getToolSchema(toolName);
}

/**
 * Search tools by keyword
 */
export function searchTools(keyword: string): ToolSchema[] {
  const tools = toolRegistry.listTools();
  const lower = keyword.toLowerCase();
  
  return tools.filter(tool => 
    tool.name.toLowerCase().includes(lower) ||
    tool.description.toLowerCase().includes(lower)
  );
}
```

### Integration: src/agent/orion.ts Updates

```typescript
// Add to imports
import { getToolContextSummary } from '../tools/context.js';
import { needsDiscovery, registerDiscoveredTools, extractToolFromSdkMessage } from '../tools/mcp/discovery.js';
import type { ToolSchema } from '../tools/registry.js';

// In runOrionAgent function, add tool context to system prompt:
export async function runOrionAgent(
  userMessage: string,
  context: AgentContext
): Promise<AsyncGenerator<SDKMessage>> {
  const toolConfig = getToolConfig();
  
  // Add tool context summary to system prompt (minimal context per AR17)
  const toolContext = getToolContextSummary();
  const enhancedSystemPrompt = `${context.systemPrompt}

## Available Tools
${toolContext}`;

  return await startActiveObservation('orion-agent', async (trace) => {
    trace.update({
      input: userMessage,
      metadata: {
        mcpServers: Object.keys(toolConfig.mcpServers),
        needsDiscovery: needsDiscovery(),
      },
    });

    const response = query({
      prompt: userMessage,
      options: {
        systemPrompt: enhancedSystemPrompt,
        mcpServers: toolConfig.mcpServers,
        allowedTools: toolConfig.allowedTools,
        settingSources: ['user', 'project'],
      },
    });

    // Observe response for tool discovery
    const discoveredTools: ToolSchema[] = [];
    
    for await (const message of response) {
      // Extract tool info from SDK messages
      if (message.type === 'tool_use') {
        const schema = extractToolFromSdkMessage(message, 'mcp');
        if (schema) {
          discoveredTools.push(schema);
        }
      }
      
      yield message;
    }

    // Register any newly discovered tools
    if (discoveredTools.length > 0) {
      await registerDiscoveredTools(discoveredTools);
    }
  });
}
```

### src/tools/registry.test.ts

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { toolRegistry, type ToolSchema } from './registry.js';

describe('ToolRegistry', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  const createTestTool = (name: string, server = 'test-server'): ToolSchema => ({
    name,
    description: `Test tool: ${name}`,
    inputSchema: { type: 'object' },
    server,
  });

  it('registers and retrieves tools', () => {
    const tool = createTestTool('test_tool');
    toolRegistry.registerTool(tool);

    const retrieved = toolRegistry.getToolSchema('test_tool');
    expect(retrieved).toEqual(tool);
  });

  it('registers multiple tools at once', () => {
    const tools = [
      createTestTool('tool_1'),
      createTestTool('tool_2'),
      createTestTool('tool_3'),
    ];
    toolRegistry.registerTools(tools);

    expect(toolRegistry.listTools()).toHaveLength(3);
  });

  it('returns undefined for unknown tool', () => {
    const result = toolRegistry.getToolSchema('nonexistent');
    expect(result).toBeUndefined();
  });

  it('lists tools by server', () => {
    toolRegistry.registerTools([
      createTestTool('tool_a', 'server_1'),
      createTestTool('tool_b', 'server_1'),
      createTestTool('tool_c', 'server_2'),
    ]);

    const byServer = toolRegistry.listToolsByServer();
    expect(byServer['server_1']).toEqual(['tool_a', 'tool_b']);
    expect(byServer['server_2']).toEqual(['tool_c']);
  });

  it('clears cache', () => {
    toolRegistry.registerTool(createTestTool('test'));
    expect(toolRegistry.listTools()).toHaveLength(1);

    toolRegistry.clear();
    expect(toolRegistry.listTools()).toHaveLength(0);
  });

  it('reports cache stats', () => {
    toolRegistry.registerTools([
      createTestTool('t1'),
      createTestTool('t2'),
    ]);

    const stats = toolRegistry.getStats();
    expect(stats.toolCount).toBe(2);
    expect(stats.cacheAge).toBeGreaterThanOrEqual(0);
    expect(stats.expired).toBe(false);
  });

  describe('cache expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('expires cache after TTL', () => {
      toolRegistry.registerTool(createTestTool('test'));
      expect(toolRegistry.isExpired()).toBe(false);

      // Advance time by 6 minutes (beyond 5 min TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      expect(toolRegistry.isExpired()).toBe(true);
      expect(toolRegistry.listTools()).toHaveLength(0);
    });

    it('cache remains valid before TTL', () => {
      toolRegistry.registerTool(createTestTool('test'));

      // Advance time by 4 minutes (within 5 min TTL)
      vi.advanceTimersByTime(4 * 60 * 1000);

      expect(toolRegistry.isExpired()).toBe(false);
      expect(toolRegistry.listTools()).toHaveLength(1);
    });
  });
});
```

### src/tools/context.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getToolContextSummary, searchTools } from './context.js';
import { toolRegistry } from './registry.js';

describe('Tool Context', () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  describe('getToolContextSummary', () => {
    it('returns fallback when no tools registered', () => {
      const summary = getToolContextSummary();
      expect(summary).toContain('Tools will be discovered');
    });

    it('groups tools by server', () => {
      toolRegistry.registerTools([
        { name: 'github_search', description: 'Search GitHub', inputSchema: {}, server: 'rube' },
        { name: 'slack_send', description: 'Send Slack message', inputSchema: {}, server: 'rube' },
        { name: 'custom_tool', description: 'Custom', inputSchema: {}, server: 'custom' },
      ]);

      const summary = getToolContextSummary();
      expect(summary).toContain('rube');
      expect(summary).toContain('custom');
    });

    it('highlights essential tools', () => {
      toolRegistry.registerTools([
        { name: 'github_search', description: 'Search GitHub', inputSchema: {}, server: 'rube' },
        { name: 'random_tool', description: 'Random', inputSchema: {}, server: 'rube' },
      ]);

      const summary = getToolContextSummary();
      expect(summary).toContain('github_search');
    });
  });

  describe('searchTools', () => {
    beforeEach(() => {
      toolRegistry.registerTools([
        { name: 'github_search', description: 'Search repositories', inputSchema: {}, server: 'rube' },
        { name: 'github_create_issue', description: 'Create issue', inputSchema: {}, server: 'rube' },
        { name: 'slack_send', description: 'Send message', inputSchema: {}, server: 'rube' },
      ]);
    });

    it('finds tools by name', () => {
      const results = searchTools('github');
      expect(results).toHaveLength(2);
    });

    it('finds tools by description', () => {
      const results = searchTools('message');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('slack_send');
    });

    it('returns empty for no matches', () => {
      const results = searchTools('nonexistent');
      expect(results).toHaveLength(0);
    });
  });
});
```

### Project Structure Notes

Files created:
- `src/tools/registry.ts` — Tool registry with caching
- `src/tools/context.ts` — Minimal context generation
- `src/tools/mcp/discovery.ts` — Discovery utilities
- `src/tools/registry.test.ts` — Registry tests
- `src/tools/context.test.ts` — Context tests

Files modified:
- `src/agent/orion.ts` — Integrate tool context and discovery

### Common Mistakes to Avoid

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| Implementing MCP tools/list ourselves | Claude SDK does this internally | Observe SDK messages instead |
| Loading full schemas in system prompt | Wastes context window | Use minimal summary (AR17) |
| Not caching tool schemas | Repeated discovery is slow | Cache with 5 min TTL |
| Hardcoding tool lists | Violates dynamic discovery | Let SDK discover from servers |

### References

- [Source: _bmad-output/architecture.md#AR17] — Minimal tools in context
- [Source: _bmad-output/prd.md#FR28] — System selects appropriate tools
- [Source: _bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md#4.1] — Tool discovery via SDK
- [External: MCP Protocol - tools/list](https://modelcontextprotocol.io/docs/concepts/tools)

## Dev Agent Record

### Agent Model Used

_To be filled by implementing agent_

### Completion Notes List

_To be filled during implementation_

### Debug Log

_To be filled during implementation_

### File List

Files to create:
- `src/tools/registry.ts`
- `src/tools/context.ts`
- `src/tools/mcp/discovery.ts`
- `src/tools/registry.test.ts`
- `src/tools/context.test.ts`

Files to modify:
- `src/agent/orion.ts`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story created with full implementation guidance |
