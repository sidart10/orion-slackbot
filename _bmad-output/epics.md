---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "_bmad-output/prd.md"
  - "_bmad-output/architecture.md"
  - "_bmad-output/ux-design-specification.md"
  - "_bmad-output/sprint-change-proposal-2026-01-06.md"
project_name: '2025-12 orion-slack-agent'
user_name: 'Sid'
date: '2025-12-22'
last_updated: '2026-01-09'
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
FR3: System executes multiple tool calls in parallel when beneficial (via native Claude tool_use pattern)
FR4: System synthesizes results from multiple tool calls into coherent responses (handled by Claude natively)
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

**Code Generation & Execution (FR19-23):**
FR19: System generates executable code when pre-built integrations don't exist *(Phase 2)*
FR20: System executes generated code in sandboxed environments *(MVP — GKE Agent Sandbox)*
FR21: System can call external APIs via generated code *(MVP — sandbox has network access)*
FR22: System processes and transforms data via generated code *(MVP — Python execution)*
FR23: System validates generated code output before returning results *(Phase 2)*

**Composable Extensions (FR24-29):**
FR24: Developers can add new Skills via Agent Skills open standard (agentskills.io) — SKILL.md files in .skills/ directory
FR25: Developers can add new Commands via file-based workflow definitions in .orion/commands/ *(Post-MVP — deferred)*
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
FR44: System maintains persistent memory across sessions via Anthropic Memory Tool SDK helper (`betaMemoryTool`) with 6 operations (view, create, str_replace, insert, delete, rename) and Google Cloud Storage backend
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
NFR5: Parallel tool calls managed natively by Claude (no hard limit)

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
Epic 4 (REMOVED):        FR3, FR4 reworded; FR10 via native pattern
Epic 5 (Memory):         FR44, FR45, FR46
Epic 6 (Skills):         FR24, FR20, FR21, FR22 (skills + code execution)
Epic 7 (Slack Polish):   FR16, FR18 (suggested prompts, summarization)
Epic 8 (Code Gen):       FR19 (partial), FR23 *(Phase 2 — reduced scope)*
```

**Deferred to Post-MVP:**
```
FR25 (Commands):         Skills + execute_code provide equivalent extensibility
FR19 (Code Gen patterns): Claude generates code naturally; explicit patterns deferred
FR23 (Output validation): Claude's native verification sufficient for MVP
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
| 3.1 | Generic MCP Client | done |
| 3.2 | Tool Discovery & Registration | done |
| 3.3 | Tool Execution & Error Handling | done |
| 3.4 | Channel @Mention Tool Feedback | done |
| 3.5 | MCP Session Lifecycle | done |

---

### ~~Epic 4: Subagents & Parallel Execution~~ — REMOVED

**Removed:** 2025-12-31  
**Reason:** Over-engineering. Claude's native parallel `tool_use` pattern achieves the same outcome without a separate orchestration layer. Parallel tool execution is already supported by Epic 2 (Agent Loop) + Epic 3 (MCP Tools).

**Original FRs (FR3, FR4):** Reworded to reflect native pattern.  
**FR10 (Deep Research):** Achieved via prompting + parallel MCP tool execution.

**See:** `sprint-change-proposal-2025-12-31-epic4-removal.md`

**Archived Stories:** `_archived/4-1-*.md`, `_archived/4-2-*.md`, `_archived/4-3-*.md`

---

### Epic 5: Persistent Memory
Enable Orion to remember context across sessions.

**User Outcome:** Orion learns user preferences and retains context between conversations.

**Scope:**
- Memory Tool handler via SDK helper (view, create, str_replace, insert, delete, rename)
- GCS backend for durable storage
- 3-scope structure: global, user-level, session-level
- Memory auto-check at conversation start
- Type-safe path builders (branded types)

**FRs:** FR44, FR45, FR46
**NFRs:** NFR9

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 5.1 | Memory Tool Handler (SDK Helper + GCS Backend) | done |
| 5.2 | Memory Scopes & Path Builders | done |
| 5.3 | Memory Auto-Check at Conversation Start | done |

---

### Epic 6: Skills & Extensions Framework
Enable developers to add new capabilities via Anthropic Skills API and file-based definitions, with code execution for programmatic tool orchestration.

**User Outcome:** New skills can be added by dropping SKILL.md files and uploading to Anthropic—no code changes required. Code execution enables programmatic tool calling (PTC) with MCP tool access.

**Scope:**
- Agent Skills loader (parse SKILL.md metadata from `.skills/` directory)
- Anthropic Skills API integration (upload, reference by skill_id)
- Anthropic Files API integration (download generated files)
- Programmatic Tool Calling (PTC) with `allowed_callers` for MCP
- GKE Agent Sandbox fallback for edge-case skills (webapp-testing, web-artifacts-builder)
- Skill migration from filesystem to Anthropic container

**FRs:** FR24, FR20, FR21, FR22
**NFRs:** None specific

**Note:** Commands framework (FR25) deferred to post-MVP. Skills + execute_code provide equivalent extensibility for MVP.

**Course Correction (2026-01-02):**
Story 6-1 implemented incorrectly — used full content injection (~15k tokens) instead of progressive disclosure (~1.2k tokens). Refactor required to follow Agent Skills open standard ([agentskills.io](https://agentskills.io)). Story 6-2 enhanced with skill filesystem sync to GKE sandbox.
See: `sprint-change-proposal-2026-01-02-skills-architecture-fix.md`

**Course Correction (2026-01-07):**
Anthropic's code execution container supports Skills + PTC + MCP via `allowed_callers`. Migrating skills to Anthropic eliminates ~90% of GKE complexity. Stories 6.2-6.3 archived; replaced by 6.2-6.13.
See: `sprint-change-proposal-2026-01-07-skills-migration-to-anthropic.md`

**Stories:**
| Story | Title | Status |
|-------|-------|--------|
| 6.1 | Agent Skills Loader (Progressive Disclosure) | done |
| 6.2 | Skills API Client | done |
| 6.3 | Skills Container Config | done |
| 6.4 | Skill Registry Service | done |
| 6.5 | Files API Client | done |
| 6.6 | Files API Slack Integration | done |
| 6.7 | Programmatic Tool Calling (PTC) Core | done |
| 6.8 | PTC Observability | done |
| 6.9 | Upload Custom Skills Script | done |
| 6.10 | Skill Migration & Testing | ready-for-testing |
| 6.11 | Prompt Builder Cleanup | review |
| 6.12 | GKE Sandbox Scope Reduction | done |
| 6.13 | Documentation Update | done |

**Archived Stories:**
- `archived/6-2-execute-code-gke-sandbox.md` — GKE sandbox implemented, now fallback only
- `archived/6-3-anthropic-managed-ptc.md` — Absorbed into 6.7/6.8 with expanded scope

**Sprint Change (2026-01-07) — Skills Migration to Anthropic Container:**
Anthropic's code execution container supports Skills + PTC + MCP via `allowed_callers`, eliminating ~90% of GKE sandbox complexity.

**Phases:**
- Phase 1 (6.2-6.6): API Integration Foundation — Skills API, Files API, container config
- Phase 2 (6.7-6.11): PTC & Skill Migration — code execution, upload skills, migrate
- Phase 3 (6.12-6.13): Cleanup — reduce GKE scope, update docs

**Key Changes:**
- Skills uploaded to Anthropic via Skills API (not baked into Docker)
- Generated files downloaded via Files API (not stdout parsing)
- Container reused across conversation turns (`container.id`)
- GKE sandbox retained for 2 edge-case skills only

See: `sprint-change-proposal-2026-01-07-skills-migration-to-anthropic.md`, `tech-spec-skills-migration-to-anthropic-container.md`

---

### Epic 7: Slack Polish
Add discovery, summarization, and UX polish features to complete the Slack experience.

**User Outcome:** Users discover Orion's capabilities through intelligent prompts, see exactly what Orion is doing during tool calls, and have clear visual feedback when questions are answered.

**Scope:**
- Dynamic suggested prompts (context-aware, evolve based on user behavior)
- Thread summarization command/capability
- Contextual tool feedback (show which tools and what queries)
- Response completion indicators (✅ on answered messages)
- Bug fixes for response handling

**FRs:** FR16, FR18, FR47 (enhanced)
**NFRs:** NFR22

**Stories:**
| Story | Title | Status | Priority |
|-------|-------|--------|----------|
| 7.1 | Dynamic Suggested Prompts | done | P2 |
| 7.2 | ~~Thread Summarization~~ | cancelled | - |
| 7.3 | Contextual Tool Feedback | done | P1 |
| 7.4 | Response Completion Indicators | done | P2 |
| 7.5 | Fix Duplicate Response Bug | done | P0 |
| 7.6 | Conversation Summarization (All types incl. threads) | done | P1 |
| 7.7 | Skill-Aware & Response-Content Suggested Prompts | backlog | P2 |
| 7.8 | Enhanced Slack UI Polish | backlog | P3 |
| 7.9 | Unified Status Updater Refactoring | backlog | P3 |

**Note:** Foundational UX (FR47-50) moved to Epic 1/2 for day-1 integration:
- FR47 (dynamic status) → Story 2.2 ✓ (enhanced in 7.3)
- FR48/49 (feedback) → Story 1.8
- FR50 (error templates) → Story 2.4
- Response templates → Story 2.1
- Citations → Story 2.7

**Stories (Updated 2026-01-11):**
- 7.1: Dynamic Suggested Prompts (context-aware) ✅
- 7.2: ~~Thread Summarization~~ — Merged into 7.6
- 7.3: Contextual Tool Feedback — "Using MSCI Reports: Search Reports — 'Hulu'..." ✅
- 7.4: Response Completion Indicators — ✅ on answered messages ✅
- 7.5: Fix Duplicate Response Bug — P0 bug, response appearing twice ✅
- 7.6: Conversation Summarization — Channels, Group DMs, DMs, Threads (context-aware) ✅
- 7.7: Skill-Aware Suggested Prompts — Enhance prompts based on available skills and response content
- 7.8: Enhanced Slack UI Polish — Improve visual consistency and professional appearance
- 7.9: Unified Status Updater — Extract status logic to `StatusUpdater` abstraction (refactoring)

**Note (2026-01-11):** Stories 7.7, 7.8, 7.9 re-added for proper implementation.

---

### Epic 8: Anthropic API Enhancements
Integrate Anthropic's latest API features: Citations, Tool Search, and enhanced Files API integration.

**User Outcome:** Responses include verifiable source citations, tool discovery scales to 1000s of tools, and users can upload files for Claude to read.

**Scope:**
- **Citations API:** Enable `citations.enabled=true` for verifiable source references
- **Tool Search Tool:** Mark tools with `defer_loading: true` for on-demand discovery
- **Slack File Ingestion:** Download Slack files → upload to Anthropic → Claude reads
- **MCP Auth Fix:** Fix auth bug for no-auth MCP servers via PTC

**FRs:** FR6 (enhanced), FR28 (enhanced), FR51 (new - file ingestion)
**NFRs:** NFR29 (token optimization via tool search)

**Course Correction (2026-01-09):**
Epic 8 repurposed from "Code Generation (Phase 2)" to "Anthropic API Enhancements" based on user-identified feature gaps. Code generation patterns (FR19, FR23) remain deferred.
See: `sprint-change-proposal-2025-01-09.md`

**Stories:**
| Story | Title | Status | Priority |
|-------|-------|--------|----------|
| 8.1 | Citations & Sources Unification | done | P1 |
| 8.2 | Tool Search Tool Integration | done | P2 |
| 8.3 | Slack File Ingestion for Claude Context | done | P1 |
| 8.4 | MCP Auth Fix for PTC Integration | done | P1 |
| 8.5 | Tool Call Summary & Sandbox Output Cleanup | done | P1 |
| 8.6 | Tool Search Bug Fix - Add tool_search_tool_bm25 | ready-for-dev | P0 |

**Story Details:**

**8.1 Citations & Sources Unification**

**Background:** We have two similar systems: (1) existing "sources" showing tool transparency (📎, 🔧) and (2) Anthropic's Citations API for document-level claim verification.

**Architecture Decision:** Keep both systems, unify display format.
- **Sources** = tool transparency ("I called these tools") — for MCP tool calls
- **Citations** = claim verification ("This exact text supports my answer") — for document blocks
- Both rendered in same professional footer format, no emojis

**Scope:**
- Enable `citations.enabled=true` on document blocks (Anthropic Citations API)
- Parse citation blocks from Claude response (`cited_text`, `document_index`, `start_char_index`)
- Clean up existing sources display — remove 📎, 🔧 emojis for professional appearance
- Unify rendering into single `*References:*` footer block
- Track citation usage in Langfuse
- Note: GA (no beta header), incompatible with Structured Outputs

**Unified Format Example:**
```
*References:*
[1] MSCI Reports: Search — "Hulu"
[2] "Hulu's Q3 revenue grew 12% YoY" — MSCI_Hulu_Report.pdf, page 3
```

**Acceptance Criteria:**
1. **No Emojis:** Remove 📎, 🔧 from sources-block.ts — use `*References:*` header instead
2. **Unified Footer:** Single Block Kit context block for both tool sources AND document citations
3. **Tool Sources Format:** `[n] Tool Name: Action — "query"` (no emoji)
4. **Document Citations Format:** `[n] "cited text excerpt..." — Document.pdf, page X`
5. **Inline Markers:** Claude's `[1]`, `[2]` markers in response body link to footer
6. **Langfuse Tracking:** Citation count, types (tool vs document), and usage tracked per response
7. **Backwards Compatible:** Works with existing tool-only responses (no document citations)

**8.2 Tool Search Tool Integration**
- Enable `advanced-tool-use-2025-11-20` beta header
- Configure MCP tools with `defer_loading: true`
- Keep core tools always loaded (memory, web_search, execute_code)
- Track token savings in Langfuse
- Requires: Sonnet 4.5+ or Opus 4.5+

**8.3 Slack File Ingestion for Claude Context**
- Detect `files` array in Slack message events
- Download file from Slack API
- Upload to Anthropic Files API (reuse Story 6.5 client)
- Include as document block with `file_id`
- Pair with Citations (8.1) for uploaded document citations
- Support: PDF, images, CSV, TXT, MD, JSON

**8.4 MCP Auth Fix for PTC Integration**
- Fix: MCP servers with `headers: {}` (no auth) via PTC
- Fix: MCP servers with `authType: gcp_identity` via PTC
- Verify: Bearer token auth (like Rube) works via PTC
- Affects: `audience-manager`, `msci-reports`, `exa`

**8.5 Tool Call Summary & Sandbox Output Cleanup**

**Background:** Users sometimes see ugly/raw output in tool summaries. When Orion sandbox runs, code like `import pandas` can leak through. Tool call summaries shown to users need standardization.

**Scope:**
- **Standardize Tool Summaries:** Define consistent format for what users see during tool execution
- **Sandbox Output Filtering:** Filter out Python imports, stack traces, and debug output from user-facing responses
- **Clean Status Messages:** Ensure status updates shown during processing are user-friendly
- **Error Message Cleanup:** Technical errors sanitized before showing to users

**Acceptance Criteria:**
1. **No Code Leakage:** Python `import` statements, stack traces, and raw code NEVER shown to users
2. **Filtered Sandbox Output:** stdout/stderr from Orion sandbox sanitized before display
3. **Consistent Summary Format:** All tool calls use standardized summary format (e.g., "Searching MSCI Reports for 'Hulu'...")
4. **User-Friendly Errors:** Technical sandbox errors converted to helpful messages
5. **Status Message Guidelines:** Document standard patterns for status messages
6. **Test Coverage:** Unit tests verify filtering works for common leak scenarios

---

### ~~Epic 8 (Original): Code Generation & Execution~~ *(Phase 2 — Deferred)*

**Deferred:** 2026-01-09
**Reason:** Epic 8 repurposed for Anthropic API Enhancements. Code generation patterns remain deferred.

**Original Scope (Deferred):**
- FR19: Code generation patterns, templates, guardrails
- FR23: Output validation before returning results

**See:** `sprint-change-proposal-2025-01-09.md`

---

## Summary

| Epic | Title | Stories | Status | Phase |
|------|-------|---------|--------|-------|
| 1 | Foundation & Deployment | 8 (1.1-1.8) | ✅ done | MVP |
| 2 | Agent Core Loop | 9 (2.1-2.9) | ✅ done | MVP |
| 3 | Tool Connectivity (MCP) | 5 (3.1-3.5) | ✅ done | MVP |
| 4 | ~~Subagents~~ | 0 | ❌ REMOVED | — |
| 5 | Persistent Memory | 3 (5.1-5.3) | ✅ done | MVP |
| 6 | Skills & Extensions Framework | 13 (6.1-6.13) | 🔄 11/13 done | MVP |
| 7 | Slack Polish | 6 (7.1-7.6) | ✅ done | MVP |
| 8 | Anthropic API Enhancements | 5 (8.1-8.5) | 📋 draft | Sprint 8 |

**MVP Status:** 38 stories across 7 epics — **36 done, 2 remaining** (6.10 ready-for-testing, 6.11 in-review)
**Updated:** 2026-01-11 (Epic 7 scope reduced - 7.7, 7.8, 7.9 removed)
**Sprint 8:** Epic 8 (8.1-8.5) — 5 stories
**Phase 2 (Deferred):** Code generation patterns (FR19, FR23)

### UX Integration (Hybrid Approach)

Foundational UX moved into Epic 1/2 for day-1 quality:

| Story | UX Feature | FR |
|-------|------------|-----|
| 1.8 | Feedback Button Infrastructure | FR48, FR49 |
| 2.1 | Response Templates (system prompt) | UX spec |
| 2.2 | Dynamic Status Messages | FR47 |
| 2.4 | Error Response Template | FR50 |
| 2.7 | Block Kit Citation Context | UX spec |

### Epic 7 (Slack Polish) — Final Scope (2026-01-11)

| Story | Title | FRs/Notes |
|-------|-------|-----------|
| 7.1 | Dynamic Suggested Prompts | FR16 ✅ |
| 7.2 | ~~Thread Summarization~~ | Merged into 7.6 |
| 7.3 | Contextual Tool Feedback | FR47 enhanced - rich status messages ✅ |
| 7.4 | Response Completion Indicators | UX - ✅ reaction on completion ✅ |
| 7.5 | Fix Duplicate Response Bug | P0 Bug - response appearing twice ✅ |
| 7.6 | Conversation Summarization | FR18 - All types: Channels, MPIMs, DMs, Threads ✅ |

**Removed (2026-01-11):** 7.7, 7.8, 7.9 — WIP code preserved in branch `backup/epic-7-wip-2026-01-11`

---

## Use Cases (Not Epics)

These are enabled by the platform, not separate work:

| Use Case | Enabled By | Notes |
|----------|------------|-------|
| **Deep Research** | Epic 2 + 3 | Agent loop + MCP tools (parallel via native tool_use) |
| **Q&A** | Epic 2 + 3 | Agent loop + MCP tools for knowledge search |
| **Summarization** | Epic 2 | Just prompting—Claude summarizes content |
| **Prospect Dossiers** | Epic 2 + 3 | Agent loop + web search MCP |
| **Troubleshooting** | Epic 2 + 3 | Agent loop + Slack search MCP |

These don't need stories—they work once the platform epics are complete.
