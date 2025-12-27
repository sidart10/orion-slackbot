# Story 5.5: Confluence Search

Status: superseded
Superseded By: 5-search-integrations.md
Superseded Date: 2025-12-21

## Story

As a **user**,
I want Orion to search Confluence for documentation,
So that I can find information from our knowledge base.

## Acceptance Criteria

1. **Given** a research request needs documentation, **When** the agent searches for information, **Then** it can search Confluence content (FR12)

2. **Given** search executes, **When** spaces are accessed, **Then** search covers spaces the user has access to

3. **Given** results are found, **When** they are returned, **Then** results include page links for full context

4. **Given** many results exist, **When** they are processed, **Then** search results are filtered for relevance

5. **Given** the capability exists, **When** subagents need it, **Then** Confluence search is available as a subagent capability

## Tasks / Subtasks

- [ ] **Task 1: Create Confluence Search Module** (AC: #1)
  - [ ] Create `src/tools/search/confluence.ts`
  - [ ] Implement via Rube MCP (Atlassian integration)
  - [ ] Support CQL (Confluence Query Language) for advanced queries
  - [ ] Handle pagination for large result sets

- [ ] **Task 2: Implement Space Filtering** (AC: #2)
  - [ ] Use Atlassian MCP with user authentication
  - [ ] Filter by accessible spaces
  - [ ] Support space key restrictions in query
  - [ ] Handle permission errors gracefully

- [ ] **Task 3: Generate Page Links** (AC: #3)
  - [ ] Extract page URL from Confluence API response
  - [ ] Format links for Slack mrkdwn: `<url|Page Title>`
  - [ ] Include space name in link context
  - [ ] Handle Cloud vs Server URL formats

- [ ] **Task 4: Implement Relevance Filtering** (AC: #4)
  - [ ] Use Confluence search score/relevance
  - [ ] Limit results to top N (default: 10)
  - [ ] Prioritize recently updated pages
  - [ ] Remove duplicate results

- [ ] **Task 5: Create MCP Tool Wrapper** (AC: #5)
  - [ ] Create `src/tools/search/confluence-mcp.ts`
  - [ ] Register as MCP tool: `orion_search_confluence`
  - [ ] Define input schema (query, spaceKeys, options)
  - [ ] Return structured results for subagent consumption

- [ ] **Task 6: Verification Tests** (AC: all)
  - [ ] Test: Search returns matching pages
  - [ ] Test: Results include valid URLs
  - [ ] Test: CQL queries work correctly
  - [ ] Test: MCP tool wrapper functions

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR12 | prd.md | System can search Confluence for documentation |
| AR21-23 | architecture.md | Slack mrkdwn formatting for links |
| NFR19 | prd.md | 30 second timeout per tool call |

### Rube MCP Integration

**Atlassian MCP Tools (via Rube/Composio):**
- `ATLASSIAN_CONFLUENCE_SEARCH` — Search pages using CQL
- `ATLASSIAN_CONFLUENCE_GET_PAGE` — Get page content
- `ATLASSIAN_CONFLUENCE_LIST_SPACES` — List accessible spaces

**CQL (Confluence Query Language) Examples:**
- `text ~ "authentication"` — Full text search
- `space = "ATF" AND text ~ "policy"` — Search in specific space
- `type = page AND lastModified >= now("-30d")` — Recent pages

### src/tools/search/confluence.ts

```typescript
import type { RubeMcpClient } from '../mcp/client.js';
import { logger } from '../../utils/logger.js';

export interface ConfluenceSearchOptions {
  /** Limit results (default: 20) */
  limit?: number;
  /** Space keys to search in (empty = all accessible) */
  spaceKeys?: string[];
  /** Content types to include */
  contentTypes?: ('page' | 'blogpost' | 'comment')[];
  /** Only pages modified after this date */
  modifiedAfter?: string; // YYYY-MM-DD
  /** Minimum relevance score (0-1) */
  minScore?: number;
  /** Include page excerpt in results */
  includeExcerpt?: boolean;
}

export interface ConfluenceSearchResult {
  pages: ConfluencePageResult[];
  totalMatches: number;
  hasMore: boolean;
  query: string;
}

export interface ConfluencePageResult {
  /** Page ID */
  id: string;
  /** Page title */
  title: string;
  /** Space key */
  spaceKey: string;
  /** Space name */
  spaceName: string;
  /** Full URL to page */
  url: string;
  /** Page excerpt/summary */
  excerpt: string;
  /** Last modified date */
  lastModified: string;
  /** Author display name */
  author: string;
  /** Relevance score (0-1) */
  score: number;
  /** Content type */
  type: 'page' | 'blogpost' | 'comment';
}

const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_SCORE = 0.1;

/**
 * Search Confluence for documentation and knowledge base content
 * 
 * Uses Rube MCP's Atlassian integration for search.
 * Results are automatically filtered by user permissions.
 * 
 * @param mcpClient - Rube MCP client instance
 * @param query - Search query (text or CQL)
 * @param options - Search options
 */
export async function searchConfluence(
  mcpClient: RubeMcpClient,
  query: string,
  options: ConfluenceSearchOptions = {}
): Promise<ConfluenceSearchResult> {
  const {
    limit = DEFAULT_LIMIT,
    spaceKeys,
    contentTypes = ['page'],
    modifiedAfter,
    minScore = DEFAULT_MIN_SCORE,
    includeExcerpt = true,
  } = options;

  // Build CQL query
  const cql = buildCqlQuery(query, { spaceKeys, contentTypes, modifiedAfter });

  logger.info({
    event: 'confluence_search_started',
    query,
    cql,
    limit,
  });

  try {
    // Use Rube MCP Atlassian search
    const response = await mcpClient.callTool('ATLASSIAN_CONFLUENCE_SEARCH', {
      cql,
      limit,
      expand: includeExcerpt ? 'body.view,space,history.lastUpdated' : 'space,history.lastUpdated',
    });

    if (!response.success) {
      throw new Error(response.error || 'Confluence search failed');
    }

    const results = response.data?.results || [];
    const totalMatches = response.data?.totalSize || results.length;

    // Transform results
    const pages: ConfluencePageResult[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      // Estimate score from position (Confluence doesn't provide explicit score)
      const estimatedScore = 1 - (i / results.length) * 0.5;
      
      if (estimatedScore < minScore) continue;

      pages.push({
        id: result.id,
        title: result.title,
        spaceKey: result.space?.key || '',
        spaceName: result.space?.name || '',
        url: buildConfluenceUrl(result),
        excerpt: extractExcerpt(result.body?.view?.value || result.excerpt || ''),
        lastModified: result.history?.lastUpdated?.when || '',
        author: result.history?.lastUpdated?.by?.displayName || '',
        score: estimatedScore,
        type: result.type || 'page',
      });
    }

    logger.info({
      event: 'confluence_search_completed',
      query,
      totalMatches,
      returnedCount: pages.length,
    });

    return {
      pages,
      totalMatches,
      hasMore: totalMatches > limit,
      query,
    };

  } catch (error) {
    logger.error({
      event: 'confluence_search_failed',
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Build CQL query from search options
 */
function buildCqlQuery(
  textQuery: string,
  options: {
    spaceKeys?: string[];
    contentTypes?: string[];
    modifiedAfter?: string;
  }
): string {
  const conditions: string[] = [];

  // Text search
  if (textQuery) {
    // Escape special CQL characters
    const escaped = textQuery.replace(/['"]/g, '\\$&');
    conditions.push(`text ~ "${escaped}"`);
  }

  // Space filter
  if (options.spaceKeys?.length) {
    const spaceCondition = options.spaceKeys
      .map((key) => `space = "${key}"`)
      .join(' OR ');
    conditions.push(`(${spaceCondition})`);
  }

  // Content type filter
  if (options.contentTypes?.length) {
    const typeCondition = options.contentTypes
      .map((type) => `type = "${type}"`)
      .join(' OR ');
    conditions.push(`(${typeCondition})`);
  }

  // Modified after filter
  if (options.modifiedAfter) {
    conditions.push(`lastModified >= "${options.modifiedAfter}"`);
  }

  return conditions.join(' AND ') || 'type = page';
}

/**
 * Build Confluence page URL from result
 */
function buildConfluenceUrl(result: { _links?: { webui?: string }; id?: string }): string {
  // Prefer webui link if available
  if (result._links?.webui) {
    // Confluence returns relative path, need to add base URL
    const baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://your-domain.atlassian.net/wiki';
    return `${baseUrl}${result._links.webui}`;
  }

  // Fallback: construct from ID
  const baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://your-domain.atlassian.net/wiki';
  return `${baseUrl}/pages/viewpage.action?pageId=${result.id}`;
}

/**
 * Extract clean excerpt from HTML content
 */
function extractExcerpt(html: string, maxLength: number = 200): string {
  // Strip HTML tags
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  if (text.length <= maxLength) return text;
  
  // Truncate at word boundary
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > maxLength * 0.8 
    ? truncated.slice(0, lastSpace) + '...'
    : truncated + '...';
}

/**
 * Format search results for Slack mrkdwn display
 */
export function formatConfluenceSearchResults(results: ConfluenceSearchResult): string {
  if (results.pages.length === 0) {
    return `No Confluence pages found for "${results.query}"`;
  }

  const lines = results.pages.slice(0, 10).map((page) => {
    const link = `<${page.url}|${page.title}>`;
    const space = page.spaceName ? ` (${page.spaceName})` : '';
    return `• ${link}${space}\n  _${page.excerpt}_`;
  });

  return `*Confluence Search Results* (${results.pages.length} of ${results.totalMatches})\n\n${lines.join('\n\n')}`;
}
```

### src/tools/search/confluence-mcp.ts

```typescript
import type { RubeMcpClient } from '../mcp/client.js';
import { searchConfluence, formatConfluenceSearchResults } from './confluence.js';
import { logger } from '../../utils/logger.js';

/**
 * MCP Tool definition for Confluence search
 * Registered as: orion_search_confluence
 */
export const confluenceSearchToolDefinition = {
  name: 'orion_search_confluence',
  description: 'Search Confluence for documentation, wiki pages, and knowledge base content',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      spaceKeys: {
        type: 'array',
        items: { type: 'string' },
        description: 'Space keys to search in (e.g., ["ATF", "ENG"])',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 20)',
        default: 20,
      },
      modifiedAfter: {
        type: 'string',
        description: 'Only include pages modified after this date (YYYY-MM-DD)',
      },
    },
    required: ['query'],
  },
};

/**
 * Execute Confluence search tool
 */
export async function executeConfluenceSearchTool(
  mcpClient: RubeMcpClient,
  input: {
    query: string;
    spaceKeys?: string[];
    limit?: number;
    modifiedAfter?: string;
  }
): Promise<{
  success: boolean;
  data?: {
    pages: Array<{
      title: string;
      url: string;
      space: string;
      excerpt: string;
      score: number;
    }>;
    totalMatches: number;
    formatted: string;
  };
  error?: string;
}> {
  try {
    const results = await searchConfluence(mcpClient, input.query, {
      limit: input.limit,
      spaceKeys: input.spaceKeys,
      modifiedAfter: input.modifiedAfter,
    });

    return {
      success: true,
      data: {
        pages: results.pages.map((p) => ({
          title: p.title,
          url: p.url,
          space: p.spaceName,
          excerpt: p.excerpt,
          score: p.score,
        })),
        totalMatches: results.totalMatches,
        formatted: formatConfluenceSearchResults(results),
      },
    };
  } catch (error) {
    logger.error({
      event: 'confluence_search_tool_failed',
      query: input.query,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Confluence search failed',
    };
  }
}
```

### Environment Variables Required

```bash
# .env
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net/wiki
# Atlassian credentials managed via Rube MCP connection
```

### Update .orion/agents/search-agent.md

Add Confluence search capability:

```markdown
## Confluence Search Capability

When searching Confluence:
1. Use `orion_search_confluence` tool with relevant keywords
2. Specify space keys if query mentions specific teams/areas
3. Use CQL for advanced queries (e.g., modified dates)
4. Format sources as: [Source: confluence - Page Title](url)

Example:
- Query: "AI policy documentation in ATF space"
- Tool call: orion_search_confluence({ query: "AI policy", spaceKeys: ["ATF"] })
```

### File Structure After This Story

```
src/
├── tools/
│   └── search/
│       ├── slack.ts
│       ├── slack-mcp.ts
│       ├── confluence.ts           # NEW
│       ├── confluence.test.ts      # NEW
│       ├── confluence-mcp.ts       # NEW
│       └── confluence-mcp.test.ts  # NEW
```

### Dependencies on Prior Stories

| Story | Dependency | Usage |
|-------|------------|-------|
| 5-1 | Subagent Infrastructure | Subagent capability registration |
| 3-1 | MCP Client Infrastructure | RubeMcpClient for Atlassian tools |

### Test Specifications

```typescript
// src/tools/search/confluence.test.ts
describe('searchConfluence', () => {
  it('should return pages matching query', async () => {
    const mockClient = createMockRubeClient({
      results: [{ id: '123', title: 'Auth Guide', space: { key: 'ATF', name: 'AI Task Force' } }],
    });

    const results = await searchConfluence(mockClient, 'authentication');
    
    expect(results.pages).toHaveLength(1);
    expect(results.pages[0].title).toBe('Auth Guide');
  });

  it('should build correct CQL for space filter', async () => {
    const mockClient = createMockRubeClient({ results: [] });
    
    await searchConfluence(mockClient, 'test', { spaceKeys: ['ATF', 'ENG'] });
    
    expect(mockClient.lastCall.cql).toContain('space = "ATF"');
    expect(mockClient.lastCall.cql).toContain('space = "ENG"');
  });

  it('should include valid URLs', async () => {
    const mockClient = createMockRubeClient({
      results: [{ id: '123', title: 'Test', _links: { webui: '/pages/123' } }],
    });

    const results = await searchConfluence(mockClient, 'test');
    
    expect(results.pages[0].url).toMatch(/atlassian\.net/);
  });
});
```

### References

- [Source: _bmad-output/epics.md#Story 5.5: Confluence Search] — Original story
- [Source: _bmad-output/prd.md#FR12] — Confluence search requirement
- [Source: Rube MCP Tools] — Atlassian integration via Composio [[memory:306901]]
- [External: Confluence CQL Syntax](https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/)

### Previous Story Intelligence

From Story 5-4 (Slack History Search):
- Similar structure for search tool + MCP wrapper
- Same formatting pattern for Slack mrkdwn output

From Story 3-1 (MCP Client Infrastructure):
- `RubeMcpClient` available for tool calls
- Use `callTool()` method with tool name and args

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `src/tools/search/confluence.ts`
- `src/tools/search/confluence.test.ts`
- `src/tools/search/confluence-mcp.ts`
- `src/tools/search/confluence-mcp.test.ts`

Files to modify:
- `.orion/agents/search-agent.md` — Add Confluence capability
