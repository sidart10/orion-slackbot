# Story 2.1: Claude Agent SDK Integration

Status: ready-for-dev

## Story

As a **user**,
I want Orion to respond intelligently to my messages,
So that I get helpful answers powered by Claude.

## Acceptance Criteria

1. **Given** the Slack app is receiving messages, **When** a user sends a message to Orion, **Then** the message is passed to the Claude Agent SDK via `query()`

2. **Given** a message is being processed, **When** the agent is initialized, **Then** a system prompt is constructed from `.orion/agents/orion.md`

3. **Given** the agent generates a response, **When** the response is ready, **Then** the response is streamed back to Slack

4. **Given** the interaction completes, **When** tracing data is recorded, **Then** the full interaction (input, output, tokens) is traced in Langfuse

5. **Given** a simple query is received, **When** processing completes, **Then** response time is 1-3 seconds (NFR1)

## Tasks / Subtasks

- [ ] **Task 1: Create Agent Core Module** (AC: #1)
  - [ ] Create `src/agent/orion.ts` with `runOrionAgent()` function
  - [ ] Import `query` from `@anthropic-ai/claude-agent-sdk`
  - [ ] Configure `query()` with prompt and options
  - [ ] Return AsyncGenerator of agent messages
  - [ ] Handle streaming responses

- [ ] **Task 2: Create Agent Loader** (AC: #2)
  - [ ] Create `src/agent/loader.ts`
  - [ ] Implement `loadAgentPrompt()` to read `.orion/agents/orion.md`
  - [ ] Parse markdown frontmatter for agent configuration
  - [ ] Implement `constructSystemPrompt()` to build final prompt
  - [ ] Cache loaded agents in memory

- [ ] **Task 3: Create Orion Agent Definition** (AC: #2)
  - [ ] Create `.orion/agents/orion.md` agent persona file
  - [ ] Define agent name, description, capabilities
  - [ ] Include personality traits and response style guidelines
  - [ ] Add Slack formatting rules (mrkdwn, no blockquotes, no emojis)

- [ ] **Task 4: Create Tool Configuration** (AC: #1)
  - [ ] Create `src/agent/tools.ts`
  - [ ] Configure MCP servers (Rube/Composio placeholder)
  - [ ] Configure allowed tools list
  - [ ] Export `toolConfig` for use in `query()`

- [ ] **Task 5: Integrate with User Message Handler** (AC: #1, #3)
  - [ ] Update `src/slack/handlers/user-message.ts`
  - [ ] Replace placeholder response with `runOrionAgent()`
  - [ ] Stream agent response chunks to Slack
  - [ ] Format responses using Slack mrkdwn

- [ ] **Task 6: Add Langfuse Trace Integration** (AC: #4)
  - [ ] Fetch system prompt from Langfuse via `getPrompt()`
  - [ ] Link prompt to trace with `trace.update({ prompt })`
  - [ ] Create span for agent execution
  - [ ] Log token usage and response metrics

- [ ] **Task 7: Verification** (AC: all)
  - [ ] Send simple message to Orion
  - [ ] Verify response streams in real-time
  - [ ] Measure response time (target: 1-3 seconds)
  - [ ] Check Langfuse trace shows input, output, tokens
  - [ ] Verify system prompt loaded from `.orion/agents/orion.md`

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| NFR1 | prd.md | Response time 1-3s for simple queries |
| AR21-23 | architecture.md | Slack mrkdwn formatting, no blockquotes, no emojis |

### Claude Agent SDK `query()` Function

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
});

// Returns AsyncGenerator<SDKMessage, void>
for await (const message of response) {
  // Handle streaming messages
}
```

### Key Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `systemPrompt` | `string` | Custom system prompt for the agent |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP server configurations |
| `allowedTools` | `string[]` | List of allowed tool names |
| `settingSources` | `['user', 'project']` | Enable Skills from filesystem |
| `cwd` | `string` | Working directory for file access |
| `maxTurns` | `number` | Maximum conversation turns |
| `maxBudgetUsd` | `number` | Maximum budget in USD |

### src/agent/orion.ts

```typescript
import { query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { loadAgentPrompt } from './loader.js';
import { toolConfig } from './tools.js';
import { getPrompt } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';

export interface AgentContext {
  threadHistory: string[];
  userId: string;
  channelId: string;
  traceId?: string;
}

export interface AgentOptions {
  context: AgentContext;
  systemPromptOverride?: string;
}

/**
 * Run the Orion agent with a user message
 * 
 * @param userMessage - The user's message text
 * @param options - Agent context and configuration
 * @returns AsyncGenerator of agent response messages
 */
export async function* runOrionAgent(
  userMessage: string,
  options: AgentOptions
): AsyncGenerator<string, void> {
  const startTime = Date.now();
  
  // Load system prompt (Langfuse first, fallback to local)
  let systemPrompt: string;
  try {
    const promptObj = await getPrompt('orion-system-prompt');
    systemPrompt = promptObj.compile({
      threadHistory: options.context.threadHistory.join('\n'),
    });
  } catch (error) {
    logger.warn({
      event: 'langfuse_prompt_fallback',
      error: error instanceof Error ? error.message : String(error),
    });
    systemPrompt = await loadAgentPrompt('orion');
  }

  // Override if provided
  if (options.systemPromptOverride) {
    systemPrompt = options.systemPromptOverride;
  }

  logger.info({
    event: 'agent_start',
    userId: options.context.userId,
    promptLength: systemPrompt.length,
    traceId: options.context.traceId,
  });

  // Execute agent query
  const response = query({
    prompt: userMessage,
    options: {
      systemPrompt,
      mcpServers: toolConfig.mcpServers,
      settingSources: ['user', 'project'],  // Enable Skills
      allowedTools: toolConfig.allowedTools,
      cwd: process.cwd(),  // Enable file access for agentic search
    }
  });

  // Stream responses
  let tokenCount = 0;
  for await (const message of response) {
    if (message.type === 'text') {
      tokenCount += estimateTokens(message.content);
      yield message.content;
    }
  }

  const duration = Date.now() - startTime;
  logger.info({
    event: 'agent_complete',
    userId: options.context.userId,
    duration,
    tokenCount,
    traceId: options.context.traceId,
    nfr1Met: duration < 3000,  // NFR1: 1-3 seconds
  });
}

/**
 * Rough token estimate for logging
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### src/agent/loader.ts

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

// Cache loaded agents in memory
const agentCache = new Map<string, AgentDefinition>();

/**
 * Load agent prompt from .orion/agents/{name}.md
 */
export async function loadAgentPrompt(agentName: string): Promise<string> {
  const cached = agentCache.get(agentName);
  if (cached) {
    return cached.prompt;
  }

  const agentPath = join(process.cwd(), '.orion', 'agents', `${agentName}.md`);
  
  try {
    const content = await readFile(agentPath, 'utf-8');
    const agent = parseAgentFile(content);
    agentCache.set(agentName, agent);
    
    logger.info({
      event: 'agent_loaded',
      agentName,
      promptLength: agent.prompt.length,
    });
    
    return agent.prompt;
  } catch (error) {
    logger.error({
      event: 'agent_load_error',
      agentName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to load agent: ${agentName}`);
  }
}

/**
 * Parse agent markdown file
 * Supports frontmatter for metadata
 */
function parseAgentFile(content: string): AgentDefinition {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatter: Record<string, string> = {};
  let promptLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === '---') {
      if (!inFrontmatter && Object.keys(frontmatter).length === 0) {
        inFrontmatter = true;
        continue;
      }
      inFrontmatter = false;
      continue;
    }

    if (inFrontmatter) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        frontmatter[match[1]] = match[2].trim();
      }
    } else {
      promptLines.push(line);
    }
  }

  return {
    name: frontmatter.name || 'unknown',
    description: frontmatter.description || '',
    prompt: promptLines.join('\n').trim(),
    tools: frontmatter.tools?.split(',').map(t => t.trim()),
    model: frontmatter.model,
  };
}

/**
 * Load all agents from .orion/agents/
 */
export async function loadOrionAgents(): Promise<Record<string, AgentDefinition>> {
  // Implementation for bulk loading (used for subagents)
  // Returns agents keyed by name for Claude SDK agents option
  return {};
}

/**
 * Clear agent cache (useful for development)
 */
export function clearAgentCache(): void {
  agentCache.clear();
}
```

### src/agent/tools.ts

```typescript
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

export interface ToolConfig {
  mcpServers: Record<string, McpServerConfig>;
  allowedTools: string[];
}

/**
 * Tool configuration for Orion agent
 * 
 * MCP servers are lazily initialized by the Claude SDK
 * Tools are discovered at runtime via MCP protocol
 */
export const toolConfig: ToolConfig = {
  mcpServers: {
    // Rube (Composio) for 500+ app integrations
    // TODO: Enable in Story 3.1 (MCP Client Infrastructure)
    // rube: {
    //   command: 'npx',
    //   args: ['-y', '@composio/mcp', 'start']
    // },
  },

  // Allowed tools for agent
  // Start minimal, expand as needed
  allowedTools: [
    'Read',      // Read files
    'Write',     // Write files
    'Bash',      // Execute commands
    // 'mcp',    // MCP tools (enabled in Story 3.1)
    // 'Skill',  // Skills (enabled in Story 7.1)
  ],
};

/**
 * Get MCP server configuration by name
 */
export function getMcpServer(name: string): McpServerConfig | undefined {
  return toolConfig.mcpServers[name];
}

/**
 * Check if a tool is allowed
 */
export function isToolAllowed(toolName: string): boolean {
  return toolConfig.allowedTools.includes(toolName);
}
```

### .orion/agents/orion.md

```markdown
---
name: orion
description: Orion is an agentic AI assistant for SambaTV employees
model: claude-sonnet-4-20250514
tools: Read,Write,Bash
---

# Orion

You are Orion, an AI assistant for SambaTV employees. You help with research, analysis, documentation, and answering questions about company processes and policies.

## Core Capabilities

- Deep research across multiple sources (Slack, Confluence, web)
- Prospect research and company dossiers
- Audience targeting recommendations using SambaTV data
- Document summarization and Q&A
- Thread summarization for Slack conversations
- Code generation and data analysis

## Response Guidelines

### Formatting (CRITICAL)

You are responding in Slack. Use Slack mrkdwn formatting:

- Use `*bold*` for emphasis (NOT `**bold**`)
- Use `_italic_` for secondary emphasis (NOT `*italic*`)
- Use `~strikethrough~` for corrections
- Use backticks for `inline code`
- Use triple backticks for code blocks
- Use bullet points for lists (NOT blockquotes)

**NEVER use:**
- Blockquotes (> at start of line)
- Emojis (unless the user explicitly asks for them)
- Markdown-style bold (`**text**`)

### Style

- Be concise and direct
- Lead with the answer, then provide context
- Use structured lists for complex information
- Include source links when citing information
- Ask clarifying questions when the request is ambiguous

### Verification

Before providing information:
1. Gather context from available sources
2. Verify facts when possible
3. Cite sources for claims
4. Acknowledge uncertainty when appropriate

## Context

You have access to:
- Thread history from the current conversation
- Files in the `orion-context/` directory
- MCP tools for external integrations
- Skills and Commands for specialized tasks
```

### Updated src/slack/handlers/user-message.ts

```typescript
import type { AssistantUserMessageMiddlewareArgs } from '@slack/bolt';
import { startActiveObservation, createSpan } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { createStreamer } from '../../utils/streaming.js';
import { formatSlackMrkdwn } from '../../utils/formatting.js';
import { fetchThreadHistory } from '../thread-context.js';
import { runOrionAgent } from '../../agent/orion.js';

type UserMessageArgs = AssistantUserMessageMiddlewareArgs;

/**
 * Handle user messages in assistant threads
 */
export async function handleUserMessage({
  message,
  setTitle,
  setStatus,
  getThreadContext,
  client,
  context,
}: UserMessageArgs): Promise<void> {
  if (!('text' in message) || !message.text) {
    return;
  }

  const messageText = message.text;
  const threadTs = 'thread_ts' in message ? message.thread_ts : message.ts;
  const messageReceiptTime = Date.now();

  await startActiveObservation(
    {
      name: 'user-message-handler',
      userId: context.userId,
      sessionId: threadTs,
      input: { text: messageText },
      metadata: {
        teamId: context.teamId,
        channelId: message.channel,
      },
    },
    async (trace) => {
      await setTitle(messageText.slice(0, 50));
      await setStatus({ status: 'is thinking...' });

      // Initialize streamer within 500ms (NFR4)
      const streamer = createStreamer({
        client,
        channel: message.channel,
        threadTs: threadTs!,
        userId: context.userId!,
        teamId: context.teamId!,
      });

      await streamer.start();
      const timeToStreamStart = Date.now() - messageReceiptTime;

      // Create agent execution span
      const agentSpan = createSpan(trace, {
        name: 'orion-agent-execution',
        input: { messageText },
        metadata: { timeToStreamStart },
      });

      try {
        // Fetch thread context
        const threadHistory = await fetchThreadHistory({
          client,
          channel: message.channel,
          threadTs: threadTs!,
          limit: 20,
        });

        // Run Orion agent
        const agentResponse = runOrionAgent(messageText, {
          context: {
            threadHistory: threadHistory.map(m => `${m.user}: ${m.text}`),
            userId: context.userId!,
            channelId: message.channel,
            traceId: trace.id,
          },
        });

        // Stream formatted response
        let fullResponse = '';
        for await (const chunk of agentResponse) {
          const formattedChunk = formatSlackMrkdwn(chunk);
          await streamer.append(formattedChunk);
          fullResponse += formattedChunk;
        }

        const metrics = await streamer.stop();

        agentSpan.end({
          output: {
            response: fullResponse,
            metrics,
          },
        });

        const totalDuration = Date.now() - messageReceiptTime;
        trace.update({
          output: {
            response: fullResponse,
            streamDuration: metrics.totalDuration,
            totalDuration,
            nfr1Met: totalDuration < 3000,
          },
        });

        logger.info({
          event: 'message_handled',
          userId: context.userId,
          totalDuration,
          responseLength: fullResponse.length,
          traceId: trace.id,
        });

      } catch (error) {
        await streamer.stop().catch(() => {});
        agentSpan.end({
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }

      return { success: true };
    }
  );
}
```

### File Structure After This Story

```
orion-slack-agent/
├── src/
│   ├── agent/
│   │   ├── orion.ts                # Claude Agent SDK integration
│   │   ├── loader.ts               # BMAD-style agent loader
│   │   └── tools.ts                # Tool/MCP configurations
│   ├── slack/
│   │   └── handlers/
│   │       └── user-message.ts     # Updated with agent integration
│   └── ...
├── .orion/
│   ├── config.yaml                 # Agent configuration
│   └── agents/
│       └── orion.md                # Primary agent persona
└── ...
```

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Response time (simple) | 1-3 seconds (NFR1) | Total trace duration |
| Time to first token | < 500ms (NFR4) | Stream start time |
| Token estimation | Logged per request | `estimateTokens()` |

### References

- [Source: _bmad-output/epics.md#Story 2.1: Claude Agent SDK Integration] — Original story definition
- [Source: _bmad-output/architecture.md#Agent Layer] — Agent architecture
- [Source: technical-research#2.2 Core API: query() Function] — SDK API reference
- [Source: technical-research#2.3 Key Configuration Options] — Configuration options
- [External: Claude Agent SDK Documentation](https://code.claude.com/docs/en/sdk/sdk-typescript)

### Previous Story Intelligence

From Story 1-2 (Langfuse):
- `getPrompt()` available for fetching system prompts
- `startActiveObservation()` wraps all handlers
- `createSpan()` for nested spans

From Story 1-5 (Response Streaming):
- `createStreamer()` and `SlackStreamer` available
- `formatSlackMrkdwn()` for response formatting
- Streaming must start within 500ms (NFR4)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- The Claude Agent SDK may have slightly different API than documented — verify against latest SDK version
- MCP servers are disabled initially — enabled in Story 3.1
- Skills are disabled initially — enabled in Story 7.1
- Langfuse prompt fetching has a fallback to local file
- Token counting is rough estimate — actual counts come from API response

### File List

Files to create:
- `src/agent/orion.ts`
- `src/agent/loader.ts`
- `src/agent/tools.ts`
- `.orion/agents/orion.md`

Files to modify:
- `src/slack/handlers/user-message.ts` (integrate agent)

