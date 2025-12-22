# Story 5-search: Search Integrations (Slack, Confluence, Web)

Status: ready-for-dev

## Consolidated From

This story consolidates the following stories into a single cohesive implementation:

| Original Story | Title | Reason for Merge |
|---------------|-------|------------------|
| 5-4 | Slack History Search | Search integration |
| 5-5 | Confluence Search | Search integration |
| 5-6 | Web Search Integration | Search integration |

**Merge Date**: 2025-12-21
**See**: sprint-change-proposal-sdk-alignment-2025-12-21.md

## Story

As a **user**,
I want Orion to search across Slack, Confluence, and the web,
So that I can find relevant information from multiple sources in one interaction.

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 3-1 MCP Client Infrastructure | ✅ done | MCP server configuration |
| 2-1 Claude Agent SDK Integration | ✅ done | Agent query capabilities |
| 1-3 Slack Bolt App Setup | ✅ done | Slack WebClient for API calls |
| 1-2 Langfuse Instrumentation | ✅ done | Tracing for search operations |

## Acceptance Criteria

### Slack Search (from 5-4)

1. **Given** a research request mentions internal discussions, **When** the agent searches for information, **Then** it can search recent Slack history (FR11)

2. **Given** Slack search executes, **When** results are found, **Then** results include message permalinks for context

3. **Given** Slack results exist, **When** they are returned, **Then** results are filtered for relevance and formatted for Slack mrkdwn

### Confluence Search (from 5-5)

4. **Given** a research request mentions documentation, **When** the agent searches, **Then** it can search Confluence pages and spaces

5. **Given** Confluence search executes, **When** results are found, **Then** results include page links and relevant excerpts

6. **Given** Confluence is configured, **When** search is available, **Then** the MCP tool is registered and functional

### Web Search (from 5-6)

7. **Given** a research request needs external information, **When** internal sources lack data, **Then** web search can find current information

8. **Given** web search executes, **When** results are returned, **Then** results include source URLs and summaries

9. **Given** web search is configured, **When** search is available, **Then** the MCP tool is registered and functional

### Cross-Cutting

10. **Given** any search is performed, **When** results are returned, **Then** source attribution is included (e.g., `[Source: slack - #channel]`)

11. **Given** any search fails, **When** errors occur, **Then** graceful degradation with useful error messages

## Tasks / Subtasks

### Slack Search

- [ ] **Task 1: Create Slack Search Module** (AC: #1, #2, #3)
  - [ ] Create `src/tools/search/slack.ts`
  - [ ] Implement `searchSlackMessages(query, options)` function
  - [ ] Use Slack `search.messages` API
  - [ ] Handle pagination and rate limits
  - [ ] Generate message permalinks

- [ ] **Task 2: Create Slack Search MCP Tool** (AC: #10)
  - [ ] Create `src/tools/search/slack-mcp.ts`
  - [ ] Register as MCP tool: `orion_search_slack`
  - [ ] Define input schema (query, count, sort, afterDate)
  - [ ] Format results with source attribution

### Confluence Search

- [ ] **Task 3: Configure Confluence MCP Server** (AC: #4, #6)
  - [ ] Add Confluence MCP server to `.orion/config.yaml`
  - [ ] Configure authentication (API token)
  - [ ] Verify connection and tool discovery

- [ ] **Task 4: Create Confluence Search Wrapper** (AC: #5)
  - [ ] Create `src/tools/search/confluence.ts`
  - [ ] Wrap Confluence MCP search tool
  - [ ] Extract page links and excerpts
  - [ ] Format for Slack display

### Web Search

- [ ] **Task 5: Configure Web Search MCP Server** (AC: #7, #9)
  - [ ] Add web search MCP server to `.orion/config.yaml`
  - [ ] Configure API key (Brave, Tavily, or similar)
  - [ ] Verify connection and tool discovery

- [ ] **Task 6: Create Web Search Wrapper** (AC: #8)
  - [ ] Create `src/tools/search/web.ts`
  - [ ] Wrap web search MCP tool
  - [ ] Extract URLs and summaries
  - [ ] Format for Slack display

### Integration

- [ ] **Task 7: Unified Search Result Format** (AC: #10)
  - [ ] Create `src/tools/search/types.ts`
  - [ ] Define `SearchResult` interface
  - [ ] Implement `formatSearchSource()` for consistent attribution
  - [ ] Support all three search types

- [ ] **Task 8: Error Handling** (AC: #11)
  - [ ] Implement graceful degradation per search type
  - [ ] Log errors to Langfuse
  - [ ] Return partial results when some sources fail

- [ ] **Task 9: Verification Tests** (AC: all)
  - [ ] Test Slack search with mock client
  - [ ] Test Confluence search via MCP
  - [ ] Test web search via MCP
  - [ ] Test error handling scenarios

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR11 | prd.md | Search recent Slack history |
| FR12 | prd.md | Search Confluence documentation |
| FR13 | prd.md | Web search for external info |
| AR21-23 | architecture.md | Slack mrkdwn formatting |
| NFR19 | prd.md | 30 second timeout per tool call |

### Slack Search Implementation

```typescript
export interface SlackSearchResult {
  messages: Array<{
    text: string;
    username: string;
    channelName: string;
    permalink: string;
    score: number;
  }>;
  totalMatches: number;
  query: string;
}

export async function searchSlackMessages(
  client: WebClient,
  query: string,
  options: { count?: number; sort?: 'score' | 'timestamp'; afterDate?: string }
): Promise<SlackSearchResult>;
```

### Unified Search Result Interface

```typescript
export interface SearchResult {
  source: 'slack' | 'confluence' | 'web';
  title: string;
  snippet: string;
  url: string;
  relevanceScore?: number;
  metadata?: Record<string, unknown>;
}

export function formatSearchSource(result: SearchResult): string {
  switch (result.source) {
    case 'slack':
      return `[Source: slack - ${result.title}](${result.url})`;
    case 'confluence':
      return `[Source: confluence - ${result.title}](${result.url})`;
    case 'web':
      return `[Source: web - ${result.title}](${result.url})`;
  }
}
```

### MCP Server Configuration

```yaml
# .orion/config.yaml
mcp_servers:
  confluence:
    type: stdio
    command: npx
    args: ["@anthropic/mcp-server-confluence"]
    env:
      CONFLUENCE_URL: ${CONFLUENCE_URL}
      CONFLUENCE_TOKEN: ${CONFLUENCE_TOKEN}
  
  web_search:
    type: stdio
    command: npx
    args: ["@anthropic/mcp-server-brave-search"]
    env:
      BRAVE_API_KEY: ${BRAVE_API_KEY}
```

### File List

Files to create:
- `src/tools/search/types.ts`
- `src/tools/search/slack.ts`
- `src/tools/search/slack.test.ts`
- `src/tools/search/slack-mcp.ts`
- `src/tools/search/confluence.ts`
- `src/tools/search/confluence.test.ts`
- `src/tools/search/web.ts`
- `src/tools/search/web.test.ts`

Files to modify:
- `.orion/config.yaml` (add MCP servers)

### References

- [Source: _bmad-output/epics.md#Epic 5] — Original epic
- [Source: _bmad-output/prd.md#FR11-13] — Search requirements
- [Source: sprint-change-proposal-sdk-alignment-2025-12-21.md] — Merge rationale
- [External: Slack search.messages API](https://api.slack.com/methods/search.messages)
- [External: Atlassian Confluence MCP](https://github.com/anthropics/mcp-servers)
- [External: Brave Search MCP](https://github.com/anthropics/mcp-servers)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Consolidates 3 search integrations into unified story
- Slack search uses native API; Confluence and Web use MCP servers
- All results use consistent `SearchResult` format with source attribution
- Error handling allows partial results if one source fails

### File List

Files to create:
- `src/tools/search/types.ts`
- `src/tools/search/slack.ts`
- `src/tools/search/slack.test.ts`
- `src/tools/search/slack-mcp.ts`
- `src/tools/search/confluence.ts`
- `src/tools/search/confluence.test.ts`
- `src/tools/search/web.ts`
- `src/tools/search/web.test.ts`

Files to modify:
- `.orion/config.yaml`

