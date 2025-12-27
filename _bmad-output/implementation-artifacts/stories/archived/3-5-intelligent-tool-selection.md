# Story 3.5: Intelligent Tool Selection

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: Claude's reasoning handles tool selection; this is prompting, not code

## Story

As a **user**,
I want Orion to choose the right tool for each task,
So that I get the best results without specifying tools.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3.2 Tool Discovery & Registration | required | Tool registry with schemas and descriptions |
| 3.4 Multiple MCP Servers | required | Multi-server tool availability |
| 2.1 Claude Agent SDK Integration | required | SDK handles primary tool selection |
| 1.2 Langfuse Instrumentation | ✅ done | Tracing for selection decisions |

## Acceptance Criteria

1. **Given** multiple tools are available, **When** the agent processes a request, **Then** it selects appropriate tools from available options (FR28)

2. **Given** tools are being selected, **When** selection occurs, **Then** tool selection considers request context, tool descriptions, and tool capabilities

3. **Given** tools are selected, **When** debugging is needed, **Then** the agent logs tool selection reasoning in Langfuse traces

4. **Given** no suitable MCP tool exists, **When** the task requires external action, **Then** the agent falls back to code generation (AR15 - Epic 4)

5. **Given** multiple tools can accomplish a task, **When** selecting, **Then** prefer tools with higher reliability (based on health status from Story 3.1)

6. **Given** tool selection occurs, **When** traced, **Then** selection metrics are available for analysis (which tools selected, why)

## Tasks / Subtasks

- [ ] **Task 1: Create Tool Selection Module** (AC: #1, #2)
  - [ ] Create `src/tools/selection.ts`
  - [ ] Define `ToolSelectionContext` interface
  - [ ] Implement `selectToolsForRequest(context)` function
  - [ ] Return ranked list of applicable tools

- [ ] **Task 2: Implement Capability Matching** (AC: #2)
  - [ ] Match request keywords to tool descriptions
  - [ ] Consider tool input schema requirements
  - [ ] Score tools by relevance to request
  - [ ] Handle ambiguous requests (return multiple options)

- [ ] **Task 3: Integrate Health-Aware Selection** (AC: #5)
  - [ ] Import `isServerAvailable` from health module
  - [ ] Prefer tools from healthy servers
  - [ ] Demote tools from degraded servers
  - [ ] Exclude tools from unhealthy servers

- [ ] **Task 4: Log Selection Reasoning** (AC: #3, #6)
  - [ ] Create span for tool selection process
  - [ ] Log: request context, candidate tools, scores, selected tools
  - [ ] Include selection rationale in trace metadata
  - [ ] Track selection patterns over time

- [ ] **Task 5: Implement Code Generation Fallback Detection** (AC: #4)
  - [ ] Detect when no tool matches request
  - [ ] Create `shouldFallbackToCodeGen(request, tools)` function
  - [ ] Log fallback trigger events
  - [ ] Return flag for Epic 4 integration

- [ ] **Task 6: Create Selection Analytics** (AC: #6)
  - [ ] Track tool selection frequency
  - [ ] Track fallback frequency
  - [ ] Log selection success/failure correlation

- [ ] **Task 7: Create Tests** (AC: all)
  - [ ] Create `src/tools/selection.test.ts`
  - [ ] Test tool matching by description
  - [ ] Test health-aware prioritization
  - [ ] Test fallback detection
  - [ ] Test selection logging

- [ ] **Task 8: Verification** (AC: all)
  - [ ] Request requiring specific tool type (e.g., "search GitHub")
  - [ ] Verify correct tool selected in trace
  - [ ] Request with no matching tool
  - [ ] Verify fallback flag is set

## Dev Notes

### Claude SDK Handles Tool Selection

The Claude Agent SDK has built-in intelligence for tool selection. When you provide tools via `mcpServers`, the SDK:

1. Includes tool descriptions in the context
2. Lets Claude decide which tools to use
3. Claude selects based on the conversation and tool capabilities

Our module **augments** this by:
- Logging what Claude selected (for debugging)
- Tracking selection patterns (for optimization)
- Detecting when fallback to code gen is needed
- Health-aware filtering before tools reach Claude

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR28 | prd.md | System selects appropriate tools from available options |
| AR15 | architecture.md | Tool fallback to code generation when MCP tool doesn't exist |
| AR17 | architecture.md | Agent discovers available tools dynamically |

### Tool Selection Flow

```
User Request
    │
    ▼
┌─────────────────────────────────────┐
│  1. Gather Available Tools          │
│     (from registry, filter healthy) │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  2. Claude Selects Tools            │
│     (SDK handles via tool_use)      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  3. Log Selection                   │
│     (which tools, why)              │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  4. No tools selected?              │
│     → Set fallback flag for Epic 4  │
└─────────────────────────────────────┘
```

### src/tools/selection.ts

```typescript
import { startActiveObservation } from '@langfuse/tracing';
import { toolRegistry, ToolSchema } from './registry.js';
import { isServerAvailable, healthRegistry } from './mcp/health.js';
import { logger } from '../utils/logger.js';

/**
 * Context for tool selection
 */
export interface ToolSelectionContext {
  userMessage: string;
  threadContext?: string;
  previousToolUse?: string[];  // Tools already used in this conversation
}

/**
 * Result of tool selection analysis
 */
export interface ToolSelectionResult {
  availableTools: ToolSchema[];
  healthyServerTools: ToolSchema[];
  degradedServerTools: ToolSchema[];
  excludedTools: ToolSchema[];
  shouldFallbackToCodeGen: boolean;
  selectionMetadata: {
    totalTools: number;
    healthyCount: number;
    excludedCount: number;
    requestKeywords: string[];
  };
}

/**
 * Prepare available tools for Claude, filtering by health
 * 
 * This runs BEFORE Claude SDK gets the tools, ensuring only
 * healthy/degraded server tools are available for selection.
 */
export async function prepareToolsForSelection(
  context: ToolSelectionContext
): Promise<ToolSelectionResult> {
  return await startActiveObservation('tool-selection-prep', async (trace) => {
    const allTools = toolRegistry.listTools();
    
    // Categorize by server health
    const healthyServerTools: ToolSchema[] = [];
    const degradedServerTools: ToolSchema[] = [];
    const excludedTools: ToolSchema[] = [];

    for (const tool of allTools) {
      const health = healthRegistry.getHealth(tool.server);
      
      if (health.status === 'unhealthy') {
        excludedTools.push(tool);
      } else if (health.status === 'degraded') {
        degradedServerTools.push(tool);
      } else {
        healthyServerTools.push(tool);
      }
    }

    // Available = healthy + degraded (unhealthy excluded)
    const availableTools = [...healthyServerTools, ...degradedServerTools];

    // Extract keywords from request for logging
    const requestKeywords = extractKeywords(context.userMessage);

    const result: ToolSelectionResult = {
      availableTools,
      healthyServerTools,
      degradedServerTools,
      excludedTools,
      shouldFallbackToCodeGen: availableTools.length === 0,
      selectionMetadata: {
        totalTools: allTools.length,
        healthyCount: healthyServerTools.length,
        excludedCount: excludedTools.length,
        requestKeywords,
      },
    };

    trace.update({
      metadata: {
        totalTools: allTools.length,
        availableCount: availableTools.length,
        excludedCount: excludedTools.length,
        excludedServers: [...new Set(excludedTools.map(t => t.server))],
        requestKeywords,
      },
    });

    logger.debug({
      event: 'tool_selection_prepared',
      availableCount: availableTools.length,
      excludedCount: excludedTools.length,
    });

    return result;
  });
}

/**
 * Log tool selection after Claude makes choices
 * 
 * Called after we observe which tools Claude actually used.
 */
export function logToolSelection(
  selectedTools: string[],
  context: ToolSelectionContext,
  availableTools: ToolSchema[]
): void {
  const selectedSchemas = selectedTools.map(name => 
    availableTools.find(t => t.name === name)
  ).filter(Boolean);

  const servers = [...new Set(selectedSchemas.map(t => t?.server))];

  logger.info({
    event: 'tools_selected',
    selectedTools,
    servers,
    availableCount: availableTools.length,
    requestPreview: context.userMessage.substring(0, 100),
  });
}

/**
 * Detect if we should fallback to code generation
 * 
 * Called when:
 * 1. No tools are available (all servers unhealthy)
 * 2. Claude didn't select any tools but task requires action
 * 3. Available tools don't match the request type
 */
export function shouldFallbackToCodeGen(
  selectedTools: string[],
  availableTools: ToolSchema[],
  requestType: 'query' | 'action' | 'unknown'
): { fallback: boolean; reason?: string } {
  // Case 1: No tools available at all
  if (availableTools.length === 0) {
    return { 
      fallback: true, 
      reason: 'No tools available (all servers unhealthy)' 
    };
  }

  // Case 2: Request requires action but no tools selected
  if (requestType === 'action' && selectedTools.length === 0) {
    return { 
      fallback: true, 
      reason: 'Action requested but no tools selected by Claude' 
    };
  }

  // Case 3: Query type - code gen not typically needed
  if (requestType === 'query') {
    return { fallback: false };
  }

  return { fallback: false };
}

/**
 * Analyze request to determine if it's a query or action
 */
export function classifyRequest(
  userMessage: string
): 'query' | 'action' | 'unknown' {
  const actionPatterns = [
    /\b(create|make|build|send|post|update|delete|add|remove)\b/i,
    /\b(file|ticket|issue|message|email|document)\b.*\b(for|to|in)\b/i,
  ];

  const queryPatterns = [
    /\b(what|how|why|when|where|who|which|find|search|look up|tell me)\b/i,
    /\?$/,
  ];

  for (const pattern of actionPatterns) {
    if (pattern.test(userMessage)) return 'action';
  }

  for (const pattern of queryPatterns) {
    if (pattern.test(userMessage)) return 'query';
  }

  return 'unknown';
}

/**
 * Extract keywords from user message for logging/analysis
 */
function extractKeywords(message: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
    'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's',
    't', 'just', 'don', 'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you',
    'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they',
    'them', 'their', 'theirs', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
    'those', 'am', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'please']);

  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10);  // Limit to 10 keywords
}

/**
 * Get tools matching specific keywords (for debugging/analysis)
 */
export function findToolsByKeywords(keywords: string[]): ToolSchema[] {
  const allTools = toolRegistry.listTools();
  
  return allTools.filter(tool => {
    const searchText = `${tool.name} ${tool.description}`.toLowerCase();
    return keywords.some(kw => searchText.includes(kw.toLowerCase()));
  });
}
```

### src/tools/selection.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  prepareToolsForSelection,
  classifyRequest,
  shouldFallbackToCodeGen,
  findToolsByKeywords,
} from './selection.js';
import { toolRegistry } from './registry.js';
import { healthRegistry } from './mcp/health.js';

describe('Tool Selection', () => {
  beforeEach(() => {
    toolRegistry.clear();
    healthRegistry.resetAll();

    // Setup test tools
    toolRegistry.registerTools([
      { name: 'github_search', description: 'Search GitHub repos', inputSchema: {}, server: 'github' },
      { name: 'github_create_issue', description: 'Create GitHub issue', inputSchema: {}, server: 'github' },
      { name: 'slack_search', description: 'Search Slack messages', inputSchema: {}, server: 'rube' },
      { name: 'confluence_search', description: 'Search Confluence docs', inputSchema: {}, server: 'atlassian' },
    ]);
  });

  describe('prepareToolsForSelection', () => {
    it('returns all tools when all servers healthy', async () => {
      healthRegistry.markHealthy('github');
      healthRegistry.markHealthy('rube');
      healthRegistry.markHealthy('atlassian');

      const result = await prepareToolsForSelection({
        userMessage: 'Search for documentation',
      });

      expect(result.availableTools).toHaveLength(4);
      expect(result.excludedTools).toHaveLength(0);
    });

    it('excludes tools from unhealthy servers', async () => {
      healthRegistry.markHealthy('github');
      healthRegistry.markHealthy('rube');
      // Make atlassian unhealthy
      for (let i = 0; i < 3; i++) {
        healthRegistry.markFailure('atlassian', new Error('down'));
      }

      const result = await prepareToolsForSelection({
        userMessage: 'Search for documentation',
      });

      expect(result.availableTools).toHaveLength(3);
      expect(result.excludedTools).toHaveLength(1);
      expect(result.excludedTools[0].name).toBe('confluence_search');
    });

    it('sets fallback flag when no tools available', async () => {
      // Make all servers unhealthy
      for (const server of ['github', 'rube', 'atlassian']) {
        for (let i = 0; i < 3; i++) {
          healthRegistry.markFailure(server, new Error('down'));
        }
      }

      const result = await prepareToolsForSelection({
        userMessage: 'Do something',
      });

      expect(result.shouldFallbackToCodeGen).toBe(true);
      expect(result.availableTools).toHaveLength(0);
    });
  });

  describe('classifyRequest', () => {
    it('classifies action requests', () => {
      expect(classifyRequest('Create a new issue for the bug')).toBe('action');
      expect(classifyRequest('Send a message to the team')).toBe('action');
      expect(classifyRequest('Delete the old file')).toBe('action');
    });

    it('classifies query requests', () => {
      expect(classifyRequest('What is the status of the project?')).toBe('query');
      expect(classifyRequest('Find documents about onboarding')).toBe('query');
      expect(classifyRequest('How does authentication work?')).toBe('query');
    });

    it('returns unknown for ambiguous requests', () => {
      expect(classifyRequest('project status')).toBe('unknown');
      expect(classifyRequest('hello')).toBe('unknown');
    });
  });

  describe('shouldFallbackToCodeGen', () => {
    it('returns fallback when no tools available', () => {
      const result = shouldFallbackToCodeGen([], [], 'action');
      expect(result.fallback).toBe(true);
      expect(result.reason).toContain('No tools available');
    });

    it('returns fallback when action requested but no tools selected', () => {
      const tools = [{ name: 't1', description: '', inputSchema: {}, server: 's1' }];
      const result = shouldFallbackToCodeGen([], tools, 'action');
      expect(result.fallback).toBe(true);
      expect(result.reason).toContain('no tools selected');
    });

    it('does not fallback for query requests', () => {
      const result = shouldFallbackToCodeGen([], [], 'query');
      expect(result.fallback).toBe(false);
    });
  });

  describe('findToolsByKeywords', () => {
    it('finds tools matching keywords', () => {
      const results = findToolsByKeywords(['github']);
      expect(results).toHaveLength(2);
      expect(results.map(t => t.name)).toContain('github_search');
      expect(results.map(t => t.name)).toContain('github_create_issue');
    });

    it('finds tools by description', () => {
      const results = findToolsByKeywords(['slack', 'messages']);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('slack_search');
    });
  });
});
```

### Project Structure Notes

Files created:
- `src/tools/selection.ts` — Tool selection logic
- `src/tools/selection.test.ts` — Tests

Files modified:
- `src/agent/orion.ts` — Integrate selection preparation

### References

- [Source: _bmad-output/prd.md#FR28] — System selects appropriate tools
- [Source: _bmad-output/architecture.md#AR15] — Fallback to code generation
- [Source: _bmad-output/architecture.md#AR17] — Dynamic tool discovery

## Dev Agent Record

### Agent Model Used

_To be filled by implementing agent_

### Completion Notes List

_To be filled during implementation_

### Debug Log

_To be filled during implementation_

### File List

Files to create:
- `src/tools/selection.ts`
- `src/tools/selection.test.ts`

Files to modify:
- `src/agent/orion.ts`

## Change Log

| Date | Change |
|------|--------|
| 2025-12-17 | Story enhanced with full implementation guidance |
