# Story 5.7: Result Aggregation & Synthesis

Status: ready-for-dev

## Story

As a **user**,
I want research results synthesized into a coherent summary,
So that I don't have to read through raw data.

## Acceptance Criteria

1. **Given** subagents have completed their searches, **When** results are returned to the orchestrator, **Then** only relevant results are aggregated (FR4)

2. **Given** multiple sources exist, **When** synthesis runs, **Then** information is synthesized into structured summaries (FR8)

3. **Given** sources may conflict, **When** synthesis runs, **Then** contradictions or gaps are noted

4. **Given** synthesis completes, **When** output is generated, **Then** the synthesis is coherent and actionable

5. **Given** quality matters, **When** synthesis is returned, **Then** synthesis quality is verified before delivery

## Tasks / Subtasks

- [ ] **Task 1: Create Aggregation Module** (AC: #1)
  - [ ] Create `src/agent/synthesis/aggregator.ts`
  - [ ] Implement `aggregateResults(subagentResults[])` function
  - [ ] Filter irrelevant results by score threshold
  - [ ] Rank results by relevance to original query
  - [ ] Deduplicate overlapping information

- [ ] **Task 2: Create Synthesis Engine** (AC: #2)
  - [ ] Create `src/agent/synthesis/synthesizer.ts`
  - [ ] Implement LLM-based synthesis via Claude
  - [ ] Structure output into sections (summary, findings, sources)
  - [ ] Preserve source citations in synthesis

- [ ] **Task 3: Implement Contradiction Detection** (AC: #3)
  - [ ] Create `src/agent/synthesis/contradiction-detector.ts`
  - [ ] Identify conflicting information across sources
  - [ ] Note contradictions in synthesis output
  - [ ] Suggest verification for uncertain claims

- [ ] **Task 4: Ensure Coherence** (AC: #4)
  - [ ] Use LLM to review for logical flow
  - [ ] Add transitions between sections
  - [ ] Extract actionable insights
  - [ ] Format for readability

- [ ] **Task 5: Add Quality Verification** (AC: #5)
  - [ ] Verify all claims have citations
  - [ ] Check for completeness against original query
  - [ ] Score synthesis quality
  - [ ] Log quality metrics

- [ ] **Task 6: Verification Tests** (AC: all)
  - [ ] Test: Low-relevance results filtered
  - [ ] Test: Synthesis contains structured sections
  - [ ] Test: Contradictions are noted
  - [ ] Test: All sources cited

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR4 | prd.md | System aggregates only relevant results from subagents |
| FR8 | prd.md | System synthesizes information into structured summaries |
| AR7 | architecture.md | Agent loop includes verification phase |

### src/agent/synthesis/aggregator.ts

```typescript
import type { SubagentResult, SubagentSource } from '../subagents/types.js';
import type { UnifiedSearchResult } from '../../tools/search/types.js';
import { logger } from '../../utils/logger.js';

export interface AggregationOptions {
  /** Minimum relevance score to include (0-1) */
  minRelevance?: number;
  /** Maximum total results to aggregate */
  maxResults?: number;
  /** Whether to deduplicate similar content */
  deduplicate?: boolean;
}

export interface AggregatedResults {
  /** Filtered and ranked results */
  results: AggregatedItem[];
  /** Sources organized by type */
  sourcesByType: Record<string, SubagentSource[]>;
  /** Aggregation metrics */
  metrics: AggregationMetrics;
}

export interface AggregatedItem {
  /** Content from subagent */
  content: string;
  /** Source citations */
  sources: SubagentSource[];
  /** Relevance score */
  relevance: number;
  /** Confidence score */
  confidence: number;
  /** Which subagent produced this */
  subagent: string;
}

export interface AggregationMetrics {
  totalInputResults: number;
  filteredResults: number;
  deduplicatedCount: number;
  averageRelevance: number;
  sourceTypeDistribution: Record<string, number>;
}

const DEFAULT_MIN_RELEVANCE = 0.3;
const DEFAULT_MAX_RESULTS = 20;

/**
 * Aggregate results from multiple subagents
 * 
 * Filters low-relevance results, ranks by relevance, and deduplicates.
 * This is the first step before synthesis.
 * 
 * @param subagentResults - Array of results from parallel subagents
 * @param originalQuery - The original user query for relevance scoring
 * @param options - Aggregation options
 */
export function aggregateResults(
  subagentResults: SubagentResult[],
  originalQuery: string,
  options: AggregationOptions = {}
): AggregatedResults {
  const {
    minRelevance = DEFAULT_MIN_RELEVANCE,
    maxResults = DEFAULT_MAX_RESULTS,
    deduplicate = true,
  } = options;

  const allItems: AggregatedItem[] = [];
  const allSources: SubagentSource[] = [];

  // Extract and score items from each subagent result
  for (const result of subagentResults) {
    if (!result.success || !result.data) continue;

    allItems.push({
      content: result.data.content,
      sources: result.data.sources,
      relevance: result.data.relevance,
      confidence: result.data.confidence,
      subagent: result.subagent,
    });

    allSources.push(...result.data.sources);
  }

  const totalInputResults = allItems.length;

  // Filter by relevance
  let filteredItems = allItems.filter((item) => item.relevance >= minRelevance);

  // Deduplicate if enabled
  let deduplicatedCount = 0;
  if (deduplicate) {
    const beforeDedup = filteredItems.length;
    filteredItems = deduplicateItems(filteredItems);
    deduplicatedCount = beforeDedup - filteredItems.length;
  }

  // Sort by relevance (highest first)
  filteredItems.sort((a, b) => b.relevance - a.relevance);

  // Limit results
  filteredItems = filteredItems.slice(0, maxResults);

  // Organize sources by type
  const sourcesByType: Record<string, SubagentSource[]> = {};
  for (const source of allSources) {
    const type = source.type || 'unknown';
    if (!sourcesByType[type]) {
      sourcesByType[type] = [];
    }
    sourcesByType[type].push(source);
  }

  // Calculate metrics
  const averageRelevance = filteredItems.length > 0
    ? filteredItems.reduce((sum, item) => sum + item.relevance, 0) / filteredItems.length
    : 0;

  const sourceTypeDistribution: Record<string, number> = {};
  for (const [type, sources] of Object.entries(sourcesByType)) {
    sourceTypeDistribution[type] = sources.length;
  }

  const metrics: AggregationMetrics = {
    totalInputResults,
    filteredResults: filteredItems.length,
    deduplicatedCount,
    averageRelevance,
    sourceTypeDistribution,
  };

  logger.info({
    event: 'results_aggregated',
    originalQuery: originalQuery.slice(0, 50),
    ...metrics,
  });

  return {
    results: filteredItems,
    sourcesByType,
    metrics,
  };
}

/**
 * Deduplicate items with similar content
 */
function deduplicateItems(items: AggregatedItem[]): AggregatedItem[] {
  const seen = new Set<string>();
  const unique: AggregatedItem[] = [];

  for (const item of items) {
    // Create content fingerprint (first 200 chars, normalized)
    const fingerprint = item.content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 200);

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(item);
    }
  }

  return unique;
}
```

### src/agent/synthesis/synthesizer.ts

```typescript
import type { AggregatedResults, AggregatedItem } from './aggregator.js';
import type { SubagentSource } from '../subagents/types.js';
import { queryOrion } from '../orion.js';
import { createSpan } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';

export interface SynthesisOptions {
  /** Target length for summary (words) */
  targetLength?: number;
  /** Include contradictions section */
  includeContradictions?: boolean;
  /** Include gaps analysis */
  includeGaps?: boolean;
  /** Output format */
  format?: 'structured' | 'narrative';
}

export interface SynthesizedOutput {
  /** Executive summary */
  summary: string;
  /** Key findings organized by topic */
  findings: SynthesisFinding[];
  /** Contradictions found (if any) */
  contradictions: Contradiction[];
  /** Information gaps identified */
  gaps: string[];
  /** All sources cited */
  sources: SubagentSource[];
  /** Synthesis quality metrics */
  quality: SynthesisQuality;
}

export interface SynthesisFinding {
  /** Finding topic/title */
  topic: string;
  /** Finding content */
  content: string;
  /** Sources supporting this finding */
  sources: SubagentSource[];
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

export interface Contradiction {
  /** Description of the contradiction */
  description: string;
  /** Sources with conflicting info */
  sources: SubagentSource[];
  /** Suggested resolution */
  suggestion: string;
}

export interface SynthesisQuality {
  /** Citation coverage (0-1) */
  citationRate: number;
  /** Coherence score (0-1) */
  coherence: number;
  /** Completeness vs query (0-1) */
  completeness: number;
  /** Overall quality (0-1) */
  overall: number;
}

const SYNTHESIS_SYSTEM_PROMPT = `You are a research synthesis expert. Your task is to:
1. Combine information from multiple sources into a coherent summary
2. Identify key findings and organize them by topic
3. Note any contradictions between sources
4. Identify gaps in the available information
5. Cite sources for all claims

Always use Slack mrkdwn formatting:
- *bold* for emphasis
- _italic_ for technical terms
- \`code\` for code/commands
- • for bullet points

Format your response as JSON with this structure:
{
  "summary": "Executive summary (2-3 sentences)",
  "findings": [
    { "topic": "Topic 1", "content": "Details...", "sourceIndices": [0, 2], "confidence": "high" }
  ],
  "contradictions": [
    { "description": "Source A says X, Source B says Y", "sourceIndices": [1, 3], "suggestion": "Verify with..." }
  ],
  "gaps": ["Missing information about X", "No data on Y"]
}`;

/**
 * Synthesize aggregated results into a coherent summary
 * 
 * Uses LLM to combine information from multiple sources,
 * identify patterns, contradictions, and gaps.
 * 
 * @param aggregated - Aggregated results from subagents
 * @param originalQuery - The original user query
 * @param options - Synthesis options
 */
export async function synthesizeResults(
  aggregated: AggregatedResults,
  originalQuery: string,
  options: SynthesisOptions = {},
  parentTrace?: { id: string }
): Promise<SynthesizedOutput> {
  const {
    targetLength = 200,
    includeContradictions = true,
    includeGaps = true,
    format = 'structured',
  } = options;

  const span = createSpan(parentTrace, {
    name: 'synthesize-results',
    input: {
      query: originalQuery,
      resultCount: aggregated.results.length,
      sourceCount: Object.values(aggregated.sourcesByType).flat().length,
    },
  });

  // Build context for LLM
  const allSources = Object.values(aggregated.sourcesByType).flat();
  const contextText = buildSynthesisContext(aggregated.results, allSources);

  const synthesisPrompt = `
Original Query: ${originalQuery}

Research Results:
${contextText}

Please synthesize these results into a coherent summary.
Target length: ~${targetLength} words.
${includeContradictions ? 'Include any contradictions found.' : ''}
${includeGaps ? 'Note any information gaps.' : ''}
`;

  try {
    const response = await queryOrion({
      prompt: synthesisPrompt,
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      maxTokens: 2000,
    });

    // Parse LLM response
    const parsed = parseSynthesisResponse(response.content, allSources);

    // Calculate quality metrics
    const quality = calculateQuality(parsed, originalQuery, allSources);
    parsed.quality = quality;
    parsed.sources = allSources;

    span.end({
      output: {
        findingCount: parsed.findings.length,
        contradictionCount: parsed.contradictions.length,
        gapCount: parsed.gaps.length,
        quality: quality.overall,
      },
    });

    logger.info({
      event: 'synthesis_completed',
      query: originalQuery.slice(0, 50),
      findingCount: parsed.findings.length,
      quality: quality.overall,
    });

    return parsed;

  } catch (error) {
    span.end({
      output: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

/**
 * Build context text for synthesis
 */
function buildSynthesisContext(
  results: AggregatedItem[],
  sources: SubagentSource[]
): string {
  const lines: string[] = [];

  lines.push('## Sources:');
  sources.forEach((source, i) => {
    lines.push(`[${i}] ${source.type}: ${source.title}${source.url ? ` (${source.url})` : ''}`);
  });

  lines.push('\n## Content:');
  for (const result of results) {
    lines.push(`\n### From ${result.subagent} (relevance: ${result.relevance.toFixed(2)}):`);
    lines.push(result.content);
  }

  return lines.join('\n');
}

/**
 * Parse LLM synthesis response
 */
function parseSynthesisResponse(
  content: string,
  allSources: SubagentSource[]
): SynthesizedOutput {
  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Map source indices to actual sources
    const findings: SynthesisFinding[] = (parsed.findings || []).map((f: any) => ({
      topic: f.topic,
      content: f.content,
      sources: (f.sourceIndices || []).map((i: number) => allSources[i]).filter(Boolean),
      confidence: f.confidence || 'medium',
    }));

    const contradictions: Contradiction[] = (parsed.contradictions || []).map((c: any) => ({
      description: c.description,
      sources: (c.sourceIndices || []).map((i: number) => allSources[i]).filter(Boolean),
      suggestion: c.suggestion || 'Verify with additional sources',
    }));

    return {
      summary: parsed.summary || '',
      findings,
      contradictions,
      gaps: parsed.gaps || [],
      sources: allSources,
      quality: { citationRate: 0, coherence: 0, completeness: 0, overall: 0 },
    };

  } catch {
    // Fallback: treat entire content as summary
    return {
      summary: content,
      findings: [],
      contradictions: [],
      gaps: [],
      sources: allSources,
      quality: { citationRate: 0, coherence: 0.5, completeness: 0.5, overall: 0.5 },
    };
  }
}

/**
 * Calculate synthesis quality metrics
 */
function calculateQuality(
  synthesis: SynthesizedOutput,
  query: string,
  sources: SubagentSource[]
): SynthesisQuality {
  // Citation rate: % of findings with sources
  const citedFindings = synthesis.findings.filter((f) => f.sources.length > 0).length;
  const citationRate = synthesis.findings.length > 0
    ? citedFindings / synthesis.findings.length
    : 0;

  // Coherence: based on structure (has summary, findings, no errors)
  const coherence = synthesis.summary.length > 0 && synthesis.findings.length > 0 ? 0.8 : 0.5;

  // Completeness: simple keyword check
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentText = `${synthesis.summary} ${synthesis.findings.map((f) => f.content).join(' ')}`.toLowerCase();
  const matchedWords = queryWords.filter((w) => w.length > 3 && contentText.includes(w)).length;
  const completeness = queryWords.length > 0 ? matchedWords / queryWords.length : 0.5;

  const overall = (citationRate * 0.4 + coherence * 0.3 + completeness * 0.3);

  return {
    citationRate,
    coherence,
    completeness,
    overall,
  };
}

/**
 * Format synthesis for Slack output
 */
export function formatSynthesisForSlack(synthesis: SynthesizedOutput): string {
  const sections: string[] = [];

  // Summary
  sections.push(`*Summary*\n${synthesis.summary}`);

  // Key findings
  if (synthesis.findings.length > 0) {
    sections.push('\n*Key Findings*');
    for (const finding of synthesis.findings) {
      const confidence = finding.confidence === 'high' ? '✓' : finding.confidence === 'low' ? '?' : '';
      sections.push(`• *${finding.topic}* ${confidence}\n  ${finding.content}`);
    }
  }

  // Contradictions
  if (synthesis.contradictions.length > 0) {
    sections.push('\n*Contradictions Noted*');
    for (const contradiction of synthesis.contradictions) {
      sections.push(`• ⚠️ ${contradiction.description}`);
    }
  }

  // Gaps
  if (synthesis.gaps.length > 0) {
    sections.push('\n*Information Gaps*');
    for (const gap of synthesis.gaps) {
      sections.push(`• ${gap}`);
    }
  }

  // Sources
  sections.push('\n*Sources*');
  const sourcesByType = groupBy(synthesis.sources, (s) => s.type);
  for (const [type, sources] of Object.entries(sourcesByType)) {
    const links = sources.slice(0, 5).map((s) => 
      s.url ? `<${s.url}|${s.title}>` : s.title
    ).join(', ');
    sections.push(`• _${type}_: ${links}`);
  }

  return sections.join('\n');
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of array) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
```

### src/agent/synthesis/index.ts

```typescript
/**
 * Synthesis Module - Public API
 */

export { aggregateResults, type AggregatedResults, type AggregationOptions } from './aggregator.js';
export { synthesizeResults, formatSynthesisForSlack, type SynthesizedOutput, type SynthesisOptions } from './synthesizer.js';
```

### File Structure After This Story

```
src/
├── agent/
│   ├── synthesis/                   # NEW
│   │   ├── index.ts
│   │   ├── aggregator.ts
│   │   ├── aggregator.test.ts
│   │   ├── synthesizer.ts
│   │   └── synthesizer.test.ts
```

### Dependencies on Prior Stories

| Story | Dependency | Usage |
|-------|------------|-------|
| 5-1 | Subagent Infrastructure | `SubagentResult` type |
| 5-3 | Parallel Execution | Results from parallel subagents |
| 2-1 | Claude SDK Integration | `queryOrion()` for LLM synthesis |

### Test Specifications

```typescript
// src/agent/synthesis/aggregator.test.ts
describe('aggregateResults', () => {
  it('should filter low-relevance results', () => {
    const results: SubagentResult[] = [
      createMockResult({ relevance: 0.9, content: 'Highly relevant' }),
      createMockResult({ relevance: 0.1, content: 'Not relevant' }),
    ];

    const aggregated = aggregateResults(results, 'test query', { minRelevance: 0.5 });
    
    expect(aggregated.results).toHaveLength(1);
    expect(aggregated.results[0].content).toBe('Highly relevant');
  });

  it('should deduplicate similar content', () => {
    const results: SubagentResult[] = [
      createMockResult({ content: 'The answer is 42', relevance: 0.9 }),
      createMockResult({ content: 'The answer is 42!', relevance: 0.8 }),
    ];

    const aggregated = aggregateResults(results, 'test', { deduplicate: true });
    
    expect(aggregated.results).toHaveLength(1);
    expect(aggregated.metrics.deduplicatedCount).toBe(1);
  });
});

// src/agent/synthesis/synthesizer.test.ts
describe('synthesizeResults', () => {
  it('should produce structured synthesis', async () => {
    const aggregated = createMockAggregated([
      { content: 'Finding 1', sources: [{ type: 'slack', title: 'Thread' }] },
    ]);

    const synthesis = await synthesizeResults(aggregated, 'test query');
    
    expect(synthesis.summary).toBeDefined();
    expect(synthesis.findings.length).toBeGreaterThan(0);
    expect(synthesis.sources.length).toBeGreaterThan(0);
  });

  it('should calculate quality metrics', async () => {
    const aggregated = createMockAggregated([]);

    const synthesis = await synthesizeResults(aggregated, 'test query');
    
    expect(synthesis.quality.overall).toBeGreaterThanOrEqual(0);
    expect(synthesis.quality.overall).toBeLessThanOrEqual(1);
  });
});
```

### References

- [Source: _bmad-output/epics.md#Story 5.7: Result Aggregation & Synthesis] — Original story
- [Source: _bmad-output/prd.md#FR4] — Only relevant results aggregated
- [Source: _bmad-output/prd.md#FR8] — Information synthesis requirement
- [Source: Story 5-3] — Parallel results input
- [Source: Story 2-1] — Claude SDK for synthesis

### Previous Story Intelligence

From Story 5-3 (Parallel Execution):
- `executeSubagentsParallel()` returns `SubagentResult[]`
- Results may contain mixed success/failure

From Story 2-1 (Claude SDK):
- `queryOrion()` available for LLM calls
- Use structured prompts for JSON output

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `src/agent/synthesis/index.ts`
- `src/agent/synthesis/aggregator.ts`
- `src/agent/synthesis/aggregator.test.ts`
- `src/agent/synthesis/synthesizer.ts`
- `src/agent/synthesis/synthesizer.test.ts`
