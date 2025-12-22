---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "_bmad-output/prd.md"
  - "_bmad-output/architecture.md"
epicCount: 9
storyCount: 59
frCount: 43
status: complete
completedAt: '2025-12-17'
validationStatus: passed
---

# 2025-12 orion-slack-agent - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for 2025-12 orion-slack-agent, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Agent Core Execution (FR1-6)**
- FR1: System executes the agent loop (Gather Context → Take Action → Verify Work) for every user interaction
- FR2: System verifies responses before delivery and iterates until verification passes
- FR3: System spawns subagents for parallel task execution with isolated context windows
- FR4: System aggregates only relevant results from subagents into the orchestrator response
- FR5: System manages conversation context across long-running threads via compaction
- FR6: System cites sources for factual claims in responses

**Research & Information Gathering (FR7-12)**
- FR7: Users can request multi-source research across Slack, Confluence, and web sources
- FR8: System synthesizes information from multiple sources into structured summaries
- FR9: System provides links to source materials alongside synthesized information
- FR10: Users can request deep research with automatic parallelization across sources
- FR11: System can search recent Slack history for relevant discussions and solutions
- FR12: System can search Confluence for documentation and knowledge base content

**Communication & Interaction (FR13-18)**
- FR13: Users can interact with Orion via Slack DMs and channels
- FR14: System streams responses in real-time to show progress
- FR15: System maintains conversation context within Slack threads
- FR16: System provides suggested prompts to help users discover capabilities
- FR17: System responds to @mentions and direct messages
- FR18: System can summarize Slack threads on request

**Code Generation & Execution (FR19-23)**
- FR19: System generates executable code when pre-built integrations don't exist
- FR20: System executes generated code in sandboxed environments
- FR21: System can call external APIs via generated code
- FR22: System processes and transforms data via generated code
- FR23: System validates generated code output before returning results

**Composable Extensions (FR24-29)**
- FR24: Developers can add new Skills via file-based definitions in `.orion/skills/`
- FR25: Developers can add new Commands via file-based definitions in `.orion/commands/`
- FR26: System can connect to MCP servers for external tool access
- FR27: System can invoke multiple MCP servers within a single response
- FR28: System selects appropriate tools from available options for each task
- FR29: Platform admin can enable or disable MCP servers

**Knowledge & Q&A (FR30-34)**
- FR30: Users can ask questions and receive grounded, verified answers
- FR31: System searches relevant knowledge sources before answering
- FR32: Users can request prospect research and receive structured dossiers
- FR33: Users can request audience targeting recommendations with exact IDs
- FR34: System provides troubleshooting guidance by searching recent issues

**Observability & Administration (FR35-40)**
- FR35: System traces all interactions via Langfuse
- FR36: System tracks token usage and cost per interaction
- FR37: Platform admin can view interaction traces for debugging
- FR38: Platform admin can manage prompt versions via Langfuse
- FR39: System logs all tool executions and their results
- FR40: Platform admin can configure which tools are available

**MVP Workflows (FR41-43)**
- FR41: System supports Deep Research workflow (multi-step, parallelized, synthesized)
- FR42: System supports Summarization workflow (threads, documents, conversations)
- FR43: System supports Q&A workflow (grounded, verified, cited)

### NonFunctional Requirements

**Performance**
- NFR1: Simple query response time of 1-3 seconds (time from user message to first streamed response)
- NFR2: Tool-augmented response time of 3-10 seconds (time from user message to complete response with tool calls)
- NFR3: Deep research workflow completes in <5 minutes (multi-source research with synthesis)
- NFR4: Streaming starts within <500ms (time from message receipt to first streamed token)
- NFR5: Maximum 3 concurrent subagents per request

**Security**
- NFR6: All API keys and tokens stored in GCP Secret Manager—never in code or logs
- NFR7: All Slack requests validated via signing secret
- NFR8: All generated code runs in sandboxed environments with no filesystem/network escape
- NFR9: No sensitive data stored in Orion—all data remains in source systems
- NFR10: All users authenticated via Slack—no separate auth layer
- NFR11: All interactions traced via Langfuse with user identification

**Reliability**
- NFR12: Uptime >99.5% (measured monthly)
- NFR13: Cold start mitigation via min instances = 1 (always-on Cloud Run instance)
- NFR14: Graceful degradation when MCP server unavailable (inform user and continue with available tools)
- NFR15: Automatic retry with exponential backoff for transient failures
- NFR16: 100% trace coverage via Langfuse (every interaction traced)

**Integration**
- NFR17: Support MCP 1.0 protocol for MCP server compatibility
- NFR18: Support multiple MCP servers in single response for concurrent tool calls
- NFR19: 30 second timeout per tool call with graceful handling
- NFR20: All responses stream to Slack regardless of tool usage
- NFR21: OpenTelemetry-compatible tracing for Langfuse integration

**Scalability**
- NFR22: Support 50 simultaneous concurrent users (initial internal deployment)
- NFR23: Support 100 requests per minute (peak expected load)
- NFR24: Support 200k token context window (Claude Sonnet limit; compaction manages long threads)
- NFR25: Cloud Run auto-scaling to demand within budget

**Cost**
- NFR26: Average cost per query <$0.10 (tracked via Langfuse)
- NFR27: Configurable monthly budget alerts and limits
- NFR28: Per-interaction token tracking (all token usage logged)

### Additional Requirements

**From Architecture - Project Foundation**
- AR1: Custom project structure (no starter template) — agentic Slack platform requires specialized organization
- AR2: TypeScript 5.x as primary language with strict mode
- AR3: Node.js 20 LTS runtime
- AR4: pnpm as package manager
- AR5: Vitest for testing (fast, ESM-native)
- AR6: ESLint + Prettier for linting and formatting

**From Architecture - Agent Patterns (MANDATORY)**
- AR7: ALL agent implementations MUST follow the canonical agent loop pattern (gather → act → verify)
- AR8: Maximum 3 verification attempts before graceful failure
- AR9: Subagents spawned via `spawnSubagent()` pattern with isolated context
- AR10: Parallel subagent execution via `Promise.all()` for concurrent tasks

**From Architecture - Observability (MANDATORY)**
- AR11: ALL handlers MUST be wrapped in Langfuse traces via `startActiveObservation`
- AR12: Structured JSON logging for all log statements (timestamp, level, event, traceId)
- AR13: Instrumentation.ts MUST be imported first in index.ts

**From Architecture - Tool Layer**
- AR14: MCP servers initialize lazily after Claude SDK ready
- AR15: Tool fallback to code generation when MCP tool doesn't exist
- AR16: Rube RUBE_REMOTE_WORKBENCH for code execution (Python/bash)
- AR17: Agent discovers available tools dynamically (minimal tools preloaded in context)

**From Architecture - Error Handling**
- AR18: Use `OrionError` interface for ALL errors (code, message, userMessage, recoverable)
- AR19: Graceful degradation for tool failures — continue with available tools, inform user
- AR20: 4 minute hard timeout (below Cloud Run default)

**From Architecture - Slack Formatting (User Preference)**
- AR21: Use Slack mrkdwn syntax: `*bold*` NOT `**bold**`, `_italic_` NOT `*italic*`
- AR22: No blockquotes in Slack responses — use bullet points and plain text
- AR23: No emojis unless explicitly requested by user

**From Architecture - File Organization**
- AR24: File naming: kebab-case.ts (e.g., `user-message.ts`)
- AR25: Code naming: PascalCase for classes/interfaces, camelCase for functions/variables
- AR26: Agent definitions in `.orion/` directory (BMAD-inspired)
- AR27: Claude SDK extensions in `.claude/` directory (skills, commands)
- AR28: Agentic search context in `orion-context/` directory

**From Architecture - Memory & Context**
- AR29: Slack API fetch for thread context (stateless Cloud Run)
- AR30: Manual sliding window compaction for long thread handling
- AR31: File-based persistent memory in `orion-context/`
- AR32: Langfuse SDK prompt caching (5 min TTL)

**From Architecture - Deployment**
- AR33: Docker deployment to Google Cloud Run (HTTP mode)
- AR34: GitHub Actions for CI (test + lint on PR)
- AR35: Cloud Build for deployment trigger
- AR36: Environment tags for staging/production (`--tag staging`)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 2 | Agent loop execution |
| FR2 | Epic 2 | Response verification |
| FR3 | Epic 5 | Subagent spawning |
| FR4 | Epic 5 | Subagent result aggregation |
| FR5 | Epic 2 | Context compaction |
| FR6 | Epic 2 | Source citations |
| FR7 | Epic 5 | Multi-source research |
| FR8 | Epic 5 | Information synthesis |
| FR9 | Epic 5 | Source material links |
| FR10 | Epic 5 | Deep research parallelization |
| FR11 | Epic 5 | Slack history search |
| FR12 | Epic 5 | Confluence search |
| FR13 | Epic 1 | Slack DMs and channels |
| FR14 | Epic 1 | Response streaming |
| FR15 | Epic 2 | Thread context maintenance |
| FR16 | Epic 7 | Suggested prompts |
| FR17 | Epic 2 | @mentions and DMs |
| FR18 | Epic 6 | Thread summarization |
| FR19 | Epic 4 | Code generation |
| FR20 | Epic 4 | Sandboxed execution |
| FR21 | Epic 4 | API calls via code |
| FR22 | Epic 4 | Data processing via code |
| FR23 | Epic 4 | Code output validation |
| FR24 | Epic 7 | Skills framework |
| FR25 | Epic 7 | Commands framework |
| FR26 | Epic 3 | MCP server connection |
| FR27 | Epic 3 | Multiple MCP servers |
| FR28 | Epic 3 | Tool selection |
| FR29 | Epic 3 | Admin MCP controls |
| FR30 | Epic 2 | Q&A responses |
| FR31 | Epic 2 | Knowledge source search |
| FR32 | Epic 8 | Prospect research dossiers |
| FR33 | Epic 8 | Audience targeting IDs |
| FR34 | Epic 6 | Troubleshooting guidance |
| FR35 | Epic 1 | Langfuse tracing |
| FR36 | Epic 9 | Token/cost tracking |
| FR37 | Epic 9 | Admin trace viewing |
| FR38 | Epic 9 | Prompt version management |
| FR39 | Epic 3 | Tool execution logging |
| FR40 | Epic 3 | Tool configuration |
| FR41 | Epic 5 | Deep Research workflow |
| FR42 | Epic 6 | Summarization workflow |
| FR43 | Epic 6 | Q&A workflow |

## Epic List

### Epic 1: Project Foundation & Slack Connection
Users can talk to Orion in Slack and receive streaming responses. Development environment is fully configured with observability from day one.

**FRs covered:** FR13, FR14, FR35
**ARs covered:** AR1-6, AR11-13, AR21-28, AR33-36

---

### Epic 2: Agent Core & Verified Responses
Users get verified, accurate responses with source citations and proper context management across long conversations.

**FRs covered:** FR1, FR2, FR5, FR6, FR15, FR17, FR30, FR31
**ARs covered:** AR7-10, AR18-20, AR29-32

---

### Epic 3: MCP Tool Integration
Orion can connect to external tools via MCP (500+ apps via Rube/Composio) and admins can control tool access.

**FRs covered:** FR26, FR27, FR28, FR29, FR39, FR40
**ARs covered:** AR14, AR17, AR19

---

### Epic 4: Code Generation & Execution
When no tool exists, Orion writes and runs code to fill the gap — eliminating the integration ceiling.

**FRs covered:** FR19, FR20, FR21, FR22, FR23
**ARs covered:** AR15, AR16

---

### Epic 5: Subagents & Deep Research
Users can request deep research across Slack, Confluence, and web with parallelized subagents and synthesized results.

**FRs covered:** FR3, FR4, FR7, FR8, FR9, FR10, FR11, FR12, FR41
**NFRs addressed:** NFR5

---

### Epic 6: Summarization & Q&A Workflows
Users can summarize threads and documents, and get troubleshooting guidance via Q&A workflows.

**FRs covered:** FR18, FR34, FR42, FR43

---

### Epic 7: Skills & Commands Framework
Developers can extend Orion by dropping skill and command files into `.orion/` directories.

**FRs covered:** FR16, FR24, FR25
**ARs covered:** AR26, AR27, AR28

---

### Epic 8: Domain-Specific Intelligence
Users get specialized domain recommendations including prospect dossiers and audience targeting with exact IDs.

**FRs covered:** FR32, FR33

---

### Epic 9: Production Observability & Cost Management
Admins have full visibility into system behavior, costs, and can manage prompt versions.

**FRs covered:** FR36, FR37, FR38

---

## Epic 1: Project Foundation & Slack Connection

Users can talk to Orion in Slack and receive streaming responses. Development environment is fully configured with observability from day one.

### Story 1.1: Project Scaffolding

As a *developer*,
I want a properly structured TypeScript project with all dependencies configured,
So that I can start building Orion with consistent tooling and patterns.

**Acceptance Criteria:**

**Given** a new project directory
**When** I run `pnpm install`
**Then** all dependencies are installed including @anthropic-ai/sdk, @slack/bolt, @langfuse/client
**And** TypeScript compiles without errors via `pnpm build`
**And** ESLint and Prettier are configured with the architecture's naming conventions
**And** Vitest is configured and runs with `pnpm test`
**And** The directory structure matches the architecture spec (src/, .orion/, .claude/, orion-context/)
**And** .env.example exists with all required environment variables documented

---

### Story 1.2: Langfuse Instrumentation

As a *platform admin*,
I want all Orion interactions traced via Langfuse from day one,
So that I have full observability into system behavior.

**Acceptance Criteria:**

**Given** the project is scaffolded
**When** the application starts
**Then** instrumentation.ts is imported first in index.ts
**And** OpenTelemetry is configured with Langfuse as the tracing backend
**And** A Langfuse client singleton is available in src/observability/langfuse.ts
**And** The `startActiveObservation` wrapper function is available for handler tracing
**And** Test traces appear in Langfuse dashboard when running locally

---

### Story 1.3: Slack Bolt App Setup

As a *user*,
I want to send messages to Orion in Slack and receive acknowledgment,
So that I know the system is connected and responding.

**Acceptance Criteria:**

**Given** the Langfuse instrumentation is configured
**When** I send a DM to the Orion bot in Slack
**Then** the message is received by the Slack Bolt app
**And** Slack request signatures are validated via the signing secret
**And** The handler is wrapped in a Langfuse trace
**And** A simple acknowledgment response is sent back ("Orion received your message")
**And** The interaction appears in Langfuse traces

---

### Story 1.4: Assistant Class & Thread Handling

As a *user*,
I want to have threaded conversations with Orion,
So that context is maintained within a conversation.

**Acceptance Criteria:**

**Given** Slack Bolt is configured
**When** I start a new thread with Orion
**Then** the Assistant class handles threadStarted events
**And** threadContextChanged events are handled when I switch threads
**And** userMessage events are handled for messages within threads
**And** Thread history is fetched from Slack API for context
**And** All handlers are traced via Langfuse

---

### Story 1.5: Response Streaming

As a *user*,
I want to see Orion's responses stream in real-time,
So that I know the system is working and don't wait for long responses.

**Acceptance Criteria:**

**Given** the Assistant class is handling messages
**When** Orion generates a response
**Then** the response streams to Slack using chatStream API
**And** Streaming starts within 500ms of message receipt (NFR4)
**And** The streamed response uses Slack mrkdwn formatting (*bold*, _italic_)
**And** No blockquotes are used in responses
**And** No emojis are used unless explicitly requested
**And** The complete response is traced in Langfuse

---

### Story 1.6: Docker & Cloud Run Deployment

As a *developer*,
I want to deploy Orion to Google Cloud Run,
So that the system is accessible to Slack in production.

**Acceptance Criteria:**

**Given** the application handles Slack events and streams responses
**When** I run `pnpm docker:build`
**Then** a Docker image is built with the Dockerfile
**And** The image uses Node.js 20 LTS
**And** docker-compose.yml works for local development
**And** The app runs in HTTP mode (not socket mode) for Cloud Run
**And** Secrets are read from environment variables (GCP Secret Manager in production)
**And** min-instances is set to 1 in Cloud Run config to avoid cold starts

---

### Story 1.7: CI/CD Pipeline

As a *developer*,
I want automated testing and deployment,
So that code changes are validated and deployed consistently.

**Acceptance Criteria:**

**Given** the Docker deployment is configured
**When** I push a PR to GitHub
**Then** GitHub Actions runs lint and test checks
**And** Cloud Build triggers on merge to main
**And** The new revision deploys to Cloud Run
**And** Environment tags (staging, production) are supported via `--tag`

---

## Epic 2: Agent Core & Verified Responses

Users get verified, accurate responses with source citations and proper context management across long conversations.

### Story 2.1: Anthropic API Integration

As a *user*,
I want Orion to respond intelligently to my messages,
So that I get helpful answers powered by Claude.

**Acceptance Criteria:**

**Given** the Slack app is receiving messages
**When** a user sends a message to Orion
**Then** the message is passed to Anthropic API via `messages.create()`
**And** A system prompt is constructed from `.orion/agents/orion.md`
**And** The response is streamed back to Slack
**And** The full interaction (input, output, tokens) is traced in Langfuse
**And** Response time for simple queries is 1-3 seconds (NFR1)

---

### Story 2.2: Agent Loop Implementation

As a *user*,
I want Orion to gather context before answering,
So that responses are grounded in real information, not assumptions.

**Acceptance Criteria:**

**Given** the Claude SDK is integrated
**When** Orion processes a user message
**Then** the agent loop executes: Gather Context → Take Action → Verify Work
**And** The gather phase searches available context (thread history, orion-context/)
**And** The act phase generates a response based on gathered context
**And** The verify phase checks the response for accuracy
**And** Each phase is logged as a span within the Langfuse trace

---

### Story 2.3: Response Verification & Retry

As a *user*,
I want Orion to verify responses before sending them,
So that I receive accurate, high-quality answers.

**Acceptance Criteria:**

**Given** the agent loop is implemented
**When** verification fails
**Then** the agent retries with feedback from verification
**And** Maximum 3 verification attempts before graceful failure (AR8)
**And** If all attempts fail, a graceful failure response is returned to the user
**And** Verification results are logged in Langfuse
**And** Verification pass rate is tracked (target: >95%)

---

### Story 2.4: OrionError & Graceful Degradation

As a *user*,
I want helpful error messages when something goes wrong,
So that I understand what happened and what to do next.

**Acceptance Criteria:**

**Given** an error occurs during processing
**When** the error is caught
**Then** it is wrapped in the OrionError interface (code, message, userMessage, recoverable)
**And** A user-friendly message is returned to Slack
**And** The full error details are logged with structured JSON (AR12)
**And** Recoverable errors trigger retries with exponential backoff
**And** The 4-minute hard timeout is enforced (AR20)

---

### Story 2.5: Thread Context & History

As a *user*,
I want Orion to remember what we discussed earlier in the thread,
So that I don't have to repeat context.

**Acceptance Criteria:**

**Given** a conversation is happening in a Slack thread
**When** the user sends a follow-up message
**Then** thread history is fetched from Slack API
**And** The full thread context is passed to Claude
**And** Orion references previous messages appropriately
**And** Thread context is maintained correctly (FR15)
**And** @mentions and DMs are both handled (FR17)

---

### Story 2.6: Context Compaction

As a *user*,
I want to have long conversations without hitting limits,
So that complex discussions can continue uninterrupted.

**Acceptance Criteria:**

**Given** a conversation exceeds the context window
**When** the 200k token limit is approached (NFR24)
**Then** manual sliding window compaction is triggered (AR30)
**And** Older context is summarized to free up space
**And** Key information is preserved in the compacted context
**And** The conversation continues without user interruption
**And** Compaction events are logged in Langfuse

---

### Story 2.7: Source Citations

As a *user*,
I want to know where Orion's information comes from,
So that I can verify facts and explore further.

**Acceptance Criteria:**

**Given** Orion gathers context from sources
**When** the response includes factual claims
**Then** sources are cited inline or at the end of the response (FR6)
**And** Citations include links when available
**And** Citation rate is tracked (target: >90%)
**And** Uncited factual claims are flagged during verification

---

### Story 2.8: File-Based Memory

As a *user*,
I want Orion to remember important information between sessions,
So that I don't have to re-explain context.

**Acceptance Criteria:**

**Given** the orion-context/ directory exists
**When** Orion identifies information worth remembering
**Then** it is saved to orion-context/ as a file
**And** The gather phase searches orion-context/ for relevant memories
**And** User preferences are stored in orion-context/user-preferences/
**And** Conversation summaries are stored in orion-context/conversations/
**And** Knowledge is stored in orion-context/knowledge/

---

### Story 2.9: Basic Q&A with Knowledge Search

As a *user*,
I want to ask questions and get grounded answers,
So that I can find information quickly.

**Acceptance Criteria:**

**Given** the agent loop and memory are working
**When** I ask a question
**Then** Orion searches relevant knowledge sources before answering (FR31)
**And** The answer is grounded in found information
**And** Sources are cited in the response
**And** If no relevant information is found, Orion says so rather than guessing
**And** The response is verified before delivery (FR30)

---

## Epic 3: MCP Tool Integration

Orion can connect to external tools via MCP (500+ apps via Rube/Composio) and admins can control tool access.

### Story 3.1: MCP Client Infrastructure

As a *developer*,
I want a robust MCP client that can connect to servers,
So that Orion can use external tools.

**Acceptance Criteria:**

**Given** the agent core is working
**When** the application initializes
**Then** MCP servers initialize lazily after Claude SDK is ready (AR14)
**And** The MCP client is available in src/tools/mcp/client.ts
**And** Connection errors are handled gracefully
**And** MCP server configurations are loaded from .orion/config.yaml
**And** The client supports MCP 1.0 protocol (NFR17)

---

### Story 3.2: Tool Discovery & Registration

As an *agent*,
I want to discover available tools dynamically,
So that I know what capabilities are available.

**Acceptance Criteria:**

**Given** MCP servers are configured
**When** a tool call is needed
**Then** available tools are discovered from connected MCP servers
**And** Tool schemas (inputs, outputs) are available to the agent
**And** Minimal tools are preloaded in context (AR17)
**And** Tool discovery results are cached appropriately
**And** New MCP servers can be added without code changes

---

### Story 3.3: Tool Execution with Timeout

As a *user*,
I want tool calls to complete reliably,
So that external integrations don't hang my request.

**Acceptance Criteria:**

**Given** a tool is discovered and selected
**When** the agent executes the tool
**Then** the tool call has a 30-second timeout (NFR19)
**And** Timeout errors are handled gracefully
**And** The user is informed if a tool times out
**And** Tool execution continues with other available tools
**And** Tool results are returned to the agent for processing

---

### Story 3.4: Multiple MCP Servers

As a *user*,
I want Orion to use multiple tools in a single response,
So that complex tasks can be completed in one interaction.

**Acceptance Criteria:**

**Given** multiple MCP servers are connected
**When** a request requires multiple tools
**Then** the agent can invoke tools from different MCP servers (FR27)
**And** Tool calls are executed appropriately (parallel when independent)
**And** Results from multiple tools are aggregated
**And** The response incorporates information from all tool calls
**And** Concurrent tool calls are supported (NFR18)

---

### Story 3.5: Intelligent Tool Selection

As a *user*,
I want Orion to choose the right tool for each task,
So that I get the best results without specifying tools.

**Acceptance Criteria:**

**Given** multiple tools are available
**When** the agent processes a request
**Then** it selects appropriate tools from available options (FR28)
**And** Tool selection is based on the request context and tool capabilities
**And** The agent explains tool choices in traces (for debugging)
**And** If no suitable tool exists, the agent falls back to code generation (Epic 4)

---

### Story 3.6: Tool Execution Logging

As a *platform admin*,
I want to see all tool executions and their results,
So that I can debug issues and audit tool usage.

**Acceptance Criteria:**

**Given** tools are being executed
**When** a tool call completes (success or failure)
**Then** the execution is logged via Langfuse (FR39)
**And** Logs include: tool name, arguments, result, duration, success/failure
**And** Tool execution spans are visible in the Langfuse trace
**And** Failed tool calls include error details
**And** Structured JSON logging is used (AR12)

---

### Story 3.7: Admin Tool Configuration

As a *platform admin*,
I want to enable or disable MCP servers,
So that I can control which integrations are available.

**Acceptance Criteria:**

**Given** MCP servers are configured
**When** an admin modifies .orion/config.yaml
**Then** MCP servers can be enabled or disabled (FR29)
**And** Disabled servers are not available to the agent
**And** Tool availability configuration is loaded at startup (FR40)
**And** Changes take effect on next restart (no hot reload required for MVP)
**And** Configuration changes are logged

---

### Story 3.8: Graceful Degradation for Tool Failures

As a *user*,
I want Orion to continue working when a tool fails,
So that one broken integration doesn't block my request.

**Acceptance Criteria:**

**Given** a tool call fails
**When** the error is not recoverable
**Then** the agent continues with available tools (AR19)
**And** The user is informed about the unavailable tool
**And** The response is still useful with remaining capabilities
**And** Failed tools are retried with exponential backoff (NFR15)
**And** Persistent failures are logged for admin review

---

## Epic 4: Code Generation & Execution

When no tool exists, Orion writes and runs code to fill the gap — eliminating the integration ceiling.

### Story 4.1: Code Generation Capability

As a *user*,
I want Orion to write code when no tool exists,
So that I can accomplish tasks without waiting for integrations.

**Acceptance Criteria:**

**Given** the agent needs to perform an action
**When** no MCP tool exists for the task
**Then** the agent generates executable code (FR19)
**And** Code is generated in Python or JavaScript as appropriate
**And** The generated code is included in the Langfuse trace
**And** Code generation is the fallback when MCP tools fail (AR15)
**And** The user is informed that code is being generated

---

### Story 4.2: Sandbox Environment Setup

As a *developer*,
I want generated code to run in a secure sandbox,
So that untrusted code cannot harm the system.

**Acceptance Criteria:**

**Given** code has been generated
**When** the sandbox is initialized
**Then** Rube RUBE_REMOTE_WORKBENCH is configured for code execution (AR16)
**And** The sandbox has no filesystem access outside its container
**And** The sandbox has no network escape capabilities (NFR8)
**And** Resource limits (CPU, memory, time) are enforced
**And** Sandbox initialization is traced in Langfuse

---

### Story 4.3: Code Execution

As a *user*,
I want generated code to actually run and produce results,
So that I get actionable output, not just code.

**Acceptance Criteria:**

**Given** code is generated and sandbox is ready
**When** the code is executed
**Then** it runs in the sandboxed environment (FR20)
**And** Execution output (stdout, stderr) is captured
**And** Execution is subject to timeout limits
**And** Results are returned to the agent for processing
**And** Execution events are logged in Langfuse

---

### Story 4.4: External API Calls via Code

As a *user*,
I want generated code to call external APIs,
So that Orion can connect to any system with an API.

**Acceptance Criteria:**

**Given** code is executing in the sandbox
**When** the code makes HTTP requests
**Then** external API calls are allowed (FR21)
**And** API responses are captured and returned
**And** Network calls are logged for debugging
**And** The agent can provide API documentation to guide code generation
**And** Authentication is handled via environment variables in sandbox

---

### Story 4.5: Data Processing via Code

As a *user*,
I want generated code to process and transform data,
So that complex data operations can be performed.

**Acceptance Criteria:**

**Given** data needs to be processed
**When** the agent generates data processing code
**Then** the code can parse, filter, transform, and aggregate data (FR22)
**And** Common data formats are supported (JSON, CSV, etc.)
**And** Results are formatted for user consumption
**And** Large data sets are handled appropriately (chunking if needed)
**And** Processing results are included in the response

---

### Story 4.6: Code Output Validation

As a *user*,
I want generated code output to be validated before I see it,
So that I receive correct, safe results.

**Acceptance Criteria:**

**Given** code has executed and produced output
**When** the agent processes the results
**Then** output is validated before returning to the user (FR23)
**And** Error outputs are handled gracefully
**And** Unexpected output formats are caught
**And** Validation failures trigger retry with adjusted code
**And** Validation results are logged in Langfuse

---

## Epic 5: Subagents & Deep Research

Users can request deep research across Slack, Confluence, and web with parallelized subagents and synthesized results.

### Story 5.1: Subagent Infrastructure

As a *developer*,
I want a framework for spawning specialized subagents,
So that complex tasks can be broken into parallel subtasks.

**Acceptance Criteria:**

**Given** the agent core is working
**When** a complex task requires parallelization
**Then** subagents can be spawned via `spawnSubagent()` pattern (AR9)
**And** Subagent definitions are loaded from .orion/agents/
**And** Each subagent has its own system prompt and capabilities
**And** Subagent spawning is traced in Langfuse
**And** The framework supports up to 3 concurrent subagents (NFR5)

---

### Story 5.2: Subagent Context Isolation

As a *user*,
I want subagent results to be focused and relevant,
So that I don't get overwhelmed with unnecessary details.

**Acceptance Criteria:**

**Given** subagents are spawned for a task
**When** each subagent executes
**Then** it has an isolated context window (FR3)
**And** Only relevant context is passed to each subagent
**And** Subagent results are focused on their specific task
**And** Context isolation prevents cross-contamination
**And** Memory usage is optimized by isolation

---

### Story 5.3: Parallel Subagent Execution

As a *user*,
I want research to happen in parallel,
So that complex tasks complete faster.

**Acceptance Criteria:**

**Given** multiple subagents are needed
**When** they can execute independently
**Then** subagents run in parallel via Promise.all() (AR10)
**And** Results are collected as subagents complete
**And** Failures in one subagent don't block others
**And** Maximum 3 subagents execute concurrently (NFR5)
**And** Parallel execution is visible in Langfuse traces

---

### Story 5.4: Slack History Search

As a *user*,
I want Orion to search Slack for relevant discussions,
So that I can find information from past conversations.

**Acceptance Criteria:**

**Given** a research request mentions internal discussions
**When** the agent searches for information
**Then** it can search recent Slack history (FR11)
**And** Search includes channels the user has access to
**And** Results include message links for context
**And** Search results are filtered for relevance
**And** Slack search is available as a subagent capability

---

### Story 5.5: Confluence Search

As a *user*,
I want Orion to search Confluence for documentation,
So that I can find information from our knowledge base.

**Acceptance Criteria:**

**Given** a research request needs documentation
**When** the agent searches for information
**Then** it can search Confluence content (FR12)
**And** Search covers spaces the user has access to
**And** Results include page links for full context
**And** Search results are filtered for relevance
**And** Confluence search is available as a subagent capability

---

### Story 5.6: Web Search Integration

As a *user*,
I want Orion to search the web for external information,
So that I can research beyond internal sources.

**Acceptance Criteria:**

**Given** a research request needs external information
**When** the agent determines web search is needed
**Then** it can search the web via MCP/tool integration
**And** Results include source URLs
**And** Search results are filtered for credibility
**And** Web search is available as a subagent capability
**And** Web search supports multi-source research (FR7)

---

### Story 5.7: Result Aggregation & Synthesis

As a *user*,
I want research results synthesized into a coherent summary,
So that I don't have to read through raw data.

**Acceptance Criteria:**

**Given** subagents have completed their searches
**When** results are returned to the orchestrator
**Then** only relevant results are aggregated (FR4)
**And** Information is synthesized into structured summaries (FR8)
**And** Contradictions or gaps are noted
**And** The synthesis is coherent and actionable
**And** Synthesis quality is verified before delivery

---

### Story 5.8: Source Linking

As a *user*,
I want links to all source materials,
So that I can verify and explore further.

**Acceptance Criteria:**

**Given** research results are synthesized
**When** the response is delivered
**Then** links to source materials are included (FR9)
**And** Links are formatted for Slack (clickable)
**And** Sources are organized by type (Slack, Confluence, web)
**And** Links are verified as accessible when possible
**And** Missing sources are noted

---

### Story 5.9: Deep Research Workflow

As a *user*,
I want to request comprehensive research with a single message,
So that complex research happens automatically.

**Acceptance Criteria:**

**Given** a user requests deep research
**When** the agent processes the request
**Then** the Deep Research workflow is triggered (FR41)
**And** Multiple sources are searched in parallel (FR10)
**And** Results are synthesized with source citations
**And** The workflow completes in <5 minutes (NFR3)
**And** Progress updates are streamed to the user
**And** The complete workflow is traced in Langfuse

---

## Epic 6: Summarization & Q&A Workflows

Users can summarize threads and documents, and get troubleshooting guidance via Q&A workflows.

### Story 6.1: Thread Summarization

As a *user*,
I want Orion to summarize Slack threads,
So that I can quickly catch up on long discussions.

**Acceptance Criteria:**

**Given** a long Slack thread exists
**When** I ask Orion to summarize it
**Then** the complete thread is fetched (FR18)
**And** Key points are extracted and organized
**And** Action items are highlighted if present
**And** Participants and decisions are noted
**And** The summary is concise but comprehensive
**And** Source thread link is included

---

### Story 6.2: Document Summarization

As a *user*,
I want Orion to summarize documents,
So that I can quickly understand long content.

**Acceptance Criteria:**

**Given** a document (Confluence page, file, etc.)
**When** I ask Orion to summarize it
**Then** the document content is retrieved
**And** Key points and structure are extracted
**And** The summary preserves important details
**And** Links to the source document are included
**And** Long documents are handled via chunking if needed

---

### Story 6.3: Conversation Summarization

As a *user*,
I want Orion to summarize our current conversation,
So that I can save or share the key points.

**Acceptance Criteria:**

**Given** a conversation thread with Orion
**When** I ask for a summary
**Then** the conversation is analyzed
**And** Key questions and answers are extracted
**And** Decisions and next steps are highlighted
**And** The summary is formatted for sharing
**And** The summary supports the Summarization workflow (FR42)

---

### Story 6.4: Troubleshooting via Recent Issues

As a *user*,
I want Orion to help me troubleshoot by finding similar issues,
So that I can solve problems faster.

**Acceptance Criteria:**

**Given** I describe a problem or error
**When** I ask Orion for help
**Then** Orion searches for similar recent issues (FR34)
**And** Slack history is searched for relevant discussions
**And** Known solutions are surfaced
**And** Links to previous discussions are included
**And** The troubleshooting guidance is verified before delivery

---

### Story 6.5: Q&A Workflow

As a *user*,
I want to ask questions and get complete, verified answers,
So that I can find information reliably.

**Acceptance Criteria:**

**Given** I ask a question
**When** Orion processes the Q&A workflow (FR43)
**Then** relevant sources are searched first
**And** The answer is grounded in found information
**And** Sources are cited in the response
**And** The answer is verified before delivery
**And** Follow-up questions are supported in the thread
**And** Unsure answers are flagged as such

---

## Epic 7: Skills & Commands Framework

Developers can extend Orion by dropping skill and command files into `.orion/` directories.

### Story 7.1: Skills Framework Infrastructure

As a *developer*,
I want a framework for defining Skills,
So that I can add new capabilities without code changes.

**Acceptance Criteria:**

**Given** the .claude/skills/ directory exists
**When** a skill file is present
**Then** the skill definition is loaded at startup
**And** Skills are defined in markdown files (.md)
**And** Each skill has a name, description, and instructions
**And** Skills can specify required tools or capabilities
**And** Skill loading is logged in Langfuse

---

### Story 7.2: Skill Discovery & Registration

As an *agent*,
I want to discover and use available Skills,
So that I can apply them when relevant.

**Acceptance Criteria:**

**Given** Skills are loaded
**When** the agent processes a request
**Then** relevant Skills are matched based on request context
**And** Skill instructions augment the agent's capabilities
**And** Multiple Skills can be applied to a single request
**And** Skill usage is traced in Langfuse
**And** Adding a new Skill file is all that's needed to extend (FR24)

---

### Story 7.3: Commands Framework Infrastructure

As a *developer*,
I want a framework for defining Commands,
So that users can trigger specific workflows.

**Acceptance Criteria:**

**Given** the .claude/commands/ directory exists
**When** a command file is present
**Then** the command definition is loaded at startup
**And** Commands are defined in markdown files (.md)
**And** Each command has a trigger pattern and workflow
**And** Commands can accept parameters
**And** Command loading is logged in Langfuse

---

### Story 7.4: Command Discovery & Execution

As a *user*,
I want to trigger Commands in my messages,
So that I can run specific workflows directly.

**Acceptance Criteria:**

**Given** Commands are loaded
**When** I use a command trigger pattern (e.g., "run X workflow")
**Then** the corresponding Command is matched
**And** Command parameters are extracted from the message
**And** The Command workflow is executed
**And** Command results are returned to the user
**And** Adding a new Command file is all that's needed to extend (FR25)

---

### Story 7.5: Suggested Prompts

As a *user*,
I want to see suggested prompts,
So that I can discover Orion's capabilities.

**Acceptance Criteria:**

**Given** I start a conversation with Orion
**When** the thread begins
**Then** suggested prompts are displayed (FR16)
**And** Prompts are relevant to available Skills and Commands
**And** Prompts demonstrate key capabilities
**And** Clicking/selecting a prompt triggers that action
**And** Prompts are configurable via .orion/config.yaml

---

### Story 7.6: Extensibility Validation

As a *developer*,
I want to verify that extensions work without code changes,
So that the MVP success gate is met.

**Acceptance Criteria:**

**Given** the Skills and Commands frameworks are working
**When** I add a new Skill or Command file
**Then** it is available after restart (no code changes)
**And** The new capability works as defined
**And** This validates the MVP success gate: "Successfully add 1 new Skill or Command post-launch"
**And** Extension patterns are documented

---

## Epic 8: Domain-Specific Intelligence

Users get specialized domain recommendations including prospect dossiers and audience targeting with exact IDs.

### Story 8.1: Prospect Research Capability

As a *sales user*,
I want Orion to research prospects,
So that I'm prepared for sales calls.

**Acceptance Criteria:**

**Given** I provide a prospect name and company
**When** I request a prospect brief
**Then** Orion researches the prospect via web search
**And** Company news and recent developments are gathered
**And** LinkedIn insights are retrieved when available
**And** Industry trends relevant to the prospect are analyzed
**And** Research is parallelized for speed

---

### Story 8.2: Structured Prospect Dossiers

As a *sales user*,
I want prospect research in a structured dossier format,
So that I can quickly scan and use the information.

**Acceptance Criteria:**

**Given** prospect research is complete
**When** Orion delivers the results
**Then** a structured dossier is provided (FR32)
**And** The dossier includes: company overview, recent news, likely priorities, connections to existing clients
**And** Actionable conversation hooks are highlighted
**And** Sources are cited with links
**And** The format is consistent and scannable

---

### Story 8.3: Audience Targeting Recommendations

As a *programmatic consultant*,
I want Orion to recommend audience segments,
So that I can quickly build targeting strategies for clients.

**Acceptance Criteria:**

**Given** I describe a client targeting need
**When** I request audience recommendations
**Then** Orion analyzes the request against available audience data
**And** Relevant audience segments are identified
**And** Recommendations include exact Activation IDs (FR33)
**And** Reach estimates are provided when available
**And** Rationale is provided for each recommendation

---

### Story 8.4: Knowledge Base ID Matching

As a *programmatic consultant*,
I want exact IDs from our audience knowledge base,
So that I can immediately use them in activation platforms.

**Acceptance Criteria:**

**Given** audience recommendations are being generated
**When** the agent matches segments
**Then** exact Activation IDs are retrieved from orion-context/knowledge/
**And** IDs are verified against the knowledge base
**And** Mismatches or missing IDs are flagged
**And** Both standard and contextual segment options are provided
**And** The output is implementation-ready

---

## Epic 9: Production Observability & Cost Management

Admins have full visibility into system behavior, costs, and can manage prompt versions.

### Story 9.1: Token Usage Tracking

As a *platform admin*,
I want to see token usage for each interaction,
So that I can understand resource consumption.

**Acceptance Criteria:**

**Given** interactions are traced in Langfuse
**When** an interaction completes
**Then** input and output token counts are logged (FR36)
**And** Token usage is associated with the trace
**And** Usage is broken down by model (if multiple models used)
**And** Token data is available in Langfuse dashboard
**And** Historical token usage can be queried

---

### Story 9.2: Cost Tracking Per Interaction

As a *platform admin*,
I want to see cost per interaction,
So that I can monitor spending and optimize.

**Acceptance Criteria:**

**Given** token usage is tracked
**When** costs are calculated
**Then** cost per interaction is computed and logged (FR36)
**And** Costs are based on current model pricing
**And** Average cost per query is tracked (target: <$0.10, NFR26)
**And** Cost data is visible in Langfuse dashboard
**And** High-cost interactions are identifiable

---

### Story 9.3: Admin Trace Viewing

As a *platform admin*,
I want to view detailed traces for debugging,
So that I can diagnose issues and optimize performance.

**Acceptance Criteria:**

**Given** interactions are traced in Langfuse
**When** I access the Langfuse dashboard
**Then** I can view traces for any interaction (FR37)
**And** Traces include: user ID, input, output, tool calls, timing
**And** Spans show the agent loop phases (gather, act, verify)
**And** Failed interactions have clear error details
**And** Traces can be filtered and searched

---

### Story 9.4: Prompt Version Management

As a *platform admin*,
I want to manage prompt versions via Langfuse,
So that I can iterate on prompts without code changes.

**Acceptance Criteria:**

**Given** Langfuse prompt management is available
**When** I create or update a prompt version
**Then** prompts can be versioned and managed in Langfuse (FR38)
**And** The application fetches prompts from Langfuse
**And** Prompt caching respects 5-minute TTL (AR32)
**And** Prompt changes take effect without restart
**And** Prompt performance can be compared across versions

---

### Story 9.5: Budget Alerts & Limits

As a *platform admin*,
I want budget alerts and spending limits,
So that costs stay within acceptable bounds.

**Acceptance Criteria:**

**Given** cost tracking is working
**When** spending approaches limits
**Then** configurable budget alerts are triggered (NFR27)
**And** Alerts can be configured via environment variables
**And** Spending limits can be enforced if needed
**And** Alert history is logged
**And** Monthly cost reports are available in Langfuse

---

