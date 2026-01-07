---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: 'Claude Tool Search Tool Implementation for Orion'
session_goals: 'Reduce token consumption, improve tool selection accuracy, align with Claude patterns'
selected_approach: 'ai-recommended'
techniques_used: ['constraint_mapping', 'first_principles_thinking', 'decision_tree_mapping']
ideas_generated: ['feature_flag_rollout', 'balanced_defer_strategy', 'bm25_search_variant']
context_file: '_bmad/bmm/data/project-context-template.md'
technique_execution_complete: true
---

# Brainstorming Session: Claude Tool Search Tool Implementation

**Date:** 2026-01-03  
**Facilitator:** Mary (Business Analyst)  
**Participant:** Sid

## Session Overview

**Topic:** Refactoring Orion's tool system to use Claude's native Tool Search Tool pattern

**Goals:**
1. Reduce token consumption (from ~100K+ to ~5-10K per call)
2. Improve tool selection accuracy (currently degraded with 500+ Rube tools)
3. Align with Claude's recommended patterns for scalable tool management

### Context Guidance

This session focuses on a technical architecture challenge within the Orion Slack Agent project:

- **Current State:** All tools (500+) loaded upfront into every `messages.create()` call
- **Problem:** Token waste, degraded selection accuracy beyond 30-50 tools
- **Solution Direction:** Claude's `tool_search_tool` with `defer_loading: true`
- **Integration Points:** Epic 3 (MCP Tools), Story 3.2 (Tool Discovery), agent loop

### Session Setup

**Research Completed:**
- Analyzed current `src/tools/registry.ts` architecture
- Reviewed Claude Tool Search Tool documentation
- Verified SDK support (`@anthropic-ai/sdk ^0.71.0` has `defer_loading`, `BetaToolSearchToolResultBlock`)
- Identified 7 files requiring modification
- Mapped complete implementation requirements including beta API switch

**Key Technical Findings:**
1. Must switch from `messages.create()` to `beta.messages.create()`
2. New stream event types: `server_tool_use`, `tool_search_tool_result`
3. Beta header: `advanced-tool-use-2025-11-20`
4. Tool tiers needed: ALWAYS (memory, static) / FREQUENT (exa, internal MCP) / DEFERRED (rube 500+)

---

## Technique Selection

**Approach:** AI-Recommended Techniques  
**Analysis Context:** Claude Tool Search Tool Implementation with focus on reducing token consumption and improving tool selection accuracy

**Recommended Techniques:**

1. **Constraint Mapping** (deep): Map real vs. imagined constraints — beta API limitations, backwards compatibility, migration paths
2. **First Principles Thinking** (creative): Strip away assumptions about tool loading, rebuild from Claude's documented patterns
3. **Decision Tree Mapping** (structured): Map all implementation paths with risk/reward analysis for phased rollout

**AI Rationale:** This technical architecture challenge benefits from a grounded → creative → structured flow. We first understand what's truly blocking us (Constraint Mapping), then question assumptions (First Principles), then map concrete paths forward (Decision Tree).

---

## Brainstorming Content

### Technique 1: Constraint Mapping 🗺️

**Key Discovery:** Tool search is a **presentation-layer change**, not an execution-layer change.

#### Hard Constraints (Immutable)
| Constraint | Why It's Hard |
|------------|---------------|
| Must use `beta.messages.create()` | Required for tool search feature |
| Beta header: `advanced-tool-use-2025-11-20` | API requirement |
| Must ALSO keep `context-management-2025-06-27` | Memory tool dependency |
| Only Sonnet 4+ / Opus 4+ support | API limitation |
| Must handle `server_tool_use` stream events | New event type from API |
| Must handle `tool_search_tool_result` stream events | New event type from API |

#### Soft Constraints (Negotiable)
| Constraint | Mitigation |
|------------|------------|
| Stream types change | Type assertion / gradual migration |
| Need rollback capability | Feature flag |
| Can't unit test server-side search | Integration tests only |

#### Key Insight: What DOESN'T Change
- Tool registration (all tools still in registry)
- Tool routing (Static → Skill → MCP priority)
- Tool execution (`router.ts`, `executor.ts` unchanged)
- Tool result formatting
- Memory tool handling (just combine beta headers)

**Conclusion:** Implementation is SIMPLER than initially scoped — only 2 files need changes:
1. `registry.ts` — add `getToolsForClaudeWithDefer()`
2. `loop.ts` — beta API, new stream handlers, tool search tool

---

### Technique 2: First Principles Thinking 🧱

**Core Principles Established:**

| # | Principle | Implication |
|---|-----------|-------------|
| **1** | Context window is finite — preserve it for actual work | Defer as many tools as possible |
| **2** | Use Claude's native tool search API exactly as provided | `tool_search_tool_bm25_20251119` — no custom implementations |
| **3** | Tool execution path doesn't change | Only change what Claude SEES, not how tools RUN |
| **4** | Rube has internal search (double-layer efficiency) | Claude → Rube → Composio 500+ tools |

**Minimal Upfront Set:**
- `tool_search_tool_bm25` (required for discovery)
- `memory` tool (required for context — most turns use this)
- Static tools: `summarize_conversation`, `execute_code`

**Everything Else Deferred:**
- `rube__*` (500+ Composio tools)
- `genmedia-imagen__*`, `genmedia-veo__*`
- `audience-manager__*`, `msci-reports__*`, `exa__*`

**Token Savings:** ~100K+ tokens per request → available for actual work

---

### Technique 3: Decision Tree Mapping 🌲

**Implementation Decisions Made:**

| Decision | Options Considered | Selected | Rationale |
|----------|-------------------|----------|-----------|
| **Rollout Strategy** | Big Bang / Feature Flag / Phased | **Feature Flag** | Low risk, instant rollback via env var, allows A/B testing |
| **Defer Strategy** | Aggressive / Balanced / Conservative | **Balanced** | Keep static tools + memory upfront; defer all MCP tools |
| **Search Variant** | Regex / BM25 | **BM25** | Natural language search matches user intent better |

**Final Architecture:**

```
UPFRONT (non-deferred):
├── tool_search_tool_bm25 (required)
├── memory (SDK helper, most turns use)
├── summarize_conversation (static)
└── execute_code (static)

DEFERRED (defer_loading: true):
├── rube__* (500+ Composio tools)
├── genmedia-imagen__* (image generation)
├── genmedia-veo__* (video generation)
├── audience-manager__* (internal MCP)
├── msci-reports__* (internal MCP)
└── exa__* (web search)
```

**Feature Flag:**
```
TOOL_SEARCH_ENABLED=true  → Use beta API with tool search
TOOL_SEARCH_ENABLED=false → Current behavior (all tools upfront)
```

---

## Session Outcomes

### Files to Modify

| File | Changes |
|------|---------|
| `src/config/environment.ts` | Add `toolSearchEnabled` config |
| `src/tools/registry.ts` | Add `getToolsForClaudeWithDefer()`, tier logic |
| `src/agent/loop.ts` | Feature flag, beta API, stream handlers |

### Implementation Checklist

- [ ] Add `TOOL_SEARCH_ENABLED` env var to config
- [ ] Add `defer_loading` flag to tool type definitions
- [ ] Implement `getToolsForClaudeWithDefer()` in registry
- [ ] Add `tool_search_tool_bm25` to tools array
- [ ] Switch to `beta.messages.create()` with combined betas
- [ ] Handle `server_tool_use` stream events
- [ ] Handle `tool_search_tool_result` stream events
- [ ] Add integration tests for tool search flow
- [ ] Update Story 3.2 or create new Story for this work

### Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Tokens per request (tools) | ~100K+ | ~2-5K |
| Context available for work | ~68K | ~195K |
| Tool selection accuracy | Degraded (500+ tools) | Optimal (3-5 discovered) |

---

## Next Steps

1. **Create Story** — Write formal story with acceptance criteria
2. **Implement** — Follow feature flag approach
3. **Test** — Integration tests with real MCP servers
4. **Deploy** — Behind `TOOL_SEARCH_ENABLED=false` initially
5. **Validate** — Enable flag, monitor Langfuse traces
6. **Cleanup** — Remove flag once stable


