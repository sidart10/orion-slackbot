# Epic 1 Test Design — Foundation & Deployment

**Project:** 2025-12 orion-slack-agent (Orion)
**Epic:** Epic 1: Foundation & Deployment
**Date:** 2025-12-22
**Author:** Sid (via TEA Agent)
**Phase:** Epic-Level Test Design (Phase 4)
**Status:** Draft

---

## Executive Summary

This document defines comprehensive test scenarios for Epic 1, covering the foundational infrastructure for Orion's deployment. Epic 1 establishes the Slack integration, observability, streaming, and deployment pipeline that all subsequent epics depend on.

**Epic 1 Scope:**
- 8 stories (1-1 through 1-8)
- Stories Done: 1-1, 1-2, 1-3, 1-4
- Stories In Progress: 1-5 (Response Streaming)
- Stories Ready: 1-6, 1-7, 1-8

**Test Strategy:**
- **57 Unit Tests** — Core logic validation
- **15 Integration Tests** — API contracts, external services
- **1 E2E Test** — Critical user journey (Slack → Cloud Run)

---

## Risk Assessment

### Functional Risks

| Risk ID | Story | Risk Description | Probability | Impact | Score | Mitigation |
|---------|-------|------------------|-------------|--------|-------|------------|
| **FR-01** | 1-3, 1-4 | Slack message handling fails to route to correct handler | 2 | 3 | **6** | Integration tests with real Slack event payloads |
| **FR-02** | 1-2 | Langfuse traces fail to persist | 2 | 2 | **4** | Integration test with real Langfuse credentials |
| **FR-03** | 1-4 | Thread history pagination fails for long threads | 2 | 2 | **4** | Unit tests with paginated responses |
| **FR-04** | 1-5 | Streaming response timing exceeds NFR4 (500ms) | 2 | 3 | **6** | Performance tests with timing assertions |
| **FR-05** | 1-5 | Slack mrkdwn formatting incorrectly renders | 2 | 2 | **4** | Unit tests with formatting edge cases |
| **FR-06** | 1-8 | Feedback buttons fail to correlate with trace | 2 | 2 | **4** | Integration tests for cache + fallback |
| **FR-07** | 1-3 | DM handler and Assistant handler conflict | 1 | 3 | **3** | Integration test for both registration |

### NFR/Quality Risks

| Risk ID | NFR | Risk Description | Probability | Impact | Score | Mitigation |
|---------|-----|------------------|-------------|--------|-------|------------|
| **NF-01** | NFR4 | Time-to-first-token > 500ms | 2 | 3 | **6** | Performance test with strict timing assertion |
| **NF-02** | NFR6 | Secrets leak into logs | 1 | 3 | **3** | Log output scanning, CI secret detection |
| **NF-03** | NFR7 | Slack signature verification fails | 2 | 3 | **6** | Integration test with valid/invalid signatures |
| **NF-04** | NFR16 | Trace coverage < 100% | 2 | 2 | **4** | Trace presence tests for all handlers |

### Integration Risks

| Risk ID | Integration | Risk Description | Probability | Impact | Score | Mitigation |
|---------|-------------|------------------|-------------|--------|-------|------------|
| **IR-01** | Slack API | chatStream API incompatible with Cloud Run | 2 | 3 | **6** | E2E test in Cloud Run staging |
| **IR-02** | Langfuse | API version mismatch or SDK incompatibility | 1 | 2 | **2** | Integration test with real SDK |
| **IR-03** | OpenTelemetry | Instrumentation conflicts with Langfuse native SDK | 1 | 2 | **2** | Already mitigated (using native SDK only) |

---

## Test Coverage by Story

### Story 1-1: Project Scaffolding ✅ DONE

**Objective:** Properly structured TypeScript project with all dependencies configured.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-1-U01 | Unit | P0 | Config loads required env vars | Config object populated | ✅ |
| 1-1-U02 | Unit | P0 | Missing required env throws in production | Error with variable name | ✅ |
| 1-1-U03 | Unit | P0 | Optional vars have defaults | Defaults applied | ✅ |
| 1-1-U04 | Unit | P1 | NODE_ENV defaults to development | nodeEnv = "development" | ✅ |
| 1-1-U05 | Unit | P1 | PORT parses as integer | port = 3000 (number) | ✅ |
| 1-1-U06 | Unit | P1 | LOG_LEVEL defaults to info | logLevel = "info" | ✅ |
| 1-1-I01 | Integration | P0 | `pnpm build` compiles | Exit 0, no TS errors | ✅ |
| 1-1-I02 | Integration | P0 | `pnpm lint` passes | Exit 0, no lint errors | ✅ |
| 1-1-I03 | Integration | P0 | `pnpm test:run` passes | All tests pass | ✅ |

**Test File:** `src/config/environment.test.ts`
**Coverage:** ✅ Complete

---

### Story 1-2: Langfuse Instrumentation ✅ DONE

**Objective:** Full observability via Langfuse tracing from day one.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-2-U01 | Unit | P0 | `getLangfuse()` returns singleton | Same instance on repeated calls | ✅ |
| 1-2-U02 | Unit | P0 | Missing credentials in dev → no-op client | No throw, warns to console | ✅ |
| 1-2-U03 | Unit | P0 | Missing credentials in prod → throws | Error with clear message | ✅ |
| 1-2-U04 | Unit | P0 | `startActiveObservation` creates trace with metadata | Trace has userId, sessionId, input | ✅ |
| 1-2-U05 | Unit | P0 | `createSpan` nests under parent trace | Span linked to trace | ✅ |
| 1-2-U06 | Unit | P0 | Error in operation → trace marked error | Status "error" with message | ✅ |
| 1-2-U07 | Unit | P1 | `logGeneration` logs model + tokens | Generation with usage stats | ✅ |
| 1-2-U08 | Unit | P1 | `shutdown()` flushes and nulls client | No pending traces | ✅ |
| 1-2-I01 | Integration | P1 | Real trace appears in Langfuse | Verify via dashboard or API | ⏭️ Skipped (requires creds) |
| 1-2-I02 | Integration | P1 | Trace includes duration | durationMs in metadata | ⏭️ Skipped (requires creds) |

**Test Files:** `src/observability/langfuse.test.ts`, `src/observability/tracing.test.ts`
**Coverage:** ✅ Complete (2 integration tests skipped for CI)

---

### Story 1-3: Slack Bolt App Setup ✅ DONE

**Objective:** Users can send DMs to Orion and receive acknowledgment.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-3-U01 | Unit | P0 | App initializes with config | No errors, app object created | ✅ |
| 1-3-U02 | Unit | P0 | Missing signing secret → warning in dev | Logs warning, continues | ✅ |
| 1-3-U03 | Unit | P0 | Bot messages filtered | Handler returns early | ✅ |
| 1-3-U04 | Unit | P0 | Empty text messages filtered | Handler returns early | ✅ |
| 1-3-U05 | Unit | P0 | Handler wrapped in trace | startActiveObservation called | ✅ |
| 1-3-U06 | Unit | P0 | Acknowledgment sent in thread | say() called with thread_ts | ✅ |
| 1-3-U07 | Unit | P0 | Ack text is exactly "Orion received your message" | Literal match | ✅ |
| 1-3-U08 | Unit | P1 | Logger outputs structured JSON | Contains timestamp, level, event | ✅ |
| 1-3-I01 | Integration | P1 | DM sends ack response | Real Slack receives response | ⏭️ Manual |

**Test Files:** `src/slack/app.test.ts`, `src/slack/handlers/user-message.test.ts`, `src/utils/logger.test.ts`
**Coverage:** ✅ Complete

---

### Story 1-4: Assistant Class & Thread Handling ✅ DONE

**Objective:** Threaded conversations with context maintained.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-4-U01 | Unit | P0 | Assistant class configures all 3 handlers | threadStarted, threadContextChanged, userMessage | ✅ |
| 1-4-U02 | Unit | P0 | threadStarted sends greeting + prompts | say() + setSuggestedPrompts() called | ✅ |
| 1-4-U03 | Unit | P0 | threadContextChanged saves context | saveThreadContext() called | ✅ |
| 1-4-U04 | Unit | P0 | userMessage fetches thread history | fetchThreadHistory() called with params | ✅ |
| 1-4-U05 | Unit | P0 | Thread history pagination works | Cursor returned and used | ✅ |
| 1-4-U06 | Unit | P1 | Token limit stops fetching | Stops at ~4000 tokens | ✅ |
| 1-4-U07 | Unit | P0 | All handlers wrapped in traces | startActiveObservation for each | ✅ |
| 1-4-U08 | Unit | P0 | setTitle truncates to 50 chars | Title ≤ 50 characters | ✅ |
| 1-4-U09 | Unit | P1 | formatThreadHistoryForContext formats correctly | "User: ..." and "Orion: ..." lines | ✅ |
| 1-4-I01 | Integration | P1 | Thread history formatted for context | Formatted string output | ✅ |

**Test Files:** `src/slack/assistant.test.ts`, `src/slack/handlers/thread-started.test.ts`, `src/slack/handlers/thread-context-changed.test.ts`, `src/slack/thread-context.test.ts`
**Coverage:** ✅ Complete

---

### Story 1-5: Response Streaming 🔄 IN PROGRESS

**Objective:** Real-time streaming responses to Slack.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-5-U01 | Unit | P0 | SlackStreamer.start() initializes | No errors, startTime recorded | ✅ |
| 1-5-U02 | Unit | P0 | SlackStreamer.append() buffers content | pendingContent accumulates | ✅ |
| 1-5-U03 | Unit | P0 | SlackStreamer.stop() finalizes | Returns StreamMetrics | ✅ |
| 1-5-U04 | Unit | P0 | Debounce 250ms enforced | Updates batched, not immediate | ❌ Task 6 |
| 1-5-U05 | Unit | P0 | formatSlackMrkdwn converts **bold** | Output uses *bold* | ✅ |
| 1-5-U06 | Unit | P0 | formatSlackMrkdwn converts *italic* | Output uses _italic_ | ✅ |
| 1-5-U07 | Unit | P0 | formatSlackMrkdwn strips blockquotes | > replaced with • | ✅ |
| 1-5-U08 | Unit | P0 | formatSlackMrkdwn strips emojis | Unicode emojis removed | ✅ |
| 1-5-U09 | Unit | P1 | 429 retry with backoff | Retries 3 times, delays increase | ❌ Task 6 |
| 1-5-U10 | Unit | P1 | Heartbeat logged after 10s silence | Debug log emitted | ❌ Task 6 |
| 1-5-U11 | Unit | P0 | Stream not started → append throws | Error "Stream not started" | ✅ |
| 1-5-U12 | Unit | P0 | Stream not started → stop throws | Error "Stream not started" | ✅ |
| 1-5-P01 | Performance | P0 | Stream starts < 500ms | timeToStreamStart < 500 | ✅ |
| 1-5-I01 | Integration | P1 | Streaming span in Langfuse | Span with timeToFirstToken | ❌ |

**Test Files:** `src/utils/streaming.test.ts`, `src/utils/formatting.test.ts`, `src/slack/response-generator.test.ts`
**Coverage:** 🔄 Partial — Task 6 (debounce, heartbeat, 429) not implemented

---

### Story 1-6: Dockerfile & Cloud Run 📋 READY

**Objective:** Production deployment on Google Cloud Run.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-6-U01 | Unit | P0 | Dockerfile builds without errors | `docker build` exits 0 | ❌ |
| 1-6-U02 | Unit | P0 | Container starts and listens on port | Health check passes | ❌ |
| 1-6-U03 | Unit | P0 | Environment variables accessible in container | Config loads from env | ❌ |
| 1-6-I01 | Integration | P0 | Cloud Run deployment succeeds | Service active, health 200 | ❌ |
| 1-6-I02 | Integration | P0 | 300s timeout configured | Timeout matches spec | ❌ |
| 1-6-I03 | Integration | P0 | min-instances=1 configured | No cold start on first request | ❌ |
| 1-6-E01 | E2E | P1 | Slack event reaches Cloud Run | Handler executes, response sent | ❌ |

**Test Files:** TBD (story not started)
**Coverage:** ❌ Not started

---

### Story 1-7: CI/CD Pipeline 📋 READY

**Objective:** Automated testing and deployment pipeline.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-7-U01 | Unit | P0 | CI config YAML validates | YAML parses correctly | ❌ |
| 1-7-I01 | Integration | P0 | PR triggers test workflow | Tests run, pass/fail reported | ❌ |
| 1-7-I02 | Integration | P0 | Main merge triggers deploy | Cloud Run updated | ❌ |
| 1-7-I03 | Integration | P1 | Secrets not exposed in logs | No API keys in output | ❌ |

**Test Files:** TBD (story not started)
**Coverage:** ❌ Not started

---

### Story 1-8: Feedback Button Infrastructure 📋 READY

**Objective:** User feedback collection via thumbs up/down buttons.

| Test ID | Type | Priority | Scenario | Expected Result | Status |
|---------|------|----------|----------|-----------------|--------|
| 1-8-U01 | Unit | P0 | feedbackBlock uses context_actions type | Correct Block Kit structure | ❌ |
| 1-8-U02 | Unit | P0 | handleFeedback logs positive score | Langfuse score() called with value=1 | ❌ |
| 1-8-U03 | Unit | P0 | handleFeedback logs negative score | Langfuse score() called with value=0 | ❌ |
| 1-8-U04 | Unit | P0 | Missing traceId → orphan event logged | Langfuse event() called | ❌ |
| 1-8-U05 | Unit | P0 | Positive feedback → ephemeral ack | "Thanks for the feedback!" | ❌ |
| 1-8-U06 | Unit | P0 | Negative feedback → ephemeral with suggestion | "Starting a new thread may help" | ❌ |
| 1-8-U07 | Unit | P0 | setTraceIdForMessage stores in cache | Entry retrievable | ❌ |
| 1-8-U08 | Unit | P1 | Cache cleanup after 24h | Expired entries removed | ❌ |
| 1-8-U09 | Unit | P0 | flushAsync called after score | Persists to Langfuse | ❌ |
| 1-8-U10 | Unit | P1 | Metadata includes userId, channelId, messageTs | All fields present | ❌ |
| 1-8-I01 | Integration | P1 | Feedback button click → Langfuse score | Score visible in dashboard | ❌ |

**Test Files:** TBD (story not started)
**Coverage:** ❌ Not started

---

## Coverage Summary

### Test Count by Story

| Story | Unit Tests | Integration Tests | E2E Tests | Status |
|-------|------------|-------------------|-----------|--------|
| 1-1 | 6 | 3 | 0 | ✅ Complete |
| 1-2 | 8 | 2 | 0 | ✅ Complete |
| 1-3 | 8 | 1 | 0 | ✅ Complete |
| 1-4 | 10 | 1 | 0 | ✅ Complete |
| 1-5 | 12 | 1 | 0 | 🔄 Partial |
| 1-6 | 3 | 3 | 1 | ❌ Not started |
| 1-7 | 1 | 3 | 0 | ❌ Not started |
| 1-8 | 10 | 1 | 0 | ❌ Not started |
| **Total** | **58** | **15** | **1** | — |

### Risk-to-Test Traceability

| Risk ID | Score | Covered By | Status |
|---------|-------|------------|--------|
| FR-01 | 6 | 1-3-U05, 1-3-I01, 1-4-U01 | ✅ |
| FR-04 | 6 | 1-5-P01, 1-5-I01 | 🔄 |
| NF-01 | 6 | 1-5-P01 | ✅ |
| NF-03 | 6 | 1-3-U02, 1-3-I01 | ✅ |
| IR-01 | 6 | 1-6-E01 | ❌ |

---

## Next Steps

### Immediate Actions (P0)

| Priority | Action | Effort | Blocker |
|----------|--------|--------|---------|
| **P0** | Complete Story 1-5 Task 6 (debounce, heartbeat, 429) | 2h | None |
| **P0** | Create Story 1-8 test file before implementation | 2h | None |
| **P0** | Create Story 1-6 Docker smoke tests | 1h | None |

### Follow-on Actions (P1)

| Priority | Action | Effort | Blocker |
|----------|--------|--------|---------|
| **P1** | Create Story 1-7 CI config validation tests | 1h | None |
| **P1** | E2E test for Cloud Run Slack event handling | 3h | 1-6 complete |
| **P1** | Integration test for real Langfuse traces | 1h | Credentials |

---

## Appendix: Test Framework

| Category | Tool | Configuration |
|----------|------|---------------|
| Unit/Integration | Vitest | `vitest.config.ts` |
| Coverage | @vitest/coverage-v8 | Target: ≥80% |
| Mocking | Vitest mocks | `vi.mock()`, `vi.fn()` |
| Performance | Vitest + timing assertions | `Date.now()` delta checks |
| E2E (future) | Playwright + Slack test mode | Staging environment |

---

## Document Metadata

**Generated by:** TEA Agent (Test Architect)
**Workflow:** `testarch-test-design` (Epic-Level Mode)
**Input Documents:**
- `_bmad-output/prd.md`
- `_bmad-output/epics.md`
- `_bmad-output/architecture.md`
- `_bmad-output/test-design-system.md`
- Story files: `1-1` through `1-8`

**Next Review:** Before Story 1-6 implementation

