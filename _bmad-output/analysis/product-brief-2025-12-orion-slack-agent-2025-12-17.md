---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - "_bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md"
workflowType: "product-brief"
lastStep: 5
project_name: "2025-12 orion-slack-agent"
user_name: "Sid"
date: "2025-12-17"
---

# Product Brief: 2025-12 orion-slack-agent

**Date:** 2025-12-17
**Author:** Sid

---

## Executive Summary

Orion is an enterprise agentic AI system that transforms Slack into an intelligent execution layer for the entire organization. Built on Anthropic's Claude Agent SDK, Orion implements the core agent loop—*gather context, take action, verify work*—with composable tool connectivity, parallel subagent execution, and first-class observability.

Unlike conversational AI that answers questions, Orion *executes work*: conducting deep research with automatic synthesis, generating and running code in sandboxed environments, managing workflows across enterprise systems, and maintaining context across long-running conversations through intelligent compaction.

The architecture prioritizes **composability at every layer**:
- **Tools**: MCP protocol, vector databases, direct API calls via code generation—all unified as tool calls
- **Skills**: Domain expertise packages that load progressively on-demand
- **Commands**: User-triggered workflows via slash syntax
- **Subagents**: Parallel execution with isolated context windows

Orion is not locked to any single tool protocol or vendor—it's designed for extensibility, with code generation filling gaps where pre-built integrations don't exist.

---

## Core Vision

### Problem Statement

Enterprise knowledge work is fragmented across dozens of systems, requiring manual task execution that should be automated, deep research that takes hours instead of minutes, and institutional knowledge that remains locked in tribal memory. Current AI assistants can *tell* users things but cannot *do* work—they lack tool connectivity, agentic execution, and enterprise context.

### The Orion Approach

Orion addresses this through a fundamentally different architecture:

**1. Agent Loop Execution Model**

Every interaction follows: Gather Context → Take Action → Verify Work. This ensures responses are grounded in real data and validated before delivery—not hallucinated or assumed.

**2. Unified Tool Architecture**

All external interactions are tool calls—the agent decides which tool to use based on the task:

| Tool Type | Examples | When Used |
|-----------|----------|-----------|
| **MCP Servers** | Custom servers, Composio/Rube, GitHub, Atlassian | Protocol-based integrations |
| **Vector Databases** | Pinecone, Weaviate, Chroma, Qdrant | Semantic similarity search |
| **Code Generation** | REST/GraphQL calls, SQL queries, data processing | On-the-fly integrations |
| **Agentic Search** | grep, find, bash | File system navigation |
| **Skills** | `.claude/skills/` packages | Domain expertise |
| **Commands** | `/command` triggered actions | User workflows |

The tool layer is open and extensible. The agent selects the right tool for each task.

**3. Three-Layer Extensibility**

- **Tools**: MCP servers, vector DBs, code generation—all invoked the same way
- **Skills**: Domain expertise packages that load progressively (metadata → instructions → resources)
- **Commands**: User-invoked workflows via `/command` syntax

**4. Parallel Subagent Architecture**

Complex tasks spawn specialized subagents (research, search, summarize) that run in parallel with isolated context windows. Only relevant results bubble up to the main orchestrator—not full context dumps.

**5. Long-Running Task Support**

- Sandboxed code generation and execution
- Thread-aware compaction for extended conversations
- Progress tracking and background execution
- Graceful degradation on failures

**6. Verification Before Delivery**

- Rules-based validation (format, length, forbidden patterns)
- LLM-as-judge for quality and accuracy assessment
- Visual feedback for generated content
- Iterative refinement loop until verification passes

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                          SLACK                               │
│  (Split Pane AI View, Streaming, Suggested Prompts)         │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP Events
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD RUN                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ORION APPLICATION                                      │ │
│  │  • Slack Bolt (TypeScript) - Event handling, streaming │ │
│  │  • Claude Agent SDK - Reasoning, tool execution        │ │
│  │  • Agent Loop - Gather → Act → Verify                  │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      TOOL LAYER                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ MCP      │ │ Vector   │ │ Code Gen │ │ Agentic  │       │
│  │ Servers  │ │ DB (RAG) │ │ (APIs)   │ │ Search   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│              All unified as tool calls                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       LANGFUSE                               │
│              (Observability & Prompt Management)             │
└─────────────────────────────────────────────────────────────┘
```

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Primary Claude Agent SDK, better async I/O, faster cold starts |
| Slack Mode | HTTP (webhooks) | Aligns with Cloud Run serverless model |
| Tool Architecture | Unified (all tool calls) | MCP, RAG, APIs all invoked the same way |
| Code Execution | Sandboxed | Safe long-running tasks |
| Observability | Langfuse | Prompt versioning, tracing, evaluations |
| Agent Definitions | File-based (.orion/) | Version control, composability |

### What Success Looks Like

- Any employee asks Orion in Slack and gets *executed work*, not just answers
- Complex research tasks run in background with progress updates
- New hires get instant access to institutional knowledge
- Jira tickets, onboarding workflows, and cross-system tasks handled autonomously
- The agent selects the right tool for each task
- Every interaction traced, evaluated, and continuously improved

---

## Target Users

### Primary Users

**1. Knowledge Workers (Cross-Functional)**

*The everyday Orion user across all departments.*

| Attribute | Details |
|-----------|---------|
| **Role** | Engineers, PMs, Analysts, Ops—anyone doing information work |
| **Daily Pain** | Finding information scattered across systems, manual workflows, context-switching, synthesizing data from multiple sources |
| **Orion Use Cases** | Deep research with synthesis, summarizing long threads/docs, collaborative work coordination, automating repetitive workflows |
| **Success Moment** | "I asked Orion and got a complete answer with sources in 30 seconds instead of 30 minutes of hunting" |

---

**2. Programmatic Consultants**

*Specialists who advise on ad tech campaigns and need fast access to data.*

| Attribute | Details |
|-----------|---------|
| **Role** | Client-facing consultants optimizing programmatic campaigns |
| **Daily Pain** | Pulling data from multiple platforms, generating client-ready insights, staying current on audience targeting options |
| **Orion Use Cases** | Campaign performance queries, audience segment recommendations, automated reporting, competitive research |
| **Internal Tools** | Custom MCP servers for ad platform integrations, audience data access |
| **Success Moment** | "I gave Orion a client brief and got targeting recommendations with exact Activation IDs in minutes" |

---

**3. Sales & Marketing (Research)**

*Revenue teams that need fast, accurate intelligence.*

| Attribute | Details |
|-----------|---------|
| **Role** | Sales reps, account managers, marketing strategists |
| **Daily Pain** | Prospect research takes too long, competitive intel is scattered, market analysis is manual |
| **Orion Use Cases** | Prospect research and briefings, competitive intelligence, market trend synthesis, content research |
| **Success Moment** | "Before a call, I ask Orion for a prospect brief and get a complete dossier in seconds" |

---

### Secondary Users

**4. HR (Onboarding)**

*People ops supporting new hire success.*

| Attribute | Details |
|-----------|---------|
| **Role** | HR coordinators, onboarding specialists, managers with new hires |
| **Daily Pain** | New hires ask the same questions repeatedly, onboarding is inconsistent, tribal knowledge is hard to transfer |
| **Orion Use Cases** | New hire Q&A (policies, tools, processes), onboarding workflow automation, training resource discovery |
| **Success Moment** | "New hires ask Orion instead of waiting for someone to respond—and get accurate answers instantly" |

---

**5. IT (Requests & Support)**

*Tech support and internal services team.*

| Attribute | Details |
|-----------|---------|
| **Role** | IT helpdesk, systems administrators, internal tools team |
| **Daily Pain** | Repetitive requests, ticket triage, documentation lookups |
| **Orion Use Cases** | Self-service IT support, ticket creation/triage, runbook execution, system status queries |
| **Success Moment** | "Common IT requests get resolved by Orion without a human ever touching the ticket" |

---

### User Journey (Universal)

| Stage | Experience |
|-------|------------|
| **Discovery** | User hears about Orion from a colleague or sees it in Slack's AI apps |
| **First Use** | Opens Orion in Slack, asks a simple question, gets an answer with sources |
| **Aha Moment** | Realizes Orion can *do* things—not just answer—like filing a Jira ticket or summarizing a long thread |
| **Daily Use** | Orion becomes the first place they go for research, workflows, and cross-system tasks |
| **Power Use** | Uses slash commands, triggers long-running tasks, customizes with Skills |

---

## Success Metrics

### User Success Metrics (Primary)

*How we know Orion is creating real value for employees.*

| Metric | Measurement | Target |
|--------|-------------|--------|
| **Time to Answer** | Average time from query to satisfactory response | <60 seconds for simple queries, <5 min for research |
| **Research Time Saved** | Self-reported time saved on research tasks | >50% reduction vs. manual approach |
| **Task Completion Rate** | % of agentic tasks (Jira, workflows) completed successfully | >90% |
| **Information Found Rate** | % of queries where user finds what they need | >85% |
| **Repeat Usage** | Users who return after first use | >70% within 7 days |
| **"Aha" Moment Conversion** | Users who try an agentic action (not just Q&A) | >40% of active users |

---

### Quality Metrics (Primary)

*How we know Orion is giving accurate, useful answers.*

| Metric | Measurement | Target |
|--------|-------------|--------|
| **Verification Pass Rate** | % of responses passing internal verification loop | >95% |
| **User Feedback Score** | Thumbs up vs. thumbs down ratio | >4:1 positive |
| **Source Citation Rate** | % of factual responses with cited sources | >90% |
| **Follow-up Question Rate** | Users needing to clarify or re-ask | <15% of queries |
| **Hallucination Rate** | Responses flagged as inaccurate | <2% |
| **Tool Execution Success** | % of tool calls returning valid results | >98% |

---

### Adoption Metrics (Secondary)

*How we know employees are actually using Orion.*

| Metric | Measurement | Target (6 months) |
|--------|-------------|-------------------|
| **Daily Active Users (DAU)** | Unique users per day | >30% of eligible employees |
| **Weekly Active Users (WAU)** | Unique users per week | >60% of eligible employees |
| **Queries per User** | Average queries per active user per week | >10 |
| **Feature Breadth** | % of users using 2+ feature types (Q&A, research, tasks) | >50% |
| **Department Coverage** | Departments with >25% adoption | All major departments |

---

### Business Impact Metrics (Secondary)

*How we quantify ROI for the organization.*

| Metric | Measurement | Target |
|--------|-------------|--------|
| **Hours Saved per Employee** | Estimated weekly time savings | >2 hours/week per active user |
| **Ticket Deflection** | IT/HR requests resolved by Orion without human | >30% of common requests |
| **Onboarding Acceleration** | Time for new hires to reach productivity | 20% reduction |
| **Cost per Query** | Langfuse-tracked API + infrastructure cost | <$0.10 per query average |

---

### Observability & Tracking

All metrics tracked via **Langfuse**:
- Every interaction traced with user ID, query type, response time
- Prompt versions linked to quality scores for A/B testing
- Cost and token usage tracked per query
- User feedback captured via Slack feedback buttons

---

## MVP Scope

### Core Features

**Full Platform Infrastructure:**

The MVP delivers a complete, composable platform—not a stripped-down proof of concept. All foundational capabilities are implemented to enable rapid addition of new workflows and skills post-launch.

| Component | Description |
|-----------|-------------|
| **Slack Integration** | Bolt with Assistant class, streaming, thread management, suggested prompts |
| **Claude Agent SDK** | Full `query()` integration with system prompts and tool connectivity |
| **Agent Loop** | Complete gather → act → verify cycle with iterative refinement |
| **Subagents** | Parallel execution with isolated context (research, search, summarize) |
| **Long-Running Tasks** | Background execution with progress tracking |
| **Code Generation** | On-the-fly integrations, data processing, API calls |
| **Sandboxed Execution** | Safe code execution environment |
| **Skills Framework** | Infrastructure for `.claude/skills/` packages |
| **Commands Framework** | Infrastructure for `/command` workflows |
| **Unified Tool Layer** | MCP servers, vector DBs, APIs—all invoked as tool calls |
| **Agentic Search** | File system navigation (grep, find, bash) |
| **Thread Compaction** | Context management for long conversations |
| **Langfuse Observability** | Tracing, prompt versioning, evaluations, cost tracking |
| **Cloud Run Deployment** | HTTP mode, auto-scaling, secrets management |

**MVP Workflows:**

| Workflow | Capability |
|----------|------------|
| **Deep Research** | Multi-step research with subagent parallelization, synthesis, and source citation |
| **Summarization** | Summarize Slack threads, documents, and conversations |
| **Q&A** | Answer questions with grounded responses and verification |

---

### Out of Scope for MVP

*Deferred until tools and instructions are available:*

| Deferred Item | Reason |
|---------------|--------|
| **Jira/Ticket Workflows** | Requires Jira MCP server + workflow instructions |
| **Onboarding Automation** | Requires HR tools + onboarding content |
| **IT Request Handling** | Requires IT systems integration |
| **Programmatic Consultant Tools** | Requires internal ad platform MCP servers |
| **Domain-Specific Skills** | Skills added incrementally as tools/instructions are built |
| **Advanced Commands** | Beyond core `/research`, `/summarize` patterns |
| **HR/Sales/Marketing Specific Features** | Platform ready; features added as integrations mature |

---

### MVP Success Criteria

| Criterion | Target |
|-----------|--------|
| **Infrastructure Complete** | All platform components operational and composable |
| **Core Workflows Functional** | Deep research, summarization, Q&A working end-to-end |
| **Quality Metrics** | >95% verification pass rate, >4:1 positive feedback |
| **Reliability** | >98% tool execution success, <2% hallucination rate |
| **Adoption Signal** | 10+ active users within first 2 weeks |
| **Extensibility Validated** | Successfully add 1 new Skill or Command post-launch |

---

### Future Vision

**Post-MVP Expansion (as tools/integrations mature):**

- **Domain Skills**: Programmatic consulting, sales research, HR onboarding
- **Workflow Library**: Jira ticket creation, IT request handling, meeting prep
- **Additional Tool Integrations**: More MCP servers, vector DBs, custom APIs
- **Advanced Commands**: Custom user-defined automation workflows
- **Cross-Team Features**: Collaborative research, shared context, team dashboards
- **Enterprise Features**: Role-based access, audit logging, compliance controls

**Long-Term Vision:**

Orion becomes the intelligent layer between employees and enterprise systems—the first place anyone goes to get work done, not just get answers.
