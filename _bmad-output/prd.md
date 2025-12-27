---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
inputDocuments:
  - "_bmad-output/analysis/product-brief-2025-12-orion-slack-agent-2025-12-17.md"
  - "_bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md"
  - "_bmad-output/analysis/brainstorming-session-2025-12-22.md"
documentCounts:
  briefs: 1
  research: 1
  brainstorming: 1
  projectDocs: 0
workflowType: 'prd'
lastStep: 11
project_name: '2025-12 orion-slack-agent'
user_name: 'Sid'
date: '2025-12-17'
last_updated: '2025-12-22'
course_correction: 'Claude Agent SDK → Direct Anthropic API migration'
prd_version: '1.2'
---

# Product Requirements Document - 2025-12 orion-slack-agent

**Author:** Sid
**Date:** 2025-12-17
**Last Updated:** 2025-12-22 (v1.2: Slack AI App features - FR47-50 for feedback buttons, dynamic status, feedback logging)

## Executive Summary

Orion is an enterprise agentic AI system that transforms Slack into an intelligent execution layer for the organization. Built on a **pluggable LLM provider layer** (Anthropic API with tool_use, orchestrated via MCP tools), Orion implements the core agent loop—*gather context, take action, verify work*—with composable tool connectivity, parallel subagent execution, and first-class observability.

Unlike conversational AI assistants that answer questions, Orion *executes work*: conducting deep research with automatic synthesis, generating and running code in sandboxed environments, managing workflows across enterprise systems, and maintaining context across long-running conversations through intelligent compaction.

The architecture is designed for **composability at every layer**—tools, skills, commands, and subagents can be combined to solve problems that no single integration could handle alone.

### What Makes This Special

The differentiator is not any single feature, but how four architectural principles compose together:

1. **Agent Loop Execution Model** — Every interaction follows Gather → Act → Verify via a `while (stop_reason === 'tool_use')` loop around `messages.create()`. Responses are grounded in real data and validated before delivery—not hallucinated or assumed. If verification fails, the loop refines until it passes.

2. **Code Generation Fills the Gaps** — When an MCP server or pre-built integration doesn't exist, Orion generates precise, executable code on-the-fly. There is no integration ceiling—the agent writes its way through.

3. **Subagents with Context Isolation** — Complex tasks spawn specialized subagents (research, search, summarize) as parallel `messages.create()` calls with isolated context windows. Executed via `Promise.all()`, only relevant results bubble up to the orchestrator—no context dumps, no pollution.

4. **File-Based Agent Definitions** — Inspired by BMAD methodology, all agent personas, workflows, and prompts live in version-controlled `.orion/` files. This separates concerns, enables composability, and makes the system maintainable as it grows.

These principles reinforce each other: the agent loop needs subagents for parallelism, subagents need code generation to fill tool gaps, code generation needs verification to ensure safety, and file-based definitions make the entire system evolvable.

## Project Classification

**Technical Type:** SaaS/B2B Enterprise Platform
**Domain:** Enterprise Productivity + AI/Agentic Systems
**Complexity:** Medium (sophisticated architecture, no regulatory compliance burden)
**Project Context:** Greenfield — new system from scratch
**Primary Platform:** Slack (AI Agent integration via Bolt + Assistant API)
**Deployment Target:** Google Cloud Run (HTTP mode, serverless)
**Agent Framework:** Direct Anthropic API (messages.create with tool_use) + Generic MCP Client (HTTP streamable transport, runtime-configurable)
**Model selection:** Config-driven (provider + model ID); no model names hardcoded in application code
**Observability:** Langfuse (tracing, prompt management, evaluations)

## Success Criteria

### User Success

Users experience success when Orion *executes work* rather than just providing answers.

**The "Aha" Moment:** The user realizes Orion *did something*—synthesized research from multiple sources, generated and ran code, filed a ticket, or completed a workflow—rather than just responding with text.

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Time to Answer** | <60s simple, <5min research | Faster than hunting through systems |
| **Research Time Saved** | >50% reduction | Measurable productivity gain |
| **Task Completion Rate** | >90% | Agentic actions actually work |
| **Information Found Rate** | >85% | Users find what they need |
| **Repeat Usage** | >70% within 7 days | Users come back |
| **"Aha" Moment Conversion** | >40% try agentic actions | Users discover execution capability |

### Quality Success

Orion's responses must be accurate, grounded, and verified before delivery.

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Verification Pass Rate** | >95% | Agent loop catches issues |
| **User Feedback Score** | >4:1 positive | Users rate responses via feedback buttons (FR48), tracked in Langfuse (FR49) |
| **Source Citation Rate** | >90% | Factual claims are grounded |
| **Follow-up Question Rate** | <15% | Clarity on first response |
| **Hallucination Rate** | <2% | Trust requires accuracy |
| **Tool Execution Success** | >98% | Tools work reliably |

### Adoption Success (6-month targets)

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Daily Active Users** | >30% of eligible employees | Daily utility |
| **Weekly Active Users** | >60% of eligible employees | Broad adoption |
| **Queries per User** | >10/week | Regular engagement |
| **Feature Breadth** | >50% use 2+ features | Beyond just Q&A |
| **Department Coverage** | All major departments | Cross-functional value |

### Business Success

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Hours Saved** | >2 hours/week per active user | Quantifiable ROI |
| **Ticket Deflection** | >30% of common IT/HR requests | Reduces support burden |
| **Onboarding Acceleration** | 20% faster time-to-productivity | New hire value |
| **Cost per Query** | <$0.10 average | Sustainable economics |

### Technical Success

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Response Latency (simple)** | 1-3 seconds | Feels responsive |
| **Response Latency (with tools)** | 3-10 seconds | Acceptable for complex tasks |
| **Uptime** | >99.5% | Reliable availability |
| **Tracing Coverage** | 100% via Langfuse | Full observability |
| **Cold Start Optimization** | min instances = 1 | No cold start delays |

## Product Scope

### MVP — Minimum Viable Product

**What must work for this to be useful:**

| Component | Description |
|-----------|-------------|
| **Slack Integration** | Bolt with Assistant class, streaming, thread management, suggested prompts |
| **LLM Runtime (pluggable)** | Anthropic API `messages.create()` with tool_use for agent loop; model/provider selected via config |
| **Agent Loop** | Complete Gather → Act → Verify cycle with iterative refinement |
| **Subagents** | Parallel execution with isolated context (research, search, summarize) |
| **Unified Tool Layer** | Generic MCP client (HTTP streamable), code generation—all tools invoked via Claude tool_use |
| **Code Generation** | On-the-fly integrations, data processing, API calls |
| **Skills Framework** | Infrastructure for `.claude/skills/` packages |
| **Commands Framework** | Infrastructure for `/command` workflows |
| **Thread Compaction** | Context management for long conversations |
| **Langfuse Observability** | Tracing, prompt versioning, evaluations, cost tracking |
| **Cloud Run Deployment** | HTTP mode, auto-scaling, secrets management |

**MVP Workflows:**
- Deep Research (multi-step with subagent parallelization, synthesis, source citation)
- Summarization (Slack threads, documents, conversations)
- Q&A (grounded responses with verification)

**MVP Success Gate:**
- >95% verification pass rate
- >4:1 positive user feedback
- >98% tool execution success
- <2% hallucination rate
- 10+ active users within first 2 weeks
- Successfully add 1 new Skill or Command post-launch (proves extensibility)

**MVP Implementation Estimate (Post-Architecture Decision):**

| Component | Effort | Priority |
|-----------|--------|----------|
| Agent Loop (`src/agent/loop.ts`) | 1 day | P0 |
| Generic MCP Client (`src/tools/mcp/client.ts`) | 1 day | P0 |
| Tool Registry (`src/tools/registry.ts`) | 0.5 day | P0 |
| Subagent Spawner (`src/agent/subagents.ts`) | 0.5 day | P0 |
| Response Generator (replace placeholder) | 0.5 day | P0 |
| Dockerfile + Cloud Run config | 0.5 day | P0 |
| CI/CD Pipeline | 0.5 day | P1 |

*Total new work: ~4.5 days (validated in 2025-12-22 brainstorming session)*

**Already Complete:**
- ✅ Slack Bolt + Assistant integration
- ✅ Streaming to Slack
- ✅ Thread context management
- ✅ Langfuse tracing
- ✅ Environment configuration
- ✅ Logging infrastructure

### Growth Features (Post-MVP)

*Added as tools and integrations mature:*

| Feature | Dependency |
|---------|------------|
| Jira/Ticket Workflows | Jira MCP server + workflow instructions |
| Onboarding Automation | HR tools + onboarding content |
| IT Request Handling | IT systems integration |
| Programmatic Consultant Tools | Internal ad platform MCP servers |
| Domain-Specific Skills | Built incrementally per department |
| Advanced Commands | Custom user-defined automation |

### Explicitly Out of Scope (MVP)

The following are **not** included in MVP:

- **Sandbox code execution** — Deferred to Phase 2; MVP uses MCP-based integrations only
- **Multi-tenant deployment** — Single-tenant internal tool for SambaTV only
- **Custom LLM fine-tuning** — Uses off-the-shelf Claude models
- **Voice/audio input** — Text-only Slack interface
- **Mobile app** — Slack-native only
- **Role-based access controls** — All authenticated Slack users have equal access
- **Advanced rate limiting per user** — Basic system-level protection only
- **Semantic memory search (Mem0)** — Deferred to post-MVP; uses agentic file-based memory

### Vision (Future)

Orion becomes the intelligent layer between employees and enterprise systems—the first place anyone goes to get work done, not just get answers.

- Cross-team collaborative research and shared context
- Role-based access and audit logging
- Enterprise compliance controls
- Team dashboards and analytics
- Self-improving through evaluation feedback loops

## User Journeys

### Journey 1: Alex Chen — The 30-Second Answer

Alex is a Product Manager at SambaTV preparing for a cross-functional planning meeting. She needs to understand how a competitor's new product announcement affects their Q1 roadmap, but the relevant information is scattered across Slack threads from three months ago, a Confluence page she vaguely remembers, and an analyst report someone mentioned in passing.

Normally, this would take 45 minutes of hunting—opening tabs, searching Slack, scrolling through old threads, piecing together fragments. Instead, Alex opens Orion in Slack and types: "What do we know about [Competitor X]'s product announcement in October and how does it affect our Q1 priorities?"

Orion spawns three parallel research subagents. One searches Slack history, another queries Confluence, and a third synthesizes the analyst report from the shared drive. Within 90 seconds, Alex receives a structured summary: the competitor announcement, internal reactions from engineering and sales, the strategic implications documented by the product team, and links to source materials.

The meeting starts in 5 minutes. Alex walks in prepared, cites specific internal discussions, and leads a focused conversation. Her colleagues ask, "How did you pull that together so fast?"

**Requirements revealed:** Multi-source search, parallel subagent execution, source citation, Slack/Confluence integration, synthesis capability.

---

### Journey 2: Marcus Rivera — Activation IDs in Minutes

Marcus is a Programmatic Consultant preparing for a client call in 30 minutes. The client—a major streaming platform—wants targeting recommendations for their Q1 brand campaign focused on "cord-cutters who watch premium content." Marcus would normally spend an hour pulling audience segments from multiple platforms, cross-referencing availability, and building a recommendation deck.

He opens Orion and types: "I need audience targeting recommendations for cord-cutters interested in premium streaming content in the US. Give me exact Activation IDs from our APAC and US audience data."

Orion queries the internal audience MCP server, analyzes the client brief against available segments, and returns a structured response: five recommended audience segments with exact Activation IDs, reach estimates, and a brief rationale for each. It even suggests a contextual targeting layer from the TTD Rail.

Marcus copies the recommendations into his deck, adds two sentences of context, and joins the call. The client is impressed by the specificity—exact IDs, not vague categories. The deal closes that week.

**Requirements revealed:** Custom MCP server for internal data, structured recommendations, exact ID matching from knowledge base, client-ready output format.

---

### Journey 3: Priya Sharma — The Prospect Dossier

Priya is an Account Executive with a discovery call in one hour. The prospect—a VP of Marketing at a retail brand—has been unresponsive to generic outreach. Priya needs to understand their business challenges, recent news, and what would make this call valuable to them.

She opens Orion: "Build me a prospect brief for [VP Name] at [Retail Brand]. Include recent company news, their likely priorities based on industry trends, and any connections to our existing clients."

Orion runs a deep research workflow: web search for recent news, LinkedIn insights, analysis of retail industry trends, and a cross-reference against SambaTV's client list. Three minutes later, Priya has a one-page dossier: the company just announced a new streaming partnership, the VP previously worked at a brand that's a current client, and retail media networks are their likely priority for Q1.

Priya opens the call with: "I noticed you just announced the streaming partnership—congratulations. I'm curious how you're thinking about connected TV measurement for that." The VP leans in. The call extends by 20 minutes.

**Requirements revealed:** Web research capability, structured dossier format, cross-reference internal data, industry trend analysis, actionable conversation hooks.

---

### Journey 4: Jordan Taylor — Day One Questions

Jordan is a new Software Engineer starting their first day at SambaTV. They've completed the formal onboarding checklist, but now they're staring at a Slack workspace with 200 channels, a Confluence space they can't navigate, and a codebase they've never seen. Their manager is in back-to-back meetings until 3pm.

Jordan remembers someone mentioning Orion during orientation. They open it and type: "I'm a new engineer. How do I set up my local development environment for the data pipeline team?"

Orion searches the engineering onboarding docs, finds the setup guide, and returns a step-by-step summary with links to the source documentation. When Jordan hits a snag with Docker configuration, they ask: "I'm getting a Docker network error when running the data pipeline locally." Orion searches recent Slack threads, finds that three other engineers hit this issue last month, and surfaces the solution: a specific environment variable that wasn't in the docs.

By end of day one, Jordan has a working local environment and has submitted their first PR—a documentation update to add the missing environment variable.

**Requirements revealed:** Onboarding doc search, troubleshooting via Slack history, recent issue discovery, documentation gap identification.

---

### Journey 5: Sam Okonkwo — The Ticket That Solved Itself

Sam works in IT Support and starts their morning with 47 tickets in the queue. They scan the list: password reset, VPN access, software installation request, Slack integration issue, and a dozen variations of "my laptop is slow."

But something's different this morning. The ticket count is actually down from last week. Sam investigates and finds that 15 common requests never became tickets—employees resolved them through Orion instead. Someone needed VPN setup instructions and got them instantly. Another person needed to request software access and Orion walked them through the self-service portal. A third asked about the guest WiFi password and got it without filing a ticket.

Sam focuses on the complex issues—the ones that actually need human judgment. The Slack integration issue turns out to be a permissions problem that requires admin access. Sam resolves it, updates the runbook, and adds the solution to Orion's knowledge base so future similar issues can be handled automatically.

By end of week, ticket volume is down 30%. Sam's team can finally focus on infrastructure improvements instead of password resets.

**Requirements revealed:** Self-service IT support, runbook access, knowledge base integration, ticket deflection, escalation path for complex issues.

---

### Journey Requirements Summary

| Journey | Key Capabilities Required |
|---------|---------------------------|
| **Alex (Research)** | Multi-source search, parallel subagents, source citation, Slack/Confluence integration |
| **Marcus (Consultant)** | Custom MCP servers, internal data access, structured recommendations, exact ID matching |
| **Priya (Sales)** | Web research, prospect dossiers, cross-reference internal data, actionable insights |
| **Jordan (New Hire)** | Onboarding docs, troubleshooting, recent issue discovery, documentation linking |
| **Sam (IT Support)** | Self-service support, runbook access, knowledge base, ticket deflection |

### Cross-Journey Patterns

All journeys share these core patterns:
- **Context gathering first** — Orion searches before answering
- **Source transparency** — Links to where information came from
- **Structured output** — Formatted for immediate use
- **Speed** — Answers in seconds/minutes, not hours
- **The "Aha" moment** — Users realize Orion *did work*, not just answered

## Innovation & Novel Patterns

### Detected Innovation Areas

Orion contains three genuinely novel architectural approaches that challenge common assumptions about enterprise AI assistants:

#### 1. No Integration Ceiling (Code Generation as Escape Hatch)

**Assumption challenged:** "You need pre-built integrations to connect to systems."

Most AI assistants hit a wall when there's no pre-built connector. If the MCP server doesn't exist, if the API wrapper isn't available, if the integration hasn't been built—the assistant is stuck.

Orion's approach: generate code on-the-fly. When a user needs data from a system without a pre-built integration, Orion writes Python or JavaScript to call the API directly, parse the response, and return structured results. The agent writes its way through gaps.

**Implications:**
- No dependency on integration marketplace coverage
- Can connect to internal APIs without building MCP servers first
- Reduces "we don't support that" responses to near-zero
- Shifts work from "build integration" to "provide API documentation"

**Validation approach:**
- Track % of requests that use code generation vs. pre-built tools
- Measure success rate of generated code executions
- Monitor for security/safety issues in generated code

#### 2. Composable Agent Architecture (Everything is a Tool Call)

**Assumption challenged:** "AI assistants are monolithic systems with fixed capabilities."

Traditional AI assistants have a fixed set of capabilities decided at build time. Adding new features requires code changes and redeployment.

Orion's approach: everything is a tool call—MCP servers, vector DBs, code generation, subagents, skills, commands. The agent selects the right tool for each task. New capabilities are added by dropping files into `.orion/` or `.claude/` directories.

**Implications:**
- Capabilities grow without code changes
- Different users can have different skill sets
- The system can adapt to new requirements dynamically
- Architecture supports experimentation without risk

**Validation approach:**
- Successfully add 1 new Skill or Command post-launch (MVP success gate)
- Track time-to-new-capability after platform is stable
- Measure adoption of new capabilities after addition

#### 3. File-First Context Engineering (Agentic Search)

**Assumption challenged:** "AI context must come from vector databases and semantic search."

The industry default for RAG is semantic search over embeddings. Orion supplements this with agentic search—using `grep`, `find`, `tail` to navigate a file system where the folder structure itself is context engineering.

**Implications:**
- Context gathering is transparent and debuggable
- No embedding pipeline to maintain
- File organization becomes a feature, not just storage
- Works for structured data that embeds poorly

**Validation approach:**
- Compare accuracy of agentic search vs. semantic search for specific query types
- Measure user satisfaction when sources are cited via file paths
- Track which approach is selected for different query patterns

### Market Context

These innovations position Orion in an emerging category: **agentic AI systems** that execute work rather than just answer questions. The market is early:

- **Claude Code** (Anthropic) — Developer-focused, code-first
- **Devin** (Cognition) — Autonomous software engineer
- **Harvey** (Legal AI) — Domain-specific agent
- **Ramp** (Finance) — Workflow automation in finance

Orion's differentiation: enterprise-wide, Slack-native, composable architecture that grows with the organization's needs.

### Risk Mitigation

| Innovation Risk | Mitigation Strategy |
|-----------------|---------------------|
| Generated code introduces security vulnerabilities | Sandboxed execution, code review in verification loop |
| Composability creates configuration complexity | BMAD-style file organization, clear conventions |
| Agentic search is slower than semantic search | Hybrid approach—use semantic for speed, agentic for precision |
| "Everything is a tool" creates cognitive overload | Skills/Commands abstract complexity from end users |

## Enterprise Platform Requirements

### Platform Model

**Deployment Model:** Single-tenant internal enterprise tool
- Deployed for SambaTV organization only
- Not a multi-tenant SaaS product
- No external customer billing or subscription tiers

**Access Model:**
- **MVP:** All employees can access Orion via Slack
- **Admin controls:** Platform admin manages restrictions as needed (MCP server access, tool permissions)
- **Future:** Role-based access controls, audit logging, department-specific permissions

### Integration Architecture

Orion connects to enterprise systems through a unified tool layer:

| Integration Type | Examples | Protocol |
|------------------|----------|----------|
| **Slack** | Primary interface | Bolt + Assistant API |
| **MCP Servers** | Any HTTP streamable MCP server (Rube/Composio, GitHub, Atlassian, custom) | Generic MCP Client (HTTP streamable transport) |
| **Knowledge Sources** | Confluence, Google Drive, Slack history | Via MCP or agentic search |
| **Observability** | Langfuse | OpenTelemetry + Langfuse SDK |
| **Infrastructure** | Google Cloud Run (300s timeout, min 1 instance) | HTTP webhooks |
| **Code Execution** | MCP-based sandboxes (e.g., Rube workbench) or deferred to post-MVP | Via MCP tools |

**Integration Priorities for MVP:**

| Priority | Integration | Reason |
|----------|-------------|--------|
| **P0 (Must Have)** | Slack (Bolt + Assistant) | Primary interface |
| **P0 (Must Have)** | Direct Anthropic API (messages.create) | Core agent execution with tool_use loop |
| **P0 (Must Have)** | Generic MCP Client (HTTP streamable) | Connect to any MCP server at runtime |
| **P0 (Must Have)** | Langfuse | Observability from day one |
| **P0 (Must Have)** | Cloud Run (300s timeout) | Deployment target for long-running agent loops |
| **P1 (Should Have)** | Rube/Composio MCP server | 500+ app integrations (one of many MCP options) |
| **P1 (Should Have)** | Web search | Research capability |
| **P2 (Nice to Have)** | Confluence MCP | Knowledge base access |
| **P2 (Nice to Have)** | Custom internal MCP servers | Domain-specific data |

### Permission Model

**MVP Approach (Simple):**
- All authenticated Slack users can access Orion
- No feature-level restrictions initially
- Admin can disable MCP servers or tools if needed
- All actions logged via Langfuse for audit trail

**Future Access Controls (Post-MVP):**

| Control Type | Description |
|--------------|-------------|
| **Role-Based Access** | Define roles (user, power user, admin) with different capabilities |
| **Tool Restrictions** | Limit which MCP servers/tools are available to which users |
| **Department Scoping** | Restrict access to department-specific data sources |
| **Audit Logging** | Detailed logs of who did what, when |
| **Compliance Controls** | Approval workflows for sensitive actions |

### Enterprise Considerations

**Security:**
- All secrets in GCP Secret Manager (API keys, tokens)
- Request signature verification via Slack signing secret
- Sandboxed code execution for generated code
- Minimize data stored in Orion; store only necessary metadata/summaries with retention + access controls. Source systems remain authoritative.

**Reliability:**
- Cloud Run auto-scaling (min 1 instance to avoid cold starts)
- Graceful degradation if MCP servers are unavailable
- Langfuse tracing for debugging production issues

**Cost Management:**
- Target: <$0.10 per query average
- Langfuse tracks token usage and cost per interaction
- Budget alerts and usage limits configurable

### Technical Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                          SLACK                               │
│              (Events API → HTTP Webhooks)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    GOOGLE CLOUD RUN                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ORION CONTAINER                                        │ │
│  │  ├── Slack Bolt (HTTP mode)                             │ │
│  │  ├── Agent Loop (Anthropic messages.create + tool_use) │ │
│  │  ├── Subagent Spawner (parallel API calls)              │ │
│  │  ├── Generic MCP Client (HTTP streamable transport)     │ │
│  │  └── Langfuse SDK (tracing)                             │ │
│  └────────────────────────────────────────────────────────┘ │
│  Config: timeout=300s, minInstances=1, memory=2GB           │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Anthropic│ │ MCP      │ │ Langfuse │
        │ API      │ │ Servers  │ │          │
        └──────────┘ └──────────┘ └──────────┘
```

**Key Architecture Decisions (from 2025-12-22 session):**
- Direct Anthropic API replaces Agent SDK (eliminates sandbox spin-up latency)
- Cloud Run deployment replaces Vercel (supports 300s+ timeouts for agent loops)
- Generic MCP client connects to any HTTP streamable MCP server at runtime
- Subagents are parallel `messages.create()` calls with isolated context

## Functional Requirements

### Agent Core Execution

- FR1: System executes the agent loop (Gather Context → Take Action → Verify Work) for every user interaction
- FR2: System verifies responses before delivery and iterates until verification passes
  - *Verification approach:* Verification prompts in system prompt instruct Claude to check tool results for errors, validate factual claims against sources, and confirm task completion before responding. Implementation details in tech spec.
- FR3: System spawns subagents for parallel task execution with isolated context windows
- FR4: System aggregates only relevant results from subagents into the orchestrator response
- FR5: System manages conversation context across long-running threads via compaction
- FR6: System cites sources for factual claims in responses

### Research & Information Gathering

- FR7: Users can request multi-source research across Slack, Confluence, and web sources
- FR8: System synthesizes information from multiple sources into structured summaries
- FR9: System provides links to source materials alongside synthesized information
- FR10: Users can request deep research with automatic parallelization across sources
- FR11: System can search recent Slack history for relevant discussions and solutions
- FR12: System can search Confluence for documentation and knowledge base content

### Communication & Interaction

- FR13: Users can interact with Orion via Slack DMs and channels
- FR14: System streams responses in real-time to show progress via Slack's `chatStream` API
- FR15: System maintains conversation context within Slack threads
- FR16: System provides suggested prompts to help users discover capabilities via `setSuggestedPrompts`
- FR17: System responds to @mentions and direct messages
- FR18: System can summarize Slack threads on request

### Slack AI App Integration

- FR47: System displays dynamic status messages during processing via `setStatus` with `loading_messages` array (e.g., "Searching Confluence...", "Calling Jira API...")
- FR48: System collects user feedback via Slack's native `feedback_buttons` element (thumbs up/down) attached to responses
- FR49: System logs user feedback (positive/negative) to Langfuse for quality tracking and improvement
- FR50: System provides contextual error messages to users when processing fails, with suggested next steps

### Code Generation & Execution (Phase 2)

*Note: Code execution capabilities deferred to Phase 2 per 2025-12-22 architecture decision. MVP focuses on MCP-based integrations.*

- FR19: System generates executable code when pre-built integrations don't exist *(Phase 2)*
- FR20: System executes generated code in sandboxed environments *(Phase 2)*
- FR21: System can call external APIs via generated code *(Phase 2)*
- FR22: System processes and transforms data via generated code *(Phase 2)*
- FR23: System validates generated code output before returning results *(Phase 2)*

### Composable Extensions

- FR24: Developers can add new Skills via Agent Skills open standard ([agentskills.io](https://agentskills.io)) — `SKILL.md` files in `.skills/` directory
- FR25: Developers can add new Commands via file-based workflow definitions in `.orion/commands/`
- FR26: System connects to MCP servers via generic HTTP streamable client (runtime-configurable)
- FR27: System can invoke multiple MCP servers within a single response (tools merged into unified registry)
- FR28: System selects appropriate tools from available options for each task
- FR29: Platform admin can enable or disable MCP servers

### Knowledge & Q&A

- FR30: Users can ask questions and receive grounded, verified answers
- FR31: System searches relevant knowledge sources before answering
- FR32: Users can request prospect research and receive structured dossiers
- FR33: Users can request audience targeting recommendations with exact IDs
- FR34: System provides troubleshooting guidance by searching recent issues

### Observability & Administration

- FR35: System traces all interactions via Langfuse
- FR36: System tracks token usage and cost per interaction
- FR37: Platform admin can view interaction traces for debugging
- FR38: Platform admin can manage prompt versions via Langfuse
- FR39: System logs all tool executions and their results
- FR40: Platform admin can configure which tools are available

### MVP Workflows

- FR41: System supports Deep Research workflow (multi-step, parallelized, synthesized)
- FR42: System supports Summarization workflow (threads, documents, conversations)
- FR43: System supports Q&A workflow (grounded, verified, cited)

### Persistent Memory

- FR44: System maintains persistent memory across sessions via Memory Tool pattern (view, create, update, delete operations) with Google Cloud Storage backend
- FR45: System organizes memory in three scopes: global (shared learnings), user-level (per Slack user preferences), and session-level (per thread context)
- FR46: Claude automatically checks `/memories` directory at conversation start to restore relevant context

## Non-Functional Requirements

### Performance

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| **Simple query response** | 1-3 seconds | Time from user message to first streamed response |
| **Tool-augmented response** | 3-10 seconds | Time from user message to complete response with tool calls |
| **Deep research workflow** | <5 minutes | Time for multi-source research with synthesis |
| **Streaming start** | <500ms | Time from message receipt to first streamed token |
| **Subagent parallelization** | 3 concurrent max | Parallel subagents per request |

### Security

| Requirement | Specification |
|-------------|---------------|
| **Secrets management** | All API keys, tokens stored in GCP Secret Manager—never in code or logs |
| **Request verification** | All Slack requests validated via signing secret |
| **Code execution** | All generated code runs in sandboxed environments with no filesystem/network escape |
| **Data residency** | Minimize data stored in Orion; keep source systems authoritative. If Orion stores derived summaries/metadata, enforce retention + access controls. |
| **Authentication** | All users authenticated via Slack—no separate auth layer |
| **Audit logging** | All interactions traced via Langfuse with user identification |

### Reliability

| Requirement | Target | Notes |
|-------------|--------|-------|
| **Uptime** | >99.5% | Measured monthly |
| **Cold start mitigation** | min instances = 1 | Always-on Cloud Run instance |
| **Graceful degradation** | Yes | If MCP server unavailable, inform user and continue with available tools |
| **Error recovery** | Automatic retry | Transient failures retried with exponential backoff |
| **Trace coverage** | 100% | Every interaction traced via Langfuse |

### Integration

| Requirement | Specification |
|-------------|---------------|
| **MCP transport** | HTTP streamable transport (generic client connects to any MCP server) |
| **MCP protocol** | Support MCP 1.0 protocol (tools/list, tools/call) |
| **Tool discovery** | Runtime discovery via tools/list, convert to Claude tool format |
| **Concurrent tool calls** | Support multiple MCP servers in single response |
| **Tool timeout** | 30 second timeout per tool call with graceful handling |
| **Streaming compatibility** | All responses stream to Slack regardless of tool usage |
| **Langfuse integration** | OpenTelemetry-compatible tracing |

### Scalability

| Requirement | Target | Notes |
|-------------|--------|-------|
| **Concurrent users** | 50 simultaneous | Initial internal deployment |
| **Requests per minute** | 100 | Peak expected load |
| **Context window** | Model-dependent | Use a model with a large context window; compaction manages long threads |
| **Model switching** | Config-driven | Switch providers/models without code changes; validate via evals before rollout |
| **Auto-scaling** | Cloud Run default | Scale to demand within budget |

### Cost

| Requirement | Target | Notes |
|-------------|--------|-------|
| **Cost per query (average)** | <$0.10 | Tracked via Langfuse |
| **Monthly budget** | Configurable alerts | Budget limits enforced |
| **Token tracking** | Per-interaction | All token usage logged |

### Error Handling

| Requirement | Specification |
|-------------|---------------|
| **User-facing errors** | Clear, non-technical messages explaining what went wrong and suggested next steps |
| **Tool failures** | Inform user which tool failed; offer to retry or use alternative approach |
| **Agent loop failures** | Graceful exit with partial results if available; log full trace for debugging |
| **Rate limit handling** | Queue requests when approaching limits; inform user of delay if significant |

### Rate Limiting & Abuse Protection

| Requirement | Target | Notes |
|-------------|--------|-------|
| **Anthropic API limits** | Respect provider rate limits | Exponential backoff on 429 errors |
| **Per-user throttling** | 10 requests/minute soft limit | Prevent accidental loops or abuse |
| **System-wide protection** | Circuit breaker on repeated failures | Prevent cascade failures |
| **Monitoring** | Alert on unusual patterns | Langfuse + logging for detection |

