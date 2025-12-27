# Story 4.3: Deep Research Workflow

Status: ready-for-dev

## Story

As a **user**,
I want to request deep research that automatically parallelizes across sources,
So that I get comprehensive, synthesized answers in minutes instead of hours.

## Acceptance Criteria

1. **Given** a research request, **When** the agent determines it requires deep research, **Then** it spawns parallel subagents for different sources

2. **Given** a deep research task, **When** parallel search completes, **Then** results are aggregated and synthesized into a coherent response

3. **Given** deep research, **When** multiple sources are searched, **Then** the response includes proper source citations ([1], [2], etc.)

4. **Given** a deep research request, **When** processing, **Then** dynamic status messages show progress ("Searching Slack...", "Searching Confluence...")

5. **Given** deep research taking >30 seconds, **When** status updates, **Then** messages cycle every 3-5 seconds (FR47)

6. **Given** deep research results, **When** delivered to user, **Then** feedback buttons are attached (FR48 via response-generator)

7. **Given** the research workflow, **When** complete, **Then** the full flow is traced in Langfuse with parent-child relationships

8. **Given** deep research workflow, **When** executing, **Then** completion time is <5 minutes (NFR3)

## Tasks / Subtasks

- [ ] **Task 1: Register Research Tool** (AC: #1)
  - [ ] Add `deep_research` to `TOOL_NAMES` registry in `src/tools/registry.ts`
  - [ ] Create `src/tools/research/deep-research.ts`
  - [ ] Implement tool handler following `ToolResult<T>` pattern
  - [ ] Parse research request into parallel tasks

- [ ] **Task 2: Implement Source-Specific Subagents** (AC: #1, #2)
  - [ ] Create `src/tools/research/source-configs.ts`
  - [ ] Define Slack search subagent context (uses MCP Slack tools)
  - [ ] Define Confluence search subagent context (uses MCP Atlassian tools)
  - [ ] Define web search subagent context (uses MCP Rube tools)
  - [ ] Configure subagent system prompts per source

- [ ] **Task 3: Progress Status Cycling** (AC: #4, #5)
  - [ ] Implement `setInterval` status cycling during parallel execution
  - [ ] Cycle messages every 3.5 seconds
  - [ ] Use UX-spec emoji system (🔍 for searching)
  - [ ] Clear interval on completion

- [ ] **Task 4: Synthesis and Citation** (AC: #2, #3)
  - [ ] Use aggregator from Story 4.2 to combine results
  - [ ] Format citations per Story 2.7 ([1], [2] inline refs)
  - [ ] Generate structured response per UX Research Response template

- [ ] **Task 5: Handle Empty/Invalid Input** (AC: #1)
  - [ ] Validate sources array is non-empty
  - [ ] Default to all sources if not specified
  - [ ] Return clear error if no sources available

- [ ] **Task 6: Observability** (AC: #7)
  - [ ] Create parent span for entire research workflow
  - [ ] Link subagent spans as children via traceId
  - [ ] Capture timing, token usage, source counts

- [ ] **Task 7: Verification** (AC: #8)
  - [ ] Request research on a topic — verify <5 minutes
  - [ ] Verify parallel subagents execute
  - [ ] Verify synthesized response with citations
  - [ ] Verify dynamic status messages cycle
  - [ ] Verify feedback buttons attached to response
  - [ ] Check Langfuse trace structure

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR10 | prd.md | Users can request deep research with automatic parallelization |
| FR6 | prd.md | System cites sources for factual claims |
| FR47 | prd.md | Dynamic status messages during processing |
| FR48 | prd.md | Feedback buttons attached to responses |
| NFR3 | prd.md | <5 minutes for deep research workflow |

### Project Context Rules (CRITICAL)

From `project-context.md`:

| Rule | Implementation |
|------|----------------|
| Tool naming: snake_case | `deep_research` in TOOL_NAMES |
| Never throw from tools | Return `ToolResult<DeepResearchOutput>` |
| traceId in every log entry | Pass traceId to all operations |
| ESM imports with `.js` extension | All imports must use `.js` suffix |
| Slack mrkdwn format | `*bold*` not `**bold**` |

### File Locations

```
src/tools/research/
├── deep-research.ts      # Research tool handler + definition
├── deep-research.test.ts
├── source-configs.ts     # Subagent configs per source
└── types.ts              # Research types
```

### Tool Registration

```typescript
// src/tools/registry.ts — add to TOOL_NAMES
export const TOOL_NAMES = [
  'memory',
  'deep_research',  // Add this
  // ... other tools
] as const;
```

### Type Definitions

```typescript
// src/tools/research/types.ts
import type { ToolResult } from '../../types/tools.js';

export interface DeepResearchInput {
  query: string;
  sources?: ('slack' | 'confluence' | 'web')[];
}

export interface DeepResearchOutput {
  synthesis: string;
  sources: string[];
  metadata: {
    sourcesSearched: number;
    successfulSources: number;
    failedSources: number;
    totalDurationMs: number;
  };
}

export type DeepResearchResult = ToolResult<DeepResearchOutput>;
```

### Research Tool Implementation

```typescript
// src/tools/research/deep-research.ts
import { runParallelSubagents } from '../../agent/subagents/orchestrator.js';
import { aggregateResults, formatForClaude } from '../../agent/subagents/aggregator.js';
import { getSourceSubagentConfig } from './source-configs.js';
import { langfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import type { SubagentTask } from '../../agent/subagents/types.js';
import type { DeepResearchInput, DeepResearchOutput, DeepResearchResult } from './types.js';

const STATUS_CYCLE_INTERVAL_MS = 3500;
const DEFAULT_SOURCES: Array<'slack' | 'confluence' | 'web'> = ['slack', 'confluence', 'web'];

const RESEARCH_STATUS_MESSAGES = [
  '🔍 Searching Slack channels...',
  '🔍 Searching Confluence docs...',
  '🔍 Searching the web...',
  '🔄 Synthesizing findings...',
  '📝 Formatting response...',
];

/**
 * Deep Research Tool Handler
 * 
 * Spawns parallel subagents to search multiple sources and synthesizes results.
 * 
 * @see Story 4.3 - Deep Research Workflow
 * @see FR10, FR47, NFR3
 */
export async function handleDeepResearch(
  input: DeepResearchInput,
  context: {
    traceId: string;
    onStatusUpdate?: (status: string) => Promise<void>;
  }
): Promise<DeepResearchResult> {
  const { traceId, onStatusUpdate } = context;
  
  const span = langfuse.span({
    name: 'tool.deep_research',
    traceId,
    input: { query: input.query, sources: input.sources },
  });
  
  const startTime = Date.now();
  
  try {
    // Validate and default sources
    const sources = input.sources?.length ? input.sources : DEFAULT_SOURCES;
    
    logger.info({
      event: 'tool.deep_research.start',
      traceId,
      query: input.query.slice(0, 100),
      sources,
    });
    
    // Build subagent tasks for each source
    const tasks: SubagentTask[] = sources.map((source) => ({
      id: source,
      context: getSourceSubagentConfig(source, input.query),
    }));
    
    // Start status cycling
    let statusIndex = 0;
    const statusInterval = setInterval(async () => {
      if (onStatusUpdate) {
        const message = RESEARCH_STATUS_MESSAGES[statusIndex % RESEARCH_STATUS_MESSAGES.length];
        await onStatusUpdate(message).catch(() => {});  // Don't fail on status update errors
        statusIndex++;
      }
    }, STATUS_CYCLE_INTERVAL_MS);
    
    // Send initial status
    if (onStatusUpdate) {
      await onStatusUpdate(RESEARCH_STATUS_MESSAGES[0]).catch(() => {});
    }
    
    try {
      // Run parallel subagents
      const parallelResults = await runParallelSubagents(tasks, traceId);
      
      // Aggregate results
      const aggregated = aggregateResults(
        parallelResults.results.map((r) => ({
          taskId: r.taskId,
          taskDescription: `Search ${r.taskId}`,
          result: r.result,
        })),
        traceId
      );
      
      const totalDuration = Date.now() - startTime;
      
      span.end({
        output: {
          synthesisLength: aggregated.synthesis.length,
          sourceCount: aggregated.sources.length,
        },
        metadata: {
          totalDurationMs: totalDuration,
          successfulSources: aggregated.metadata.successfulSubagents,
          failedSources: aggregated.metadata.failedSubagents,
        },
      });
      
      logger.info({
        event: 'tool.deep_research.complete',
        traceId,
        durationMs: totalDuration,
        sources: aggregated.sources.length,
        successful: aggregated.metadata.successfulSubagents,
        failed: aggregated.metadata.failedSubagents,
      });
      
      return {
        success: true,
        data: {
          synthesis: formatForClaude(aggregated),
          sources: aggregated.sources.map((s) => s.url ?? s.title ?? s.id),
          metadata: {
            sourcesSearched: sources.length,
            successfulSources: aggregated.metadata.successfulSubagents,
            failedSources: aggregated.metadata.failedSubagents,
            totalDurationMs: totalDuration,
          },
        },
      };
    } finally {
      clearInterval(statusInterval);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    span.end({
      metadata: {
        success: false,
        durationMs: duration,
        error: errorMessage,
      },
    });
    
    logger.error({
      event: 'tool.deep_research.failed',
      traceId,
      error: errorMessage,
    });
    
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: `Deep research failed: ${errorMessage}`,
        retryable: true,
      },
    };
  }
}

/**
 * Tool definition for Claude.
 * Register this in the tool registry.
 */
export const deepResearchToolDefinition = {
  name: 'deep_research',
  description: `Perform deep research across multiple sources (Slack, Confluence, web) in parallel. 
Use this for comprehensive research requests that benefit from searching multiple sources.
Results are synthesized with source citations.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The research query or question to investigate',
      },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['slack', 'confluence', 'web'] },
        description: 'Sources to search. Defaults to all sources if not specified.',
      },
    },
    required: ['query'],
  },
};
```

### Source-Specific Subagent Configs

```typescript
// src/tools/research/source-configs.ts
import type { SubagentContext } from '../../agent/subagents/types.js';

/**
 * Get subagent configuration for a specific source.
 * 
 * Each subagent has access to MCP tools for its source.
 * @see Story 3.1 - MCP tools are available via tool registry
 */
export function getSourceSubagentConfig(
  source: 'slack' | 'confluence' | 'web',
  query: string
): Omit<SubagentContext, 'parentTraceId'> {
  const configs: Record<string, Omit<SubagentContext, 'parentTraceId'>> = {
    slack: {
      task: `Search Slack for relevant discussions about: ${query}`,
      systemPrompt: `You are a Slack search specialist.

Your job: Search Slack channels for relevant discussions, decisions, and context.

Guidelines:
- Focus on recent messages (last 30 days) unless specified otherwise
- Include message links as sources
- Summarize key points from conversations found
- If no results, say so clearly

You have access to Slack search tools via MCP. Use them to find relevant content.`,
      constraints: [
        'Only search channels you have access to',
        'Prioritize recent discussions',
        'Include message timestamps and authors when relevant',
      ],
    },
    
    confluence: {
      task: `Search Confluence for documentation about: ${query}`,
      systemPrompt: `You are a Confluence documentation specialist.

Your job: Search Confluence spaces for relevant documentation, policies, and guides.

Guidelines:
- Focus on official documentation and up-to-date pages
- Include page links as sources
- Extract key information and summarize
- Note page last-updated dates when relevant

You have access to Confluence/Atlassian tools via MCP. Use them to find relevant content.`,
      constraints: [
        'Prioritize official documentation',
        'Note page last-updated dates',
        'Include page links for reference',
      ],
    },
    
    web: {
      task: `Search the web for external information about: ${query}`,
      systemPrompt: `You are a web research specialist.

Your job: Search the web for relevant external information, news, and resources.

Guidelines:
- Focus on authoritative sources
- Prefer recent information
- Include URLs as sources
- Summarize key findings

You have access to web search tools via MCP (Rube). Use them to find relevant content.`,
      constraints: [
        'Prefer authoritative sources (.edu, .gov, established publications)',
        'Note publication dates',
        'Verify information appears in multiple sources when possible',
      ],
    },
  };
  
  return configs[source];
}
```

### Integration with Agent Loop

```typescript
// In src/tools/registry.ts — register handler
import { handleDeepResearch, deepResearchToolDefinition } from './research/deep-research.js';

// Add to tool handlers map
toolHandlers.deep_research = async (input, traceId, callbacks) => {
  return handleDeepResearch(input as DeepResearchInput, {
    traceId,
    onStatusUpdate: callbacks?.setStatus,
  });
};

// Add to tool definitions
toolDefinitions.push(deepResearchToolDefinition);
```

### UX Response Format (FR48 + UX Spec)

Response follows UX Research Response template. Feedback buttons are attached by `response-generator.ts` (Story 1.8):

```
🔍 *Research Results: [Topic]*

*Key Findings:*
• [Key finding 1]
• [Key finding 2]
• [Key finding 3]

*Details:*
[Detailed synthesis from each source]

---
_Sources:_
• [1] [Slack message link]
• [2] [Confluence page link]
• [3] [Web article link]

[Feedback buttons: 👍 👎] ← Attached by response-generator
```

### MCP Tool Dependencies

Subagents rely on MCP tools being available in the tool registry:

| Source | Required MCP Tools |
|--------|-------------------|
| Slack | `mcp_rube.SLACK_SEARCH_MESSAGES` or similar |
| Confluence | `mcp_Atlassian.search` or similar |
| Web | `mcp_rube.web_search` or similar |

If MCP tools unavailable, subagent should gracefully fail with clear message.

### Dependencies

- Story 4.1 (Subagent Spawner) — `runParallelSubagents()`
- Story 4.2 (Result Aggregation) — `aggregateResults()`, `formatForClaude()`
- Story 2.7 (Source Citations) — Citation format [1], [2]
- Story 1.8 (Feedback Buttons) — Attached by response-generator
- Story 2.2 (Agent Loop) — Tool execution context, setStatus callback
- Story 3.1 (MCP Client) — MCP tools for Slack/Confluence/Web search

### Success Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Completion time | <5 minutes | NFR3 |
| Source citation rate | >90% | FR6 |
| Status cycling | Every 3-5s | FR47 |
| User satisfaction | >4:1 positive | FR48 feedback |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 4 |
| 2025-12-22 | Added status cycling implementation, tool registration, MCP dependencies, empty input handling |
