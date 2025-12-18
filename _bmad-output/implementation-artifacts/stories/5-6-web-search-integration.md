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

- [ ] **Task 1: Integrate Web Search** (AC: #1)
  - [ ] Create `src/tools/search/web.ts`
  - [ ] Use Rube/Composio web search
  - [ ] Or integrate Exa/Tavily

- [ ] **Task 2: Include Source URLs** (AC: #2)
  - [ ] Extract URLs from results
  - [ ] Format for Slack links
  - [ ] Include page titles

- [ ] **Task 3: Filter for Credibility** (AC: #3)
  - [ ] Score sources
  - [ ] Prefer authoritative
  - [ ] Flag uncertain sources

- [ ] **Task 4: Expose as Subagent** (AC: #4)
  - [ ] Add to search-agent
  - [ ] Test integration

- [ ] **Task 5: Multi-Source Support** (AC: #5)
  - [ ] Combine with Slack/Confluence
  - [ ] Synthesize results

## Dev Notes

### Web Search via Rube

```typescript
// Use Rube's web search capabilities
const results = await mcpClient.callTool('RUBE_SEARCH_TOOLS', {
  query: 'web search',
});
```

### File List

Files to create:
- `src/tools/search/web.ts`

