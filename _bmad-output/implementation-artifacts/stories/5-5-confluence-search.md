# Story 5.5: Confluence Search

Status: ready-for-dev

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
  - [ ] Use Confluence REST API or MCP
  - [ ] Handle CQL queries

- [ ] **Task 2: Respect User Access** (AC: #2)
  - [ ] Use Atlassian MCP
  - [ ] Filter by space permissions
  - [ ] Handle auth

- [ ] **Task 3: Include Page Links** (AC: #3)
  - [ ] Construct page URL
  - [ ] Format for Slack
  - [ ] Include excerpt

- [ ] **Task 4: Filter for Relevance** (AC: #4)
  - [ ] Score by relevance
  - [ ] Limit results
  - [ ] Prioritize recent

- [ ] **Task 5: Expose as Subagent** (AC: #5)
  - [ ] Add to search-agent
  - [ ] Test integration

## Dev Notes

### Confluence Search via Rube/MCP

```typescript
// Use Atlassian MCP via Rube
const results = await mcpClient.callTool('atlassian_confluence_search', {
  query: searchQuery,
  space: 'ATF',
  limit: 10,
});
```

### File List

Files to create:
- `src/tools/search/confluence.ts`

