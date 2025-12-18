# Story 3.4: Multiple MCP Servers

Status: ready-for-dev

## Story

As a **user**,
I want Orion to use multiple tools in a single response,
So that complex tasks can be completed in one interaction.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3.1 MCP Client Infrastructure | required | MCP server configuration and connection |
| 3.2 Tool Discovery & Registration | required | Tool registry tracking which server provides each tool |
| 3.3 Tool Execution with Timeout | required | `executeToolWithTimeout()` for individual tool calls |
| 2.1 Claude Agent SDK Integration | required | `query()` function with `mcpServers` configuration |
| 1.2 Langfuse Instrumentation | ✅ done | Tracing for parallel execution |

## Acceptance Criteria

1. **Given** multiple MCP servers are connected, **When** a request requires multiple tools, **Then** the agent can invoke tools from different MCP servers (FR27)

2. **Given** multiple tools are needed, **When** tools are independent, **Then** tool calls are executed in parallel for performance

3. **Given** multiple tool results exist, **When** results are collected, **Then** results from multiple tools are aggregated into a unified format

4. **Given** aggregated results exist, **When** the response is generated, **Then** the response incorporates information from all tool calls coherently

5. **Given** multiple tools are needed, **When** tools can run concurrently, **Then** concurrent tool calls are limited to max 5 to avoid overwhelming servers (NFR18)

6. **Given** one tool fails in a batch, **When** other tools succeed, **Then** partial results are returned with failure noted (graceful degradation)

## Tasks / Subtasks

- [ ] **Task 1: Update Tool Config for Multiple Servers** (AC: #1)
  - [ ] Extend `.orion/config.yaml` to support multiple MCP server entries
  - [ ] Update `getMcpServersConfig()` to return all enabled servers
  - [ ] Track server source in tool registry entries

- [ ] **Task 2: Implement Multi-Server Tool Resolution** (AC: #1)
  - [ ] Create `resolveToolServer(toolName)` function
  - [ ] Map tool names to their source server
  - [ ] Handle tools available on multiple servers (prefer first)

- [ ] **Task 3: Create Parallel Execution Engine** (AC: #2, #5)
  - [ ] Create `src/tools/parallel.ts`
  - [ ] Implement `executeToolsParallel(calls: ToolCall[])` function
  - [ ] Use `Promise.allSettled` for resilient execution
  - [ ] Limit concurrency to MAX_CONCURRENT (5)
  - [ ] Implement batching for larger tool sets

- [ ] **Task 4: Implement Result Aggregation** (AC: #3, #6)
  - [ ] Create `AggregatedToolResults` interface
  - [ ] Collect successful results with metadata
  - [ ] Track failed tools with error details
  - [ ] Compute aggregate statistics (success rate, total duration)

- [ ] **Task 5: Format Results for Agent Context** (AC: #4)
  - [ ] Create `formatToolResultsForContext(results)` function
  - [ ] Structure results for LLM consumption
  - [ ] Include source server in result metadata
  - [ ] Handle partial failures gracefully in formatting

- [ ] **Task 6: Add Parallel Execution Tracing** (AC: all)
  - [ ] Trace batch execution as parent span
  - [ ] Trace individual tools as child spans
  - [ ] Log: batch size, concurrency, total duration, success/failure counts

- [ ] **Task 7: Create Tests** (AC: all)
  - [ ] Create `src/tools/parallel.test.ts`
  - [ ] Test parallel execution of independent tools
  - [ ] Test concurrency limiting (max 5)
  - [ ] Test partial failure handling
  - [ ] Test result aggregation

- [ ] **Task 8: Verification** (AC: all)
  - [ ] Configure 2+ MCP servers (e.g., Rube + GitHub)
  - [ ] Request requiring tools from both servers
  - [ ] Verify parallel execution in traces
  - [ ] Verify aggregated response includes all tool results

## Dev Notes

### Claude SDK Handles Multi-Server Natively

The Claude Agent SDK supports multiple MCP servers in the `mcpServers` configuration. When you pass multiple servers:

```typescript
const response = query({
  prompt: userMessage,
  options: {
    mcpServers: {
      rube: { command: 'npx', args: ['-y', '@composio/mcp', 'start'] },
      github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    },
  },
});
```

The SDK:
1. Connects to all configured servers
2. Discovers tools from each server
3. Makes all tools available to the agent
4. Routes tool calls to the correct server

Our job is to:
1. Track which tools came from which server (for logging/debugging)
2. Aggregate results when multiple tools are used
3. Handle partial failures gracefully

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR27 | prd.md | System can invoke multiple MCP servers within a single response |
| NFR18 | prd.md | Support multiple MCP servers in single response for concurrent tool calls |
| AR19 | architecture.md | Graceful degradation — continue with available tools |

### .orion/config.yaml Example

```yaml
mcp_servers:
  rube:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@composio/mcp", "start"]
    env:
      COMPOSIO_API_KEY: "${COMPOSIO_API_KEY}"
    description: "500+ app integrations via Composio"
    priority: 1  # Preferred for overlapping tools

  github:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
    description: "GitHub repository access"
    priority: 2

  atlassian:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-atlassian"]
    env:
      ATLASSIAN_API_KEY: "${ATLASSIAN_API_KEY}"
    description: "Jira and Confluence access"
    priority: 3

  internal:
    enabled: false  # Disabled for now
    type: http
    url: "https://internal-mcp.company.com"
    description: "Internal company tools"
```

### src/tools/parallel.ts

```typescript
import { startActiveObservation } from '@langfuse/tracing';
import { executeToolWithTimeout, ToolResult, TOOL_TIMEOUT_MS } from './execution.js';
import { toolRegistry } from './registry.js';
import { logger } from '../utils/logger.js';

/**
 * Maximum concurrent tool executions to prevent overwhelming servers
 */
const MAX_CONCURRENT = 5;

/**
 * Tool call specification
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  server?: string;  // Resolved from registry if not provided
}

/**
 * Aggregated results from parallel tool execution
 */
export interface AggregatedToolResults {
  results: ToolResult[];
  successful: ToolResult[];
  failed: ToolResult[];
  stats: {
    total: number;
    successCount: number;
    failureCount: number;
    totalDuration: number;
    averageDuration: number;
  };
}

/**
 * Execute multiple tools in parallel with concurrency limiting
 * 
 * Uses Promise.allSettled for resilience — one failure doesn't block others.
 * Results are aggregated with success/failure tracking.
 */
export async function executeToolsParallel(
  toolCalls: ToolCall[],
  executorFn: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  options: { timeout?: number; maxConcurrent?: number } = {}
): Promise<AggregatedToolResults> {
  const timeout = options.timeout ?? TOOL_TIMEOUT_MS;
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT;

  return await startActiveObservation('parallel-tool-execution', async (trace) => {
    trace.update({
      metadata: {
        toolCount: toolCalls.length,
        maxConcurrent,
        timeout,
        tools: toolCalls.map(c => c.name),
      },
    });

    const startTime = Date.now();
    const results: ToolResult[] = [];

    // Process in batches to limit concurrency
    for (let i = 0; i < toolCalls.length; i += maxConcurrent) {
      const batch = toolCalls.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(call => {
        // Resolve server from registry if not provided
        const server = call.server ?? toolRegistry.getToolSchema(call.name)?.server;
        
        return executeToolWithTimeout(
          call.name,
          () => executorFn(call.name, call.arguments),
          { timeout, serverName: server, sanitizedArgs: call.arguments }
        );
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      logger.debug({
        event: 'parallel_batch_complete',
        batchIndex: Math.floor(i / maxConcurrent),
        batchSize: batch.length,
        successCount: batchResults.filter(r => r.success).length,
      });
    }

    const totalDuration = Date.now() - startTime;
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const aggregated: AggregatedToolResults = {
      results,
      successful,
      failed,
      stats: {
        total: results.length,
        successCount: successful.length,
        failureCount: failed.length,
        totalDuration,
        averageDuration: results.length > 0 
          ? results.reduce((sum, r) => sum + r.duration, 0) / results.length 
          : 0,
      },
    };

    trace.update({
      output: {
        successCount: aggregated.stats.successCount,
        failureCount: aggregated.stats.failureCount,
        totalDuration,
      },
    });

    logger.info({
      event: 'parallel_execution_complete',
      ...aggregated.stats,
      failedTools: failed.map(f => f.toolName),
    });

    return aggregated;
  });
}

/**
 * Format aggregated results for agent context
 * 
 * Creates a structured format that the LLM can easily process,
 * including partial failure information.
 */
export function formatToolResultsForContext(
  aggregated: AggregatedToolResults
): string {
  const sections: string[] = [];

  // Successful results
  if (aggregated.successful.length > 0) {
    sections.push('## Tool Results\n');
    for (const result of aggregated.successful) {
      sections.push(`### ${result.toolName}\n`);
      sections.push('```json');
      sections.push(JSON.stringify(result.data, null, 2));
      sections.push('```\n');
    }
  }

  // Failed tools (inform agent)
  if (aggregated.failed.length > 0) {
    sections.push('## Unavailable Tools\n');
    sections.push('The following tools could not be executed:\n');
    for (const result of aggregated.failed) {
      sections.push(`- ${result.toolName}: ${result.error?.userMessage ?? 'Unknown error'}`);
    }
    sections.push('\nPlease work with the available results.\n');
  }

  return sections.join('\n');
}

/**
 * Check if tools can be parallelized (no dependencies between them)
 * 
 * For MVP, we assume all tools in a batch are independent.
 * Future enhancement: analyze tool inputs/outputs for dependencies.
 */
export function canParallelize(toolCalls: ToolCall[]): boolean {
  // MVP: All tools are independent
  // Future: Check if any tool's input depends on another's output
  return true;
}
```

### src/tools/parallel.test.ts

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeToolsParallel, formatToolResultsForContext } from './parallel.js';
import type { AggregatedToolResults, ToolCall } from './parallel.js';

describe('Parallel Tool Execution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeToolsParallel', () => {
    it('executes all tools and aggregates results', async () => {
      const calls: ToolCall[] = [
        { name: 'tool_a', arguments: { q: 'a' } },
        { name: 'tool_b', arguments: { q: 'b' } },
        { name: 'tool_c', arguments: { q: 'c' } },
      ];

      const executor = vi.fn().mockImplementation((name) => 
        Promise.resolve({ result: name })
      );

      const promise = executeToolsParallel(calls, executor, { timeout: 1000 });
      vi.advanceTimersByTime(100);
      const result = await promise;

      expect(result.stats.total).toBe(3);
      expect(result.stats.successCount).toBe(3);
      expect(result.stats.failureCount).toBe(0);
      expect(executor).toHaveBeenCalledTimes(3);
    });

    it('handles partial failures gracefully', async () => {
      const calls: ToolCall[] = [
        { name: 'good_tool', arguments: {} },
        { name: 'bad_tool', arguments: {} },
      ];

      const executor = vi.fn().mockImplementation((name) => {
        if (name === 'bad_tool') {
          return Promise.reject(new Error('Tool failed'));
        }
        return Promise.resolve({ ok: true });
      });

      const promise = executeToolsParallel(calls, executor, { timeout: 1000 });
      vi.advanceTimersByTime(100);
      const result = await promise;

      expect(result.stats.successCount).toBe(1);
      expect(result.stats.failureCount).toBe(1);
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });

    it('limits concurrency to max concurrent', async () => {
      const calls: ToolCall[] = Array(10).fill(null).map((_, i) => ({
        name: `tool_${i}`,
        arguments: {},
      }));

      const activeExecutions: number[] = [];
      let currentActive = 0;

      const executor = vi.fn().mockImplementation(async () => {
        currentActive++;
        activeExecutions.push(currentActive);
        await new Promise(r => setTimeout(r, 50));
        currentActive--;
        return { ok: true };
      });

      const promise = executeToolsParallel(calls, executor, { 
        timeout: 1000, 
        maxConcurrent: 3 
      });
      
      // Advance through all batches
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      }
      
      const result = await promise;
      
      // Max concurrent should never exceed 3
      expect(Math.max(...activeExecutions)).toBeLessThanOrEqual(3);
      expect(result.stats.successCount).toBe(10);
    });
  });

  describe('formatToolResultsForContext', () => {
    it('formats successful results', () => {
      const aggregated: AggregatedToolResults = {
        results: [],
        successful: [
          { success: true, toolName: 'search', data: { items: [1, 2] }, duration: 100 },
        ],
        failed: [],
        stats: { total: 1, successCount: 1, failureCount: 0, totalDuration: 100, averageDuration: 100 },
      };

      const formatted = formatToolResultsForContext(aggregated);
      
      expect(formatted).toContain('## Tool Results');
      expect(formatted).toContain('### search');
      expect(formatted).toContain('"items"');
    });

    it('includes failure information', () => {
      const aggregated: AggregatedToolResults = {
        results: [],
        successful: [],
        failed: [
          { 
            success: false, 
            toolName: 'broken_tool', 
            error: { code: 'TOOL_TIMEOUT', message: 'Timeout', userMessage: 'Tool timed out', recoverable: true },
            duration: 30000 
          },
        ],
        stats: { total: 1, successCount: 0, failureCount: 1, totalDuration: 30000, averageDuration: 30000 },
      };

      const formatted = formatToolResultsForContext(aggregated);
      
      expect(formatted).toContain('## Unavailable Tools');
      expect(formatted).toContain('broken_tool');
      expect(formatted).toContain('timed out');
    });
  });
});
```

### Integration with Agent

```typescript
// In src/agent/orion.ts - handling multi-tool responses

import { executeToolsParallel, formatToolResultsForContext } from '../tools/parallel.js';

// When the SDK returns multiple tool_use events:
async function handleMultipleToolCalls(
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>
): Promise<string> {
  const calls = toolCalls.map(tc => ({
    name: tc.name,
    arguments: tc.input,
  }));

  // Execute in parallel
  const aggregated = await executeToolsParallel(
    calls,
    (name, args) => mcpClient.callTool(name, args)
  );

  // Format for agent context
  return formatToolResultsForContext(aggregated);
}
```

### Project Structure Notes

Files created:
- `src/tools/parallel.ts` — Parallel execution engine
- `src/tools/parallel.test.ts` — Tests

Files modified:
- `.orion/config.yaml` — Multi-server configuration
- `src/agent/orion.ts` — Integrate parallel execution

### References

- [Source: _bmad-output/prd.md#FR27] — Multiple MCP servers in single response
- [Source: _bmad-output/prd.md#NFR18] — Concurrent tool calls
- [Source: _bmad-output/architecture.md#AR19] — Graceful degradation

## Dev Agent Record

### Agent Model Used

_To be filled by implementing agent_

### Completion Notes List

_To be filled during implementation_

### Debug Log

_To be filled during implementation_

### File List

Files to create:
- `src/tools/parallel.ts`
- `src/tools/parallel.test.ts`

Files to modify:
- `.orion/config.yaml`
- `src/agent/orion.ts`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story enhanced with full implementation guidance |
