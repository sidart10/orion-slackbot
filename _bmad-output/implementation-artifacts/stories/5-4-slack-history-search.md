# Story 5.4: Slack History Search

Status: ready-for-dev

## Story

As a **user**,
I want Orion to search Slack for relevant discussions,
So that I can find information from past conversations.

## Acceptance Criteria

1. **Given** a research request mentions internal discussions, **When** the agent searches for information, **Then** it can search recent Slack history (FR11)
2. **Given** search executes, **When** channels are accessed, **Then** search includes channels the user has access to
3. **Given** results are found, **When** they are returned, **Then** results include message links for context
4. **Given** many results exist, **When** they are processed, **Then** search results are filtered for relevance
5. **Given** the search capability exists, **When** subagents need it, **Then** Slack search is available as a subagent capability

## Tasks / Subtasks

- [ ] **Task 1: Create Slack Search Module** (AC: #1)
  - [ ] Create `src/tools/search/slack.ts`
  - [ ] Use conversations.search API
  - [ ] Handle pagination

- [ ] **Task 2: Respect User Access** (AC: #2)
  - [ ] Query as user context
  - [ ] Filter accessible channels
  - [ ] Handle permissions

- [ ] **Task 3: Include Message Links** (AC: #3)
  - [ ] Construct permalink
  - [ ] Format for Slack
  - [ ] Include context

- [ ] **Task 4: Filter for Relevance** (AC: #4)
  - [ ] Score by relevance
  - [ ] Limit results
  - [ ] Remove duplicates

- [ ] **Task 5: Expose as Subagent** (AC: #5)
  - [ ] Create search-agent.md
  - [ ] Include Slack capability
  - [ ] Test integration

## Dev Notes

### Slack Search API

```typescript
async function searchSlack(
  query: string,
  options: SlackSearchOptions
): Promise<SlackSearchResult[]> {
  const result = await client.search.messages({
    query,
    sort: 'score',
    count: 20,
  });
  
  return result.messages.matches.map(m => ({
    text: m.text,
    user: m.user,
    channel: m.channel.name,
    permalink: m.permalink,
    score: m.score,
  }));
}
```

### File List

Files to create:
- `src/tools/search/slack.ts`

