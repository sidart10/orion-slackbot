---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - "_bmad-output/prd.md"
  - "_bmad-output/architecture.md"
session_topic: 'Claude Agent SDK to Direct Claude API Migration'
session_goals: 'Research API capabilities, ensure feature parity, de-risk migration'
selected_approach: 'ai-recommended'
techniques_used: ['constraint-mapping', 'first-principles-thinking', 'solution-matrix']
ideas_generated: []
context_file: '_bmad/bmm/data/project-context-template.md'
status: 'complete'
---

# Brainstorming Session Results

**Facilitator:** Sid  
**Date:** 2025-12-22  
**Topic:** Claude Agent SDK → Direct Claude API Migration

---

## Executive Summary

This session validated that migrating from Claude Agent SDK to direct Anthropic API integration is not only feasible but **recommended**. The direct API provides all required capabilities (multi-turn tool loops, subagent orchestration, streaming) without the sandbox latency issues that caused Agent SDK to fail on Vercel.

**Key Decision:** Replace Agent SDK with direct `messages.create()` API calls, deploy on Google Cloud Run.

---

## Session Overview

**Topic:** Migrating from Claude Agent SDK to direct Anthropic API integration  
**Goals:** 
1. ✅ Research if Claude API provides equivalent capabilities
2. ✅ Find faster alternatives to sandbox execution
3. ✅ Gather accurate API specs for direct implementation
4. ✅ Map requirements to implementation approaches

**Core Problem Solved:** Agent SDK sandbox spin-up latency + Vercel incompatibility

---

## Phase 1: Constraint Mapping

### Real Constraints (Must Address)

| Constraint | Impact | Solution |
|------------|--------|----------|
| Agent SDK failed on Vercel | Blocking | Use direct API instead |
| Long-running agent loops | Need timeout > 60s | Deploy on Cloud Run (5-15 min timeout) |
| MCP connectivity | Need HTTP streamable | Build generic MCP client |
| Subagent orchestration | Must parallelize | Promise.all() on separate API calls |
| Slack streaming | Must stream responses | Existing streaming works, integrate with agent loop |

### Removed Constraints (Were Imagined)

| Assumed Constraint | Reality |
|--------------------|---------|
| Must use Agent SDK for agentic behavior | Direct API supports full agent loops |
| Must pre-plan specific MCP servers | Generic MCP client connects to any server |
| Rube is "primary" MCP server | It's just one option among many |
| Need custom sandbox for code execution | Can use MCP servers OR skip for MVP |

---

## Phase 2: First Principles Analysis

### Fundamental Truths

1. **Orion is an Execution Layer** — Claude must decide actions, execute tools, iterate until done
2. **Agent Loop is Everything** — `while (stop_reason === 'tool_use')` is the core pattern
3. **Subagents = Parallel Isolated Work** — Just separate API calls with own context
4. **Tools Are Just Function Definitions** — MCP, web search, anything is just a tool
5. **MCP is a Protocol, Not a Dependency** — HTTP client converts MCP tools to Claude format

### What Direct API Provides

| Capability | How API Provides It |
|------------|---------------------|
| Multi-turn tool loops | `stop_reason: "tool_use"` → loop continues |
| Self-correction | Natural in the loop — Claude sees results, decides next action |
| Parallel tools | Claude can request multiple tools in one response |
| Subagents | Separate `messages.create()` calls |
| Streaming | Native API support |
| Extended thinking | API parameter for planning before action |

---

## Phase 3: Solution Matrix

### Agent Core (FR1-6)

| Requirement | Implementation | Effort |
|-------------|----------------|--------|
| Agent Loop | `while` loop around `messages.create()` | 1 day |
| Verification | Instructions in system prompt | Low |
| Spawn Subagents | Parallel `messages.create()` calls | 0.5 day |
| Aggregate Results | Collect outputs from Promise.all | Low |
| Context Compaction | Sliding window on messages array | 0.5 day |
| Source Citation | Prompt instructions + tool responses | Low |

### MCP Integration

| Requirement | Implementation | Effort |
|-------------|----------------|--------|
| Generic MCP Client | HTTP client for streamable transport | 1 day |
| Tool Discovery | Call `tools/list`, convert to Claude format | 0.5 day |
| Tool Execution | Proxy to MCP `tools/call` | Low |
| Multiple Servers | Connect to N servers, merge tool lists | Low |

### Deployment

| Requirement | Implementation | Effort |
|-------------|----------------|--------|
| Cloud Platform | Google Cloud Run | Medium |
| Container | Dockerfile with Node.js 20 | Low |
| Timeout | 300s (5 min) configurable | Low |
| Auto-scaling | Cloud Run native | Low |
| Secrets | GCP Secret Manager | Low |
| CI/CD | Cloud Build + GitHub | 0.5 day |

### Already Complete

| Component | Status |
|-----------|--------|
| Slack Bolt + Assistant | ✅ Working |
| Streaming to Slack | ✅ Working |
| Thread Context | ✅ Working |
| Langfuse Tracing | ✅ Working |
| Environment Config | ✅ Working |
| Logging | ✅ Working |

---

## Architecture Decision: Cloud Run vs Vercel

| Aspect | Vercel | Cloud Run | Decision |
|--------|--------|-----------|----------|
| Function Timeout | 60s max | Up to 60 min | **Cloud Run** |
| Subprocess Support | Limited | Full Docker | **Cloud Run** |
| Long Streaming | May timeout | Full support | **Cloud Run** |
| Auto-scaling | Yes | Yes | Tie |
| Cold Starts | Fast | Configurable min instances | Tie |
| Cost | Per invocation | Per request-time | Similar |

**Decision:** Deploy on Google Cloud Run

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SLACK                                 │
│              (Events API → HTTP Webhooks)                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                   GOOGLE CLOUD RUN                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ORION CONTAINER                                        │ │
│  │  ├── Slack Bolt (HTTP mode)                             │ │
│  │  ├── Agent Loop (Anthropic messages.create)             │ │
│  │  ├── Subagent Spawner (parallel API calls)              │ │
│  │  ├── MCP Client (generic HTTP streamable)               │ │
│  │  └── Langfuse SDK (tracing)                             │ │
│  └────────────────────────────────────────────────────────┘ │
│  Config: timeout=300s, minInstances=1, memory=2GB           │
└─────────────────────────────┬───────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │ Anthropic│    │ MCP      │    │ Langfuse │
        │ API      │    │ Servers  │    │          │
        └──────────┘    └──────────┘    └──────────┘
```

---

## Implementation Estimate

| Component | Effort | Priority |
|-----------|--------|----------|
| Agent Loop (`src/agent/loop.ts`) | 1 day | P0 |
| MCP Client (`src/tools/mcp/client.ts`) | 1 day | P0 |
| Tool Registry (`src/tools/registry.ts`) | 0.5 day | P0 |
| Subagent Spawner (`src/agent/subagents.ts`) | 0.5 day | P0 |
| Response Generator (replace placeholder) | 0.5 day | P0 |
| Dockerfile + Cloud Run config | 0.5 day | P0 |
| CI/CD Pipeline | 0.5 day | P1 |

**Total New Work:** ~4.5 days

---

## Required Document Updates

### PRD Changes

1. Replace all "Agent SDK" references with "Direct Anthropic API"
2. Update deployment target: Vercel → Google Cloud Run
3. MCP section: "Generic MCP client" not "Rube as primary"
4. Add HTTP streamable MCP as MVP requirement
5. Update architecture diagram

### Architecture Changes

1. Agent execution: `messages.create()` with tool loop
2. MCP: Generic HTTP streamable client, runtime-configurable
3. Deployment: Cloud Run with 300s timeout
4. Remove sandbox spin-up assumptions
5. Update project structure for new components

### Epic/Story Changes

1. Story 2.1: Complete rewrite for direct API
2. Story 3.1: Update for generic MCP client
3. Story 4.x: Sandbox stories may be deferred
4. Add: Cloud Run deployment story
5. Add: CI/CD pipeline story

---

## Session Conclusion

**Migration Validated:** ✅ Direct Claude API provides all required capabilities  
**Architecture Confirmed:** ✅ Cloud Run deployment with generic MCP client  
**Risk Level:** LOW — API capabilities confirmed, implementation straightforward  
**Estimated Effort:** ~4.5 days for core implementation  

**Next Steps:**
1. Update PRD with session findings
2. Update Architecture document
3. Create new stories based on solution matrix
4. Begin implementation

---

*Session completed: 2025-12-22*
