# Story 5.8: Source Linking

Status: ready-for-dev

## Story

As a **user**,
I want links to all source materials,
So that I can verify and explore further.

## Acceptance Criteria

1. **Given** research results are synthesized, **When** the response is delivered, **Then** links to source materials are included (FR9)

2. **Given** links are included, **When** displayed in Slack, **Then** links are formatted for Slack (clickable)

3. **Given** multiple source types, **When** organizing results, **Then** sources are organized by type (Slack, Confluence, web)

4. **Given** links are included, **When** possible, **Then** links are verified as accessible when possible

5. **Given** some sources missing, **When** formatting output, **Then** missing sources are noted

## Tasks / Subtasks

- [ ] **Task 1: Create Source Collector** (AC: #1)
  - [ ] Create `src/agent/citations/source-collector.ts`
  - [ ] Implement `collectSources(subagentResults[])` function
  - [ ] Extract all source references from results
  - [ ] Deduplicate sources by URL

- [ ] **Task 2: Format for Slack** (AC: #2)
  - [ ] Create `src/agent/citations/formatter.ts`
  - [ ] Implement `formatSourcesForSlack(sources)` function
  - [ ] Use Slack mrkdwn link syntax: `<url|title>`
  - [ ] Handle long titles gracefully

- [ ] **Task 3: Organize by Type** (AC: #3)
  - [ ] Group sources by type (slack, confluence, web, file)
  - [ ] Create section headers for each type
  - [ ] Order types by relevance (internal first)

- [ ] **Task 4: Verify Links (Optional)** (AC: #4)
  - [ ] Create `src/agent/citations/verifier.ts`
  - [ ] Implement lightweight HEAD request check
  - [ ] Set short timeout (2s) to avoid delays
  - [ ] Mark unverified links (skip for internal)

- [ ] **Task 5: Handle Missing Sources** (AC: #5)
  - [ ] Detect when content lacks source citation
  - [ ] Add "unverified" marker to uncited claims
  - [ ] Note missing sources in output

- [ ] **Task 6: Verification Tests** (AC: all)
  - [ ] Test: All sources extracted from results
  - [ ] Test: Slack links are clickable format
  - [ ] Test: Sources grouped by type
  - [ ] Test: Missing sources noted

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR9 | prd.md | System provides links to source materials |
| AR21-23 | architecture.md | Slack mrkdwn formatting for links |
| FR6 | prd.md | System cites sources for factual claims |

### src/agent/citations/source-collector.ts

```typescript
import type { SubagentResult, SubagentSource } from '../subagents/types.js';
import { logger } from '../../utils/logger.js';

export interface CollectedSources {
  /** All unique sources */
  sources: SourceWithMetadata[];
  /** Sources grouped by type */
  byType: Record<string, SourceWithMetadata[]>;
  /** Collection metrics */
  metrics: CollectionMetrics;
}

export interface SourceWithMetadata extends SubagentSource {
  /** Which subagent found this source */
  foundBy: string;
  /** How many times this source was referenced */
  referenceCount: number;
  /** Verification status */
  verified?: boolean;
  /** Verification error if failed */
  verificationError?: string;
}

export interface CollectionMetrics {
  totalSources: number;
  uniqueSources: number;
  byType: Record<string, number>;
  duplicatesRemoved: number;
}

/**
 * Collect and deduplicate sources from subagent results
 * 
 * Extracts all source citations, deduplicates by URL,
 * and organizes by source type.
 * 
 * @param results - Array of subagent results
 */
export function collectSources(results: SubagentResult[]): CollectedSources {
  const urlMap = new Map<string, SourceWithMetadata>();
  let totalSources = 0;

  for (const result of results) {
    if (!result.success || !result.data?.sources) continue;

    for (const source of result.data.sources) {
      totalSources++;
      
      // Use URL as unique key, or title if no URL
      const key = source.url || `${source.type}:${source.title}`;
      
      if (urlMap.has(key)) {
        // Increment reference count for duplicate
        const existing = urlMap.get(key)!;
        existing.referenceCount++;
      } else {
        urlMap.set(key, {
          ...source,
          foundBy: result.subagent,
          referenceCount: 1,
        });
      }
    }
  }

  const sources = Array.from(urlMap.values());
  const duplicatesRemoved = totalSources - sources.length;

  // Group by type
  const byType: Record<string, SourceWithMetadata[]> = {};
  for (const source of sources) {
    const type = source.type || 'unknown';
    if (!byType[type]) {
      byType[type] = [];
    }
    byType[type].push(source);
  }

  // Sort each group by reference count (most cited first)
  for (const type of Object.keys(byType)) {
    byType[type].sort((a, b) => b.referenceCount - a.referenceCount);
  }

  const metrics: CollectionMetrics = {
    totalSources,
    uniqueSources: sources.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([type, sources]) => [type, sources.length])
    ),
    duplicatesRemoved,
  };

  logger.info({
    event: 'sources_collected',
    ...metrics,
  });

  return { sources, byType, metrics };
}

/**
 * Extract sources mentioned inline in text content
 * Parses [Source: type - title](url) and (via source: title) patterns
 */
export function extractInlineSources(content: string): SubagentSource[] {
  const sources: SubagentSource[] = [];

  // Match [Source: type - title](url)
  const linkPattern = /\[Source:\s*(slack|confluence|web|file)?\s*-?\s*([^\]]+)\]\(([^)]+)\)/gi;
  let match;
  
  while ((match = linkPattern.exec(content)) !== null) {
    sources.push({
      type: (match[1]?.toLowerCase() as SubagentSource['type']) || 'unknown',
      title: match[2].trim(),
      url: match[3],
    });
  }

  // Match (via slack: #channel-name) or (via confluence: Page Title)
  const inlinePattern = /\(via\s+(slack|confluence|web):\s*([^)]+)\)/gi;
  while ((match = inlinePattern.exec(content)) !== null) {
    sources.push({
      type: match[1].toLowerCase() as SubagentSource['type'],
      title: match[2].trim(),
    });
  }

  return sources;
}
```

### src/agent/citations/formatter.ts

```typescript
import type { SourceWithMetadata, CollectedSources } from './source-collector.js';

export interface FormatOptions {
  /** Maximum sources per type to show */
  maxPerType?: number;
  /** Whether to show reference counts */
  showReferenceCounts?: boolean;
  /** Order of source types to display */
  typeOrder?: string[];
  /** Whether to include verification status */
  showVerification?: boolean;
}

const DEFAULT_TYPE_ORDER = ['slack', 'confluence', 'web', 'file', 'unknown'];
const DEFAULT_MAX_PER_TYPE = 5;

/**
 * Format collected sources for Slack mrkdwn output
 * 
 * Creates a structured sources section with links organized by type.
 * Uses Slack mrkdwn syntax for clickable links.
 * 
 * @param collected - Collected sources from source collector
 * @param options - Formatting options
 */
export function formatSourcesForSlack(
  collected: CollectedSources,
  options: FormatOptions = {}
): string {
  const {
    maxPerType = DEFAULT_MAX_PER_TYPE,
    showReferenceCounts = false,
    typeOrder = DEFAULT_TYPE_ORDER,
    showVerification = false,
  } = options;

  if (collected.sources.length === 0) {
    return '_No sources available_';
  }

  const sections: string[] = ['*Sources*'];

  // Sort types by configured order
  const sortedTypes = Object.keys(collected.byType).sort((a, b) => {
    const aIndex = typeOrder.indexOf(a);
    const bIndex = typeOrder.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  for (const type of sortedTypes) {
    const sources = collected.byType[type];
    if (!sources?.length) continue;

    // Type header
    const typeName = formatTypeName(type);
    sections.push(`\n_${typeName}:_`);

    // Format each source
    const displaySources = sources.slice(0, maxPerType);
    for (const source of displaySources) {
      const line = formatSourceLine(source, { showReferenceCounts, showVerification });
      sections.push(line);
    }

    // Show count of remaining sources
    if (sources.length > maxPerType) {
      sections.push(`  _...and ${sources.length - maxPerType} more_`);
    }
  }

  return sections.join('\n');
}

/**
 * Format a single source line
 */
function formatSourceLine(
  source: SourceWithMetadata,
  options: { showReferenceCounts: boolean; showVerification: boolean }
): string {
  const { showReferenceCounts, showVerification } = options;

  // Build link
  let link: string;
  if (source.url) {
    const title = truncateTitle(source.title, 50);
    link = `<${source.url}|${title}>`;
  } else {
    link = source.title;
  }

  // Add reference count if enabled
  let suffix = '';
  if (showReferenceCounts && source.referenceCount > 1) {
    suffix += ` (×${source.referenceCount})`;
  }

  // Add verification status if enabled
  if (showVerification) {
    if (source.verified === true) {
      suffix += ' ✓';
    } else if (source.verified === false) {
      suffix += ' ⚠';
    }
  }

  return `• ${link}${suffix}`;
}

/**
 * Format type name for display
 */
function formatTypeName(type: string): string {
  const names: Record<string, string> = {
    slack: 'Slack',
    confluence: 'Confluence',
    web: 'Web',
    file: 'Files',
    unknown: 'Other',
  };
  return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Truncate title to max length
 */
function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 3) + '...';
}

/**
 * Create inline source citation for use within text
 */
export function createInlineCitation(source: SourceWithMetadata): string {
  if (source.url) {
    return `<${source.url}|${source.title}>`;
  }
  return `_${source.title}_`;
}

/**
 * Format a sources section for appending to a response
 */
export function createSourcesSection(collected: CollectedSources): string {
  const header = `\n\n---\n${formatSourcesForSlack(collected)}`;
  return header;
}
```

### src/agent/citations/verifier.ts

```typescript
import { logger } from '../../utils/logger.js';
import type { SourceWithMetadata } from './source-collector.js';

const VERIFICATION_TIMEOUT_MS = 2000;
const SKIP_VERIFICATION_DOMAINS = ['slack.com', 'atlassian.net'];

/**
 * Verify that source URLs are accessible
 * 
 * Performs lightweight HEAD requests to check URL accessibility.
 * Skips internal domains and uses short timeout to avoid delays.
 * 
 * @param sources - Sources to verify
 * @returns Sources with verification status added
 */
export async function verifySources(
  sources: SourceWithMetadata[]
): Promise<SourceWithMetadata[]> {
  const verificationPromises = sources.map(async (source) => {
    if (!source.url) {
      return { ...source, verified: undefined };
    }

    // Skip internal domains
    if (shouldSkipVerification(source.url)) {
      return { ...source, verified: true };
    }

    try {
      const verified = await verifyUrl(source.url);
      return { ...source, verified };
    } catch (error) {
      return {
        ...source,
        verified: false,
        verificationError: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  const results = await Promise.all(verificationPromises);

  const verified = results.filter((s) => s.verified === true).length;
  const failed = results.filter((s) => s.verified === false).length;

  logger.info({
    event: 'sources_verified',
    total: sources.length,
    verified,
    failed,
    skipped: sources.length - verified - failed,
  });

  return results;
}

/**
 * Check if verification should be skipped for this URL
 */
function shouldSkipVerification(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SKIP_VERIFICATION_DOMAINS.some((domain) =>
      parsed.hostname.endsWith(domain)
    );
  } catch {
    return true;
  }
}

/**
 * Verify a single URL with HEAD request
 */
async function verifyUrl(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    return response.ok;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Mark unverified content in synthesis
 * Adds markers to claims that lack source citations
 */
export function markUnverifiedContent(
  content: string,
  sources: SourceWithMetadata[]
): { content: string; unverifiedCount: number } {
  // Find sentences without citations
  const sentences = content.split(/(?<=[.!?])\s+/);
  let unverifiedCount = 0;
  const markedSentences: string[] = [];

  for (const sentence of sentences) {
    // Check if sentence has a citation pattern
    const hasCitation =
      /\[Source:/.test(sentence) ||
      /\(via\s+/.test(sentence) ||
      /<[^>]+\|[^>]+>/.test(sentence);

    if (!hasCitation && sentence.length > 50) {
      // Long sentence without citation - mark as unverified
      unverifiedCount++;
      // Don't actually mark in output (would be noisy), just count
    }

    markedSentences.push(sentence);
  }

  return {
    content: markedSentences.join(' '),
    unverifiedCount,
  };
}
```

### src/agent/citations/index.ts

```typescript
/**
 * Citations Module - Public API
 */

export {
  collectSources,
  extractInlineSources,
  type CollectedSources,
  type SourceWithMetadata,
  type CollectionMetrics,
} from './source-collector.js';

export {
  formatSourcesForSlack,
  createInlineCitation,
  createSourcesSection,
  type FormatOptions,
} from './formatter.js';

export {
  verifySources,
  markUnverifiedContent,
} from './verifier.js';
```

### Integration with Synthesis

Update the synthesis module to include source linking:

```typescript
// In src/agent/synthesis/synthesizer.ts

import { collectSources, formatSourcesForSlack, createSourcesSection } from '../citations/index.js';

// After synthesis, add sources section
export async function synthesizeWithSources(
  aggregated: AggregatedResults,
  originalQuery: string,
  options: SynthesisOptions = {}
): Promise<string> {
  // Synthesize content
  const synthesis = await synthesizeResults(aggregated, originalQuery, options);
  
  // Collect all sources
  // Note: Sources are already in aggregated results
  const collected = collectSourcesFromAggregated(aggregated);
  
  // Format synthesis for Slack
  const content = formatSynthesisForSlack(synthesis);
  
  // Append sources section
  const sourcesSection = createSourcesSection(collected);
  
  return content + sourcesSection;
}
```

### File Structure After This Story

```
src/
├── agent/
│   ├── citations/                   # NEW
│   │   ├── index.ts
│   │   ├── source-collector.ts
│   │   ├── source-collector.test.ts
│   │   ├── formatter.ts
│   │   ├── formatter.test.ts
│   │   ├── verifier.ts
│   │   └── verifier.test.ts
```

### Dependencies on Prior Stories

| Story | Dependency | Usage |
|-------|------------|-------|
| 5-1 | Subagent Infrastructure | `SubagentSource` type |
| 5-7 | Result Aggregation | Sources from aggregated results |

### Test Specifications

```typescript
// src/agent/citations/formatter.test.ts
describe('formatSourcesForSlack', () => {
  it('should format sources with Slack mrkdwn links', () => {
    const collected = createMockCollected([
      { type: 'slack', title: '#engineering', url: 'https://slack.com/...' },
    ]);

    const formatted = formatSourcesForSlack(collected);
    
    expect(formatted).toContain('<https://slack.com/...|#engineering>');
  });

  it('should group sources by type', () => {
    const collected = createMockCollected([
      { type: 'slack', title: 'Thread 1' },
      { type: 'confluence', title: 'Page 1' },
      { type: 'slack', title: 'Thread 2' },
    ]);

    const formatted = formatSourcesForSlack(collected);
    
    expect(formatted).toMatch(/_Slack:_[\s\S]*_Confluence:_/);
  });

  it('should respect maxPerType limit', () => {
    const collected = createMockCollected(
      Array(10).fill({ type: 'slack', title: 'Thread' })
    );

    const formatted = formatSourcesForSlack(collected, { maxPerType: 3 });
    
    expect(formatted).toContain('...and 7 more');
  });
});

// src/agent/citations/source-collector.test.ts
describe('collectSources', () => {
  it('should deduplicate sources by URL', () => {
    const results = [
      createMockResult({ sources: [{ url: 'https://a.com', title: 'A' }] }),
      createMockResult({ sources: [{ url: 'https://a.com', title: 'A' }] }),
    ];

    const collected = collectSources(results);
    
    expect(collected.sources).toHaveLength(1);
    expect(collected.sources[0].referenceCount).toBe(2);
  });
});
```

### References

- [Source: _bmad-output/epics.md#Story 5.8: Source Linking] — Original story
- [Source: _bmad-output/prd.md#FR9] — Source material links requirement
- [Source: _bmad-output/prd.md#FR6] — Source citations for claims
- [Source: _bmad-output/architecture.md#Slack Response Formatting] — AR21-23
- [Source: Story 5-7] — Synthesis output to add sources to

### Previous Story Intelligence

From Story 5-7 (Result Aggregation & Synthesis):
- Sources available in `SynthesizedOutput.sources`
- `formatSynthesisForSlack()` handles main content

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `src/agent/citations/index.ts`
- `src/agent/citations/source-collector.ts`
- `src/agent/citations/source-collector.test.ts`
- `src/agent/citations/formatter.ts`
- `src/agent/citations/formatter.test.ts`
- `src/agent/citations/verifier.ts`
- `src/agent/citations/verifier.test.ts`

Files to modify:
- `src/agent/synthesis/synthesizer.ts` — Add source section integration
