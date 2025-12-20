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
  - [ ] Implement `searchSlackMessages(query, options)` function
  - [ ] Use Slack `search.messages` API
  - [ ] Handle pagination with `cursor` for large result sets
  - [ ] Configure sensible defaults (count: 20, sort: score)

- [ ] **Task 2: Implement User Access Filtering** (AC: #2)
  - [ ] Execute search in user's context (use their token if available)
  - [ ] Filter results to accessible channels only
  - [ ] Handle permission errors gracefully
  - [ ] Log access filtering for debugging

- [ ] **Task 3: Generate Message Permalinks** (AC: #3)
  - [ ] Use `chat.getPermalink` API or construct from channel/ts
  - [ ] Format links for Slack mrkdwn: `<url|title>`
  - [ ] Include channel name and timestamp in link text
  - [ ] Handle DM vs channel permalink formats

- [ ] **Task 4: Implement Relevance Filtering** (AC: #4)
  - [ ] Score results by Slack API `score` field
  - [ ] Filter out low-relevance matches (score < threshold)
  - [ ] Limit results to top N (default: 10)
  - [ ] Remove duplicate messages from same thread

- [ ] **Task 5: Create MCP Tool Wrapper** (AC: #5)
  - [ ] Create `src/tools/search/slack-mcp.ts`
  - [ ] Register as MCP tool: `orion_search_slack`
  - [ ] Define input schema (query, options)
  - [ ] Return structured results for subagent consumption

- [ ] **Task 6: Verification Tests** (AC: all)
  - [ ] Test: Search returns messages matching query
  - [ ] Test: Results include valid permalinks
  - [ ] Test: Low-relevance results filtered out
  - [ ] Test: MCP tool wrapper works correctly

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR11 | prd.md | System can search recent Slack history for relevant discussions |
| AR21-23 | architecture.md | Slack mrkdwn formatting for links |
| NFR19 | prd.md | 30 second timeout per tool call |

### Slack API Requirements

**Required Scopes:**
- `search:read` — Search messages in workspace
- `channels:history` — Read channel messages (for context)
- `groups:history` — Read private channel messages
- `im:history` — Read DM messages

**Rate Limits:**
- Tier 2: ~20 requests per minute
- Implement exponential backoff on 429 responses

### src/tools/search/slack.ts

```typescript
import type { WebClient } from '@slack/web-api';
import { logger } from '../../utils/logger.js';

export interface SlackSearchOptions {
  /** Maximum results to return (default: 20) */
  count?: number;
  /** Sort order: 'score' (relevance) or 'timestamp' (recent) */
  sort?: 'score' | 'timestamp';
  /** Sort direction */
  sortDir?: 'asc' | 'desc';
  /** Filter by channel IDs */
  channelIds?: string[];
  /** Filter by user IDs */
  fromUsers?: string[];
  /** Search only in specific date range */
  afterDate?: string; // YYYY-MM-DD
  beforeDate?: string; // YYYY-MM-DD
  /** Minimum relevance score (0-1) */
  minScore?: number;
}

export interface SlackSearchResult {
  messages: SlackMessageResult[];
  totalMatches: number;
  hasMore: boolean;
  query: string;
}

export interface SlackMessageResult {
  /** Message text content */
  text: string;
  /** User ID who sent the message */
  userId: string;
  /** Username (display name) */
  username: string;
  /** Channel ID */
  channelId: string;
  /** Channel name */
  channelName: string;
  /** Message timestamp */
  timestamp: string;
  /** Slack permalink to message */
  permalink: string;
  /** Relevance score from Slack (0-1) */
  score: number;
  /** Whether this is part of a thread */
  isThreadReply: boolean;
  /** Thread parent timestamp if reply */
  threadTs?: string;
}

const DEFAULT_COUNT = 20;
const DEFAULT_MIN_SCORE = 0.1;

/**
 * Search Slack messages for relevant discussions
 * 
 * Uses Slack's search.messages API with relevance scoring.
 * Results are filtered by access permissions automatically by Slack.
 * 
 * @param client - Slack WebClient instance
 * @param query - Search query string
 * @param options - Search options
 */
export async function searchSlackMessages(
  client: WebClient,
  query: string,
  options: SlackSearchOptions = {}
): Promise<SlackSearchResult> {
  const {
    count = DEFAULT_COUNT,
    sort = 'score',
    sortDir = 'desc',
    channelIds,
    fromUsers,
    afterDate,
    beforeDate,
    minScore = DEFAULT_MIN_SCORE,
  } = options;

  // Build search query with filters
  let searchQuery = query;
  
  if (channelIds?.length) {
    searchQuery += ` in:${channelIds.join(' in:')}`;
  }
  if (fromUsers?.length) {
    searchQuery += ` from:${fromUsers.join(' from:')}`;
  }
  if (afterDate) {
    searchQuery += ` after:${afterDate}`;
  }
  if (beforeDate) {
    searchQuery += ` before:${beforeDate}`;
  }

  logger.info({
    event: 'slack_search_started',
    query: searchQuery,
    count,
    sort,
  });

  try {
    const response = await client.search.messages({
      query: searchQuery,
      count,
      sort,
      sort_dir: sortDir,
    });

    if (!response.ok || !response.messages) {
      throw new Error(`Slack search failed: ${response.error || 'Unknown error'}`);
    }

    const matches = response.messages.matches || [];
    const totalMatches = response.messages.total || 0;

    // Transform and filter results
    const messages: SlackMessageResult[] = [];

    for (const match of matches) {
      // Extract score (Slack doesn't provide it directly, estimate from position)
      const estimatedScore = 1 - (matches.indexOf(match) / matches.length);
      
      if (estimatedScore < minScore) continue;

      // Get permalink
      const permalink = await getMessagePermalink(client, match.channel?.id || '', match.ts || '');

      messages.push({
        text: match.text || '',
        userId: match.user || '',
        username: match.username || 'Unknown',
        channelId: match.channel?.id || '',
        channelName: match.channel?.name || 'Unknown',
        timestamp: match.ts || '',
        permalink,
        score: estimatedScore,
        isThreadReply: !!match.thread_ts && match.thread_ts !== match.ts,
        threadTs: match.thread_ts,
      });
    }

    // Remove duplicate thread messages (keep highest scored)
    const dedupedMessages = deduplicateThreadMessages(messages);

    logger.info({
      event: 'slack_search_completed',
      query,
      totalMatches,
      returnedCount: dedupedMessages.length,
      filteredCount: matches.length - dedupedMessages.length,
    });

    return {
      messages: dedupedMessages,
      totalMatches,
      hasMore: totalMatches > count,
      query,
    };

  } catch (error) {
    logger.error({
      event: 'slack_search_failed',
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get permalink for a message
 */
async function getMessagePermalink(
  client: WebClient,
  channelId: string,
  messageTs: string
): Promise<string> {
  try {
    const response = await client.chat.getPermalink({
      channel: channelId,
      message_ts: messageTs,
    });
    return response.permalink || '';
  } catch {
    // Fallback: construct permalink manually
    return `https://slack.com/archives/${channelId}/p${messageTs.replace('.', '')}`;
  }
}

/**
 * Remove duplicate messages from same thread (keep highest scored)
 */
function deduplicateThreadMessages(messages: SlackMessageResult[]): SlackMessageResult[] {
  const threadMap = new Map<string, SlackMessageResult>();
  const standaloneMessages: SlackMessageResult[] = [];

  for (const msg of messages) {
    const threadKey = msg.threadTs || msg.timestamp;
    
    if (msg.isThreadReply) {
      const existing = threadMap.get(threadKey);
      if (!existing || msg.score > existing.score) {
        threadMap.set(threadKey, msg);
      }
    } else {
      standaloneMessages.push(msg);
    }
  }

  return [...standaloneMessages, ...threadMap.values()]
    .sort((a, b) => b.score - a.score);
}

/**
 * Format search results for Slack mrkdwn display
 */
export function formatSlackSearchResults(results: SlackSearchResult): string {
  if (results.messages.length === 0) {
    return `No Slack messages found for "${results.query}"`;
  }

  const lines = results.messages.slice(0, 10).map((msg) => {
    const preview = msg.text.slice(0, 100) + (msg.text.length > 100 ? '...' : '');
    const link = `<${msg.permalink}|#${msg.channelName}>`;
    return `• ${link}: ${preview}`;
  });

  return `*Slack Search Results* (${results.messages.length} of ${results.totalMatches})\n\n${lines.join('\n')}`;
}
```

### src/tools/search/slack-mcp.ts

```typescript
import type { WebClient } from '@slack/web-api';
import { searchSlackMessages, formatSlackSearchResults } from './slack.js';
import { logger } from '../../utils/logger.js';

/**
 * MCP Tool definition for Slack search
 * Registered as: orion_search_slack
 */
export const slackSearchToolDefinition = {
  name: 'orion_search_slack',
  description: 'Search Slack messages for relevant discussions and information',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      count: {
        type: 'number',
        description: 'Maximum results to return (default: 20)',
        default: 20,
      },
      sort: {
        type: 'string',
        enum: ['score', 'timestamp'],
        description: 'Sort by relevance or recency',
        default: 'score',
      },
      afterDate: {
        type: 'string',
        description: 'Filter messages after this date (YYYY-MM-DD)',
      },
    },
    required: ['query'],
  },
};

/**
 * Execute Slack search tool
 */
export async function executeSlackSearchTool(
  client: WebClient,
  input: {
    query: string;
    count?: number;
    sort?: 'score' | 'timestamp';
    afterDate?: string;
  }
): Promise<{
  success: boolean;
  data?: {
    messages: Array<{
      text: string;
      channel: string;
      permalink: string;
      username: string;
      score: number;
    }>;
    totalMatches: number;
    formatted: string;
  };
  error?: string;
}> {
  try {
    const results = await searchSlackMessages(client, input.query, {
      count: input.count,
      sort: input.sort,
      afterDate: input.afterDate,
    });

    return {
      success: true,
      data: {
        messages: results.messages.map((m) => ({
          text: m.text,
          channel: m.channelName,
          permalink: m.permalink,
          username: m.username,
          score: m.score,
        })),
        totalMatches: results.totalMatches,
        formatted: formatSlackSearchResults(results),
      },
    };
  } catch (error) {
    logger.error({
      event: 'slack_search_tool_failed',
      query: input.query,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Slack search failed',
    };
  }
}
```

### Update .orion/agents/search-agent.md

Add Slack search capability to the search agent:

```markdown
## Slack Search Capability

When searching Slack:
1. Use `orion_search_slack` tool with relevant keywords
2. Filter by date if query mentions timeframe
3. Always include permalinks in results
4. Format sources as: [Source: slack - #channel-name](permalink)

Example:
- Query: "authentication discussions last month"
- Tool call: orion_search_slack({ query: "authentication", afterDate: "2025-11-17" })
```

### File Structure After This Story

```
src/
├── tools/
│   └── search/
│       ├── slack.ts              # NEW
│       ├── slack.test.ts         # NEW
│       ├── slack-mcp.ts          # NEW
│       └── slack-mcp.test.ts     # NEW
```

### Dependencies on Prior Stories

| Story | Dependency | Usage |
|-------|------------|-------|
| 5-1 | Subagent Infrastructure | Subagent capability registration |
| 1-3 | Slack Bolt App | WebClient for API calls |

### Test Specifications

```typescript
// src/tools/search/slack.test.ts
describe('searchSlackMessages', () => {
  it('should return messages matching query', async () => {
    const mockClient = createMockClient([
      { text: 'Auth discussion', channel: { name: 'engineering' } },
    ]);

    const results = await searchSlackMessages(mockClient, 'auth');
    
    expect(results.messages).toHaveLength(1);
    expect(results.messages[0].text).toContain('Auth');
  });

  it('should include valid permalinks', async () => {
    const mockClient = createMockClient([
      { text: 'Test', channel: { id: 'C123', name: 'test' }, ts: '123.456' },
    ]);

    const results = await searchSlackMessages(mockClient, 'test');
    
    expect(results.messages[0].permalink).toMatch(/slack\.com/);
  });

  it('should filter low-relevance results', async () => {
    const mockClient = createMockClient([
      { text: 'Relevant', channel: { name: 'eng' } },
      { text: 'Barely related', channel: { name: 'random' } },
    ]);

    const results = await searchSlackMessages(mockClient, 'relevant', {
      minScore: 0.8,
    });
    
    expect(results.messages.length).toBeLessThanOrEqual(1);
  });
});
```

### References

- [Source: _bmad-output/epics.md#Story 5.4: Slack History Search] — Original story
- [Source: _bmad-output/prd.md#FR11] — Slack history search requirement
- [Source: _bmad-output/architecture.md#Slack Response Formatting] — AR21-23 mrkdwn
- [External: Slack search.messages API](https://api.slack.com/methods/search.messages)
- [External: Slack chat.getPermalink API](https://api.slack.com/methods/chat.getPermalink)

### Previous Story Intelligence

From Story 1-3 (Slack Bolt App Setup):
- WebClient available from Bolt app instance
- Use `client` passed to handlers

From Story 5-1 (Subagent Infrastructure):
- Register as capability in search-agent.md
- Use structured output format

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to create:
- `src/tools/search/slack.ts`
- `src/tools/search/slack.test.ts`
- `src/tools/search/slack-mcp.ts`
- `src/tools/search/slack-mcp.test.ts`

Files to modify:
- `.orion/agents/search-agent.md` — Add Slack capability
