---
stepsCompleted: [1, 2]
inputDocuments:
  - "_bmad-output/prd.md"
  - "_bmad-output/architecture.md"
  - "_bmad-output/ux-design-specification.md"
project_name: '2025-12 orion-slack-agent'
user_name: 'Sid'
date: '2025-12-22'
last_updated: '2025-12-22'
starterTemplate: 'Custom Structure (Direct API + Agent Skills) - no external template'
---

# 2025-12 orion-slack-agent - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for 2025-12 orion-slack-agent, decomposing the requirements from the PRD, Architecture, and UX Design Specification into implementable stories.

## Requirements Inventory

### Functional Requirements

**Agent Core Execution (FR1-6):**
FR1: System executes the agent loop (Gather Context → Take Action → Verify Work) for every user interaction
FR2: System verifies responses before delivery and iterates until verification passes (via prompt-based verification instructions)
FR3: System spawns subagents for parallel task execution with isolated context windows
FR4: System aggregates only relevant results from subagents into the orchestrator response
FR5: System manages conversation context across long-running threads via compaction
FR6: System cites sources for factual claims in responses

**Research & Information Gathering (FR7-12):**
FR7: Users can request multi-source research across Slack, Confluence, and web sources
FR8: System synthesizes information from multiple sources into structured summaries
FR9: System provides links to source materials alongside synthesized information
FR10: Users can request deep research with automatic parallelization across sources
FR11: System can search recent Slack history for relevant discussions and solutions
FR12: System can search Confluence for documentation and knowledge base content

**Communication & Interaction (FR13-18):**
FR13: Users can interact with Orion via Slack DMs and channels
FR14: System streams responses in real-time to show progress
FR15: System maintains conversation context within Slack threads
FR16: System provides suggested prompts to help users discover capabilities
FR17: System responds to @mentions and direct messages
FR18: System can summarize Slack threads on request

**Code Generation & Execution — PHASE 2 (FR19-23):**
FR19: System generates executable code when pre-built integrations don't exist *(Phase 2)*
FR20: System executes generated code in sandboxed environments *(Phase 2)*
FR21: System can call external APIs via generated code *(Phase 2)*
FR22: System processes and transforms data via generated code *(Phase 2)*
FR23: System validates generated code output before returning results *(Phase 2)*

**Composable Extensions (FR24-29):**
FR24: Developers can add new Skills via Agent Skills open standard (agentskills.io) — SKILL.md files in .skills/ directory
FR25: Developers can add new Commands via file-based workflow definitions in .orion/commands/
FR26: System connects to MCP servers via generic HTTP streamable client (runtime-configurable)
FR27: System can invoke multiple MCP servers within a single response (tools merged into unified registry)
FR28: System selects appropriate tools from available options for each task
FR29: Platform admin can enable or disable MCP servers

**Knowledge & Q&A (FR30-34):**
FR30: Users can ask questions and receive grounded, verified answers
FR31: System searches relevant knowledge sources before answering
FR32: Users can request prospect research and receive structured dossiers
FR33: Users can request audience targeting recommendations with exact IDs
FR34: System provides troubleshooting guidance by searching recent issues

**Observability & Administration (FR35-40):**
FR35: System traces all interactions via Langfuse
FR36: System tracks token usage and cost per interaction
FR37: Platform admin can view interaction traces for debugging
FR38: Platform admin can manage prompt versions via Langfuse
FR39: System logs all tool executions and their results
FR40: Platform admin can configure which tools are available

**MVP Workflows (FR41-43):**
FR41: System supports Deep Research workflow (multi-step, parallelized, synthesized)
FR42: System supports Summarization workflow (threads, documents, conversations)
FR43: System supports Q&A workflow (grounded, verified, cited)

**Persistent Memory (FR44-46):**
FR44: System maintains persistent memory across sessions via Memory Tool pattern (view, create, update, delete operations) with Google Cloud Storage backend
FR45: System organizes memory in three scopes: global (shared learnings), user-level (per Slack user preferences), and session-level (per thread context)
FR46: Claude automatically checks /memories directory at conversation start to restore relevant context

**Slack AI App Integration (FR47-50):**
FR47: System displays dynamic status messages during processing via `setStatus` with `loading_messages` array (e.g., "Searching Confluence...", "Calling Jira API...")
FR48: System collects user feedback via Slack's native `feedback_buttons` element (thumbs up/down) attached to responses
FR49: System logs user feedback (positive/negative) to Langfuse for quality tracking and improvement
FR50: System provides contextual error messages to users when processing fails, with suggested next steps

### NonFunctional Requirements

**Performance (NFR1-5):**
NFR1: Simple query response time 1-3 seconds
NFR2: Tool-augmented response time 3-10 seconds
NFR3: Deep research workflow <5 minutes
NFR4: Streaming start <500ms from message receipt
NFR5: Maximum 3 concurrent subagents per request

**Security (NFR6-11):**
NFR6: All API keys and tokens stored in GCP Secret Manager
NFR7: All Slack requests validated via signing secret
NFR8: All generated code runs in sandboxed environments (Phase 2)
NFR9: Minimize data stored in Orion; source systems remain authoritative
NFR10: All users authenticated via Slack
NFR11: All interactions traced via Langfuse with user identification

**Reliability (NFR12-16):**
NFR12: Uptime >99.5% measured monthly
NFR13: Cold start mitigation via min instances = 1
NFR14: Graceful degradation if MCP server unavailable
NFR15: Automatic retry with exponential backoff for transient failures
NFR16: 100% trace coverage via Langfuse

**Integration (NFR17-23):**
NFR17: MCP HTTP streamable transport (generic client)
NFR18: Support MCP 1.0 protocol (tools/list, tools/call)
NFR19: Runtime tool discovery via tools/list
NFR20: Support multiple MCP servers in single response
NFR21: 30 second timeout per tool call
NFR22: All responses stream to Slack regardless of tool usage
NFR23: OpenTelemetry-compatible Langfuse integration

**Scalability (NFR24-28):**
NFR24: 50 concurrent users capacity
NFR25: 100 requests per minute peak load
NFR26: Config-driven model switching without code changes
NFR27: Cloud Run auto-scaling within budget
NFR28: Large context window model with compaction for long threads

**Cost (NFR29-31):**
NFR29: Cost per query <$0.10 average
NFR30: Configurable budget alerts
NFR31: Per-interaction token tracking

**Error Handling (NFR32-35):**
NFR32: User-facing errors are clear and non-technical with suggested next steps
NFR33: Tool failures inform user and offer retry/alternative
NFR34: Agent loop failures exit gracefully with partial results
NFR35: Rate limit handling queues requests and informs user of delays

**Rate Limiting (NFR36-39):**
NFR36: Respect Anthropic API rate limits with exponential backoff
NFR37: Per-user throttling at 10 requests/minute soft limit
NFR38: Circuit breaker on repeated failures
NFR39: Alert on unusual usage patterns

### Additional Requirements

**From Architecture - Starter Template:**
- Custom Structure (Direct API + Agent Skills) — no external starter template
- Epic 1 Story 1 will be project scaffolding + configuration

**From Architecture - Infrastructure:**
- Google Cloud Run deployment (300s timeout, min 1 instance, 2GB memory)
- Docker containerization via docker/Dockerfile
- CI/CD via Cloud Build + GitHub Actions

**From Architecture - Integration:**
- Direct Anthropic API (@anthropic-ai/sdk v0.71.x, NOT Agent SDK)
- Generic MCP client (HTTP streamable transport)
- Anthropic Memory Tool → GCS backend
- Langfuse (OpenTelemetry integration)

**From Architecture - Data/Monitoring:**
- GCS bucket (gs://orion-memories/) for persistent memory
- Structured JSON logging with traceId
- Token/cost tracking per interaction

**From Architecture - Implementation Patterns:**
- TOOL_NAMES registry (TypeScript const) for tool naming
- Memory.* path builders (branded types)
- Layered error handling: InternalError → ToolError → UserError
- Span naming: {component}.{operation}
- Co-located unit tests (*.test.ts alongside source)

**From UX Design Specification:**
- Response templates: Research Response, Action Confirmation, Error, Clarification patterns
- Emoji system: 🔍 (search), 🔄 (processing), ✅ (success), ⚠️ (warning), ❌ (error), 💡 (tip)
- Source citation: Inline `[1]`, `[2]` refs + context block at response end
- Feedback buttons: 👍/👎 on all substantive responses
- Progressive status: Cycle messages every 3-5s for long tasks (never static >5s)
- Dynamic suggested prompts: Context-aware, evolve with user behavior
- Message structure: Lead with value → Details → Sources → Actions
- Hybrid: Claude markdown + Slack Block Kit structure (mrkdwn, not standard markdown)

**From PRD - Already Complete:**
- ✅ Slack Bolt + Assistant integration
- ✅ Streaming to Slack
- ✅ Thread context management
- ✅ Langfuse tracing
- ✅ Environment configuration
- ✅ Logging infrastructure

### FR Coverage Map

**Platform Epics (Actual Work):**
```
Epic 1 (Foundation):     Infrastructure + FR48, FR49 (feedback buttons)
Epic 2 (Agent Loop):     FR1, FR2, FR5, FR6, FR47, FR50 (dynamic status, error templates)
Epic 3 (MCP/Tools):      FR26, FR27, FR28, FR29, FR39
Epic 4 (Subagents):      FR3, FR4, FR10
Epic 5 (Memory):         FR44, FR45, FR46
Epic 6 (Skills):         FR24, FR25
Epic 7 (Slack Polish):   FR16, FR18 (suggested prompts, summarization)
Epic 8 (Code Gen):       FR19-23 *(Phase 2)*
```

**UX Spec Integration (Hybrid Approach):**
```
Story 1.8:  Feedback Button Infrastructure (FR48, FR49) ← NEW
Story 2.1:  + Response templates in system prompt
Story 2.4:  + UX spec error template (FR50)
Story 2.7:  + Block Kit citation context blocks
Story 2.2:  Already has FR47 (dynamic status) ✓
```

**Use Cases Enabled by Platform (Not Separate Epics):**
```
Research & Synthesis:    FR7-12, FR41 → Enabled by Epic 2 + 3 + 4
Q&A & Knowledge:         FR30-34, FR43 → Enabled by Epic 2 + 3
Summarization:           FR42 → Enabled by Epic 2 (just prompting)
```

**Already Complete (Existing Codebase):**
```
Slack Integration:       FR13, FR14, FR15, FR17 ✅
Langfuse Tracing:        FR35, FR36, FR37, FR38 ✅ (OOTB)
Logging:                 FR40 partial ✅
```

## Epic List

### Epic 1: Foundation & Deployment
Enable production deployment of Orion on Google Cloud Run with CI/CD pipeline, including foundational UX infrastructure.

**User Outcome:** System is deployable, observable, operationally ready, and has feedback collection from day 1.

**Scope:**
- Dockerfile and container configuration
- Cloud Run deployment (300s timeout, min 1 instance)
- CI/CD via Cloud Build + GitHub Actions
- Health check endpoint (`/health`)
- Secrets management (GCP Secret Manager)
- **Feedback button infrastructure (FR48, FR49)** — attached to all responses

**FRs:** Infrastructure + FR48, FR49
**NFRs:** NFR6, NFR12, NFR13, NFR27

**Stories:**
- 1.1-1.7: Existing infrastructure stories
- **1.8: Feedback Button Infrastructure** (NEW) — Slack feedback_buttons + Langfuse logging

---

### Epic 2: Agent Core Loop
Implement the agentic execution pattern: Gather Context → Take Action → Verify Work.

**User Outcome:** Every user message triggers an intelligent agent loop that gathers context, takes action via tools, and verifies results before responding.

**Scope:**
- `while (stop_reason === 'tool_use')` loop around `messages.create()`
- Verification via system prompt instructions
- Context compaction for long threads (sliding window)
- Source citation in responses
- Response streaming integration with Slack

**FRs:** FR1, FR2, FR5, FR6
**NFRs:** NFR1, NFR2, NFR4, NFR15, NFR22

---

### Epic 3: Tool Connectivity (MCP)
Connect Orion to external tools via the Model Context Protocol.

**User Outcome:** Orion can use any MCP-compatible tool at runtime without code changes.

**Scope:**
- Generic MCP client (HTTP streamable transport)
- Tool discovery via `tools/list` endpoint
- Tool execution via `tools/call` endpoint
- Tool registry merging multiple MCP servers
- Tool execution logging to Langfuse
- Admin enable/disable of MCP servers (config-based)

**FRs:** FR26, FR27, FR28, FR29, FR39
**NFRs:** NFR17, NFR18, NFR19, NFR20, NFR21

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 3.1 | Generic MCP Client | ready-for-dev |
| 3.2 | Tool Discovery & Registration | ready-for-dev |
| 3.3 | Tool Execution & Error Handling | ready-for-dev |

---

### Epic 4: Subagents & Parallel Execution
Enable complex tasks to spawn parallel workers for faster execution.

**User Outcome:** Research and complex tasks run in parallel, returning synthesized results faster.

**Scope:**
- Subagent spawner (parallel `messages.create()` calls)
- Context isolation (subagents don't pollute parent context)
- Result aggregation (only relevant results bubble up)
- `Promise.all()` orchestration with error handling

**FRs:** FR3, FR4, FR10
**NFRs:** NFR3, NFR5

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 4.1 | Subagent Spawner | ready-for-dev |
| 4.2 | Result Aggregation | ready-for-dev |
| 4.3 | Deep Research Workflow | ready-for-dev |

---

### Epic 5: Persistent Memory
Enable Orion to remember context across sessions.

**User Outcome:** Orion learns user preferences and retains context between conversations.

**Scope:**
- Memory Tool handler (view, create, update, delete operations)
- GCS backend for durable storage
- 3-scope structure: global, user-level, session-level
- Memory auto-check at conversation start
- Type-safe path builders (branded types)

**FRs:** FR44, FR45, FR46
**NFRs:** NFR9

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 5.1 | Memory Tool Handler (GCS Backend) | ready-for-dev |
| 5.2 | Memory Scopes & Path Builders | ready-for-dev |
| 5.3 | Memory Auto-Check at Conversation Start | ready-for-dev |

---

### Epic 6: Skills & Extensions Framework
Enable developers to add new capabilities via file-based definitions.

**User Outcome:** New skills and commands can be added by dropping files—no code changes required.

**Scope:**
- Agent Skills loader (parse SKILL.md from `.skills/` directory)
- Skills injection into system prompt or tool definitions
- Commands loader from `.orion/commands/`
- Skill execution integration with agent loop

**FRs:** FR24, FR25
**NFRs:** None specific

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 6.1 | Agent Skills Loader | ready-for-dev |
| 6.2 | Commands Framework | ready-for-dev |

---

### Epic 7: Slack Polish
Add discovery and summarization features to complete the Slack experience.

**User Outcome:** Users discover Orion's capabilities through intelligent prompts and can summarize threads on demand.

**Scope:**
- Dynamic suggested prompts (context-aware, evolve based on user behavior)
- Thread summarization command/capability

**FRs:** FR16, FR18
**NFRs:** NFR22

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 7.1 | Dynamic Suggested Prompts | ready-for-dev |
| 7.2 | Thread Summarization | ready-for-dev |

**Note:** Foundational UX (FR47-50) moved to Epic 1/2 for day-1 integration:
- FR47 (dynamic status) → Story 2.2 ✓
- FR48/49 (feedback) → Story 1.8
- FR50 (error templates) → Story 2.4
- Response templates → Story 2.1
- Citations → Story 2.7

**Stories:**
- 7.1: Dynamic Suggested Prompts (context-aware)
- 7.2: Thread Summarization on Demand

---

### Epic 8: Code Generation & Execution *(Phase 2)*
Enable Orion to write and execute code when pre-built integrations don't exist.

**User Outcome:** No integration ceiling—Orion writes its way through gaps.

**Scope:** *(Deferred to Phase 2)*
- Code generation for API calls
- Sandboxed execution environment
- Output validation before returning results
- Security controls for generated code

**FRs:** FR19, FR20, FR21, FR22, FR23
**NFRs:** NFR8

---

## Summary

| Epic | Title | Stories | Phase |
|------|-------|---------|-------|
| 1 | Foundation & Deployment | 8 (1.1-1.8) | MVP |
| 2 | Agent Core Loop | 7 (2.1-2.7) | MVP |
| 3 | Tool Connectivity (MCP) | 5 | MVP |
| 4 | Subagents & Parallel Execution | 3 | MVP |
| 5 | Persistent Memory | 3 | MVP |
| 6 | Skills & Extensions Framework | 3 | MVP |
| 7 | Slack Polish | 2 | MVP |
| 8 | Code Generation & Execution | TBD | Phase 2 |

**MVP Total:** ~31 stories across 7 epics
**Phase 2:** Epic 8 (deferred)

### UX Integration (Hybrid Approach)

Foundational UX moved into Epic 1/2 for day-1 quality:

| Story | UX Feature | FR |
|-------|------------|-----|
| 1.8 | Feedback Button Infrastructure | FR48, FR49 |
| 2.1 | Response Templates (system prompt) | UX spec |
| 2.2 | Dynamic Status Messages | FR47 |
| 2.4 | Error Response Template | FR50 |
| 2.7 | Block Kit Citation Context | UX spec |

### Epic 7 (Slack Polish) — Reduced Scope

| Story | Title | FRs |
|-------|-------|-----|
| 7.1 | Dynamic Suggested Prompts | FR16 |
| 7.2 | Thread Summarization | FR18 |

---

## Use Cases (Not Epics)

These are enabled by the platform, not separate work:

| Use Case | Enabled By | Notes |
|----------|------------|-------|
| **Deep Research** | Epic 2 + 3 + 4 | Agent loop + MCP tools + subagent parallelization |
| **Q&A** | Epic 2 + 3 | Agent loop + MCP tools for knowledge search |
| **Summarization** | Epic 2 | Just prompting—Claude summarizes content |
| **Prospect Dossiers** | Epic 2 + 3 | Agent loop + web search MCP |
| **Troubleshooting** | Epic 2 + 3 | Agent loop + Slack search MCP |

These don't need stories—they work once the platform epics are complete.
