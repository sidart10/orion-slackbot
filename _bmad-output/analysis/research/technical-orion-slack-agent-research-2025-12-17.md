---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Orion - Agentic Slack Bot with Claude Agent SDK + Tools (MCP) Connectivity'
research_goals: 'Verify feasibility, determine optimal tech stack, design cloud deployment architecture'
user_name: 'Sid'
date: '2025-12-17'
web_research_enabled: true
source_verification: true
---

# Technical Research: Orion - Agentic Slack Bot

## Building an Agentic Slack Bot with Claude Agent SDK, Tools, Skills, and Cloud Deployment

---

## Executive Summary

This technical research document provides a comprehensive analysis of building "Orion," an agentic Slack bot that leverages Anthropic's Claude Agent SDK with native **Tools** support (via MCP protocol), **Skills**, and **Commands**—deployed on Google Cloud Platform.

**Key Findings:**

| Decision | Recommendation | Confidence |
|----------|----------------|------------|
| **Feasibility** | ✅ Fully feasible | High |
| **Language** | TypeScript | High |
| **Agent Framework** | `@anthropic-ai/claude-agent-sdk` | High |
| **Slack Framework** | `@slack/bolt` with `Assistant` class | High |
| **Deployment** | Google Cloud Run (HTTP mode) | High |
| **Tools (MCP)** | Native protocol support | High |
| **Skills** | ✅ Supported via `.claude/skills/` | High |
| **Commands** | ✅ Custom slash commands via `.claude/commands/` | High |

**Architecture Overview:**

```
Slack (AI Agent UI) → Cloud Run (Orion App) → Claude Agent SDK → Tools (MCP Servers)
```

---

## Table of Contents

1. [Technology Stack Analysis](#1-technology-stack-analysis)
2. [Claude Agent SDK Deep Dive](#2-claude-agent-sdk-deep-dive)
   - 2.5 Subagents (Parallelization & Isolation)
   - 2.6 Compaction (Context Management)
   - 2.7 Code Generation
3. [Slack AI Platform Integration](#3-slack-ai-platform-integration)
4. [Tools, Skills & Commands](#4-tools-skills--commands)
5. [System Architecture](#5-system-architecture)
   - 5.1 Agent Loop Framework
   - 5.2 High-Level Architecture
   - 5.3 Data Flow
   - 5.4 Component Responsibilities
   - 5.5 Agentic Search & Context Engineering
6. [Cloud Deployment Strategy](#6-cloud-deployment-strategy)
7. [Implementation Guide](#7-implementation-guide)
   - 7.4 BMAD-Inspired Agent Architecture
8. [Observability & Prompt Management](#8-observability--prompt-management)
9. [Verification Strategies](#9-verification-strategies)
10. [Security Considerations](#10-security-considerations)
11. [Performance & Scaling](#11-performance--scaling)
12. [Testing & Evaluation Patterns](#12-testing--evaluation-patterns)
13. [Risk Assessment](#13-risk-assessment)
14. [Recommendations](#14-recommendations)
15. [Sources & Citations](#15-sources--citations)

---

## 1. Technology Stack Analysis

### 1.1 Language Selection: TypeScript vs Python

Both Claude Agent SDK and Slack Bolt are available in TypeScript and Python. After thorough analysis:

| Factor | TypeScript | Python | Winner |
|--------|------------|--------|--------|
| **Slack Bolt AI Support** | Full Assistant API with streaming | Full support | Tie |
| **Claude Agent SDK** | Primary/flagship SDK | Available | TypeScript |
| **Event-driven I/O** | Node.js excels at this pattern | Works, but async trickier | TypeScript |
| **Type Safety** | Catches integration bugs at compile time | Runtime errors | TypeScript |
| **Cloud Run Cold Starts** | Often faster cold starts (varies by deps/region) | Often slower (varies by deps/region) | TypeScript |
| **MCP Ecosystem** | Most MCP servers are Node/TS | Some Python support | TypeScript |

**Recommendation: TypeScript** [High Confidence]

**Sources:**
- [Claude Agent SDK TypeScript Repository](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Slack Bolt JS Documentation](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/)

### 1.2 Core Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "latest",
    "@slack/bolt": "^3.x",
    "@langfuse/client": "^4.x",
    "@langfuse/tracing": "^4.x",
    "@langfuse/otel": "^4.x",
    "@opentelemetry/sdk-node": "^1.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "typescript": "^5.x"
  }
}
```

---

## 2. Claude Agent SDK Deep Dive

### 2.1 Overview

The Claude Agent SDK (formerly Claude Code SDK) enables programmatic building of AI agents with Claude Code's capabilities. It provides:

- **Autonomous agents** that understand codebases, edit files, run commands
- **Built-in MCP connectivity** for external tool integration
- **Context management** with automatic prompt caching
- **Streaming responses** for real-time interaction

**Source:** [Claude Agent SDK Documentation](https://code.claude.com/docs/en/sdk/sdk-typescript)

### 2.2 Core API: `query()` Function

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

### 2.3 Key Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `systemPrompt` | `string` | Custom system prompt for the agent |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP server configurations |
| `allowedTools` | `string[]` | List of allowed tool names |
| `tools` | `{ type: 'preset', preset: 'claude_code' }` | Use Claude Code's default tools |
| `agents` | `Record<string, AgentDefinition>` | Define subagents programmatically |
| `maxTurns` | `number` | Maximum conversation turns |
| `maxBudgetUsd` | `number` | Maximum budget in USD |

### 2.4 MCP Server Configuration

```typescript
const response = query({
  prompt: "Your question",
  options: {
    mcpServers: {
      "rube": {
        command: "npx",
        args: ["-y", "@composio/mcp", "start"]
      },
      "custom-server": {
        command: "node",
        args: ["./mcp-server.js"]
      }
    }
  }
});
```

### 2.5 Subagents

Subagents are specialized agents that can be spawned by the main agent for specific tasks. They provide two key benefits:

1. **Parallelization**: Spin up multiple subagents to work on different tasks simultaneously
2. **Context Isolation**: Subagents use their own context windows and only return relevant information

#### Subagent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      MAIN ORION AGENT                           │
│                   (Orchestrator Context)                        │
└──────────────┬─────────────────┬─────────────────┬──────────────┘
               │                 │                 │
               ▼                 ▼                 ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │  Research Agent  │ │   Search Agent   │ │ Summarize Agent  │
    │  (Isolated Ctx)  │ │  (Isolated Ctx)  │ │  (Isolated Ctx)  │
    │                  │ │                  │ │                  │
    │  Returns:        │ │  Returns:        │ │  Returns:        │
    │  - Key findings  │ │  - Relevant docs │ │  - Summary only  │
    │  - Sources       │ │  - Excerpts      │ │  - Key points    │
    └──────────────────┘ └──────────────────┘ └──────────────────┘
```

#### Subagent Configuration

```typescript
const response = query({
  prompt: "Research the latest AI developments and summarize",
  options: {
    agents: {
      "research-agent": {
        description: "Conducts deep research on complex topics",
        tools: ["web_search", "mcp", "Read", "Bash"],
        prompt: `You are a research specialist. 
                 Conduct thorough research and return ONLY:
                 - Executive summary (2-3 sentences)
                 - Key findings (bullet points)
                 - Sources (URLs)
                 Do NOT include intermediate steps or full context.`,
        model: "sonnet"
      },
      "search-agent": {
        description: "Searches files and databases in parallel",
        tools: ["Grep", "Glob", "Read", "mcp"],
        prompt: `You are a search specialist.
                 Execute searches efficiently and return only relevant excerpts.
                 Maximum 5 most relevant results per query.`,
        model: "haiku"  // Faster model for search tasks
      },
      "summarize-agent": {
        description: "Summarizes large content into digestible formats",
        tools: ["Read"],
        prompt: `You are a summarization expert.
                 Create concise summaries that preserve key information.
                 Format for Slack: use *bold*, bullets, short paragraphs.`,
        model: "haiku"
      }
    }
  }
});
```

#### Parallelization Pattern

```typescript
// Main agent can spawn multiple subagents in parallel
const researchResults = await Promise.all([
  spawnSubagent('search-agent', 'Search Slack history for "project deadline"'),
  spawnSubagent('search-agent', 'Search emails for "budget approval"'),
  spawnSubagent('research-agent', 'Research market trends in Q4 2024')
]);

// Each subagent returns only relevant excerpts, not full context
// Main agent synthesizes results
```

#### When to Use Subagents

| Scenario | Subagent Approach |
|----------|-------------------|
| **Deep research** | Research agent with isolated context |
| **Parallel searches** | Multiple search agents running concurrently |
| **Large document analysis** | Summarize agent to compress before main agent sees |
| **Specialized tasks** | Task-specific agents with focused tools |

**Source:** [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-claude-agent-sdk)

### 2.6 Compaction

When agents run for extended periods (e.g., long Slack conversation threads), **context management becomes critical**. The Claude Agent SDK's compact feature automatically summarizes previous messages when the context limit approaches.

#### Why Compaction Matters

| Problem | Impact | Solution |
|---------|--------|----------|
| Context window fills up | Agent loses access to recent info | Auto-compact old messages |
| Long conversations | Performance degrades | Summarize history periodically |
| Repeated loops | Same context loaded multiple times | Compact to essentials |

#### Compaction Configuration

```typescript
const response = query({
  prompt: userMessage,
  options: {
    // Long-running threads: use /compact (SDK slash commands) or your own summarization pipeline.
    // (Compaction boundaries are surfaced as SDK messages when they occur.)
    maxTurns: 50
  }
});
```

#### Compaction for Slack Threads

For Orion's Slack integration, implement thread-aware compaction:

```typescript
// Store compacted history per thread
const threadHistories = new Map<string, CompactedHistory>();

async function handleLongThread(threadTs: string, newMessage: string) {
  let history = threadHistories.get(threadTs);
  
  if (history && history.messageCount > 30) {
    // Trigger compaction
    history = await compactHistory(history);
    threadHistories.set(threadTs, history);
  }
  
  // Use compacted history as context
  const response = query({
    prompt: newMessage,
    options: {
      systemPrompt: `Previous conversation summary:\n${history?.summary}\n\n` + baseSystemPrompt
    }
  });
}
```

**Source:** [Slash Commands in the SDK](https://platform.claude.com/docs/en/agent-sdk/slash-commands)

### 2.7 Code Generation

The Claude Agent SDK excels at **code generation**—one of its most powerful capabilities. Code is precise, composable, and infinitely reusable.

#### Why Code Generation Matters

| Benefit | Description |
|---------|-------------|
| **Precision** | Code is unambiguous; no interpretation needed |
| **Composability** | Generated code can be combined with existing code |
| **Reusability** | Once generated, code can be run repeatedly |
| **Verification** | Code can be linted, tested, and validated |

#### Code Generation Use Cases for Orion

| Use Case | Example |
|----------|---------|
| **Data Processing** | Generate Python/JS to parse CSV, transform data |
| **API Calls** | Generate code to call external APIs |
| **Automation Scripts** | Create one-off automation scripts for users |
| **Report Generation** | Generate code that produces formatted reports |
| **Integration Helpers** | Generate code for connecting systems |

#### Implementation

```typescript
// Enable code generation in Orion
const response = query({
  prompt: userMessage,
  options: {
    allowedTools: [
      'Write',      // Create code files
      'Bash',       // Execute code
      'Edit',       // Modify code
      'mcp'         // External tools
    ],
    // System prompt encouraging code generation
    systemPrompt: `${baseSystemPrompt}
    
When tasks would benefit from code:
- Generate precise, executable code
- Use Python for data processing, Node.js for web tasks
- Include clear comments
- Test the code before presenting results
- Offer to save scripts for reuse`
  }
});
```

#### Example: User Asks for Data Analysis

```
User: "Can you analyze the sales data in #sales-reports and tell me the top 5 products?"

Orion's approach:
1. Use MCP to fetch messages from #sales-reports
2. Generate Python code to parse and analyze the data
3. Execute the code
4. Present results with visualization
5. Offer to save the script for future use
```

```python
# Generated by Orion
import pandas as pd
from collections import Counter

# Parse sales data from channel messages
sales_data = [...]  # Extracted from Slack messages

# Analyze top products
product_counts = Counter(item['product'] for item in sales_data)
top_5 = product_counts.most_common(5)

# Format for Slack
result = "*Top 5 Products by Sales:*\n"
for i, (product, count) in enumerate(top_5, 1):
    result += f"{i}. {product}: {count} sales\n"

print(result)
```

**Source:** [Building Agents with Claude Agent SDK - Code Generation](https://www.anthropic.com/engineering/building-agents-with-claude-agent-sdk)

---

## 3. Slack AI Platform Integration

### 3.1 Slack's Native AI Agent Features

Slack provides purpose-built infrastructure for AI agents:

| Feature | Description | API Method |
|---------|-------------|------------|
| **Split Pane View** | Side-by-side chat window | Automatic with "Agents & AI Apps" |
| **Top Bar Launch** | App accessible from navigation | Automatic |
| **Loading States** | Show "thinking..." messages | `assistant.threads.setStatus` |
| **Suggested Prompts** | Pre-set user prompts | `assistant.threads.setSuggestedPrompts` |
| **App Threads** | Automatic conversation threading | `assistant.threads.setTitle` |
| **Text Streaming** | Real-time response display | `chat.startStream/chat.appendStream/chat.stopStream` |
| **Feedback Blocks** | Thumbs up/down UI | `feedback_buttons` block element |

**Source:** [Slack AI Apps Documentation](https://docs.slack.dev/ai/developing-ai-apps)

### 3.2 The `Assistant` Class (Bolt JS)

```typescript
import { App, Assistant } from '@slack/bolt';

const assistant = new Assistant({
  threadStarted: async ({ say, setSuggestedPrompts, saveThreadContext }) => {
    await say('Hi, how can I help?');
    await setSuggestedPrompts({
      title: 'Try these:',
      prompts: [
        { title: 'Summarize channel', message: 'Summarize this channel' }
      ]
    });
  },

  threadContextChanged: async ({ saveThreadContext }) => {
    await saveThreadContext();
  },

  userMessage: async ({ message, say, setTitle, setStatus, getThreadContext }) => {
    await setTitle(message.text);
    await setStatus({
      status: 'thinking...',
      loading_messages: ['Processing...', 'Almost there...']
    });
    
    // Call Claude Agent SDK here
    const response = await processWithClaude(message.text);
    await say(response);
  }
});

app.assistant(assistant);
```

### 3.3 Text Streaming Implementation

```typescript
const streamer = client.chatStream({
  channel: channel,
  recipient_team_id: teamId,
  recipient_user_id: userId,
  thread_ts: thread_ts,
});

for await (const chunk of llmResponse) {
  await streamer.append({ markdown_text: chunk.delta });
}
await streamer.stop();
```

### 3.4 Required Slack Configuration

**OAuth Scopes:**
- `assistant:write` — Use assistant.threads.* methods
- `chat:write` — Send messages
- `im:history` — Read DM history

**Event Subscriptions:**
- `assistant_thread_started` — User opens assistant
- `assistant_thread_context_changed` — User switches channels
- `message.im` — User sends message

**Source:** [Slack Bolt JS AI Apps](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/)

---

## 4. Tools, Skills & Commands

The Claude Agent SDK provides three major extensibility mechanisms that match Claude Code's capabilities:

| Feature | Description | Invocation | SDK Support |
|---------|-------------|------------|-------------|
| **Tools** | External integrations via MCP protocol | Automatic (context-based) | ✅ Native |
| **Skills** | Reusable domain expertise packages | Automatic (context-based) | ✅ Native |
| **Commands** | User-invoked slash commands | Explicit (`/command`) | ✅ Via filesystem |

---

### 4.1 Tools (MCP Integration)

**Tools** are external integrations connected via the Model Context Protocol (MCP)—an open standard for AI-tool integrations.

**What Tools Enable:**
- Connect to external databases, APIs, and services
- Execute functions in external systems
- Access resources and data sources
- 500+ app integrations via Rube (Composio)

#### 4.1.1 Tool Server Types

| Type | Transport | Use Case |
|------|-----------|----------|
| **Remote HTTP** | HTTP | Cloud-hosted servers |
| **Remote SSE** | Server-Sent Events | Real-time streaming |
| **Local stdio** | Standard I/O | Local Node.js processes |

#### 4.1.2 Popular Tool Servers

| Server | Description |
|--------|-------------|
| **Rube (Composio)** | 500+ app integrations |
| **Atlassian** | Jira & Confluence access |
| **GitHub** | Repository management |
| **Linear** | Issue tracking |
| **Slack** | Workspace integration |
| **Hugging Face** | ML model access |

#### 4.1.3 Tool Configuration

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: "Search for recent PRs",
  options: {
    mcpServers: {
      // Rube provides 500+ app integrations
      "rube": {
        command: "npx",
        args: ["-y", "@composio/mcp", "start"]
      },
      // Custom tool server
      "custom-tools": {
        command: "node",
        args: ["./my-tool-server.js"]
      }
    },
    allowedTools: ["mcp"]  // Enable MCP tools
  }
});
```

**Source:** [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp)

---

### 4.2 Skills

**Skills** are reusable, filesystem-based packages that provide Claude with domain-specific expertise. Unlike one-off prompts, Skills load on-demand and eliminate repetitive guidance.

**Key Benefits:**
- **Specialize Claude**: Tailor capabilities for domain-specific tasks
- **Reduce repetition**: Create once, use automatically
- **Compose capabilities**: Combine Skills to build complex workflows

#### 4.2.1 How Skills Work

Skills leverage **progressive disclosure**—only loading content when needed:

| Level | When Loaded | Token Cost | Content |
|-------|-------------|------------|---------|
| **Level 1: Metadata** | Always (startup) | ~100 tokens | `name` and `description` from YAML |
| **Level 2: Instructions** | When triggered | <5k tokens | SKILL.md body |
| **Level 3: Resources** | As needed | Unlimited | Scripts, templates, docs |

#### 4.2.2 Skill Structure

```
.claude/skills/
└── my-skill/
    ├── SKILL.md           # Main instructions (required)
    ├── REFERENCE.md       # Additional docs
    └── scripts/
        └── helper.py      # Executable scripts
```

**Example SKILL.md:**
```markdown
---
name: slack-expert
description: Help format messages for Slack, use markdown, handle threads, and integrate with Slack APIs. Use when working with Slack messages or Slack app development.
---

# Slack Expert

## Quick Start
When formatting for Slack:
- Use `*bold*` not **bold**
- Use `_italic_` not *italic*
- Use bullet points, avoid blockquotes

## Threading
Always reply in thread when responding to existing conversations...
```

#### 4.2.3 SDK Configuration for Skills

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: "Format this message for Slack",
  options: {
    cwd: "/path/to/project",  // Project with .claude/skills/
    settingSources: ["user", "project"],  // Load Skills from filesystem
    allowedTools: ["Skill", "Read", "Write", "Bash"]  // Enable Skill tool
  }
});
```

**Critical Configuration:**
- `settingSources: ["user", "project"]` — **Required** to load Skills
- `allowedTools: ["Skill"]` — **Required** to enable Skill invocation
- Skills in `~/.claude/skills/` (user) or `.claude/skills/` (project)

**Source:** [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)

---

### 4.3 Commands (Slash Commands)

**Commands** are user-invoked actions defined as Markdown files. Unlike Skills (auto-triggered), Commands require explicit invocation via `/command-name`.

#### 4.3.1 When to Use Commands vs Skills

| Use Commands For | Use Skills For |
|------------------|----------------|
| Quick, frequently used prompts | Complex workflows with structure |
| Single-file instructions | Multi-file capabilities |
| Explicit user control | Automatic context-based invocation |
| Simple prompt snippets | Domain expertise packages |

#### 4.3.2 Command Structure

```
.claude/commands/
├── review.md          # /review command
├── optimize.md        # /optimize command
└── frontend/
    └── component.md   # /component (project:frontend)
```

**Example Command (`review.md`):**
```markdown
---
description: Review code for issues
allowed-tools: Bash(git diff:*)
---

Review this code for:
- Security vulnerabilities
- Performance issues
- Code style violations

Context: $ARGUMENTS
```

#### 4.3.3 Command Features

| Feature | Syntax | Description |
|---------|--------|-------------|
| **Arguments** | `$ARGUMENTS` | All args passed to command |
| **Positional** | `$1`, `$2`, etc. | Individual arguments |
| **Bash Execution** | `!`git status`` | Execute before command runs |
| **File References** | `@src/file.ts` | Include file contents |
| **Frontmatter** | YAML header | Metadata, allowed tools, model |

#### 4.3.4 MCP-Based Commands

MCP servers can expose prompts as slash commands:

```
/mcp__github__pr_review 456
/mcp__jira__create_issue "Bug title" high
```

**Source:** [Slash Commands Reference](https://code.claude.com/docs/en/slash-commands)

---

### 4.4 Feature Comparison Matrix

| Aspect | Tools (MCP) | Skills | Commands |
|--------|-------------|--------|----------|
| **Invocation** | Automatic | Automatic | Explicit (`/cmd`) |
| **Discovery** | Config-defined | Context-based | User-triggered |
| **Scope** | External systems | Domain expertise | Quick prompts |
| **Structure** | Server processes | Directory + SKILL.md | Single .md file |
| **Token Cost** | Per-call | Progressive | Full content |
| **Best For** | API integrations | Complex workflows | Repeated tasks |

---

## 5. System Architecture

### 5.1 Agent Loop Framework

Orion follows the core agent loop pattern from Anthropic's engineering principles:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AGENT LOOP FRAMEWORK                           │
│                                                                     │
│    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐        │
│    │   GATHER     │    │    TAKE      │    │   VERIFY     │        │
│    │   CONTEXT    │───▶│   ACTION     │───▶│    WORK      │        │
│    │              │    │              │    │              │        │
│    └──────────────┘    └──────────────┘    └──────┬───────┘        │
│           ▲                                       │                 │
│           │              ┌──────────────┐         │                 │
│           │              │   SUCCESS?   │◀────────┘                 │
│           │              └──────┬───────┘                           │
│           │                     │                                   │
│           │         ┌──────────┴──────────┐                        │
│           │         │                     │                        │
│           │        No                    Yes                       │
│           │         │                     │                        │
│           └─────────┘                     ▼                        │
│                                    ┌──────────────┐                │
│                                    │   COMPLETE   │                │
│                                    └──────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

**The Three Phases:**

| Phase | Description | Orion Implementation |
|-------|-------------|----------------------|
| **Gather Context** | Retrieve relevant information before acting | Agentic search, subagent queries, file system navigation |
| **Take Action** | Execute tools, generate responses, run code | MCP tools, code generation, subagent delegation |
| **Verify Work** | Validate output before presenting to user | Rules-based checks, format validation, LLM-as-judge |

**Key Principles:**

1. **Context is King**: Never act without gathering sufficient context first
2. **Iterative Refinement**: Loop back when verification fails
3. **Verification is Mandatory**: Every response should pass validation before delivery
4. **Fail Gracefully**: If verification fails repeatedly, acknowledge limitations

**Orion Agent Loop Example:**

```typescript
// Simplified agent loop for Orion
async function orionAgentLoop(userMessage: string) {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    // 1. GATHER CONTEXT
    const context = await gatherContext(userMessage);
    
    // 2. TAKE ACTION
    const response = await generateResponse(userMessage, context);
    
    // 3. VERIFY WORK
    const verification = await verifyResponse(response, userMessage);
    
    if (verification.passed) {
      return response;  // Success!
    }
    
    // Loop back with verification feedback
    attempts++;
  }
  
  return { error: 'Unable to generate verified response' };
}
```

---

### 5.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            SLACK                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  User Interface                                              │   │
│  │  • Split Pane AI View                                        │   │
│  │  • Top Bar Launch Point                                      │   │
│  │  • Suggested Prompts                                         │   │
│  │  • Streaming Responses                                       │   │
│  │  • Feedback Buttons                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ Events (HTTP POST)
                                 │ • assistant_thread_started
                                 │ • assistant_thread_context_changed
                                 │ • message.im
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GOOGLE CLOUD RUN                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ORION APPLICATION                                           │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  Slack Bolt (TypeScript)                            │    │   │
│  │  │  • Assistant class event handlers                   │    │   │
│  │  │  • Thread context management                        │    │   │
│  │  │  • Response streaming (chatStream)                  │    │   │
│  │  └──────────────────────┬──────────────────────────────┘    │   │
│  │                         │                                    │   │
│  │  ┌──────────────────────▼──────────────────────────────┐    │   │
│  │  │  Claude Agent SDK                                   │    │   │
│  │  │  • query() function                                 │    │   │
│  │  │  • System prompt configuration                      │    │   │
│  │  │  • MCP client connections                           │    │   │
│  │  │  • Streaming message handling                       │    │   │
│  │  └──────────────────────┬──────────────────────────────┘    │   │
│  │                         │                                    │   │
│  └─────────────────────────┼────────────────────────────────────┘   │
└────────────────────────────┼────────────────────────────────────────┘
                             │ MCP Protocol (JSON-RPC 2.0)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       MCP SERVERS                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │    Rube      │ │   Custom     │ │   GitHub     │                │
│  │  (Composio)  │ │   Server     │ │    MCP       │                │
│  │  500+ apps   │ │  Your tools  │ │  Repo access │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Data Flow

1. **User opens Orion** → Slack sends `assistant_thread_started`
2. **Orion responds** → Sets suggested prompts, greets user
3. **User sends message** → Slack sends `message.im`
4. **Orion processes** → Shows loading state, calls Claude Agent SDK
5. **Claude reasons** → Uses MCP tools as needed
6. **Response streams** → Orion streams response back to Slack
7. **User provides feedback** → Feedback buttons capture sentiment

### 5.4 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Slack Bolt** | Event handling, message sending, streaming |
| **Assistant Class** | Thread management, context storage, UI utilities |
| **Claude Agent SDK** | AI reasoning, tool execution, MCP coordination |
| **MCP Servers** | External tool access, data retrieval |
| **Cloud Run** | Hosting, scaling, HTTPS termination |

---

### 5.5 Agentic Search & Context Engineering

The Claude Agent SDK enables **agentic search**—Claude navigates the file system using bash commands to find relevant context, rather than relying solely on semantic search.

#### Why Agentic Search?

| Approach | How It Works | Trade-offs |
|----------|--------------|------------|
| **Semantic Search** | Embed chunks, query vectors | Fast, but less accurate, requires index maintenance |
| **Agentic Search** | Use `grep`, `tail`, `find` to navigate | Slower, but more accurate and transparent |

**Recommendation**: Start with agentic search. Add semantic search only if you need faster results.

#### File System as Context

The folder structure becomes a form of **context engineering**:

```
orion-context/
├── conversations/           # Previous Slack thread histories
│   ├── 2024-12-16/
│   │   └── thread-abc123.json
│   └── 2024-12-17/
│       └── thread-def456.json
├── user-preferences/        # Per-user settings
│   └── U123456.yaml
├── knowledge/               # Domain knowledge files
│   ├── company-policies.md
│   └── product-docs.md
└── tool-outputs/            # Cached tool results
    └── recent-searches.json
```

Claude can search this structure using bash:

```typescript
// Claude might execute these to gather context
await bash('grep -r "project deadline" ./conversations/');
await bash('tail -100 ./conversations/2024-12-17/thread-def456.json');
await bash('cat ./user-preferences/U123456.yaml');
```

#### Context Gathering Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Grep Search** | Find specific terms across files | `grep -r "budget" ./conversations/` |
| **Tail/Head** | Read recent entries from large files | `tail -50 ./tool-outputs/search-results.json` |
| **Find** | Locate files by name/date | `find ./conversations -mtime -1` |
| **Cat** | Read entire small files | `cat ./user-preferences/U123456.yaml` |

#### Implementation for Orion

```typescript
// Enable agentic search in Claude Agent SDK
const response = query({
  prompt: userMessage,
  options: {
    cwd: '/path/to/orion-context',  // Working directory for file access
    allowedTools: [
      'Bash',      // Enable bash for agentic search
      'Read',      // File reading
      'Grep',      // Pattern search
      'Glob',      // File discovery
      'mcp'        // External tools
    ]
  }
});
```

**Source:** [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-claude-agent-sdk)

---

## 6. Cloud Deployment Strategy

### 6.1 Why Cloud Run?

| Factor | Cloud Run Advantage |
|--------|---------------------|
| **Serverless** | No server management |
| **Auto-scaling** | Scales to zero, scales up on demand |
| **Cost** | Pay only for requests |
| **HTTPS** | Automatic TLS termination |
| **Containers** | Standard Docker deployment |

### 6.2 Socket Mode vs HTTP Mode

| Mode | How It Works | Use Case |
|------|--------------|----------|
| **Socket Mode** | WebSocket connection | Local development / behind firewalls |
| **HTTP Mode** | Webhooks (POST requests) | **Production on Cloud Run** ✅ |

**HTTP Mode is recommended on Cloud Run** because:

- Webhooks align naturally with serverless (stateless request/response)
- Slack Socket Mode relies on a long-lived WebSocket; on serverless platforms this typically requires keeping instances warm (e.g., `minScale: 1`) and implementing reconnect behavior
- Cloud Run supports WebSockets, but treats them as long-running HTTP requests subject to request timeouts (default 5 minutes, up to 60 minutes), so design for reconnects

**Sources:**

- [Comparing HTTP & Socket Mode (Slack)](https://docs.slack.dev/apis/events-api/comparing-http-socket-mode/)
- [Using WebSockets on Cloud Run](https://docs.cloud.google.com/run/docs/triggering/websockets)

### 6.3 Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### 6.4 Cloud Run Configuration

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: orion-slack-agent
spec:
  template:
    spec:
      containers:
        - image: gcr.io/PROJECT_ID/orion-slack-agent
          ports:
            - containerPort: 8080
          env:
            - name: SLACK_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: slack-secrets
                  key: bot-token
            - name: SLACK_SIGNING_SECRET
              valueFrom:
                secretKeyRef:
                  name: slack-secrets
                  key: signing-secret
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: anthropic-secrets
                  key: api-key
          resources:
            limits:
              memory: 512Mi
              cpu: '1'
```

### 6.5 Deployment Commands

```bash
# Build and push
docker build -t gcr.io/PROJECT_ID/orion-slack-agent .
docker push gcr.io/PROJECT_ID/orion-slack-agent

# Deploy
gcloud run deploy orion-slack-agent \
  --image gcr.io/PROJECT_ID/orion-slack-agent \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets=SLACK_BOT_TOKEN=slack-bot-token:latest,SLACK_SIGNING_SECRET=slack-signing-secret:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest
```

**Source:** [Google Cloud Run Slack Bot Codelab](https://codelabs.developers.google.com/codelabs/cloud-slack-bot)

---

## 7. Implementation Guide

### 7.1 Project Structure

```
orion-slack-agent/
├── src/
│   ├── index.ts                    # Entry point (imports instrumentation first)
│   ├── instrumentation.ts          # OpenTelemetry + Langfuse setup
│   ├── config/
│   │   └── environment.ts          # Environment variables
│   ├── observability/
│   │   ├── langfuse.ts             # Langfuse client singleton
│   │   └── tracing.ts              # Tracing utilities
│   ├── slack/
│   │   ├── app.ts                  # Slack Bolt app setup
│   │   ├── assistant.ts            # Assistant class configuration
│   │   └── handlers/
│   │       ├── threadStarted.ts    # Thread start handler
│   │       ├── threadContextChanged.ts
│   │       └── userMessage.ts      # Main message handler
│   ├── agent/
│   │   ├── orion.ts                # Claude Agent SDK integration
│   │   ├── loader.ts               # BMAD-style agent loader
│   │   └── tools.ts                # Tool/MCP server configurations
│   └── utils/
│       └── streaming.ts            # Streaming utilities
├── .orion/                         # BMAD-inspired agent definitions
│   ├── agents/                     # Agent personas
│   │   ├── orion.md                # Main Orion agent
│   │   ├── research-agent.md       # Research subagent
│   │   ├── search-agent.md         # Search subagent
│   │   └── summarize-agent.md      # Summarization subagent
│   ├── workflows/                  # Multi-step workflows
│   │   ├── deep-research/
│   │   │   ├── workflow.md
│   │   │   └── steps/
│   │   └── channel-summary/
│   │       └── workflow.md
│   ├── tasks/                      # Reusable tasks
│   │   ├── verify-response.md
│   │   └── format-slack.md
│   └── config.yaml                 # Orion configuration
├── .claude/
│   ├── skills/                     # Claude SDK Skills (auto-discovered)
│   │   └── slack-expert/
│   │       └── SKILL.md
│   └── commands/                   # Slash Commands (user-invoked)
│       └── summarize.md
├── orion-context/                  # Agentic search context directory
│   ├── conversations/              # Thread history for search
│   ├── user-preferences/           # Per-user settings
│   └── knowledge/                  # Domain knowledge files
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

**Key Structural Decisions:**
- **`instrumentation.ts`** — Must be imported first for OpenTelemetry/Langfuse tracing
- **`observability/`** — Centralized observability (tracing, prompt management)
- **`.orion/`** — BMAD-inspired agent definitions (personas, workflows, tasks)
- **`.claude/`** — Claude SDK Skills and Commands (auto-discovered)
- **`orion-context/`** — File system for agentic search
- **Prompts in Langfuse** — System prompts managed externally, fetched at runtime

### 7.2 Core Implementation

**`src/instrumentation.ts`** — Must be imported first!
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();
console.log('🔍 Langfuse observability initialized');
```

**`src/index.ts`**
```typescript
import './instrumentation';  // MUST be first import
import { App } from '@slack/bolt';
import { assistant } from './slack/assistant';
import { config } from './config/environment';

const app = new App({
  token: config.slackBotToken,
  signingSecret: config.slackSigningSecret,
});

app.assistant(assistant);

(async () => {
  await app.start(config.port);
  console.log(`⚡️ Orion is running on port ${config.port}`);
})();
```

**`src/observability/langfuse.ts`**
```typescript
import { LangfuseClient } from '@langfuse/client';

// Singleton Langfuse client
export const langfuse = new LangfuseClient();

// Fetch prompt from Langfuse with caching
export async function getPrompt(name: string, label = 'production') {
  const prompt = await langfuse.prompt.get(name, { label });
  return prompt;
}
```

**`src/slack/assistant.ts`**
```typescript
import { Assistant } from '@slack/bolt';
import { handleThreadStarted } from './handlers/threadStarted';
import { handleUserMessage } from './handlers/userMessage';

export const assistant = new Assistant({
  threadStarted: handleThreadStarted,
  threadContextChanged: async ({ saveThreadContext }) => {
    await saveThreadContext();
  },
  userMessage: handleUserMessage,
});
```

**`src/slack/handlers/userMessage.ts`**
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { startActiveObservation } from '@langfuse/tracing';
import { toolConfig } from '../../agent/tools';
import { getPrompt, langfuse } from '../../observability/langfuse';

export async function handleUserMessage({ 
  client, 
  message, 
  say, 
  setStatus,
  setTitle,
  context 
}) {
  if (!message.text || !message.thread_ts) return;

  await setTitle(message.text.slice(0, 50));
  
  await setStatus({
    status: 'thinking...',
    loading_messages: [
      'Consulting my knowledge...',
      'Checking tools...',
      'Crafting response...'
    ]
  });

  // Wrap in Langfuse trace for observability
  await startActiveObservation('orion-response', async (trace) => {
    trace.update({
      input: message.text,
      metadata: {
        userId: context.userId,
        teamId: context.teamId,
        channel: message.channel
      }
    });

    try {
      // Fetch system prompt from Langfuse
      const systemPromptObj = await getPrompt('orion-system-prompt');
      const systemPrompt = systemPromptObj.compile({});
      
      // Link prompt to trace for tracking
      trace.update({ prompt: systemPromptObj });

      const agentResponse = query({
        prompt: message.text,
        options: {
          systemPrompt,
          mcpServers: toolConfig.mcpServers,
          settingSources: ['user', 'project'],  // Enable Skills
          allowedTools: ['Skill', 'mcp', 'Read', 'Write', 'Bash']
        }
      });

      // Stream response
      const streamer = client.chatStream({
        channel: message.channel,
        thread_ts: message.thread_ts,
        recipient_user_id: context.userId,
        recipient_team_id: context.teamId,
      });

      let fullResponse = '';
      for await (const msg of agentResponse) {
        if (msg.type === 'assistant') {
          for (const content of msg.message.content) {
            if (content.type === 'text') {
              fullResponse += content.text;
              await streamer.append({ markdown_text: content.text });
            }
          }
        }
      }

      await streamer.stop();
      trace.update({ output: fullResponse });

    } catch (error) {
      console.error('Agent error:', error);
      trace.update({ level: 'ERROR', statusMessage: String(error) });
      await say('Sorry, something went wrong. Please try again.');
    }
  });
}
```

**`src/agent/tools.ts`**
```typescript
export const toolConfig = {
  mcpServers: {
    // Rube (Composio) for 500+ app integrations
    rube: {
      command: 'npx',
      args: ['-y', '@composio/mcp', 'start']
    },
    // Add custom tool servers as needed
  }
};
```

### 7.3 Langfuse Prompt Setup

Create prompts in Langfuse UI or via API:

```typescript
// One-time setup (run once or use Langfuse UI)
import { LangfuseClient } from '@langfuse/client';

const langfuse = new LangfuseClient();

await langfuse.prompt.create({
  name: 'orion-system-prompt',
  type: 'text',
  prompt: `You are Orion, an intelligent AI assistant integrated into Slack.

Your capabilities:
- Answer questions using your knowledge and connected tools
- Access external systems through tool integrations
- Help with research, analysis, and task automation
- Provide clear, actionable responses

Communication style:
- Be concise but thorough
- Use Slack-compatible markdown: *bold*, _italic_, bullet points
- Break down complex answers into digestible parts
- Acknowledge uncertainty when appropriate

When using tools:
- Explain what you're doing when accessing external systems
- Summarize results clearly
- Offer follow-up suggestions when helpful`,
  labels: ['production'],
  config: {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096
  }
});
```

### 7.4 BMAD-Inspired Agent Architecture

Orion's agent and subagent prompts are organized using a **BMAD-inspired file structure**—a pattern for version-controlled, composable agent definitions.

#### Why File-Based Agent Definitions?

| Benefit | Description |
|---------|-------------|
| **Version Control** | All prompts/personas in git with full history |
| **Separation of Concerns** | Prompts separate from application code |
| **Composability** | Subagents can reference shared workflows |
| **Langfuse Sync** | File-based prompts can sync to Langfuse for A/B testing |
| **Claude SDK Compatible** | Works with Skills and Commands system |

#### Orion Agent File Structure

```
orion-slack-agent/
├── .orion/                           # Agent definitions (BMAD-style)
│   ├── agents/                       # Agent personas
│   │   ├── orion.md                  # Main Orion agent
│   │   ├── research-agent.md         # Research subagent
│   │   ├── search-agent.md           # Search subagent
│   │   └── summarize-agent.md        # Summarization subagent
│   ├── workflows/                    # Multi-step workflows
│   │   ├── deep-research/
│   │   │   ├── workflow.md
│   │   │   └── steps/
│   │   │       ├── step-01-scope.md
│   │   │       ├── step-02-search.md
│   │   │       └── step-03-synthesize.md
│   │   └── channel-summary/
│   │       └── workflow.md
│   ├── tasks/                        # Reusable tasks
│   │   ├── verify-response.md
│   │   └── format-slack.md
│   └── config.yaml                   # Orion configuration
├── .claude/
│   ├── skills/                       # Claude SDK Skills
│   └── commands/                     # Slash commands
└── src/
    └── agent/
        ├── loader.ts                 # Loads .orion/ files
        └── subagents.ts              # Subagent definitions
```

#### Agent File Format

**Example: `.orion/agents/orion.md`**

```markdown
---
name: orion
description: Main Orion assistant for Slack
version: 1.0.0
---

# Orion Agent

<persona>
  <role>Intelligent Slack Assistant</role>
  <identity>An AI assistant that helps teams by answering questions,
  conducting research, and connecting to external tools.</identity>
  <communication_style>Concise, professional, uses Slack markdown
  (*bold*, _italic_, bullet points). No emojis unless requested.</communication_style>
  <principles>
    - Always verify information before presenting
    - Cite sources when using external data
    - Acknowledge uncertainty when appropriate
    - Offer follow-up suggestions
  </principles>
</persona>

<capabilities>
  <tool name="mcp" description="Access external tools via MCP"/>
  <tool name="search" description="Agentic search through context"/>
  <subagent name="research-agent" trigger="deep research requests"/>
  <subagent name="search-agent" trigger="parallel search tasks"/>
</capabilities>

<verification>
  <rule>Validate tool outputs before presenting</rule>
  <rule>Check response format matches Slack markdown</rule>
  <rule>Ensure sources are cited for factual claims</rule>
</verification>
```

#### Subagent File Format

**Example: `.orion/agents/research-agent.md`**

```markdown
---
name: research-agent
description: Deep research subagent with isolated context
parent: orion
model: sonnet
---

# Research Agent

<persona>
  <role>Research Specialist</role>
  <identity>Expert researcher that conducts comprehensive analysis
  using web search, tool access, and document analysis.</identity>
</persona>

<workflow ref=".orion/workflows/deep-research/workflow.md"/>

<return_format>
  Only return: Executive summary, Key findings, Sources
  Do NOT return: Full context, intermediate steps
</return_format>
```

#### Agent Loader Implementation

```typescript
// src/agent/loader.ts
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

export function loadOrionAgents(basePath: string): Record<string, AgentDefinition> {
  const agentsPath = join(basePath, '.orion/agents');
  
  if (!existsSync(agentsPath)) {
    console.warn('.orion/agents directory not found');
    return {};
  }
  
  const agents: Record<string, AgentDefinition> = {};
  
  for (const file of readdirSync(agentsPath)) {
    if (file.endsWith('.md')) {
      const content = readFileSync(join(agentsPath, file), 'utf-8');
      const parsed = parseAgentFile(content);
      
      agents[parsed.name] = {
        name: parsed.name,
        description: parsed.description,
        prompt: extractPersona(parsed),
        tools: extractCapabilities(parsed),
        model: parsed.model || 'sonnet'
      };
    }
  }
  
  return agents;
}

function parseAgentFile(content: string): any {
  // Extract YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch 
    ? parseYaml(frontmatterMatch[1]) 
    : {};
  
  // Extract persona XML
  const personaMatch = content.match(/<persona>([\s\S]*?)<\/persona>/);
  
  return {
    ...frontmatter,
    persona: personaMatch ? personaMatch[1] : ''
  };
}

function extractPersona(parsed: any): string {
  return parsed.persona
    .replace(/<[^>]+>/g, '')  // Remove XML tags
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
}

function extractCapabilities(parsed: any): string[] {
  // Parse capabilities from agent file
  return ['mcp', 'Read', 'Bash', 'Grep'];
}
```

#### Integration with Claude Agent SDK

```typescript
// src/agent/orion.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadOrionAgents } from './loader';
import { toolConfig } from './tools';

const orionAgents = loadOrionAgents(process.cwd());

export async function runOrionAgent(userMessage: string, context: any) {
  const response = query({
    prompt: userMessage,
    options: {
      // Load agents from .orion/agents/
      agents: orionAgents,
      
      // MCP tool configuration
      mcpServers: toolConfig.mcpServers,
      
      // Enable Skills from .claude/skills/
      settingSources: ['user', 'project'],
      allowedTools: ['Skill', 'mcp', 'Agent', 'Read', 'Bash', 'Grep']
    }
  });
  
  return response;
}
```

#### Workflow File Format

**Example: `.orion/workflows/deep-research/workflow.md`**

```markdown
---
name: deep-research
description: Comprehensive research workflow
steps: 3
---

# Deep Research Workflow

## Step 1: Scope Definition
- Clarify research topic with user
- Identify key questions to answer
- Define success criteria

## Step 2: Information Gathering
- Execute parallel searches using search-agent
- Query external tools via MCP
- Collect relevant sources

## Step 3: Synthesis
- Analyze gathered information
- Identify patterns and insights
- Format results for Slack delivery
```

---

## 8. Observability & Prompt Management

### 8.1 Langfuse Overview

**Langfuse** provides comprehensive LLM observability and prompt management for Orion:

| Feature | Description | Benefit |
|---------|-------------|---------|
| **Tracing** | End-to-end request visibility | Debug issues, monitor latency |
| **Prompt Management** | Version-controlled prompts | A/B testing, safe rollbacks |
| **Evaluations** | Quality scoring | Track accuracy over time |
| **Cost Tracking** | Token & cost analytics | Budget management |
| **User Analytics** | Per-user/session insights | Understand usage patterns |

### 8.2 Dependencies

```json
{
  "dependencies": {
    "@langfuse/client": "^4.x",      // Prompts, datasets, scores
    "@langfuse/tracing": "^4.x",     // Core tracing functions
    "@langfuse/otel": "^4.x",        // LangfuseSpanProcessor
    "@opentelemetry/sdk-node": "^1.x" // Required for Node.js
  }
}
```

### 8.3 Architecture Integration

```
┌─────────────────────────────────────────────────────────────┐
│                     LANGFUSE CLOUD                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • Prompt Management (versioned system prompts)      │   │
│  │  • Trace Storage (all Orion interactions)           │   │
│  │  • Analytics Dashboard (cost, latency, errors)      │   │
│  │  • Evaluations (quality scores per response)        │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────┘
                                │ HTTPS (traces, prompts)
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                      ORION (Cloud Run)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  instrumentation.ts (imported first)                 │    │
│  │  └── LangfuseSpanProcessor (OTEL exporter)          │    │
│  │                                                      │    │
│  │  observability/langfuse.ts                          │    │
│  │  └── getPrompt('orion-system-prompt')               │    │
│  │  └── startActiveObservation() for each request      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 8.4 Tracing Strategy

**What Gets Traced:**

| Trace Type | Attributes | Purpose |
|------------|------------|---------|
| **orion-response** | userId, teamId, channel, input, output | Main conversation trace |
| **tool-execution** | toolName, arguments, result | Track MCP tool usage |
| **prompt-fetch** | promptName, version, label | Monitor prompt usage |
| **error** | level, statusMessage, stack | Debug failures |

**Trace Example:**
```typescript
import { startActiveObservation } from '@langfuse/tracing';

await startActiveObservation('orion-response', async (trace) => {
  // Add context
  trace.update({
    input: userMessage,
    userId: slackUserId,
    sessionId: threadTs,  // Use Slack thread as session
    metadata: { channel, teamId }
  });

  // Nested generation for LLM call
  await startActiveObservation('claude-agent', async (generation) => {
    generation.update({
      model: 'claude-sonnet-4-20250514',
      prompt: systemPromptObj  // Links to Langfuse prompt
    });
    
    const response = await runAgent(userMessage);
    
    generation.update({
      output: response,
      usage: { inputTokens: xxx, outputTokens: xxx }
    });
  }, { asType: 'generation' });

  trace.update({ output: finalResponse });
});
```

### 8.5 Prompt Management Workflow

**Langfuse Prompt Lifecycle:**

```
1. CREATE (Langfuse UI)              2. FETCH (Runtime)
   ┌────────────────────┐               ┌────────────────────┐
   │ orion-system-prompt │               │ langfuse.prompt.get│
   │ version: 3         │  ──────────▶  │ label: 'production'│
   │ labels: [prod]     │               │ cache: 5 min       │
   └────────────────────┘               └────────────────────┘

3. COMPILE (with variables)          4. TRACK (link to trace)
   ┌────────────────────┐               ┌────────────────────┐
   │ prompt.compile({   │               │ trace.update({     │
   │   userName: 'Sid'  │  ──────────▶  │   prompt: promptObj│
   │ })                 │               │ })                 │
   └────────────────────┘               └────────────────────┘
```

**Prompt Versioning Benefits:**
- **Safe rollbacks** — Revert to previous prompt versions instantly
- **A/B testing** — Use labels (`production`, `staging`, `experiment-v2`)
- **Analytics** — Track performance by prompt version
- **Collaboration** — Team edits prompts without code deploys

### 8.6 Environment Variables

```bash
# Langfuse Configuration
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # EU region
# LANGFUSE_BASE_URL=https://us.cloud.langfuse.com  # US region
```

### 8.7 Dashboard Metrics

Langfuse provides these key dashboards for Orion:

| Dashboard | Metrics | Use Case |
|-----------|---------|----------|
| **Traces** | Request volume, latency distribution | Monitor health |
| **Generations** | Token usage, model costs | Cost management |
| **Prompts** | Usage by version/label | Prompt performance |
| **Scores** | User feedback, quality metrics | Quality assurance |
| **Sessions** | Conversation threads | User journey analysis |

---

## 9. Verification Strategies

The agent loop's **Verify Work** phase is critical for production reliability. Agents that check and improve their own output catch mistakes before they compound.

### 9.1 Verification Approaches

| Strategy | Description | Use Case | Latency Impact |
|----------|-------------|----------|----------------|
| **Rules-Based** | Structured validation checks | Format, length, required fields | Low |
| **Visual Feedback** | Screenshots/renders | UI generation, reports | Medium |
| **LLM-as-Judge** | Another model evaluates output | Tone, accuracy, quality | High |

### 9.2 Rules-Based Verification

The most efficient form of verification—define clear rules and check against them.

#### Orion Rules Examples

```typescript
interface VerificationRules {
  maxLength: number;
  requiredElements: string[];
  forbiddenPatterns: RegExp[];
  formatChecks: ((text: string) => boolean)[];
}

const slackResponseRules: VerificationRules = {
  maxLength: 4000,  // Slack best-practice text length; Slack truncates messages containing >40,000 chars
  requiredElements: [],  // Optional: sources, action items
  forbiddenPatterns: [
    /\*\*[^*]+\*\*/,  // No markdown ** (use Slack's *)
    /<blockquote>/,   // No blockquotes (user preference)
  ],
  formatChecks: [
    (text) => !text.includes('```') || text.split('```').length % 2 === 1,  // Balanced code blocks
    (text) => text.length > 0,  // Not empty
  ]
};

async function verifyWithRules(response: string, rules: VerificationRules): Promise<VerificationResult> {
  const errors: string[] = [];
  
  if (response.length > rules.maxLength) {
    errors.push(`Response exceeds ${rules.maxLength} characters`);
  }
  
  for (const pattern of rules.forbiddenPatterns) {
    if (pattern.test(response)) {
      errors.push(`Response contains forbidden pattern: ${pattern}`);
    }
  }
  
  for (const check of rules.formatChecks) {
    if (!check(response)) {
      errors.push('Format check failed');
    }
  }
  
  return {
    passed: errors.length === 0,
    errors
  };
}
```

#### Tool Output Validation

```typescript
// Validate tool outputs before presenting to user
async function verifyToolOutput(toolName: string, output: any): Promise<boolean> {
  switch (toolName) {
    case 'web_search':
      return output.results && output.results.length > 0;
    case 'github_api':
      return output.status !== 'error';
    case 'calendar':
      return output.events !== undefined;
    default:
      return true;
  }
}
```

### 9.3 LLM-as-Judge

For fuzzy validation (tone, quality, accuracy), use another LLM to judge the output.

```typescript
import { startActiveObservation } from '@langfuse/tracing';
import { langfuse } from '../observability/langfuse';

async function verifyWithLLM(
  response: string, 
  originalQuery: string,
  criteria: string[]
): Promise<VerificationResult> {
  
  return await startActiveObservation('llm-verification', async (trace) => {
    const judgmentPrompt = `You are a response quality judge.

Original query: ${originalQuery}

Response to evaluate:
${response}

Evaluate against these criteria:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

For each criterion, respond with:
- PASS or FAIL
- Brief reason (1 sentence)

Final verdict: APPROVED or NEEDS_REVISION`;

    const judgment = await query({
      prompt: judgmentPrompt,
      options: {
        model: 'haiku',  // Fast model for verification
        maxTurns: 1
      }
    });
    
    const result = parseJudgment(judgment);
    trace.update({ 
      output: result,
      metadata: { criteria, passed: result.passed }
    });
    
    return result;
  }, { asType: 'generation' });
}

// Usage
const verification = await verifyWithLLM(response, userMessage, [
  'Response directly addresses the user question',
  'Tone is professional and appropriate for Slack',
  'If sources are cited, they appear credible',
  'Response is concise (not unnecessarily verbose)'
]);
```

### 9.4 Verification in the Agent Loop

```typescript
async function orionAgentLoopWithVerification(userMessage: string) {
  const maxAttempts = 3;
  let lastVerification: VerificationResult | null = null;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate response (with previous feedback if available)
    const prompt = lastVerification 
      ? `${userMessage}\n\n[Previous attempt failed: ${lastVerification.errors.join(', ')}. Please fix.]`
      : userMessage;
    
    const response = await generateResponse(prompt);
    
    // Rules-based verification (fast)
    const rulesCheck = await verifyWithRules(response, slackResponseRules);
    if (!rulesCheck.passed) {
      lastVerification = rulesCheck;
      continue;
    }
    
    // LLM verification (for important queries only)
    if (isHighStakesQuery(userMessage)) {
      const llmCheck = await verifyWithLLM(response, userMessage, [
        'Response is accurate',
        'No hallucinated information'
      ]);
      if (!llmCheck.passed) {
        lastVerification = llmCheck;
        continue;
      }
    }
    
    return response;  // All checks passed!
  }
  
  // Fallback: acknowledge inability to verify
  return "I'm having trouble generating a verified response. Let me try a different approach...";
}
```

### 9.5 Visual Feedback (For Report Generation)

When Orion generates visual content (reports, charts), use visual feedback:

```typescript
// For generated reports or HTML content
async function verifyVisualOutput(htmlContent: string): Promise<VerificationResult> {
  // Use Playwright MCP or similar to render and screenshot
  const screenshot = await renderAndCapture(htmlContent);
  
  // Send screenshot to Claude for visual verification
  const visualCheck = await query({
    prompt: [
      { type: 'image', source: screenshot },
      { type: 'text', text: 'Does this render correctly? Check for: layout issues, text overflow, broken formatting.' }
    ]
  });
  
  return parseVisualJudgment(visualCheck);
}
```

**Source:** [Building Agents with Claude Agent SDK - Verify Your Work](https://www.anthropic.com/engineering/building-agents-with-claude-agent-sdk)

---

## 10. Security Considerations

### 10.1 Secrets Management

| Secret | Storage Method |
|--------|----------------|
| `SLACK_BOT_TOKEN` | GCP Secret Manager |
| `SLACK_SIGNING_SECRET` | GCP Secret Manager |
| `ANTHROPIC_API_KEY` | GCP Secret Manager |
| MCP credentials | GCP Secret Manager |

### 10.2 Request Verification

Slack Bolt automatically verifies request signatures using `SLACK_SIGNING_SECRET`.

### 10.3 Prompt Injection Mitigation

From Slack's documentation:
> "Integrating with AI carries an inherent risk of prompt injection."

**Mitigations:**
- Validate user input before passing to LLM
- Use structured prompts with clear boundaries
- Implement rate limiting per user
- Log all agent actions for audit

### 10.4 Access Control

- Guest access to AI apps may be restricted depending on workspace policy; validate in your Slack AI access settings.
- Use Slack's OAuth scopes to limit bot permissions
- Implement user allowlists if needed

---

## 11. Performance & Scaling

### 9.1 Cold Start Optimization

| Strategy | Implementation |
|----------|----------------|
| Minimum instances | Set `min-instances: 1` in Cloud Run |
| Lightweight dependencies | Use production-only deps |
| Fast startup | Lazy-load MCP connections |

### 9.2 Response Latency

| Phase | Expected Latency |
|-------|------------------|
| Slack → Cloud Run | ~50-100ms |
| Cloud Run → Claude API | ~500-2000ms |
| MCP tool execution | Variable (100ms-5s) |
| Total (simple query) | ~1-3 seconds |
| Total (with MCP tools) | ~3-10 seconds |

### 9.3 Rate Limits

| Service | Limit | Mitigation |
|---------|-------|------------|
| Slack API | Tier-based | Built-in Bolt retry logic |
| Claude API | Tokens/minute | Monitor usage, implement queuing |
| MCP servers | Varies | Per-server rate limiting |

### 9.4 Scaling Strategy

```yaml
# Cloud Run autoscaling
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "10"
```

---

## 12. Testing & Evaluation Patterns

Building reliable agents requires systematic testing and evaluation. The key is looking carefully at output, especially failure cases.

### 12.1 Agent-Specific Testing Questions

When evaluating your agent, ask these diagnostic questions:

| Symptom | Diagnosis | Solution |
|---------|-----------|----------|
| **Agent misunderstands the task** | Missing key information | Alter search APIs, improve context gathering |
| **Agent fails repeatedly at same task** | Unclear rules or missing tools | Add formal validation rules to tool calls |
| **Agent can't recover from errors** | Limited tool options | Provide more creative tools for alternative approaches |
| **Performance varies with new features** | Regression without test coverage | Build representative test sets for programmatic evals |

### 12.2 Evaluation Framework

```typescript
interface AgentEvalCase {
  id: string;
  input: string;
  expectedBehavior: string[];
  tools: string[];
  maxTurns: number;
  assertions: ((response: string) => boolean)[];
}

const orionEvalCases: AgentEvalCase[] = [
  {
    id: 'basic-question',
    input: 'What time is the next team meeting?',
    expectedBehavior: [
      'Searches calendar or conversation history',
      'Provides specific time if found',
      'Asks for clarification if ambiguous'
    ],
    tools: ['mcp', 'Grep'],
    maxTurns: 3,
    assertions: [
      (r) => r.includes('meeting') || r.includes('clarif'),
      (r) => r.length < 500  // Concise response
    ]
  },
  {
    id: 'research-task',
    input: 'Research the latest developments in AI agents',
    expectedBehavior: [
      'Spawns research subagent',
      'Uses web search tools',
      'Returns cited sources'
    ],
    tools: ['Agent', 'mcp', 'web_search'],
    maxTurns: 10,
    assertions: [
      (r) => r.includes('http'),  // Contains URLs
      (r) => r.includes('agent') || r.includes('AI')
    ]
  },
  {
    id: 'error-recovery',
    input: 'Get data from the invalid-api endpoint',
    expectedBehavior: [
      'Attempts API call',
      'Handles error gracefully',
      'Explains what went wrong'
    ],
    tools: ['mcp'],
    maxTurns: 3,
    assertions: [
      (r) => !r.includes('Error:'),  // No raw errors
      (r) => r.includes('unable') || r.includes('couldn\'t') || r.includes('issue')
    ]
  }
];
```

### 12.3 Running Evaluations

```typescript
async function runEvaluations(cases: AgentEvalCase[]): Promise<EvalResults> {
  const results: EvalResult[] = [];
  
  for (const evalCase of cases) {
    const startTime = Date.now();
    
    const response = await query({
      prompt: evalCase.input,
      options: {
        maxTurns: evalCase.maxTurns,
        allowedTools: evalCase.tools
      }
    });
    
    const responseText = extractFinalResponse(response);
    const assertionResults = evalCase.assertions.map(a => a(responseText));
    
    results.push({
      id: evalCase.id,
      passed: assertionResults.every(r => r),
      duration: Date.now() - startTime,
      response: responseText,
      assertionResults
    });
  }
  
  return {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results
  };
}
```

### 12.4 Continuous Evaluation with Langfuse

```typescript
// Log evaluations to Langfuse for tracking over time
async function runAndLogEvaluation(evalCase: AgentEvalCase) {
  await startActiveObservation(`eval-${evalCase.id}`, async (trace) => {
    trace.update({
      metadata: {
        evalType: 'automated',
        expectedBehavior: evalCase.expectedBehavior
      }
    });
    
    const result = await runSingleEval(evalCase);
    
    // Log score to Langfuse
    await langfuse.score.create({
      traceId: trace.traceId,
      name: 'eval-pass',
      value: result.passed ? 1 : 0,
      comment: result.passed ? 'All assertions passed' : 'Some assertions failed'
    });
    
    trace.update({ output: result });
  });
}
```

### 12.5 Failure Analysis Workflow

```
1. IDENTIFY failure case from logs/Langfuse
   ↓
2. REPRODUCE with same input/context
   ↓
3. ANALYZE agent's decision path
   - What context did it gather?
   - What tools did it use?
   - Where did it go wrong?
   ↓
4. DIAGNOSE root cause
   - Missing information?
   - Wrong tool selection?
   - Verification gap?
   ↓
5. FIX
   - Add context sources
   - Improve tool descriptions
   - Add verification rules
   ↓
6. ADD to eval suite
   - Create test case for this failure
   - Ensure regression doesn't recur
```

### 12.6 Key Metrics to Track

| Metric | Description | Target |
|--------|-------------|--------|
| **Success Rate** | % of queries with verified good responses | >95% |
| **Tool Accuracy** | % of tool calls returning valid data | >99% |
| **Response Time** | P50/P95 latency | <5s / <15s |
| **Verification Pass Rate** | % passing all verification checks | >98% |
| **Error Recovery** | % of errors handled gracefully | >90% |
| **User Satisfaction** | Thumbs up / thumbs down ratio | >4:1 |

**Source:** [Building Agents with Claude Agent SDK - Testing and Improving](https://www.anthropic.com/engineering/building-agents-with-claude-agent-sdk)

---

## 13. Risk Assessment

### 10.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude API downtime | Low | High | Implement fallback responses |
| MCP server failures | Medium | Medium | Graceful degradation |
| Slack API changes | Low | Medium | Version pinning, monitoring |
| Cold start delays | Medium | Low | Min instances = 1 |

### 10.2 Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cost overruns | Medium | Medium | Budget alerts, usage limits |
| Prompt injection | Medium | High | Input validation, logging |
| Data leakage | Low | High | Strict MCP permissions |

### 10.3 Dependencies

| Dependency | Risk Level | Notes |
|------------|------------|-------|
| Claude Agent SDK | Low | Anthropic-maintained |
| Slack Bolt | Low | Slack-maintained |
| MCP Protocol | Low | Open standard |
| Cloud Run | Low | GCP SLA |

---

## 14. Recommendations

### 11.1 Immediate Next Steps

1. **Initialize Project**
   ```bash
   mkdir orion-slack-agent
   cd orion-slack-agent
   npm init -y
   npm install @anthropic-ai/claude-agent-sdk @slack/bolt dotenv
   npm install -D typescript @types/node
   ```

2. **Configure Slack App**
   - Enable "Agents & AI Apps" feature
   - Add OAuth scopes: `assistant:write`, `chat:write`, `im:history`
   - Subscribe to events: `assistant_thread_started`, `assistant_thread_context_changed`, `message.im`

3. **Set Up GCP**
   - Create project
   - Enable Cloud Run API
   - Configure Secret Manager
   - Set up CI/CD (Cloud Build)

4. **Develop MVP**
   - Implement basic Assistant handlers
   - Integrate Claude Agent SDK
   - Test locally with ngrok
   - Deploy to Cloud Run

### 11.2 Phased Rollout

| Phase | Scope | Timeline |
|-------|-------|----------|
| **Phase 1** | Basic Q&A (no MCP) | 1-2 days |
| **Phase 2** | Add MCP integrations | 3-5 days |
| **Phase 3** | Production hardening | 1 week |
| **Phase 4** | Advanced features | Ongoing |

### 11.3 Success Metrics

- Response latency < 3 seconds (simple queries)
- Uptime > 99.5%
- User satisfaction (feedback buttons) > 80% positive
- Cost per query < $0.05

---

## 15. Sources & Citations

### Official Documentation

1. **Claude Agent SDK TypeScript**
   - Repository: https://github.com/anthropics/claude-agent-sdk-typescript
   - Documentation: https://code.claude.com/docs/en/sdk/sdk-typescript
   - MCP Integration: https://code.claude.com/docs/en/mcp
   - Skills: https://platform.claude.com/docs/en/agent-sdk/skills
   - Slash Commands: https://code.claude.com/docs/en/slash-commands

2. **Anthropic Engineering Blog**
   - Building Agents with Claude Agent SDK: https://www.anthropic.com/engineering/building-agents-with-claude-agent-sdk
   - Building Effective Agents: https://www.anthropic.com/engineering/building-effective-agents
   - Writing Tools for Agents: https://www.anthropic.com/engineering/writing-tools-for-agents

3. **Slack Developer Documentation**
   - AI Apps Overview: https://docs.slack.dev/ai/developing-ai-apps
   - Bolt JS AI Apps: https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/
   - API Reference: https://api.slack.com/

4. **Google Cloud Platform**
   - Cloud Run: https://cloud.google.com/run
   - Slack Bot Codelab: https://codelabs.developers.google.com/codelabs/cloud-slack-bot

5. **Langfuse (Observability & Prompt Management)**
   - SDK Overview: https://langfuse.com/docs/observability/sdk/overview
   - Prompt Management: https://langfuse.com/docs/prompt-management/get-started
   - TypeScript SDK: https://www.npmjs.com/package/@langfuse/tracing

### Research Tools Used

- **Firecrawl** — Web scraping for documentation
- **Exa** — Neural search for technical content
- **GitHub API** — Repository analysis

---

## Appendix A: Environment Variables

```bash
# .env.example

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token  # Only for Socket Mode

# Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Langfuse Observability
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # EU region
# LANGFUSE_BASE_URL=https://us.cloud.langfuse.com  # US region

# Server Configuration
PORT=8080
NODE_ENV=production
```

---

## Appendix B: Slack App Manifest

```yaml
display_information:
  name: Orion
  description: AI-powered assistant with tool integrations
  background_color: "#1a1a2e"

features:
  bot_user:
    display_name: Orion
    always_online: true
  assistant:
    enabled: true

oauth_config:
  scopes:
    bot:
      - assistant:write
      - chat:write
      - im:history
      - im:read
      - im:write

settings:
  event_subscriptions:
    bot_events:
      - assistant_thread_started
      - assistant_thread_context_changed
      - message.im
  interactivity:
    is_enabled: true
  org_deploy_enabled: false
  socket_mode_enabled: false
```

---

*Research completed: December 17, 2025*
*Researcher: Mary (Business Analyst)*
*Confidence Level: High*
