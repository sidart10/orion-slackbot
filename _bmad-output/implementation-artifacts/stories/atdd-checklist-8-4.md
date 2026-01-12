# ATDD Checklist - Epic 8, Story 8.4: MCP Auth Fix for PTC Integration

**Date:** 2026-01-09
**Author:** TEA Agent (Claude Opus 4.5)
**Primary Test Level:** Unit Tests (co-located with implementation)

---

## Story Summary

Fix MCP authentication configuration for Cloud Run servers that require GCP IAM authentication. The root cause is missing `authType: gcp_identity` configuration for servers like `audience-manager` and `msci-reports`.

**As a** Slack user,
**I want** MCP tool calls to work reliably regardless of authentication method,
**So that** all configured MCP servers remain accessible whether Claude calls them directly or via PTC code execution.

---

## Acceptance Criteria

1. **AC1: GCP Identity Auth Configuration** - Cloud Run servers with `headers: {}` must include `authType: gcp_identity`
2. **AC2: No-Auth Server Verification** - Servers without auth work correctly (e.g., `exa`)
3. **AC3: Bearer Token Auth Verification** - Servers with static bearer tokens work (e.g., `rube`)
4. **AC4: GCP Identity Token Fetching** - `getAuthHeader()` fetches GCP identity token when `authType: gcp_identity`
5. **AC5: Auth Error Logging** - GCP identity fetch failures logged with `mcp.auth.gcp_identity_failed`
6. **AC6: Config Validation Warning** - Log warning for `.run.app` URLs without auth config
7. **AC7: All Servers Pass Health Check** - All MCP servers complete handshake on startup

---

## Test-to-Acceptance Criteria Mapping

| Test ID | AC | Test Description | File Path |
|---------|-----|-----------------|-----------|
| T1.1 | AC1, AC4 | getAuthHeader returns GCP identity token when authType is gcp_identity | `src/tools/mcp/client.test.ts` |
| T1.2 | AC2 | getAuthHeader returns undefined when no auth configured | `src/tools/mcp/client.test.ts` |
| T1.3 | AC3 | getAuthHeader returns static bearer token when bearerToken configured | `src/tools/mcp/client.test.ts` |
| T1.4 | AC4 | getAuthHeader uses URL origin as audience for GCP identity | `src/tools/mcp/client.test.ts` |
| T1.5 | AC5 | getAuthHeader logs error when GCP identity fetch fails | `src/tools/mcp/client.test.ts` |
| T2.1 | AC6 | Config loader warns for .run.app URLs without authType | `src/tools/mcp/config.test.ts` |
| T2.2 | AC6 | Config loader does not warn when authType: gcp_identity is set | `src/tools/mcp/config.test.ts` |
| T2.3 | AC6 | Config loader does not warn when bearer token is set | `src/tools/mcp/config.test.ts` |
| T2.4 | AC1 | Config loader passes authType to SDK config | `src/tools/mcp/config.test.ts` |
| T3.1 | AC7 | Manual: audience-manager server responds with GCP identity auth | Manual verification |
| T3.2 | AC7 | Manual: msci-reports server responds with GCP identity auth | Manual verification |
| T3.3 | AC2, AC7 | Manual: exa server responds without auth | Manual verification |
| T3.4 | AC3, AC7 | Manual: rube server responds with bearer token | Manual verification |

---

## Failing Tests Created (RED Phase)

### Unit Tests - Auth Scenarios (6 tests)

**File:** `src/tools/mcp/client.test.ts` (add to existing file)

**Test Group:** `describe('getAuthHeader auth scenarios (Story 8.4)')`

- **T1.1** `it('returns GCP identity token when authType is gcp_identity')`
  - **Status:** RED - `getAuthHeader()` private method not directly testable, needs integration through `sendRequest()`
  - **Verifies:** AC1, AC4 - GCP identity token is fetched and returned for `authType: gcp_identity`
  - **Setup:** Mock `getGcpIdentityToken()` to return a test token
  - **Action:** Make request with McpClient configured with `authType: gcp_identity`
  - **Assert:** Authorization header is `Bearer <mock-token>`

- **T1.2** `it('returns undefined (no auth) when neither bearerToken nor authType configured')`
  - **Status:** RED - Need to verify no Authorization header sent
  - **Verifies:** AC2 - No-auth servers work without credentials
  - **Setup:** Create McpClient with only `url` (no `bearerToken`, no `authType`)
  - **Action:** Make request
  - **Assert:** Authorization header is NOT present in request

- **T1.3** `it('returns static bearer token when bearerToken configured (takes precedence)')`
  - **Status:** GREEN - Already covered by existing `includes bearer token in Authorization header` test
  - **Verifies:** AC3 - Static bearer token auth works

- **T1.4** `it('uses URL origin as audience for GCP identity token')`
  - **Status:** RED - Need to verify correct audience passed to `getGcpIdentityToken()`
  - **Verifies:** AC4 - Correct audience used for token fetching
  - **Setup:** Mock `getGcpIdentityToken()` and capture audience argument
  - **Action:** Make request with URL `https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app/mcp`
  - **Assert:** Audience passed is `https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app`

- **T1.5** `it('logs error and returns undefined when GCP identity fetch fails')`
  - **Status:** RED - Need to verify error logging behavior
  - **Verifies:** AC5 - Auth errors are logged properly
  - **Setup:** Mock `getGcpIdentityToken()` to throw error
  - **Action:** Make request with `authType: gcp_identity`
  - **Assert:** Logger called with `mcp.auth.gcp_identity_failed` event, request proceeds without auth

- **T1.6** `it('static bearer token takes precedence over authType gcp_identity')`
  - **Status:** RED - Need to verify precedence
  - **Verifies:** AC3 - Static token precedence
  - **Setup:** Configure both `bearerToken` and `authType: gcp_identity`
  - **Action:** Make request
  - **Assert:** Uses static bearer token, does NOT call `getGcpIdentityToken()`

### Unit Tests - Config Validation Warning (4 tests)

**File:** `src/tools/mcp/config.test.ts` (add to existing file)

**Test Group:** `describe('config validation warning (Story 8.4 AC6)')`

- **T2.1** `it('logs warning for .run.app URL with empty headers and no authType')`
  - **Status:** RED - Warning logic not yet implemented
  - **Verifies:** AC6 - Config validation warning
  - **Setup:** Mock config with Cloud Run URL, `headers: {}`, no `authType`
  - **Action:** Call `loadMcpServersConfig()`
  - **Assert:** Logger called with `mcp.config.possible_missing_auth` warning

- **T2.2** `it('does not warn when authType: gcp_identity is configured')`
  - **Status:** RED - Need to verify no false positives
  - **Verifies:** AC6 - Warning suppression for valid config
  - **Setup:** Mock config with Cloud Run URL, `headers: {}`, `authType: gcp_identity`
  - **Action:** Call `loadMcpServersConfig()`
  - **Assert:** Logger NOT called with warning

- **T2.3** `it('does not warn when Authorization header is configured')`
  - **Status:** RED - Need to verify no warning for bearer token servers
  - **Verifies:** AC6 - Warning suppression for bearer token config
  - **Setup:** Mock config with Cloud Run URL, `headers: { Authorization: 'Bearer ...' }`
  - **Action:** Call `loadMcpServersConfig()`
  - **Assert:** Logger NOT called with warning

- **T2.4** `it('passes authType through to SDK config for http type')`
  - **Status:** GREEN - Already passing authType in `transformToSdkConfig()`
  - **Verifies:** AC1 - authType is available in runtime config

---

## Data Factories Created

### No New Factories Required

Existing test infrastructure in `src/tools/mcp/client.test.ts` provides sufficient mocking:

- `mockResponse()` - Creates mock HTTP responses
- `setupMockWithInit()` - Sets up mock for initialization flow
- `mockResponseWithSession()` - Creates mock response with session ID

### Mock Requirements

**GCP Auth Mock (for `src/tools/mcp/gcp-auth.ts`):**

```typescript
vi.mock('./gcp-auth.js', () => ({
  getGcpIdentityToken: vi.fn().mockResolvedValue('mock-gcp-identity-token'),
}));
```

**Logger Mock (already exists):**

```typescript
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
```

---

## Fixtures Created

### No New Fixtures Required

Tests use Vitest's built-in mocking capabilities. The existing mock patterns in `client.test.ts` are sufficient for all new tests.

---

## Mock Requirements

### GCP Identity Token Service Mock

**Purpose:** Test GCP identity token fetching without actual GCP calls

**Mock Interface:**
```typescript
// Success case
vi.mocked(getGcpIdentityToken).mockResolvedValue('mock-gcp-identity-token');

// Failure case
vi.mocked(getGcpIdentityToken).mockRejectedValue(new Error('Auth failed'));
```

### Logger Mock

**Already exists in test files - verify warning logs:**
```typescript
import { logger } from '../../utils/logger.js';

// In test assertion
expect(logger.warn).toHaveBeenCalledWith(
  expect.objectContaining({
    event: 'mcp.config.possible_missing_auth',
    server: 'audience-manager',
  })
);
```

---

## Required Code Changes

### `.orion/config.yaml` Changes

Add `authType: gcp_identity` to Cloud Run servers:

```yaml
# BEFORE
audience-manager:
  type: http
  enabled: true
  url: "https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app/mcp"
  headers: {}

# AFTER
audience-manager:
  type: http
  enabled: true
  url: "https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app/mcp"
  headers: {}
  authType: gcp_identity  # Cloud Run requires IAM auth
```

Same change for `msci-reports` server.

### `src/tools/mcp/config.ts` Changes

Add validation warning after `transformToSdkConfig()`:

```typescript
// After the for loop that builds cachedConfig
for (const [name, serverConfig] of Object.entries(cachedConfig)) {
  const httpConfig = serverConfig as { url?: string; headers?: Record<string, string>; authType?: string };
  if (
    httpConfig.url?.includes('.run.app') &&
    !httpConfig.headers?.Authorization &&
    !httpConfig.authType
  ) {
    logger.warn({
      event: 'mcp.config.possible_missing_auth',
      server: name,
      url: httpConfig.url,
      hint: 'Cloud Run servers typically require authType: gcp_identity',
    });
  }
}
```

---

## Implementation Checklist

### Task 1: Fix MCP Server Configurations (AC: #1, #2, #3)

**IMPORTANT:** Only modify servers that are broken. Do NOT touch working servers.

- [ ] **1.1** Add `authType: gcp_identity` to `audience-manager` in `.orion/config.yaml`
- [ ] **1.2** Add `authType: gcp_identity` to `msci-reports` in `.orion/config.yaml`
- [ ] **1.3** Verify `exa` still works without auth (no changes needed)
- [ ] **1.4** Verify `rube` bearer token auth still works (no changes needed)
- [ ] Run test: `pnpm test src/tools/mcp/config.test.ts`
- [ ] Test passes (green phase)

**Estimated Effort:** 0.25 hours

---

### Task 2: Add Config Validation Warning (AC: #6)

- [ ] **2.1** Add validation logic in `src/tools/mcp/config.ts` after `transformToSdkConfig()`
- [ ] **2.2** Log `mcp.config.possible_missing_auth` warning for suspect configs
- [ ] **2.3** Add unit tests for warning logic in `src/tools/mcp/config.test.ts`:
  - Test T2.1: warns for .run.app without auth
  - Test T2.2: no warning when authType set
  - Test T2.3: no warning when Authorization header set
- [ ] Run test: `pnpm test src/tools/mcp/config.test.ts`
- [ ] All tests pass (green phase)

**Estimated Effort:** 0.5 hours

---

### Task 3: Add Auth Scenario Tests (AC: #4, #5)

- [ ] **3.1** Add test group `describe('getAuthHeader auth scenarios (Story 8.4)')` to `src/tools/mcp/client.test.ts`
- [ ] **3.2** Add Test T1.1: GCP identity token returned for authType gcp_identity
- [ ] **3.3** Add Test T1.2: No auth when neither configured
- [ ] **3.4** Add Test T1.4: Correct audience used for GCP identity
- [ ] **3.5** Add Test T1.5: Error logging when GCP identity fails
- [ ] **3.6** Add Test T1.6: Bearer token takes precedence
- [ ] Run test: `pnpm test src/tools/mcp/client.test.ts`
- [ ] All tests pass (green phase)

**Estimated Effort:** 1 hour

---

### Task 4: Manual Verification (AC: #7)

- [ ] **4.1** Start local dev environment with `.orion/config.yaml` changes
- [ ] **4.2** Test T3.1: Call `audience-manager` tool - verify success with GCP identity token
- [ ] **4.3** Test T3.2: Call `msci-reports` tool - verify success with GCP identity token
- [ ] **4.4** Test T3.3: Call `exa` tool - verify success without auth
- [ ] **4.5** Test T3.4: Call `rube` tool - verify success with bearer token
- [ ] Document results in Dev Agent Record

**Estimated Effort:** 0.5 hours

---

## Running Tests

```bash
# Run all MCP tests (includes auth scenarios)
pnpm test src/tools/mcp/

# Run specific test file for client auth
pnpm test src/tools/mcp/client.test.ts

# Run specific test file for config validation
pnpm test src/tools/mcp/config.test.ts

# Run tests in watch mode
pnpm test:watch src/tools/mcp/

# Run with coverage
pnpm test:coverage src/tools/mcp/
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All test specifications written and documented
- Test scenarios mapped to acceptance criteria
- Mock requirements documented
- Implementation tasks defined with clear success criteria

**Current Status:**
- Tests T1.1, T1.2, T1.4, T1.5, T1.6 need to be added to `client.test.ts`
- Tests T2.1, T2.2, T2.3 need to be added to `config.test.ts`
- Config validation warning logic needs implementation

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Start with config change** (Task 1) - lowest risk, immediate value
2. **Add config validation warning** (Task 2) - prevents future misconfigurations
3. **Add auth scenario tests** (Task 3) - verify existing behavior
4. **Run manual verification** (Task 4) - confirm end-to-end auth flow

**Key Principles:**
- The existing `getAuthHeader()` implementation in `client.ts` already handles GCP identity - NO CODE CHANGES NEEDED
- Focus is on CONFIG FIX + TESTS + VALIDATION WARNING
- One test at a time, verify green before proceeding

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. Review test organization - group related tests
2. Ensure consistent mocking patterns
3. Add JSDoc comments for new test groups
4. Verify no duplicate test coverage

---

## Next Steps

1. **Review this checklist** - verify test specifications match acceptance criteria
2. **Run existing tests** - confirm baseline: `pnpm test src/tools/mcp/`
3. **Begin Task 1** - update `.orion/config.yaml` with `authType: gcp_identity`
4. **Add tests incrementally** - one test file at a time
5. **Manual verification** - test all MCP servers work end-to-end

---

## Knowledge Base References Applied

This ATDD workflow consulted the following patterns:

- **test-quality.md** - Test design principles (deterministic tests, isolated with cleanup)
- **component-tdd.md** - Red-green-refactor cycle guidance
- **Existing test patterns** - `src/tools/mcp/client.test.ts`, `src/tools/mcp/config.test.ts`

---

## Test Execution Evidence

### Initial Test Run (Baseline Verification)

**Command:** `pnpm test src/tools/mcp/`

**Expected Results:**
```
✓ src/tools/mcp/client.test.ts (34 tests)
✓ src/tools/mcp/config.test.ts (9 tests)
✓ src/tools/mcp/gcp-auth.test.ts (5 tests)
✓ src/tools/mcp/discovery.test.ts
✓ src/tools/mcp/health.test.ts
✓ src/tools/mcp/manager.test.ts
✓ src/tools/mcp/schema-converter.test.ts
```

**Post-Implementation Expected:**
- +6 new tests in `client.test.ts` (auth scenarios)
- +3 new tests in `config.test.ts` (validation warning)
- All tests passing (GREEN phase)

---

## Notes

- **Low complexity fix** - Root cause is configuration, not code
- **Auth code already works** - `getAuthHeader()` in `client.ts` supports `gcp_identity`
- **PTC limitation noted** - Anthropic's PTC server-side proxy doesn't support MCP tools yet
- **Validation warning is preventive** - Helps catch future misconfigurations

---

## Contact

**Questions or Issues?**

- Review Story 8.4: `_bmad-output/implementation-artifacts/stories/story-8-4-mcp-auth-fix-ptc.md`
- Reference existing MCP tests: `src/tools/mcp/client.test.ts`
- Consult MCP auth implementation: `src/tools/mcp/gcp-auth.ts`

---

**Generated by BMad TEA Agent** - 2026-01-09
