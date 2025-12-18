# System-Level Test Design

**Project:** 2025-12 orion-slack-agent (Orion)
**Date:** 2025-12-17
**Author:** Sid (via TEA Agent)
**Phase:** Solutioning (Pre-implementation Gate)
**Status:** Draft

---

## Executive Summary

This document assesses the testability of Orion's architecture and defines the system-level testing strategy before implementation begins. The architecture is **well-designed for testability** with clear separation of concerns, mandatory observability patterns, and explicit error handling interfaces.

**Key Findings:**
- ✅ **Controllability**: PASS — API-first design, dependency injection, mockable interfaces
- ✅ **Observability**: PASS — 100% Langfuse trace coverage mandated, structured JSON logging
- ⚠️ **Reliability**: CONCERNS — Sandbox code execution requires isolation testing; MCP server resilience needs validation
- **Overall Assessment**: READY with documented concerns

---

## Testability Assessment

### Controllability — ✅ PASS

**Can we control system state for testing?**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| API seeding | ✅ | Slack API provides thread history; `orion-context/` enables file-based test fixtures |
| Mockable dependencies | ✅ | MCP servers initialize lazily (AR14); tool layer abstracted behind interfaces |
| Dependency injection | ✅ | Claude SDK integration via `src/agent/orion.ts`; MCP client in `src/tools/mcp/client.ts` |
| Error condition triggers | ✅ | `OrionError` interface (AR18) with explicit error codes; graceful degradation patterns |
| State reset | ⚠️ | File-based memory (`orion-context/`) requires cleanup in tests; no database to reset |

**Testability Enablers:**
- Agent loop pattern (gather → act → verify) provides clear testing phases
- Subagent isolation via `spawnSubagent()` enables unit testing of individual agents
- Config-driven model selection allows mock LLM responses in tests

**Recommendations:**
- Implement test fixture helpers for `orion-context/` cleanup
- Create mock MCP server for integration tests
- Use Vitest's mocking capabilities for Claude SDK responses

---

### Observability — ✅ PASS

**Can we inspect system state and validate results?**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Trace coverage | ✅ | AR11: ALL handlers MUST be wrapped in Langfuse traces via `startActiveObservation` |
| Structured logging | ✅ | AR12: JSON logging with timestamp, level, event, traceId, userId, duration |
| Metrics availability | ✅ | Langfuse tracks token usage, cost per interaction (FR35-39) |
| Error visibility | ✅ | `OrionError` interface includes code, message, userMessage, context, recoverable |
| Test result determinism | ⚠️ | LLM responses are non-deterministic; requires verification loop testing strategy |

**Testability Enablers:**
- OpenTelemetry integration provides distributed tracing across all components
- Agent loop phases (gather, act, verify) emit separate spans for isolation
- Langfuse Evals infrastructure enables quality verification automation

**Recommendations:**
- Create assertion helpers that extract data from Langfuse traces
- Implement "golden response" testing for verification loop
- Use trace context for test debugging (correlate failures to spans)

---

### Reliability — ⚠️ CONCERNS

**Are tests isolated and reproducible?**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Test isolation | ⚠️ | Subagent context isolation (AR9) good; shared file-based memory needs parallel-safe patterns |
| Failure reproduction | ✅ | HAR capture via network interception; Langfuse traces capture full request/response |
| Component coupling | ⚠️ | Agent → Tool layer coupling requires integration testing; MCP servers are external |
| Parallel safety | ⚠️ | Cloud Run stateless design good; `orion-context/` file access needs locking or unique paths |
| Sandbox isolation | ⚠️ | Code execution sandbox (AR16) requires security and isolation validation |

**Testability Concerns (Require Mitigation):**

1. **Sandbox Code Execution (MEDIUM risk)**
   - Generated code runs in Claude SDK built-in sandbox
   - Requires validation: no filesystem escape, no network escape, resource limits
   - Test approach: Security tests with malicious payloads, resource exhaustion tests

2. **MCP Server Dependencies (MEDIUM risk)**
   - External MCP servers (Rube/Composio) are out of our control
   - Test approach: Mock MCP server for unit/integration; real servers for E2E smoke only
   - Graceful degradation (AR19) must be validated

3. **LLM Non-Determinism (LOW risk)**
   - Responses vary between runs
   - Test approach: Verify behavior patterns, not exact outputs; use seeded prompts in tests

**Recommendations:**
- Create unique `orion-context/{test-run-id}/` paths for parallel test isolation
- Build mock MCP server supporting tool discovery and execution
- Implement sandbox security test suite before code execution goes live

---

## Architecturally Significant Requirements (ASRs)

Quality requirements that drive architecture and pose testability challenges, scored using probability × impact.

### High-Priority ASRs (Score ≥6)

| ASR ID | Category | Requirement | Probability | Impact | Score | Testing Approach |
|--------|----------|-------------|-------------|--------|-------|------------------|
| ASR-001 | PERF | Response time 1-3s simple queries (NFR1) | 2 | 3 | **6** | k6 load testing with 50 concurrent users, p95 thresholds |
| ASR-002 | SEC | Sandboxed code execution, no escape (NFR8) | 2 | 3 | **6** | Security tests: injection attempts, resource limits, network isolation |
| ASR-003 | SEC | Secrets in GCP Secret Manager only (NFR6) | 2 | 3 | **6** | Config validation tests, secret scanning in CI |
| ASR-004 | PERF | Deep research <5 min (NFR3) | 2 | 3 | **6** | E2E tests with timeout assertions, subagent parallelization validation |
| ASR-005 | PERF | Tool-augmented response 3-10s (NFR2) | 2 | 3 | **6** | Integration tests with mock MCP servers, timing assertions |
| ASR-006 | OPS | Uptime >99.5% (NFR12) | 2 | 3 | **6** | Health check monitoring, graceful degradation tests |

### Medium-Priority ASRs (Score 3-4)

| ASR ID | Category | Requirement | Probability | Impact | Score | Testing Approach |
|--------|----------|-------------|-------------|--------|-------|------------------|
| ASR-007 | PERF | Streaming starts <500ms (NFR4) | 2 | 2 | **4** | E2E tests with time-to-first-byte assertions |
| ASR-008 | PERF | 50 concurrent users (NFR22) | 2 | 2 | **4** | k6 load testing with 50 VUs sustained |
| ASR-009 | PERF | Cost per query <$0.10 (NFR26) | 2 | 2 | **4** | Langfuse cost tracking, budget alert tests |
| ASR-010 | TECH | Tool timeout 30s with graceful handling (NFR19) | 2 | 2 | **4** | Integration tests with slow mock tools |
| ASR-011 | TECH | Retry with exponential backoff (NFR15) | 2 | 2 | **4** | Unit tests for retry logic, integration tests with failing services |

### Low-Priority ASRs (Score 1-2)

| ASR ID | Category | Requirement | Probability | Impact | Score | Testing Approach |
|--------|----------|-------------|-------------|--------|-------|------------------|
| ASR-012 | TECH | MCP 1.0 protocol compatibility (NFR17) | 1 | 2 | **2** | Contract tests against MCP spec |
| ASR-013 | TECH | OpenTelemetry tracing (NFR21) | 1 | 2 | **2** | Integration tests validating trace export |

---

## Test Levels Strategy

Based on architecture analysis (agentic Slack platform, TypeScript, API-heavy with UI in Slack):

### Recommended Split: 60% Unit / 30% Integration / 10% E2E

| Level | Percentage | Rationale | Primary Targets |
|-------|------------|-----------|-----------------|
| **Unit** | 60% | Agent loop logic, tool selection, error handling, data transformations | `src/agent/loop.ts`, `src/tools/`, `src/utils/` |
| **Integration** | 30% | API contracts, MCP client, Langfuse integration, Slack handlers | `src/slack/handlers/`, `src/tools/mcp/`, `src/observability/` |
| **E2E** | 10% | Critical user journeys, Slack-to-response flows | Deep research, Q&A, summarization workflows |

### Test Framework Selection

| Category | Tool | Rationale |
|----------|------|-----------|
| **Unit/Integration** | Vitest | Architecture spec (AR5); fast, ESM-native, TypeScript-first |
| **E2E (Slack)** | Playwright + Slack Test Mode | Browser automation for Slack web; API testing for bot responses |
| **Performance** | k6 | NFR validation for load/stress/spike testing |
| **Security** | Custom Vitest suite + OWASP ZAP | Sandbox isolation, injection tests, vulnerability scanning |
| **Contract** | Pact or Vitest schema validation | MCP protocol compliance |

### Coverage Targets

| Category | Target | Rationale |
|----------|--------|-----------|
| **Critical paths** | ≥80% | Agent loop, verification, error handling |
| **Security code** | 100% | Sandbox, auth, secrets handling |
| **Business logic** | ≥70% | Tool selection, response synthesis |
| **Edge cases** | ≥50% | Error recovery, timeout handling |

---

## NFR Testing Approach

### Security (SEC)

| NFR | Testing Approach | Tools |
|-----|------------------|-------|
| NFR6: Secrets in Secret Manager | Config validation tests, no secrets in code/logs | Vitest, gitleaks CI scan |
| NFR7: Slack request signature validation | Integration tests with valid/invalid signatures | Vitest + Slack test utils |
| NFR8: Sandboxed code execution | Security tests: injection, escape attempts, resource limits | Custom Vitest suite |
| NFR10: Slack authentication | Integration tests for auth flow | Vitest |

**Security Gate Criteria:**
- ✅ All security tests pass
- ✅ No secrets in codebase (gitleaks scan)
- ✅ Sandbox escape tests pass (critical blocker)

### Performance (PERF)

| NFR | Testing Approach | Tools |
|-----|------------------|-------|
| NFR1: 1-3s simple response | k6 load test with p95 <3000ms threshold | k6 |
| NFR2: 3-10s tool response | k6 with mock MCP, p95 <10000ms | k6 |
| NFR3: <5min deep research | E2E test with timeout assertion | Playwright |
| NFR4: <500ms streaming start | E2E test with time-to-first-byte | Playwright |
| NFR22: 50 concurrent users | k6 sustained load test at 50 VUs | k6 |
| NFR23: 100 requests/min | k6 stress test at 100 RPS | k6 |

**Performance Gate Criteria:**
- ✅ p95 latency meets SLO
- ✅ Error rate <1% under load
- ✅ No memory leaks in 30-minute soak test

### Reliability (REL)

| NFR | Testing Approach | Tools |
|-----|------------------|-------|
| NFR12: >99.5% uptime | Health check monitoring, synthetic tests | Cloud Monitoring, Vitest |
| NFR13: min-instances=1 | Deployment validation | Cloud Run config check |
| NFR14: Graceful degradation | Integration tests with failing MCP servers | Vitest |
| NFR15: Retry with backoff | Unit tests for retry logic | Vitest |
| NFR16: 100% trace coverage | Integration tests validating Langfuse spans | Vitest |

**Reliability Gate Criteria:**
- ✅ Graceful degradation tests pass
- ✅ Health check endpoint responds correctly
- ✅ Retry logic validated for transient failures

### Maintainability (MAINT)

| Area | Testing Approach | Tools |
|------|------------------|-------|
| Test coverage ≥80% | CI coverage reporting | Vitest + c8 |
| Code duplication <5% | CI duplication check | jscpd |
| No critical vulnerabilities | Dependency scanning | npm audit, Snyk |
| Structured logging | Integration tests for log format | Vitest |
| Observability validation | Tests for Langfuse integration | Vitest |

**Maintainability Gate Criteria:**
- ✅ Coverage ≥80%
- ✅ Duplication <5%
- ✅ No critical/high vulnerabilities

---

## Test Environment Requirements

| Environment | Purpose | Infrastructure |
|-------------|---------|----------------|
| **Local** | Unit + Integration tests | Docker Compose, mock MCP server, local Langfuse |
| **CI** | Automated testing | GitHub Actions, ephemeral containers |
| **Staging** | E2E tests, performance | Cloud Run `--tag staging`, real Slack workspace (test) |
| **Production** | Smoke tests, monitoring | Cloud Run, production Slack |

### Mock Services Required

| Service | Mock Implementation | Priority |
|---------|---------------------|----------|
| Claude SDK | Vitest mocks with canned responses | P0 |
| MCP Servers | Mock MCP server supporting discovery + execution | P0 |
| Slack API | Slack test mode or Bolt test utilities | P0 |
| Langfuse | Local Langfuse instance or mock client | P1 |

---

## Testability Concerns

### ⚠️ CONCERN 1: Sandbox Code Execution Security

**Risk:** Generated code could escape sandbox, access filesystem, or make unauthorized network calls.

**Probability:** 2 (Possible) | **Impact:** 3 (Critical) | **Score:** 6

**Mitigation:**
- Implement comprehensive security test suite before code execution goes live
- Test with known malicious payloads (injection, escape attempts)
- Validate resource limits (CPU, memory, time)
- Consider Modal or GCP Cloud Run Jobs as upgrade path if SDK sandbox insufficient

**Owner:** Security/QA
**Timeline:** Before Epic 4 (Code Generation) implementation

---

### ⚠️ CONCERN 2: MCP Server Reliability

**Risk:** External MCP servers (Rube/Composio) may be unavailable or slow, causing test flakiness.

**Probability:** 2 (Possible) | **Impact:** 2 (Degraded) | **Score:** 4

**Mitigation:**
- Build mock MCP server for unit/integration tests
- Use real MCP servers only in E2E smoke tests (tagged, optional)
- Validate graceful degradation when MCP unavailable

**Owner:** Platform Team
**Timeline:** Sprint 0 (test infrastructure)

---

### ⚠️ CONCERN 3: LLM Response Non-Determinism

**Risk:** Claude responses vary between runs, making assertion-based testing difficult.

**Probability:** 3 (Likely) | **Impact:** 1 (Minor) | **Score:** 3

**Mitigation:**
- Test behavior patterns (did it call the right tool?) not exact outputs
- Use Langfuse Evals for quality verification over time
- Implement seeded prompts for deterministic test scenarios
- Focus verification tests on the verify loop itself, not LLM output

**Owner:** QA
**Timeline:** Ongoing (test design pattern)

---

## Recommendations for Sprint 0

Actions to establish test infrastructure before feature development:

| Priority | Action | Owner | Dependency |
|----------|--------|-------|------------|
| **P0** | Set up Vitest with coverage reporting | Dev | Project scaffolding |
| **P0** | Implement mock Claude SDK responses | Dev | Vitest setup |
| **P0** | Build mock MCP server | Dev | MCP client implementation |
| **P0** | Configure CI pipeline with test gates | DevOps | GitHub Actions |
| **P1** | Set up local Langfuse for development | Dev | Docker Compose |
| **P1** | Create test data fixtures for `orion-context/` | QA | File structure |
| **P1** | Implement k6 performance test baseline | QA | Staging environment |
| **P2** | Configure security scanning (gitleaks, npm audit) | DevOps | CI pipeline |
| **P2** | Create Slack test workspace | QA | Slack admin access |

---

## Test-First Workflow

Recommended workflow aligning with ATDD principles:

1. **Epic planning:** Run `*test-design` (epic-level) to create test scenarios
2. **Before coding:** Run `*atdd` to generate failing E2E tests for P0 scenarios
3. **During implementation:** Write unit/integration tests alongside code
4. **Before PR merge:** Run `*trace` to validate coverage and gate decision
5. **Before release:** Run `*nfr-assess` to validate non-functional requirements

---

## Appendix: Requirements to Test Level Mapping

| Requirement Domain | Unit | Integration | E2E |
|--------------------|------|-------------|-----|
| Agent Core (FR1-6) | 70% | 25% | 5% |
| Research (FR7-12) | 40% | 40% | 20% |
| Communication (FR13-18) | 30% | 50% | 20% |
| Code Execution (FR19-23) | 60% | 30% | 10% |
| Extensions (FR24-29) | 50% | 40% | 10% |
| Knowledge (FR30-34) | 40% | 40% | 20% |
| Observability (FR35-40) | 30% | 60% | 10% |

---

## Document Metadata

**Generated by:** TEA Agent (Test Architect)
**Workflow:** `testarch-test-design` (System-Level Mode)
**Knowledge Base Fragments Used:**
- nfr-criteria.md
- test-levels-framework.md
- risk-governance.md
- test-quality.md

**Next Steps:**
1. Review with architecture team
2. Validate concerns have owners
3. Proceed to `*check-implementation-readiness` gate
4. Run `*framework` to scaffold test infrastructure in Sprint 0

