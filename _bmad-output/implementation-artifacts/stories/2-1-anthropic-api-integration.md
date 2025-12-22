# Story 2.1: Anthropic API Integration

Status: ready-for-dev

## Story

As a **user**,
I want Orion to respond intelligently to my messages,
So that I get helpful answers powered by Claude.

## Acceptance Criteria

1. **Given** the Slack app is receiving messages, **When** a user sends a message to Orion, **Then** the message is passed to Anthropic API via `messages.create()` with streaming

2. **Given** a message is being processed, **When** the agent is initialized, **Then** a system prompt is constructed from `.orion/agents/orion.md`

3. **Given** the agent generates a response, **When** the response is ready, **Then** the response is streamed back to Slack

4. **Given** the interaction completes, **When** tracing data is recorded, **Then** the full interaction (input, output, tokens) is traced in Langfuse

5. **Given** a simple query is received, **When** processing completes, **Then** response time is 1-3 seconds (NFR1)

## Tasks / Subtasks

- [ ] **Task 1: Create Agent Core Module** (AC: #1)
  - [ ] Create `src/agent/orion.ts` with `runOrionAgent()` function
  - [ ] Import `Anthropic` from `@anthropic-ai/sdk`
  - [ ] Configure `messages.create()` with streaming
  - [ ] Return AsyncGenerator of agent messages
  - [ ] Handle streaming responses with tool_use support

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
  - [ ] Define MCP tool schemas for Anthropic tool format
  - [ ] Configure Rube MCP server connection
  - [ ] Export tool definitions for `messages.create()`

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

### Anthropic API `messages.create()` with Streaming

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const stream = await anthropic.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  system: systemPrompt,
  messages: [...threadHistory, { role: 'user', content: userMessage }],
  tools: mcpToolDefinitions,  // Optional: MCP tools as Claude tool format
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    yield event.delta.text;
  }
}
```

### Key Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `model` | `string` | Model ID (e.g., 'claude-sonnet-4-20250514') |
| `system` | `string` | System prompt for the agent |
| `messages` | `Message[]` | Conversation history including current message |
| `tools` | `Tool[]` | Tool definitions for Claude to use |
| `max_tokens` | `number` | Maximum tokens in response |
| `stream` | `boolean` | Enable streaming (use `.stream()` helper) |

### src/agent/orion.ts

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { loadAgentPrompt } from './loader.js';
import { getPrompt } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/environment.js';

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic();

export interface AgentContext {
  threadHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
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
    systemPrompt = promptObj.compile({});
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

  // Build messages array from thread history + current message
  const messages: Anthropic.MessageParam[] = [
    ...options.context.threadHistory,
    { role: 'user', content: userMessage },
  ];

  // Execute streaming API call
  const stream = await anthropic.messages.stream({
    model: config.anthropicModel || 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages,
    // tools: [], // MCP tools added in Story 3.1
  });

  // Stream responses
  let tokenCount = 0;
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && 
        event.delta.type === 'text_delta') {
      tokenCount += estimateTokens(event.delta.text);
      yield event.delta.text;
    }
  }

  // Get final message for token usage
  const finalMessage = await stream.finalMessage();
  
  const duration = Date.now() - startTime;
  logger.info({
    event: 'agent_complete',
    userId: options.context.userId,
    duration,
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    traceId: options.context.traceId,
    nfr1Met: duration < 3000,  // NFR1: 1-3 seconds
  });
}

/**
 * Rough token estimate for logging during streaming
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
import type Anthropic from '@anthropic-ai/sdk';

// Tool definitions for Claude's tool_use capability
// MCP tools will be added dynamically in Story 3.1
export type ToolDefinition = Anthropic.Tool;

/**
 * Get tool definitions for the Orion agent
 * 
 * Initially empty - MCP tools added in Story 3.1 via Rube
 * The Rube MCP server provides 500+ app integrations including:
 * - RUBE_SEARCH_TOOLS: Discover available tools
 * - RUBE_MULTI_EXECUTE_TOOL: Execute tools in parallel  
 * - RUBE_REMOTE_WORKBENCH: Python/bash code execution
 * - RUBE_MANAGE_CONNECTIONS: Connect to apps (GitHub, Slack, etc.)
 */
export function getToolDefinitions(): ToolDefinition[] {
  // TODO: Load MCP tools dynamically in Story 3.1
  return [];
}

/**
 * Rube MCP server configuration
 * Used when spawning the MCP server process
 */
export const rubeMcpConfig = {
  command: 'npx',
  args: ['-y', '@composio/mcp', 'start'],
  description: '500+ app integrations via Composio',
};
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
│   │   ├── orion.ts                # Anthropic API integration
│   │   ├── loader.ts               # BMAD-style agent loader
│   │   └── tools.ts                # Tool definitions for Claude
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
| Token usage | Logged per request | `finalMessage.usage` |

### References

- [Source: _bmad-output/epics.md#Story 2.1: Anthropic API Integration] — Original story definition
- [Source: _bmad-output/architecture.md#Agent Layer] — Agent architecture
- [External: Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)
- [External: Messages API Reference](https://docs.anthropic.com/en/api/messages)

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

- Uses direct Anthropic API (`messages.create()`) for low latency in serverless
- No subprocess spawning — direct HTTP calls to Anthropic
- MCP tools disabled initially — added in Story 3.1 via Rube
- Langfuse prompt fetching has a fallback to local file
- Actual token counts available from `finalMessage.usage`

### File List

Files to create:
- `src/agent/orion.ts`
- `src/agent/loader.ts`
- `src/agent/tools.ts`
- `.orion/agents/orion.md`

Files to modify:
- `src/slack/handlers/user-message.ts` (integrate agent)

