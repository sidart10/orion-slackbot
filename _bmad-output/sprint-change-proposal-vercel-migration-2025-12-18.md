# Sprint Change Proposal: E2B → Full Vercel Migration

**Date:** 2025-12-18  
**Triggered By:** Story 3-0 (E2B Agent Runtime) review  
**Decision:** Migrate from GCP Cloud Run + E2B to Full Vercel Stack  
**Status:** APPROVED

---

## 1. Issue Summary

### Problem Statement
The current E2B sandbox implementation is a **workaround** that doesn't actually run the Claude Agent SDK. Instead, it calls the Anthropic API directly from Python inside the E2B sandbox, bypassing the SDK's subprocess-based architecture entirely.

### Root Cause
Claude Agent SDK requires subprocess spawning (Claude Code CLI), which Cloud Run doesn't support natively. E2B was chosen as a sandbox solution, but the implementation deviated from the intended architecture.

### Trigger
During Story 3-0 review, evaluation of alternatives revealed:
1. Current implementation doesn't use Claude Agent SDK properly
2. Vercel Sandbox has first-party documentation for Claude Agent SDK
3. Full Vercel deployment eliminates cross-platform auth complexity
4. Operational simplification by using single vendor

### Decision
**Migrate to Full Vercel Stack:**
- Deploy Orion on Vercel (instead of GCP Cloud Run)
- Use Vercel Sandbox for Claude Agent SDK execution
- Remove all E2B and GCP-specific infrastructure

---

## 2. Impact Analysis

### Epic Impact

| Epic | Impact | Changes Needed |
|------|--------|----------------|
| Epic 3 (MCP Tool Integration) | **Moderate** | Story 3-0 retargeted to Vercel Sandbox |
| Epic 4 (Code Execution) | **Moderate** | Stories 4-2, 4-3 updated for Vercel Sandbox |
| Epic 1 (Foundation) | **Low** | Story 1-6 (Docker/Cloud Run) deprecated |
| Epic 1 (Foundation) | **Low** | Story 1-7 (CI/CD) retargeted to Vercel |
| All other epics | **None** | No changes needed |

### Artifact Conflicts

| Artifact | Conflict Level | Changes Required |
|----------|----------------|------------------|
| Architecture (`architecture.md`) | **High** | Rewrite deployment section |
| Sprint Status (`sprint-status.yaml`) | **Moderate** | Update story statuses |
| Story 3-0 | **High** | Rewrite for Vercel Sandbox |
| Stories 4-2, 4-3 | **Moderate** | Update sandbox references |
| Stories 1-6, 1-7 | **Moderate** | Mark as deprecated or retarget |
| `package.json` | **Moderate** | Swap E2B → Vercel deps |
| `src/config/environment.ts` | **Moderate** | Remove E2B vars, add Vercel |
| `cloudbuild.yaml` | **High** | Delete or replace with Vercel config |
| `cloud-run-service.yaml` | **High** | Delete |

---

## 3. Detailed Change Proposals

### Files to DELETE

| Path | Reason |
|------|--------|
| `e2b-template/` | Entire folder — E2B-specific |
| `e2b-template/e2b.Dockerfile` | E2B template |
| `e2b-template/README.md` | E2B documentation |
| `src/sandbox/agent-runtime.ts` | E2B implementation |
| `src/sandbox/agent-runtime.test.ts` | E2B tests |
| `cloud-run-service.yaml` | GCP Cloud Run config |
| `cloudbuild.yaml` | GCP Cloud Build config |
| `scripts/deploy.sh` | GCP deployment script |
| `docker/Dockerfile` | Docker for Cloud Run |
| `docker-compose.yml` | Local Docker setup (review if still needed) |

### Files to MODIFY

| Path | Changes |
|------|---------|
| `package.json` | Remove `@e2b/code-interpreter`, add `@vercel/sandbox`, `ms` |
| `src/config/environment.ts` | Remove `e2bApiKey`, `useE2bSandbox`; Vercel uses OIDC auto-injection |
| `src/sandbox/index.ts` | Re-export Vercel implementation |
| `_bmad-output/architecture.md` | Update deployment section (Cloud Run → Vercel) |
| `_bmad-output/sprint-status.yaml` | Update story 3-0 description |
| `src/slack/app.ts` | Review for Vercel serverless compatibility |
| `src/index.ts` | Adapt for Vercel serverless entry point |
| `README.md` | Update deployment instructions |

### Files to CREATE

| Path | Purpose |
|------|---------|
| `src/sandbox/vercel-runtime.ts` | Vercel Sandbox implementation |
| `src/sandbox/vercel-runtime.test.ts` | Tests for Vercel implementation |
| `vercel.json` | Vercel project configuration |
| `api/slack.ts` or similar | Vercel serverless function for Slack webhook |
| `.env.example` | Update with Vercel-specific vars |

---

## 4. Story-Level Changes

### Story 3-0: E2B Agent Runtime → Vercel Sandbox Runtime

**OLD Title:** E2B Agent Runtime Deployment  
**NEW Title:** Vercel Sandbox Agent Runtime

**OLD Scope:**
- E2B sandbox integration
- Python-based Anthropic API workaround

**NEW Scope:**
- Vercel Sandbox integration
- Proper Claude Agent SDK with subprocess support
- Claude Code CLI installation in sandbox
- Streaming response handling

**Status Change:** `review` → `in-progress` (rework required)

### Story 1-6: Docker/Cloud Run Deployment

**Status Change:** `done` → `deprecated`  
**Reason:** Migrating to Vercel, Cloud Run no longer needed

### Story 1-7: CI/CD Pipeline

**Status Change:** `done` → `needs-rework`  
**NEW Scope:** Vercel deployment pipeline instead of Cloud Build

### Story 4-2: Sandbox Environment Setup

**Update:** Change references from E2B to Vercel Sandbox

### Story 4-3: Code Execution

**Update:** Change sandbox implementation to Vercel

---

## 5. Recommended Path Forward

**Selected Approach:** Direct Adjustment (Option 1)

**Rationale:**
- Story 3-0 is in review, not shipped — minimal rework waste
- No rollback of shipped features needed
- MVP scope unchanged — just implementation path
- Single vendor simplifies operations
- First-party Claude SDK support reduces risk

**Effort Estimate:** Medium  
**Risk Level:** Low  
**Timeline Impact:** +1-2 days for sandbox rework

---

## 6. Implementation Plan

### Phase 1: Infrastructure Setup (Day 1)
1. Create Vercel project and link
2. Set up `vercel.json` configuration
3. Configure environment variables in Vercel dashboard
4. Test basic deployment

### Phase 2: Sandbox Migration (Day 1-2)
1. Implement `src/sandbox/vercel-runtime.ts`
2. Install Claude Code CLI in sandbox template
3. Test `query()` execution in Vercel Sandbox
4. Verify streaming responses work

### Phase 3: Slack Integration (Day 2)
1. Adapt Slack Bolt for Vercel serverless
2. Create API route for Slack webhooks
3. Test end-to-end Slack → Vercel → Sandbox flow
4. Verify response times meet NFR1 (1-3s simple, 3-10s tools)

### Phase 4: Cleanup (Day 2-3)
1. Delete E2B and GCP files
2. Update documentation
3. Update architecture doc
4. Update sprint status

---

## 7. Vercel Plan Requirement

**Minimum Required:** Vercel Pro ($20/month per team member)

**Reason:**
- Hobby plan: 10s function timeout (insufficient)
- Pro plan: 60s function timeout (sufficient with async pattern)
- Pro plan: 5-hour sandbox timeout

**Note:** If agent execution frequently exceeds 60s, may need Enterprise plan or async callback pattern.

---

## 8. Handoff Plan

| Role | Responsibility |
|------|----------------|
| **Developer** | Implement Vercel Sandbox runtime, migrate codebase |
| **Product Owner** | Update backlog, mark deprecated stories |
| **Architect** | Update architecture document |

---

## 9. Success Criteria

- [ ] Orion deploys successfully on Vercel
- [ ] Vercel Sandbox executes Claude Agent SDK with subprocess support
- [ ] Slack webhook integration works end-to-end
- [ ] Response times meet NFR1 (1-3s simple queries)
- [ ] All E2B and GCP artifacts removed
- [ ] Architecture documentation updated
- [ ] Sprint status reflects changes

---

## 10. Approval

**Proposed By:** PM Agent (John)  
**Approved By:** Sid  
**Date:** 2025-12-18  
**Status:** ✅ APPROVED

---

## Next Steps

1. Developer to begin Phase 1: Vercel project setup
2. Rework Story 3-0 with Vercel Sandbox scope
3. Update sprint-status.yaml to reflect changes

