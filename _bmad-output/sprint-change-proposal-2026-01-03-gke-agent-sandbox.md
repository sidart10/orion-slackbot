# Sprint Change Proposal: GKE Agent Sandbox for Code Execution

**Date:** 2026-01-03  
**Author:** Course Correction Analysis  
**Status:** ✅ APPROVED  
**Impact Level:** High (New Infrastructure Component)  
**Approved By:** Sid (Product Owner)  
**Approval Date:** 2026-01-02

---

## Executive Summary

Research into Anthropic's Agent Skills feature reveals that **Anthropic's code execution container has no network access**, making it unsuitable for custom skills that need to call MCP tools or external APIs. This proposal recommends adopting **GKE Agent Sandbox** as a self-managed code execution environment that provides network access, custom packages, and full control.

---

## Problem Statement

### Original Plan (Story 6.1: Agent Skills Loader)

The architecture assumed we could create custom Skills using the SKILL.md format and have them execute code that calls MCP tools:

> "FR24: Developers can add new Skills via Agent Skills open standard (agentskills.io) — SKILL.md files in .skills/ directory"

### Research Findings

**Anthropic's Agent Skills API has critical limitations:**

| Constraint | Impact |
|------------|--------|
| **No network access** | Skills cannot call external APIs or MCP servers |
| **No runtime package installation** | Only pre-installed packages available |
| **Fixed environment** | Cannot customize the execution environment |

From Anthropic documentation:
> "**Claude API**: No network access - Skills cannot make external API calls or access the internet. No runtime package installation - Only pre-installed packages are available."

**Programmatic Tool Calling also limited:**
> "The following tools cannot currently be called programmatically: Web search, Web fetch, Tools provided by an MCP connector"

### Consequence

**Custom Skills that need to:**
- Call MCP tools (Confluence, Jira, etc.)
- Make HTTP requests to external APIs
- Use custom Python packages

**Cannot use Anthropic's code execution container.**

---

## Proposed Solution

### GKE Agent Sandbox

[GKE Agent Sandbox](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/agent-sandbox) is an open-source Kubernetes controller that provides:

| Feature | Capability |
|---------|------------|
| **Network access** | ✅ Configurable (full, partial, or none) |
| **Custom packages** | ✅ Define in SandboxTemplate |
| **Isolation** | ✅ gVisor sandboxing |
| **Performance** | ✅ Sub-second with warm pools |
| **Cost** | ~$70/month (GKE Autopilot) |

### Architecture Integration

```
┌─────────────────────────────────────────────────────────────────┐
│  Orion Slack Agent                                              │
│                                                                 │
│  ┌──────────┐    ┌────────────────────────────────────────────┐│
│  │ Claude   │───►│  execute_code Tool                         ││
│  │ (API)    │◄───│                                            ││
│  └──────────┘    │  ┌──────────────────────────────────────┐  ││
│                  │  │  GKE Agent Sandbox                   │  ││
│                  │  │                                      │  ││
│                  │  │  • Custom Skill scripts              │  ││
│                  │  │  • Claude-generated code             │  ││
│                  │  │  • MCP tool calls ✅                 │  ││
│                  │  │  • External API calls ✅             │  ││
│                  │  │  • Custom packages ✅                │  ││
│                  │  └──────────────────────────────────────┘  ││
│                  └────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Infrastructure Setup (1-2 days)

1. **Create GKE Autopilot cluster**
   ```bash
   gcloud container clusters create-auto orion-sandbox-cluster \
     --location=us-central1 \
     --project=ai-workflows-459123
   ```

2. **Deploy Agent Sandbox controller**
   ```bash
   kubectl apply \
     -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.1.0/manifest.yaml \
     -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.1.0/extensions.yaml
   ```

3. **Create Python runtime template with custom packages**

4. **Deploy warm pool for fast execution**

5. **Deploy Sandbox Router**

### Phase 2: Tool Integration (2-3 days)

1. **Create `execute_code` tool** in `src/tools/code-execution/`
   - Python client integration
   - Error handling and timeout management
   - Result parsing

2. **Update Skill loader** to support executable scripts
   - Parse `scripts/` directory in SKILL.md packages
   - Route execution to GKE sandbox

3. **Testing and validation**
   - Network access verification
   - MCP tool calls from skills
   - Latency benchmarking

### Phase 3: Skill Development (ongoing)

- Create custom skills with Python scripts
- Skills can call MCP tools, external APIs
- Full SKILL.md format compliance

---

## Requirements Mapping

| Requirement | Current State | After Change |
|-------------|---------------|--------------|
| FR19: Code generation | Phase 2 (blocked) | ✅ Enabled via GKE |
| FR20: Sandboxed execution | Phase 2 (blocked) | ✅ gVisor isolation |
| FR21: External API calls | Phase 2 (blocked) | ✅ Network access |
| FR24: Custom Skills | ⚠️ Instructions only | ✅ Full execution |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GKE cluster costs | Medium | Low | Autopilot auto-scales, ~$70/month base |
| Added infrastructure complexity | Medium | Medium | Kubernetes-native, well-documented |
| Latency overhead | Low | Medium | Warm pools provide sub-second execution |
| Security exposure | Low | High | gVisor isolation, configurable network policies |

---

## Cost Analysis

| Component | Monthly Cost |
|-----------|--------------|
| GKE Autopilot (base) | ~$70 |
| Compute (sandbox pods) | Variable by usage |
| Network egress | Minimal |
| **Estimated Total** | **$70-150/month** |

---

## Alternatives Considered

### 1. Anthropic's Code Execution (Rejected)
- ❌ No network access
- ❌ Cannot call MCP tools

### 2. Custom SKILL.md Loader Only (Current Plan)
- ✅ Instructions work
- ❌ No script execution
- Viable as fallback

### 3. Local Code Execution (Rejected)
- ⚠️ Security risks
- ⚠️ No isolation

### 4. GKE Agent Sandbox (Recommended)
- ✅ Network access
- ✅ Custom packages
- ✅ gVisor isolation
- ✅ Open source

---

## Decision Required

**Options:**

1. **Approve GKE Agent Sandbox** — Proceed with infrastructure setup and integration
2. **Defer to Phase 2** — Continue with instruction-only skills for MVP
3. **Alternative approach** — Propose different code execution strategy

---

## Affected Artifacts

### Stories to Update

| Story | Change |
|-------|--------|
| 6.1: Agent Skills Loader | Add GKE sandbox integration |
| New: Code Execution Infrastructure | Create GKE setup story |
| New: execute_code Tool | Create tool implementation story |

### Architecture Updates

- Add GKE Agent Sandbox to infrastructure diagram
- Update code execution section
- Add new tool definition

---

## Approval

- [x] Sid (Product Owner) - **APPROVED** (2026-01-02)
- [x] Architecture review complete
- [x] Cost approved (~$70-150/month)

### Approval Notes

Research confirmed the need for GKE Sandbox:
- Anthropic's code execution has no network access
- MCP tools **cannot be called programmatically** from Anthropic container
- Complex Skills requiring tool orchestration (loops, conditionals, aggregation) need network-enabled sandbox
- GKE Agent Sandbox provides full network access with gVisor isolation

**Stories Updated:**
- Story 6.1: Added GKE sandbox integration, script discovery
- Story 6.2: Created `execute_code` tool (new)

---

## Verification Results (2026-01-03)

**✅ Infrastructure Deployed Successfully:**

| Component | Status |
|-----------|--------|
| GKE Autopilot Cluster | ✅ Running (`orion-sandbox-cluster`) |
| Agent Sandbox Controller | ✅ Running |
| SandboxTemplate | ✅ Created (`python-runtime-template`) |
| WarmPool (2 replicas) | ✅ Running |
| Sandbox Router | ✅ Running (2 replicas) |

**✅ Verification Tests Passed:**

```
Test: Python code execution
Result: 2+2 = 4 ✓

Test: Network connectivity (socket to 8.8.8.8:53)
Result: CONNECTED ✓

Test: External HTTP requests (httpbin.org)
Result: HTTP Status 200 ✓
```

**This confirms GKE Agent Sandbox provides network access that Anthropic's container lacks.**

---

## Next Steps (Infrastructure Ready)

1. ~~Create GKE Autopilot cluster~~ ✅ Complete
2. ~~Deploy Agent Sandbox controller~~ ✅ Complete
3. ~~Run verification tests~~ ✅ Passed
4. Create `execute_code` tool in `src/tools/code-execution/`
5. Integrate with Orion agent loop

