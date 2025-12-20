# Story 5.9: Deep Research Workflow

Status: ready-for-dev

## Story

As a **user**,
I want to request comprehensive research with a single message,
So that complex research happens automatically.

## Acceptance Criteria

1. **Given** a user requests deep research, **When** the agent processes the request, **Then** the Deep Research workflow is triggered (FR41)

2. **Given** the workflow runs, **When** sources are searched, **Then** multiple sources are searched in parallel (FR10)

3. **Given** results are gathered, **When** output is generated, **Then** results are synthesized with source citations

4. **Given** time constraints exist, **When** monitoring progress, **Then** the workflow completes in <5 minutes (NFR3)

5. **Given** long-running operation, **When** user is waiting, **Then** progress updates are streamed to the user

6. **Given** tracing is active, **When** workflow runs, **Then** the complete workflow is traced in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Deep Research Workflow Definition** (AC: #1)
  - [ ] Create `.orion/workflows/deep-research/workflow.md`
  - [ ] Define workflow steps and triggers
  - [ ] Specify input/output schema
  - [ ] Document usage examples

- [ ] **Task 2: Create Workflow Executor** (AC: #1, #2)
  - [ ] Create `src/workflows/deep-research.ts`
  - [ ] Implement `executeDeepResearch(query, options)` function
  - [ ] Parse user query to identify research scope
  - [ ] Spawn search subagents for each source type

- [ ] **Task 3: Implement Parallel Source Search** (AC: #2)
  - [ ] Use `executeSubagentsParallel()` from Story 5-3
  - [ ] Search Slack, Confluence, and web in parallel
  - [ ] Configure subagent tasks based on query analysis
  - [ ] Respect NFR5 (max 3 concurrent)

- [ ] **Task 4: Integrate Synthesis** (AC: #3)
  - [ ] Use synthesis module from Story 5-7
  - [ ] Aggregate parallel results
  - [ ] Synthesize into structured summary
  - [ ] Add source citations from Story 5-8

- [ ] **Task 5: Enforce Time Limit** (AC: #4)
  - [ ] Set 5-minute timeout (NFR3)
  - [ ] Monitor workflow progress
  - [ ] Return partial results if timeout approaching
  - [ ] Log timeout events

- [ ] **Task 6: Stream Progress Updates** (AC: #5)
  - [ ] Use Slack status updates during workflow
  - [ ] Report phases: "Searching Slack...", "Synthesizing..."
  - [ ] Show completion percentage
  - [ ] Handle long-running gracefully

- [ ] **Task 7: Add Complete Tracing** (AC: #6)
  - [ ] Create parent trace for entire workflow
  - [ ] Create child spans for each phase
  - [ ] Track duration and token usage
  - [ ] Log workflow outcome

- [ ] **Task 8: Verification Tests** (AC: all)
  - [ ] Test: Workflow triggered by research request
  - [ ] Test: All source types searched in parallel
  - [ ] Test: Output includes citations
  - [ ] Test: Completes within 5 minutes
  - [ ] Test: Progress updates sent

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR41 | prd.md | Deep Research workflow (multi-step, parallelized, synthesized) |
| FR10 | prd.md | Deep research parallelization across sources |
| NFR3 | prd.md | Deep research completes in <5 minutes |
| NFR5 | prd.md | Max 3 concurrent subagents |
| AR7 | architecture.md | Agent loop with verification |

### .orion/workflows/deep-research/workflow.md

```markdown
---
name: deep-research
description: Comprehensive multi-source research with synthesis
trigger:
  patterns:
    - "research {topic}"
    - "deep dive on {topic}"
    - "comprehensive research about {topic}"
    - "investigate {topic}"
timeout: 300000  # 5 minutes (NFR3)
maxSubagents: 3  # NFR5
---

# Deep Research Workflow

## Overview

The Deep Research workflow conducts comprehensive research across multiple sources:
- Slack (internal discussions, decisions, context)
- Confluence (documentation, policies, processes)
- Web (external information, best practices)

Results are synthesized into a coherent summary with source citations.

## Workflow Steps

1. **Parse Query** - Analyze user request to identify research scope
2. **Plan Search** - Determine which sources to search and generate queries
3. **Execute Parallel Search** - Spawn search subagents for each source
4. **Aggregate Results** - Filter and rank results by relevance
5. **Synthesize** - Generate structured summary with LLM
6. **Cite Sources** - Add source links and verify accessibility
7. **Deliver** - Stream final response to user

## Usage Examples

- "Research our authentication approach and how it compares to industry standards"
- "Deep dive on Q1 audience targeting strategy decisions"
- "Investigate the approval process for new AI tools"

## Output Format

*Summary*
[2-3 sentence executive summary]

*Key Findings*
• Finding 1 (with source)
• Finding 2 (with source)

*Sources*
_Slack:_ [links]
_Confluence:_ [links]
_Web:_ [links]
```

### src/workflows/deep-research.ts

```typescript
import { randomUUID } from 'crypto';
import type { SubagentConfig, SubagentResult } from '../agent/subagents/types.js';
import { executeSubagentsParallel, type SubagentProgressEvent } from '../agent/subagents/parallel.js';
import { aggregateResults } from '../agent/synthesis/aggregator.js';
import { synthesizeResults, formatSynthesisForSlack } from '../agent/synthesis/synthesizer.js';
import { collectSources, createSourcesSection } from '../agent/citations/index.js';
import { createSpan } from '../observability/tracing.js';
import { logger } from '../utils/logger.js';

/**
 * NFR3: 5-minute timeout for deep research
 */
const DEEP_RESEARCH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Phase names for progress updates
 */
const PHASES = {
  PARSING: 'Analyzing your research request...',
  PLANNING: 'Planning search strategy...',
  SEARCHING: 'Searching sources...',
  SEARCHING_SLACK: 'Searching Slack discussions...',
  SEARCHING_CONFLUENCE: 'Searching Confluence documentation...',
  SEARCHING_WEB: 'Searching web resources...',
  AGGREGATING: 'Processing results...',
  SYNTHESIZING: 'Synthesizing findings...',
  CITING: 'Adding source citations...',
  COMPLETE: 'Research complete!',
};

export interface DeepResearchOptions {
  /** User ID making the request */
  userId: string;
  /** Original thread context */
  threadContext?: string;
  /** Whether to include web search */
  includeWeb?: boolean;
  /** Callback for progress updates */
  onProgress?: (phase: string, percent: number) => void;
  /** Parent trace for Langfuse */
  parentTrace?: { id: string };
}

export interface DeepResearchResult {
  success: boolean;
  /** Formatted output for Slack */
  output: string;
  /** Research metrics */
  metrics: DeepResearchMetrics;
  /** Error if failed */
  error?: string;
}

export interface DeepResearchMetrics {
  totalDurationMs: number;
  searchDurationMs: number;
  synthesisDurationMs: number;
  sourcesFound: number;
  subagentsSpawned: number;
  subagentsFailed: number;
  timedOut: boolean;
}

/**
 * Execute the Deep Research workflow
 * 
 * Performs comprehensive multi-source research with parallel search,
 * aggregation, synthesis, and source citation.
 * 
 * ARCHITECTURE RULES:
 * - FR41: Deep Research workflow
 * - FR10: Parallelized search across sources
 * - NFR3: Completes in <5 minutes
 * - NFR5: Max 3 concurrent subagents
 * 
 * @param query - User's research query
 * @param options - Workflow options
 */
export async function executeDeepResearch(
  query: string,
  options: DeepResearchOptions
): Promise<DeepResearchResult> {
  const workflowId = randomUUID();
  const startTime = Date.now();
  const { userId, threadContext, includeWeb = true, onProgress, parentTrace } = options;

  // Create workflow trace
  const workflowSpan = createSpan(parentTrace, {
    name: 'deep-research-workflow',
    input: {
      query,
      userId,
      includeWeb,
    },
    metadata: { workflowId },
  });

  logger.info({
    event: 'deep_research_started',
    workflowId,
    query: query.slice(0, 100),
    userId,
  });

  const metrics: DeepResearchMetrics = {
    totalDurationMs: 0,
    searchDurationMs: 0,
    synthesisDurationMs: 0,
    sourcesFound: 0,
    subagentsSpawned: 0,
    subagentsFailed: 0,
    timedOut: false,
  };

  try {
    // Phase 1: Parse Query
    onProgress?.(PHASES.PARSING, 5);
    const searchPlan = await parseQueryForSearch(query, workflowSpan);

    // Phase 2: Plan Search Strategy
    onProgress?.(PHASES.PLANNING, 10);
    const subagentConfigs = buildSearchSubagents(searchPlan, {
      userId,
      relevantContext: threadContext || query,
      includeWeb,
    });
    metrics.subagentsSpawned = subagentConfigs.length;

    // Phase 3: Execute Parallel Search (with timeout)
    onProgress?.(PHASES.SEARCHING, 15);
    const searchStartTime = Date.now();

    const { results: searchResults } = await executeWithTimeout(
      executeSubagentsParallel(subagentConfigs, {
        parentTrace: workflowSpan,
        fullThreadContext: threadContext,
        onProgress: (event) => handleSearchProgress(event, onProgress),
      }),
      DEEP_RESEARCH_TIMEOUT_MS - (Date.now() - startTime) - 60000 // Leave 60s for synthesis
    );

    metrics.searchDurationMs = Date.now() - searchStartTime;
    metrics.subagentsFailed = searchResults.filter((r) => !r.success).length;

    // Check if we got any results
    const successfulResults = searchResults.filter((r) => r.success);
    if (successfulResults.length === 0) {
      throw new Error('No search results found from any source');
    }

    // Phase 4: Aggregate Results
    onProgress?.(PHASES.AGGREGATING, 60);
    const aggregated = aggregateResults(searchResults, query);

    // Phase 5: Synthesize
    onProgress?.(PHASES.SYNTHESIZING, 70);
    const synthesisStartTime = Date.now();
    const synthesis = await synthesizeResults(aggregated, query, {
      includeContradictions: true,
      includeGaps: true,
    }, workflowSpan);
    metrics.synthesisDurationMs = Date.now() - synthesisStartTime;

    // Phase 6: Add Sources
    onProgress?.(PHASES.CITING, 90);
    const collected = collectSources(searchResults);
    metrics.sourcesFound = collected.sources.length;

    // Format final output
    const content = formatSynthesisForSlack(synthesis);
    const sourcesSection = createSourcesSection(collected);
    const output = content + sourcesSection;

    // Complete
    onProgress?.(PHASES.COMPLETE, 100);
    metrics.totalDurationMs = Date.now() - startTime;

    workflowSpan.end({
      output: {
        success: true,
        metrics,
        synthesisQuality: synthesis.quality.overall,
      },
    });

    logger.info({
      event: 'deep_research_completed',
      workflowId,
      ...metrics,
    });

    return {
      success: true,
      output,
      metrics,
    };

  } catch (error) {
    metrics.totalDurationMs = Date.now() - startTime;
    metrics.timedOut = error instanceof Error && error.message.includes('timeout');

    const errorMessage = error instanceof Error ? error.message : String(error);

    workflowSpan.end({
      output: {
        success: false,
        error: errorMessage,
        metrics,
      },
    });

    logger.error({
      event: 'deep_research_failed',
      workflowId,
      error: errorMessage,
      ...metrics,
    });

    // Return partial results if we have any
    if (metrics.timedOut) {
      return {
        success: false,
        output: `Research partially completed before timeout (${Math.round(metrics.totalDurationMs / 1000)}s). Please try a more specific query.`,
        metrics,
        error: 'Timeout exceeded',
      };
    }

    return {
      success: false,
      output: `Research failed: ${errorMessage}`,
      metrics,
      error: errorMessage,
    };
  }
}

/**
 * Parse query to determine search strategy
 */
async function parseQueryForSearch(
  query: string,
  parentSpan: { id: string }
): Promise<SearchPlan> {
  // Simple keyword-based planning for MVP
  // Future: Use LLM to analyze query intent
  
  const keywords = query.toLowerCase().split(/\s+/);
  
  const plan: SearchPlan = {
    topics: extractTopics(query),
    searchSlack: true,
    searchConfluence: true,
    searchWeb: true,
    slackQuery: query,
    confluenceQuery: query,
    webQuery: query,
  };

  // Adjust based on keywords
  if (keywords.some((k) => ['internal', 'our', 'we', 'team'].includes(k))) {
    plan.searchWeb = false;
  }

  if (keywords.some((k) => ['policy', 'process', 'documentation', 'guide'].includes(k))) {
    plan.searchConfluence = true;
  }

  if (keywords.some((k) => ['discussion', 'decided', 'thread', 'conversation'].includes(k))) {
    plan.searchSlack = true;
  }

  return plan;
}

interface SearchPlan {
  topics: string[];
  searchSlack: boolean;
  searchConfluence: boolean;
  searchWeb: boolean;
  slackQuery: string;
  confluenceQuery: string;
  webQuery: string;
}

/**
 * Extract main topics from query
 */
function extractTopics(query: string): string[] {
  const stopWords = new Set(['research', 'find', 'search', 'about', 'the', 'a', 'an', 'our', 'we']);
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);
}

/**
 * Build subagent configurations for search
 */
function buildSearchSubagents(
  plan: SearchPlan,
  options: { userId: string; relevantContext: string; includeWeb: boolean }
): SubagentConfig[] {
  const configs: SubagentConfig[] = [];
  const baseContext = {
    originalQuery: plan.topics.join(' '),
    relevantContext: options.relevantContext,
    userId: options.userId,
  };

  if (plan.searchSlack) {
    configs.push({
      name: 'search-agent',
      task: `Search Slack for discussions about: ${plan.slackQuery}. Focus on recent relevant conversations.`,
      context: {
        ...baseContext,
        instructions: 'Use orion_search_slack tool. Return top 10 most relevant messages with permalinks.',
      },
    });
  }

  if (plan.searchConfluence) {
    configs.push({
      name: 'search-agent',
      task: `Search Confluence for documentation about: ${plan.confluenceQuery}. Focus on authoritative pages.`,
      context: {
        ...baseContext,
        instructions: 'Use orion_search_confluence tool. Return top 10 most relevant pages with URLs.',
      },
    });
  }

  if (plan.searchWeb && options.includeWeb) {
    configs.push({
      name: 'search-agent',
      task: `Search the web for external information about: ${plan.webQuery}. Focus on authoritative sources.`,
      context: {
        ...baseContext,
        instructions: 'Use orion_search_web tool. Prioritize .gov, .edu, and documentation sites.',
      },
    });
  }

  return configs;
}

/**
 * Handle search progress events and forward to progress callback
 */
function handleSearchProgress(
  event: SubagentProgressEvent,
  onProgress?: (phase: string, percent: number) => void
): void {
  if (!onProgress) return;

  if (event.type === 'started') {
    const phaseMap: Record<string, string> = {
      'slack': PHASES.SEARCHING_SLACK,
      'confluence': PHASES.SEARCHING_CONFLUENCE,
      'web': PHASES.SEARCHING_WEB,
    };
    
    // Determine phase from task
    for (const [key, phase] of Object.entries(phaseMap)) {
      if (event.subagent.includes(key)) {
        onProgress(phase, 15 + event.percentComplete * 0.45);
        return;
      }
    }
  }

  if (event.type === 'completed' || event.type === 'failed') {
    onProgress(PHASES.SEARCHING, 15 + event.percentComplete * 0.45);
  }
}

/**
 * Execute with timeout
 */
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Deep research timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Check if a query should trigger deep research workflow
 */
export function shouldTriggerDeepResearch(query: string): boolean {
  const triggers = [
    /^research\s+/i,
    /^deep dive\s+/i,
    /^investigate\s+/i,
    /^comprehensive.*research/i,
    /research.*thoroughly/i,
    /find.*everything.*about/i,
  ];

  return triggers.some((pattern) => pattern.test(query));
}
```

### src/workflows/index.ts

```typescript
/**
 * Workflows Module - Public API
 */

export {
  executeDeepResearch,
  shouldTriggerDeepResearch,
  type DeepResearchOptions,
  type DeepResearchResult,
  type DeepResearchMetrics,
} from './deep-research.js';
```

### Integration with User Message Handler

Update the user message handler to detect and trigger deep research:

```typescript
// In src/slack/handlers/user-message.ts

import { shouldTriggerDeepResearch, executeDeepResearch } from '../../workflows/index.js';

// In handleUserMessage function, before normal processing:
if (shouldTriggerDeepResearch(messageText)) {
  // Execute deep research workflow
  const result = await executeDeepResearch(messageText, {
    userId: context.userId!,
    threadContext: threadHistory.join('\n'),
    onProgress: async (phase, percent) => {
      await setStatus({ status: phase });
    },
    parentTrace: trace,
  });

  // Stream the result
  await streamer.append(result.output);
  return;
}
```

### File Structure After This Story

```
src/
├── workflows/                       # NEW
│   ├── index.ts
│   ├── deep-research.ts
│   └── deep-research.test.ts
├── .orion/
│   └── workflows/
│       └── deep-research/           # NEW
│           └── workflow.md
```

### Dependencies on Prior Stories

| Story | Dependency | Usage |
|-------|------------|-------|
| 5-1 | Subagent Infrastructure | `SubagentConfig` type |
| 5-3 | Parallel Execution | `executeSubagentsParallel()` |
| 5-4 | Slack Search | `orion_search_slack` tool |
| 5-5 | Confluence Search | `orion_search_confluence` tool |
| 5-6 | Web Search | `orion_search_web` tool |
| 5-7 | Synthesis | `synthesizeResults()` |
| 5-8 | Source Linking | `collectSources()`, `createSourcesSection()` |
| 1-5 | Response Streaming | Stream progress updates |

### Performance Requirements

| Metric | Target | Source |
|--------|--------|--------|
| Total workflow duration | < 5 minutes | NFR3 |
| Search phase | < 3 minutes | Budget allocation |
| Synthesis phase | < 90 seconds | Budget allocation |
| Progress update frequency | Every 10% | UX requirement |

### Test Specifications

```typescript
// src/workflows/deep-research.test.ts
describe('executeDeepResearch', () => {
  it('should trigger on research keywords (AC: #1)', () => {
    expect(shouldTriggerDeepResearch('Research our auth approach')).toBe(true);
    expect(shouldTriggerDeepResearch('Deep dive on Q1 strategy')).toBe(true);
    expect(shouldTriggerDeepResearch('What time is it?')).toBe(false);
  });

  it('should search sources in parallel (AC: #2)', async () => {
    const result = await executeDeepResearch('Research authentication', {
      userId: 'U123',
      onProgress: vi.fn(),
    });

    expect(result.metrics.subagentsSpawned).toBeGreaterThanOrEqual(2);
  });

  it('should include source citations (AC: #3)', async () => {
    const result = await executeDeepResearch('Research authentication', {
      userId: 'U123',
    });

    expect(result.output).toContain('Sources');
  });

  it('should complete within 5 minutes (AC: #4)', async () => {
    const result = await executeDeepResearch('Quick research test', {
      userId: 'U123',
    });

    expect(result.metrics.totalDurationMs).toBeLessThan(5 * 60 * 1000);
  });

  it('should send progress updates (AC: #5)', async () => {
    const progressUpdates: string[] = [];
    
    await executeDeepResearch('Research test', {
      userId: 'U123',
      onProgress: (phase) => progressUpdates.push(phase),
    });

    expect(progressUpdates.length).toBeGreaterThan(3);
    expect(progressUpdates).toContain('Research complete!');
  });
});
```

### References

- [Source: _bmad-output/epics.md#Story 5.9: Deep Research Workflow] — Original story
- [Source: _bmad-output/prd.md#FR41] — Deep Research workflow requirement
- [Source: _bmad-output/prd.md#FR10] — Parallelization requirement
- [Source: _bmad-output/prd.md#NFR3] — 5-minute time limit
- [Source: _bmad-output/prd.md#NFR5] — Max 3 concurrent subagents
- [Source: Stories 5-1 through 5-8] — All preceding Epic 5 stories

### Previous Story Intelligence

This story is the capstone for Epic 5, integrating all previous stories:
- Story 5-1: Subagent infrastructure
- Story 5-3: Parallel execution
- Story 5-4, 5-5, 5-6: Search tools
- Story 5-7: Aggregation and synthesis
- Story 5-8: Source citations

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `.orion/workflows/deep-research/workflow.md`
- `src/workflows/index.ts`
- `src/workflows/deep-research.ts`
- `src/workflows/deep-research.test.ts`

Files to modify:
- `src/slack/handlers/user-message.ts` — Add deep research trigger
