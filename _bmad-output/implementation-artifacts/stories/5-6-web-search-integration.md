# Story 5.6: Web Search Integration

Status: ready-for-dev

## Story

As a **user**,
I want Orion to search the web for external information,
So that I can research beyond internal sources.

## Acceptance Criteria

1. **Given** a research request needs external information, **When** the agent determines web search is needed, **Then** it can search the web via MCP/tool integration

2. **Given** results are returned, **When** they are formatted, **Then** results include source URLs

3. **Given** many results exist, **When** they are evaluated, **Then** search results are filtered for credibility

4. **Given** the capability exists, **When** subagents need it, **Then** web search is available as a subagent capability

5. **Given** multi-source research, **When** sources are combined, **Then** web search supports multi-source research (FR7)

## Tasks / Subtasks

- [ ] **Task 1: Create Web Search Module** (AC: #1)
  - [ ] Create `src/tools/search/web.ts`
  - [ ] Integrate Rube MCP web search (or Exa/Tavily)
  - [ ] Support multiple search providers for fallback
  - [ ] Handle rate limits and quotas

- [ ] **Task 2: Extract and Format URLs** (AC: #2)
  - [ ] Extract URLs from search results
  - [ ] Format for Slack mrkdwn: `<url|Page Title>`
  - [ ] Include domain in display for credibility context
  - [ ] Handle URL validation and sanitization

- [ ] **Task 3: Implement Credibility Scoring** (AC: #3)
  - [ ] Create domain credibility scoring
  - [ ] Prioritize authoritative sources (.gov, .edu, known brands)
  - [ ] Flag uncertain or low-credibility sources
  - [ ] Filter out spam/SEO content

- [ ] **Task 4: Create MCP Tool Wrapper** (AC: #4)
  - [ ] Create `src/tools/search/web-mcp.ts`
  - [ ] Register as MCP tool: `orion_search_web`
  - [ ] Define input schema (query, options)
  - [ ] Return structured results for subagent consumption

- [ ] **Task 5: Multi-Source Integration** (AC: #5)
  - [ ] Standardize output format across Slack/Confluence/web
  - [ ] Create unified `SearchResult` interface
  - [ ] Tag results by source type for synthesis

- [ ] **Task 6: Verification Tests** (AC: all)
  - [ ] Test: Search returns web results
  - [ ] Test: Results include valid URLs
  - [ ] Test: Credibility scoring works
  - [ ] Test: Multi-source format compatibility

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR7 | prd.md | Multi-source research across Slack, Confluence, and web |
| AR21-23 | architecture.md | Slack mrkdwn formatting for links |
| NFR19 | prd.md | 30 second timeout per tool call |

### Rube MCP Web Search Options

**Available via Rube/Composio:**
- `web_search` — Generic web search via Rube
- Exa API integration (semantic search)
- Tavily API integration (AI-optimized search)

### src/tools/search/web.ts

```typescript
import type { RubeMcpClient } from '../mcp/client.js';
import { logger } from '../../utils/logger.js';

export interface WebSearchOptions {
  /** Maximum results to return (default: 10) */
  limit?: number;
  /** Filter by domain (e.g., ['github.com', 'stackoverflow.com']) */
  includeDomains?: string[];
  /** Exclude domains */
  excludeDomains?: string[];
  /** Minimum credibility score (0-1) */
  minCredibility?: number;
  /** Search type: 'general' | 'news' | 'academic' */
  searchType?: 'general' | 'news' | 'academic';
  /** Only results from this time period */
  recency?: 'day' | 'week' | 'month' | 'year';
}

export interface WebSearchResult {
  results: WebPageResult[];
  totalMatches: number;
  hasMore: boolean;
  query: string;
  provider: string;
}

export interface WebPageResult {
  /** Page title */
  title: string;
  /** Full URL */
  url: string;
  /** Page snippet/description */
  snippet: string;
  /** Domain name */
  domain: string;
  /** Credibility score (0-1) */
  credibilityScore: number;
  /** Published date if available */
  publishedDate?: string;
  /** Author if available */
  author?: string;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_CREDIBILITY = 0.3;

/**
 * Domain credibility scores (0-1)
 * Higher = more trustworthy
 */
const DOMAIN_CREDIBILITY: Record<string, number> = {
  // Official/Government
  '.gov': 0.95,
  '.edu': 0.9,
  '.org': 0.75,
  
  // Tech documentation
  'docs.github.com': 0.95,
  'developer.mozilla.org': 0.95,
  'stackoverflow.com': 0.85,
  'github.com': 0.85,
  'medium.com': 0.6,
  
  // News
  'reuters.com': 0.9,
  'bbc.com': 0.85,
  'nytimes.com': 0.85,
  
  // Default for unknown
  '_default': 0.5,
};

/**
 * Search the web for external information
 * 
 * Uses Rube MCP's web search capability with credibility filtering.
 * 
 * @param mcpClient - Rube MCP client instance
 * @param query - Search query string
 * @param options - Search options
 */
export async function searchWeb(
  mcpClient: RubeMcpClient,
  query: string,
  options: WebSearchOptions = {}
): Promise<WebSearchResult> {
  const {
    limit = DEFAULT_LIMIT,
    includeDomains,
    excludeDomains,
    minCredibility = DEFAULT_MIN_CREDIBILITY,
    searchType = 'general',
    recency,
  } = options;

  logger.info({
    event: 'web_search_started',
    query,
    limit,
    searchType,
  });

  try {
    // Use Rube MCP web search
    const response = await mcpClient.callTool('web_search', {
      query,
      num_results: limit * 2, // Request more to allow filtering
      include_domains: includeDomains,
      exclude_domains: excludeDomains,
      search_type: searchType,
      time_period: recency,
    });

    if (!response.success) {
      throw new Error(response.error || 'Web search failed');
    }

    const rawResults = response.data?.results || [];

    // Transform and score results
    const results: WebPageResult[] = [];

    for (const raw of rawResults) {
      const domain = extractDomain(raw.url);
      const credibilityScore = calculateCredibility(domain, raw);

      if (credibilityScore < minCredibility) continue;

      results.push({
        title: raw.title || 'Untitled',
        url: raw.url,
        snippet: raw.snippet || raw.description || '',
        domain,
        credibilityScore,
        publishedDate: raw.published_date,
        author: raw.author,
      });

      if (results.length >= limit) break;
    }

    // Sort by credibility
    results.sort((a, b) => b.credibilityScore - a.credibilityScore);

    logger.info({
      event: 'web_search_completed',
      query,
      totalRaw: rawResults.length,
      returnedCount: results.length,
      provider: 'rube',
    });

    return {
      results,
      totalMatches: rawResults.length,
      hasMore: rawResults.length > results.length,
      query,
      provider: 'rube',
    };

  } catch (error) {
    logger.error({
      event: 'web_search_failed',
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Calculate credibility score for a result
 */
function calculateCredibility(
  domain: string,
  result: { title?: string; snippet?: string }
): number {
  let score = DOMAIN_CREDIBILITY._default;

  // Check exact domain match
  if (DOMAIN_CREDIBILITY[domain]) {
    score = DOMAIN_CREDIBILITY[domain];
  } else {
    // Check TLD
    const tld = '.' + domain.split('.').pop();
    if (DOMAIN_CREDIBILITY[tld]) {
      score = DOMAIN_CREDIBILITY[tld];
    }
  }

  // Penalty for SEO spam indicators
  const spamIndicators = ['click here', 'buy now', 'limited time', 'free download'];
  const textToCheck = `${result.title || ''} ${result.snippet || ''}`.toLowerCase();
  
  for (const indicator of spamIndicators) {
    if (textToCheck.includes(indicator)) {
      score -= 0.2;
    }
  }

  // Bonus for documentation indicators
  const docIndicators = ['documentation', 'api reference', 'official', 'guide'];
  for (const indicator of docIndicators) {
    if (textToCheck.includes(indicator)) {
      score += 0.1;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Format search results for Slack mrkdwn display
 */
export function formatWebSearchResults(results: WebSearchResult): string {
  if (results.results.length === 0) {
    return `No web results found for "${results.query}"`;
  }

  const lines = results.results.slice(0, 10).map((result) => {
    const link = `<${result.url}|${result.title}>`;
    const credibility = result.credibilityScore >= 0.8 ? '✓' : '';
    return `• ${link} ${credibility}\n  _${result.snippet.slice(0, 150)}${result.snippet.length > 150 ? '...' : ''}_\n  \`${result.domain}\``;
  });

  return `*Web Search Results* (${results.results.length} found)\n\n${lines.join('\n\n')}`;
}
```

### src/tools/search/web-mcp.ts

```typescript
import type { RubeMcpClient } from '../mcp/client.js';
import { searchWeb, formatWebSearchResults } from './web.js';
import { logger } from '../../utils/logger.js';

/**
 * MCP Tool definition for web search
 * Registered as: orion_search_web
 */
export const webSearchToolDefinition = {
  name: 'orion_search_web',
  description: 'Search the web for external information, articles, and documentation',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)',
        default: 10,
      },
      searchType: {
        type: 'string',
        enum: ['general', 'news', 'academic'],
        description: 'Type of search',
        default: 'general',
      },
      includeDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only include results from these domains',
      },
      recency: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year'],
        description: 'Only include results from this time period',
      },
    },
    required: ['query'],
  },
};

/**
 * Execute web search tool
 */
export async function executeWebSearchTool(
  mcpClient: RubeMcpClient,
  input: {
    query: string;
    limit?: number;
    searchType?: 'general' | 'news' | 'academic';
    includeDomains?: string[];
    recency?: 'day' | 'week' | 'month' | 'year';
  }
): Promise<{
  success: boolean;
  data?: {
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      domain: string;
      credibilityScore: number;
    }>;
    totalMatches: number;
    formatted: string;
  };
  error?: string;
}> {
  try {
    const results = await searchWeb(mcpClient, input.query, {
      limit: input.limit,
      searchType: input.searchType,
      includeDomains: input.includeDomains,
      recency: input.recency,
    });

    return {
      success: true,
      data: {
        results: results.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          domain: r.domain,
          credibilityScore: r.credibilityScore,
        })),
        totalMatches: results.totalMatches,
        formatted: formatWebSearchResults(results),
      },
    };
  } catch (error) {
    logger.error({
      event: 'web_search_tool_failed',
      query: input.query,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Web search failed',
    };
  }
}
```

### src/tools/search/types.ts (Unified Search Interface)

```typescript
/**
 * Unified search result type for multi-source research
 * Used to standardize results across Slack, Confluence, and Web
 */
export type SearchSourceType = 'slack' | 'confluence' | 'web' | 'file';

export interface UnifiedSearchResult {
  /** Source type */
  source: SearchSourceType;
  /** Result title */
  title: string;
  /** Full URL/permalink */
  url: string;
  /** Content snippet */
  snippet: string;
  /** Relevance/credibility score (0-1) */
  score: number;
  /** Additional metadata */
  metadata: {
    /** For Slack: channel name */
    channel?: string;
    /** For Confluence: space name */
    space?: string;
    /** For Web: domain */
    domain?: string;
    /** Author if available */
    author?: string;
    /** Date if available */
    date?: string;
  };
}

/**
 * Convert search results to unified format
 */
export function toUnifiedResults(
  source: SearchSourceType,
  results: Array<{
    title: string;
    url: string;
    snippet?: string;
    score?: number;
    [key: string]: unknown;
  }>
): UnifiedSearchResult[] {
  return results.map((r) => ({
    source,
    title: r.title,
    url: r.url,
    snippet: r.snippet || '',
    score: r.score || 0.5,
    metadata: {
      channel: r.channelName as string | undefined,
      space: r.spaceName as string | undefined,
      domain: r.domain as string | undefined,
      author: r.author as string | undefined,
      date: r.date as string | undefined,
    },
  }));
}
```

### Update .orion/agents/search-agent.md

Add web search capability:

```markdown
## Web Search Capability

When searching the web:
1. Use `orion_search_web` tool with relevant keywords
2. Prefer authoritative sources (.gov, .edu, official docs)
3. Flag low-credibility sources
4. Format sources as: [Source: web - Article Title](url)

Example:
- Query: "OAuth 2.0 best practices 2024"
- Tool call: orion_search_web({ query: "OAuth 2.0 best practices", searchType: "general", recency: "year" })
```

### File Structure After This Story

```
src/
├── tools/
│   └── search/
│       ├── types.ts              # NEW - unified types
│       ├── slack.ts
│       ├── slack-mcp.ts
│       ├── confluence.ts
│       ├── confluence-mcp.ts
│       ├── web.ts                # NEW
│       ├── web.test.ts           # NEW
│       ├── web-mcp.ts            # NEW
│       └── web-mcp.test.ts       # NEW
```

### Dependencies on Prior Stories

| Story | Dependency | Usage |
|-------|------------|-------|
| 5-1 | Subagent Infrastructure | Subagent capability registration |
| 3-1 | MCP Client Infrastructure | RubeMcpClient for web search |
| 5-4, 5-5 | Slack/Confluence Search | Pattern for search module structure |

### Test Specifications

```typescript
// src/tools/search/web.test.ts
describe('searchWeb', () => {
  it('should return web results matching query', async () => {
    const mockClient = createMockRubeClient({
      results: [{ title: 'OAuth Guide', url: 'https://auth0.com/docs', snippet: 'OAuth best practices' }],
    });

    const results = await searchWeb(mockClient, 'OAuth 2.0');
    
    expect(results.results).toHaveLength(1);
    expect(results.results[0].title).toBe('OAuth Guide');
  });

  it('should calculate credibility scores', async () => {
    const mockClient = createMockRubeClient({
      results: [
        { title: 'Gov Doc', url: 'https://example.gov/doc' },
        { title: 'Random Blog', url: 'https://random-blog.com/post' },
      ],
    });

    const results = await searchWeb(mockClient, 'test');
    
    const govResult = results.results.find((r) => r.domain.includes('gov'));
    const blogResult = results.results.find((r) => r.domain.includes('blog'));
    
    expect(govResult?.credibilityScore).toBeGreaterThan(blogResult?.credibilityScore || 0);
  });

  it('should filter out low-credibility results', async () => {
    const mockClient = createMockRubeClient({
      results: [
        { title: 'Good Doc', url: 'https://docs.github.com/page' },
        { title: 'Buy Now Free!', url: 'https://spam-site.com/offer' },
      ],
    });

    const results = await searchWeb(mockClient, 'test', { minCredibility: 0.5 });
    
    expect(results.results.every((r) => r.credibilityScore >= 0.5)).toBe(true);
  });
});
```

### References

- [Source: _bmad-output/epics.md#Story 5.6: Web Search Integration] — Original story
- [Source: _bmad-output/prd.md#FR7] — Multi-source research requirement
- [Source: Rube MCP Tools] — Web search via Rube [[memory:306901]]
- [Source: Story 5-4] — Pattern for search module structure

### Previous Story Intelligence

From Stories 5-4, 5-5 (Slack/Confluence Search):
- Same module structure: core + MCP wrapper
- Same output format for Slack mrkdwn
- Unified `SearchResult` interface for synthesis

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `src/tools/search/types.ts`
- `src/tools/search/web.ts`
- `src/tools/search/web.test.ts`
- `src/tools/search/web-mcp.ts`
- `src/tools/search/web-mcp.test.ts`

Files to modify:
- `.orion/agents/search-agent.md` — Add web capability
