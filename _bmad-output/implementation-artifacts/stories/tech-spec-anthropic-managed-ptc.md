# Tech-Spec: Anthropic Managed Programmatic Tool Calling (PTC)

**Created:** 2026-01-06
**Status:** Ready for Development
**Priority:** High
**Estimated Effort:** 1-2 days

## Overview

### Problem Statement

When Orion executes many tool calls (5-10+), the following issues occur:

1. **Context pollution**: Each tool result enters Claude's context window, consuming 50-100k+ tokens
2. **Missing final responses**: Claude generates no summary or a truncated one
3. **Poor UX**: Users see "Sources: [10 tools]" but no actual analysis

### Solution

Adopt **Anthropic's managed Programmatic Tool Calling (PTC)** using the `allowed_callers` pattern:

1. Add `advanced-tool-use-2025-11-20` beta header
2. Add `code_execution_20250825` tool type to tools array
3. Mark MCP-derived tools with `allowed_callers: ["code_execution_20250825"]`
4. Handle new response types in agent loop (`server_tool_use`, `caller` field, `container`)

**Key Benefit:** Claude automatically knows which tools to call programmatically. No prompt engineering needed for decision logic.

**Strategic Alignment:** Using Anthropic's patterns enables easier adoption of future features (Files API, Prompt Caching, Citations).

### Scope

**In Scope:**

- Add PTC beta header to API calls
- Add `code_execution_20250825` tool to tools array
- Update `schema-converter.ts` to add `allowed_callers` to MCP tools
- Update agent loop to handle PTC response types
- Tests for new functionality

**Out of Scope:**

- GKE sandbox changes (remains for Skills execution)
- Prompt-based PTC guidance (not needed with `allowed_callers`)
- Files API, Prompt Caching, Citations (future specs)

## Context for Development

### How Anthropic PTC Works

1. Claude writes Python code that calls tools as functions
2. Code runs in Anthropic's managed sandbox
3. When tool function is called, sandbox **pauses** and API returns `tool_use` block
4. **You** execute the tool (MCP call happens in your code)
5. You return `tool_result`, sandbox **resumes**
6. Only final `stdout` enters Claude's context (not intermediate tool results)

```
Claude writes: result = await msci_reports__analyze_report(job_id=509454)
                              │
                              ▼ Anthropic pauses, sends tool_use to you

Your code: Execute MCP call, return result
                              │
                              ▼ Anthropic resumes with result

Claude continues: summary = process(result); print(summary)
                              │
                              ▼ Only print output enters context
```

### Why Your MCP Tools Work with PTC

Your MCP tools are converted to regular Anthropic tools via `mcpToolToClaude()`. From Anthropic's perspective, they're just tools with `input_schema`. The "MCP connector" limitation refers to Anthropic's built-in MCP Connector feature, not your self-managed MCP servers.

### Codebase Patterns

**Beta headers (existing pattern):**

```typescript
// src/agent/loop.ts - already using betas
const response = await anthropic.beta.messages.create({
  model: config.anthropic.model,
  betas: ['context-management-2025-06-27'],  // Add new beta here
  // ...
});
```

**Tool registration (existing pattern):**

```typescript
// src/tools/mcp/schema-converter.ts
export function mcpToolToClaude(serverName: string, tool: McpTool): AnthropicTool {
  return {
    name: `${serverName}__${tool.name}`,
    description: tool.description,
    input_schema: convertSchema(tool.inputSchema),
    // ADD: allowed_callers: ["code_execution_20250825"]
  };
}
```

### Files to Reference

| File | Purpose |
|------|---------|
| `src/agent/loop.ts` | Agent loop - add beta, handle new response types |
| `src/tools/mcp/schema-converter.ts` | Add `allowed_callers` to MCP tools |
| `src/tools/registry.ts` | Add `code_execution` tool type |
| `docs/anthropic-sdk/programmtic-tool-calling.md` | Anthropic's official docs (local copy) |

### Technical Decisions

**Decision 1: Mark all MCP tools with `allowed_callers: ["code_execution_20250825"]`**

- Rationale: Let Claude decide when to use PTC based on task complexity
- Alternative considered: `["direct", "code_execution_20250825"]` (both modes)
- Anthropic recommends choosing one mode per tool for clearer guidance

**Decision 2: Keep GKE sandbox separate**

- Rationale: Skills need network access, custom packages
- `execute_code` (GKE) and `code_execution` (Anthropic) serve different purposes
- No naming conflict - different tool names

**Decision 3: No container reuse initially**

- Rationale: Simpler implementation, each request is independent
- Can add container reuse later for multi-turn conversations if needed

## Implementation Plan

### Task 1: Add Beta Header

**File:** `src/agent/loop.ts`

```typescript
const response = await anthropic.beta.messages.create({
  model: config.anthropic.model,
  betas: [
    'context-management-2025-06-27',
    'advanced-tool-use-2025-11-20',  // NEW
  ],
  // ...
});
```

### Task 2: Add Code Execution Tool Type

**File:** `src/tools/registry.ts` or where tools are assembled

```typescript
const tools: Anthropic.Tool[] = [
  // Anthropic's managed code execution
  {
    type: 'code_execution_20250825',
    name: 'code_execution',
  } as Anthropic.Tool,
  // ... other tools
];
```

### Task 3: Add `allowed_callers` to MCP Tools

**File:** `src/tools/mcp/schema-converter.ts`

```typescript
export function mcpToolToClaude(
  serverName: string,
  tool: McpTool,
  serverDefaults?: Record<string, unknown>
): AnthropicTool {
  const name = `${serverName}__${tool.name}`;

  return {
    name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: convertProperties(tool.inputSchema?.properties),
      required: tool.inputSchema?.required || [],
    },
    // NEW: Enable programmatic calling from code execution
    allowed_callers: ['code_execution_20250825'],
  };
}
```

### Task 4: Handle PTC Response Types in Agent Loop

**File:** `src/agent/loop.ts`

Add handling for new content block types:

```typescript
for (const block of response.content) {
  if (block.type === 'text') {
    // Existing: handle text
  } else if (block.type === 'tool_use') {
    // Check if this is a programmatic call
    const caller = (block as any).caller;
    if (caller?.type === 'code_execution_20250825') {
      // Programmatic tool call - execute and return result
      // Tool result goes back to Anthropic's sandbox, NOT to Claude's context
      logger.info({
        event: 'agent.loop.ptc_tool_call',
        toolName: block.name,
        callerId: caller.tool_id,
        traceId,
      });
    }

    // Execute tool (same as before)
    const result = await executeToolCall(block, context);
    toolResults.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: result,
    });
  } else if (block.type === 'server_tool_use') {
    // Anthropic's code execution starting
    logger.info({
      event: 'agent.loop.code_execution_started',
      toolId: block.id,
      traceId,
    });
  } else if (block.type === 'code_execution_tool_result') {
    // Code execution completed - this is the final output
    logger.info({
      event: 'agent.loop.code_execution_completed',
      toolId: block.tool_use_id,
      returnCode: block.content?.return_code,
      traceId,
    });
  }
}
```

### Task 5: Handle Container Field (Optional)

**File:** `src/agent/loop.ts`

```typescript
// Track container for potential reuse
const container = response.container;
if (container) {
  logger.debug({
    event: 'agent.loop.container_info',
    containerId: container.id,
    expiresAt: container.expires_at,
    traceId,
  });
}
```

### Task 6: Update Types

**File:** `src/types/anthropic.ts` or similar

```typescript
// Extend types for PTC response handling
interface PtcToolUse extends Anthropic.ToolUseBlock {
  caller?: {
    type: 'direct' | 'code_execution_20250825';
    tool_id?: string;
  };
}

interface ServerToolUseBlock {
  type: 'server_tool_use';
  id: string;
  name: string;
  input: { code: string };
}

interface CodeExecutionResultBlock {
  type: 'code_execution_tool_result';
  tool_use_id: string;
  content: {
    type: 'code_execution_result';
    stdout: string;
    stderr: string;
    return_code: number;
    content: any[];
  };
}
```

## Acceptance Criteria

### AC1: Beta Header Added

- **Given** Orion makes an API call
- **When** the request is sent to Anthropic
- **Then** it includes `advanced-tool-use-2025-11-20` in the betas array

### AC2: Code Execution Tool Available

- **Given** Claude receives the tools list
- **When** it evaluates available tools
- **Then** `code_execution` (type `code_execution_20250825`) is present

### AC3: MCP Tools Have `allowed_callers`

- **Given** MCP tools are converted via `mcpToolToClaude()`
- **When** the tool definition is created
- **Then** it includes `allowed_callers: ["code_execution_20250825"]`

### AC4: Programmatic Tool Calls Execute

- **Given** Claude decides to use PTC for a multi-tool task
- **When** code execution calls a tool (e.g., `await msci_reports__analyze(...)`)
- **Then** Orion receives `tool_use` with `caller.type === "code_execution_20250825"`
- **And** Orion executes the MCP call and returns the result

### AC5: Context Efficiency Improved

- **Given** a task requiring 5+ tool calls
- **When** Claude uses PTC to batch them
- **Then** only the final `stdout` enters Claude's context (not all tool results)
- **And** Claude delivers a complete analysis

### AC6: Observability

- **Given** PTC is used
- **When** tool calls are made programmatically
- **Then** Langfuse traces show `ptc_tool_call` events with caller info

## Testing Strategy

### Unit Tests

**File:** `src/tools/mcp/schema-converter.test.ts`

```typescript
describe('allowed_callers', () => {
  it('adds allowed_callers to converted tools', () => {
    const mcpTool = { name: 'search', inputSchema: { type: 'object' } };
    const result = mcpToolToClaude('server', mcpTool);

    expect(result.allowed_callers).toEqual(['code_execution_20250825']);
  });
});
```

**File:** `src/agent/loop.test.ts`

```typescript
describe('PTC response handling', () => {
  it('handles tool_use with caller field', async () => {
    const mockResponse = {
      content: [{
        type: 'tool_use',
        id: 'toolu_123',
        name: 'msci-reports__analyze',
        input: { job_id: 509454 },
        caller: { type: 'code_execution_20250825', tool_id: 'srvtoolu_456' },
      }],
      stop_reason: 'tool_use',
    };

    // ... test that tool is executed and result returned
  });

  it('handles server_tool_use blocks', async () => {
    // ... test code execution start handling
  });

  it('handles code_execution_tool_result blocks', async () => {
    // ... test code execution completion handling
  });
});
```

### Integration Tests

1. **E2E Multi-Tool Test:**
   - Trigger "analyze 5 reports" in Slack
   - Verify Claude uses PTC (check logs for `ptc_tool_call` events)
   - Verify complete analysis is delivered

2. **Context Efficiency Test:**
   - Compare token usage with PTC vs. direct calls
   - Verify reduction in context consumption

## Dependencies

**Anthropic SDK:** Ensure `@anthropic-ai/sdk` version supports PTC betas (^0.71.x should work)

**No new dependencies required** - this uses existing Anthropic SDK with beta headers.

## Rollback Plan

1. Remove `advanced-tool-use-2025-11-20` from betas array
2. Remove `allowed_callers` from `mcpToolToClaude()`
3. Remove `code_execution` tool from tools array

All changes are additive and easily reversible. Direct tool calls continue to work as before.

## Relationship to GKE Sandbox

| Tool | Name | Purpose | Stays? |
|------|------|---------|--------|
| **Anthropic PTC** | `code_execution` | Multi-tool orchestration | NEW |
| **GKE Sandbox** | `execute_code` | Skills with network/packages | YES |

Both coexist. Different names, different purposes. No conflict.

## Future Considerations

Once PTC is working, consider adopting:

- **Files API** - For document handling
- **Prompt Caching** - For cost optimization
- **Citations** - For source attribution

These will be easier to integrate with Anthropic platform alignment in place.

## References

- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Programmatic Tool Calling Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)
- Local: `docs/anthropic-sdk/programmtic-tool-calling.md`
