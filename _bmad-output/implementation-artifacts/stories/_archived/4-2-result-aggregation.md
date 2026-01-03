# Story 4.2: Result Aggregation

Status: ready-for-dev

## Story

As an **orchestrator agent**,
I want to aggregate results from multiple subagents into a coherent response,
So that users receive a synthesized answer rather than fragmented outputs.

## Acceptance Criteria

1. **Given** multiple subagent results, **When** aggregation runs, **Then** results are combined into a structured synthesis

2. **Given** subagent results with sources, **When** aggregated, **Then** all sources are collected and deduplicated

3. **Given** a mix of successful and failed subagents, **When** aggregating, **Then** successful results are used and failures are noted (not hidden)

4. **Given** aggregated results, **When** returned to the orchestrator, **Then** the format is suitable for Claude to incorporate into its response

5. **Given** result aggregation, **When** complete, **Then** a Langfuse span captures input results, output synthesis, and source count

6. **Given** long subagent results, **When** aggregating, **Then** results exceeding 2000 tokens are summarized

## Tasks / Subtasks

- [ ] **Task 1: Create Aggregator Module** (AC: #1, #4)
  - [ ] Create `src/agent/subagents/aggregator.ts`
  - [ ] Implement `aggregateResults(results: ResultWithId[], traceId: string)`
  - [ ] Structure output for Claude consumption
  - [ ] Handle empty results

- [ ] **Task 2: Source Collection** (AC: #2)
  - [ ] Extract sources from each subagent result
  - [ ] Deduplicate sources by URL/identifier
  - [ ] Format sources for citation per Story 2.7

- [ ] **Task 3: Failure Handling** (AC: #3)
  - [ ] Track which subagents failed
  - [ ] Include failure summary in aggregated result
  - [ ] Provide fallback when all subagents fail

- [ ] **Task 4: Token Limit Enforcement** (AC: #6)
  - [ ] Count tokens in each subagent result
  - [ ] Truncate/summarize results exceeding 2000 tokens
  - [ ] Preserve key information in truncated results

- [ ] **Task 5: Observability** (AC: #5)
  - [ ] Create span for aggregation with traceId
  - [ ] Log input result count, success/failure with traceId
  - [ ] Log output synthesis length, source count

- [ ] **Task 6: Verification**
  - [ ] Aggregate 3 successful results
  - [ ] Aggregate 2 success + 1 failure
  - [ ] Aggregate results with duplicate sources
  - [ ] Aggregate result exceeding 2000 tokens — verify truncation
  - [ ] Verify Langfuse shows aggregation span

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR4 | prd.md | System aggregates only relevant results from subagents into orchestrator response |
| FR6 | prd.md | System cites sources for factual claims |

### Project Context Rules (CRITICAL)

From `project-context.md`:

| Rule | Implementation |
|------|----------------|
| Max 2000 tokens in subagent result | Truncate/summarize if longer |
| traceId in every log entry | Pass traceId to all logger calls |
| ESM imports with `.js` extension | All imports must use `.js` suffix |

### File Locations

```
src/agent/subagents/
├── aggregator.ts       # Result aggregation
├── aggregator.test.ts
└── types.ts            # (extended from 4.1)
```

### Type Definitions

```typescript
// src/agent/subagents/types.ts (add to existing from 4.1)

export interface AggregatedResult {
  /** Combined synthesis from all successful subagents */
  synthesis: string;
  
  /** Deduplicated sources from all subagents */
  sources: Source[];
  
  /** Summary of any failures */
  failures?: FailureSummary[];
  
  /** Metadata about aggregation */
  metadata: {
    totalSubagents: number;
    successfulSubagents: number;
    failedSubagents: number;
    totalSources: number;
    truncatedResults: number;
  };
}

export interface Source {
  id: string;
  url?: string;
  title?: string;
  type: 'slack' | 'confluence' | 'web' | 'document' | 'other';
}

export interface FailureSummary {
  taskId: string;
  task: string;
  error: string;
}

export interface ResultWithId {
  taskId: string;
  taskDescription?: string;
  result: SubagentResult;
}
```

### Aggregator Implementation

```typescript
// src/agent/subagents/aggregator.ts
import { langfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import type {
  SubagentResult,
  AggregatedResult,
  Source,
  FailureSummary,
  ResultWithId,
} from './types.js';

const MAX_RESULT_TOKENS = 2000;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_RESULT_CHARS = MAX_RESULT_TOKENS * APPROX_CHARS_PER_TOKEN;

/**
 * Aggregate results from multiple subagents into a coherent synthesis.
 * 
 * @see Story 4.2 - Result Aggregation
 * @see Project Context - Max 2000 tokens per subagent result
 */
export function aggregateResults(
  results: ResultWithId[],
  traceId: string
): AggregatedResult {
  const span = langfuse.span({
    name: 'subagent.aggregation',
    traceId,
    input: { resultCount: results.length },
  });
  
  const successful = results.filter((r) => r.result.success);
  const failed = results.filter((r) => !r.result.success);
  
  // Truncate long results
  let truncatedCount = 0;
  const truncatedSuccessful = successful.map((r) => {
    if (r.result.content.length > MAX_RESULT_CHARS) {
      truncatedCount++;
      return {
        ...r,
        result: {
          ...r.result,
          content: truncateResult(r.result.content),
        },
      };
    }
    return r;
  });
  
  // Collect and deduplicate sources
  const allSources = collectSources(truncatedSuccessful);
  const deduplicatedSources = deduplicateSources(allSources);
  
  // Build synthesis from successful results
  const synthesis = buildSynthesis(truncatedSuccessful);
  
  // Summarize failures
  const failures = failed.map((r) => ({
    taskId: r.taskId,
    task: r.taskDescription ?? r.taskId,
    error: r.result.error ?? 'Unknown error',
  }));
  
  const aggregated: AggregatedResult = {
    synthesis,
    sources: deduplicatedSources,
    failures: failures.length > 0 ? failures : undefined,
    metadata: {
      totalSubagents: results.length,
      successfulSubagents: successful.length,
      failedSubagents: failed.length,
      totalSources: deduplicatedSources.length,
      truncatedResults: truncatedCount,
    },
  };
  
  span.end({
    output: {
      synthesisLength: synthesis.length,
      sourceCount: deduplicatedSources.length,
      failureCount: failed.length,
      truncatedCount,
    },
  });
  
  logger.info({
    event: 'subagent.aggregation.complete',
    traceId,
    successful: successful.length,
    failed: failed.length,
    sources: deduplicatedSources.length,
    truncated: truncatedCount,
  });
  
  return aggregated;
}

/**
 * Truncate a result that exceeds the token limit.
 * Preserves the beginning and adds truncation notice.
 */
function truncateResult(content: string): string {
  const truncated = content.slice(0, MAX_RESULT_CHARS - 100);
  const lastPeriod = truncated.lastIndexOf('.');
  const cutPoint = lastPeriod > MAX_RESULT_CHARS * 0.7 ? lastPeriod + 1 : truncated.length;
  
  return truncated.slice(0, cutPoint) + '\n\n[Result truncated for length]';
}

/**
 * Build a synthesis from successful subagent results.
 */
function buildSynthesis(results: ResultWithId[]): string {
  if (results.length === 0) {
    return 'No results were successfully retrieved.';
  }
  
  const sections = results.map((r) => {
    const header = `### ${formatTaskHeader(r.taskId)}`;
    return `${header}\n\n${r.result.content}`;
  });
  
  return sections.join('\n\n---\n\n');
}

/**
 * Collect sources from all subagent results.
 */
function collectSources(results: ResultWithId[]): Source[] {
  const sources: Source[] = [];
  
  for (const r of results) {
    if (r.result.sources) {
      for (const source of r.result.sources) {
        sources.push(parseSource(source));
      }
    }
  }
  
  return sources;
}

/**
 * Parse a source string into structured Source object.
 */
function parseSource(source: string): Source {
  try {
    const url = new URL(source);
    return {
      id: source,
      url: source,
      type: inferSourceType(url.hostname),
    };
  } catch {
    return {
      id: source,
      title: source,
      type: 'other',
    };
  }
}

/**
 * Infer source type from hostname.
 * Extensible for additional source types.
 */
function inferSourceType(hostname: string): Source['type'] {
  if (hostname.includes('slack.com')) return 'slack';
  if (hostname.includes('atlassian.net') || hostname.includes('confluence')) return 'confluence';
  if (hostname.includes('notion.so')) return 'document';
  if (hostname.includes('docs.google.com')) return 'document';
  return 'web';
}

/**
 * Deduplicate sources by ID/URL.
 */
function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const unique: Source[] = [];
  
  for (const source of sources) {
    if (!seen.has(source.id)) {
      seen.add(source.id);
      unique.push(source);
    }
  }
  
  return unique;
}

function formatTaskHeader(taskId: string): string {
  return taskId
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format aggregated result for inclusion in Claude's context.
 * 
 * @see Story 2.7 - Source citation format
 */
export function formatForClaude(aggregated: AggregatedResult): string {
  let output = '## Research Results\n\n';
  output += aggregated.synthesis;
  
  if (aggregated.sources.length > 0) {
    output += '\n\n## Sources\n\n';
    aggregated.sources.forEach((source, i) => {
      if (source.url) {
        output += `[${i + 1}] ${source.url}\n`;
      } else if (source.title) {
        output += `[${i + 1}] ${source.title}\n`;
      }
    });
  }
  
  if (aggregated.failures && aggregated.failures.length > 0) {
    output += '\n\n## Notes\n\n';
    output += `⚠️ ${aggregated.failures.length} research task(s) encountered issues:\n`;
    aggregated.failures.forEach((f) => {
      output += `- ${f.task}: ${f.error}\n`;
    });
  }
  
  return output;
}
```

### Dependencies

- Story 4.1 (Subagent Spawner) — Provides `SubagentResult`, `ResultWithId` compatible output
- Story 2.7 (Source Citations) — Citation format alignment

### Success Metrics

| Metric | Target |
|--------|--------|
| Source deduplication accuracy | 100% |
| Token truncation enforcement | 100% at 2000 tokens |
| Synthesis coherence | Verified via user feedback |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 4 |
| 2025-12-22 | Added 2000 token truncation, traceId logging, removed naive conflict detection |
