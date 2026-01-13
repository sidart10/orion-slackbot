# ATDD Checklist: Story 8.4 - MCP Auth Fix for PTC Integration

## Story Reference
- **Story ID:** 8-4-mcp-auth-fix-ptc
- **Epic:** 8
- **Status:** done (retroactive documentation)

## Acceptance Criteria Summary

| AC | Description |
|----|-------------|
| AC1 | No-auth MCP servers (`headers: {}`) work via PTC |
| AC2 | GCP Identity auth MCP servers work via PTC |
| AC3 | Bearer token auth continues working (no regression) |
| AC4 | Error messages for auth failures are clear and actionable |

---

## AC1: No-Auth MCP Servers via PTC

### Test 1.1: Happy Path - No-Auth Tool Execution
```typescript
// File: src/skills/container-builder.test.ts
describe('allowed_callers for no-auth MCP servers', () => {
  it('builds allowed_callers with explicit empty auth_context for no-auth tools', async () => {
    // GIVEN: MCP server configured with headers: {}
    const mcpConfig = { headers: {} };

    // WHEN: Building allowed_callers for PTC
    const allowedCallers = buildAllowedCallers([{
      toolName: 'exa_search',
      mcpConfig
    }]);

    // THEN: auth_context is explicitly empty object
    expect(allowedCallers[0]).toEqual({
      tool_name: 'exa_search',
      auth_context: {},
    });
  });
});
```
- [ ] Test passes
- [ ] Verified in production

### Test 1.2: No-Auth Tool Actually Executes
```typescript
it('exa_search tool executes successfully via PTC container', async () => {
  // GIVEN: Container with exa_search as allowed_caller
  // WHEN: Code execution calls exa_search
  // THEN: Tool returns successful result (not auth error)
});
```
- [ ] Test passes
- [ ] Manual verification in Slack

### Test 1.3: Edge Case - Empty Headers Object Types
```typescript
it('handles various empty auth representations', async () => {
  // GIVEN: Different "empty" auth configs
  const configs = [
    { headers: {} },
    { headers: null },
    { headers: undefined },
  ];

  // WHEN/THEN: All resolve to explicit empty auth_context
  for (const config of configs) {
    const callers = buildAllowedCallers([{ toolName: 'test', mcpConfig: config }]);
    expect(callers[0].auth_context).toEqual({});
  }
});
```
- [ ] Test passes

### Test 1.4: Edge Case - No MCP Config
```typescript
it('returns empty allowed_callers when no MCP servers configured', async () => {
  // GIVEN: No MCP servers
  const mcpServers: McpServer[] = [];

  // WHEN: Building allowed_callers
  const result = buildAllowedCallers(mcpServers);

  // THEN: Returns empty array (not undefined/null)
  expect(result).toEqual([]);
});
```
- [ ] Test passes

---

## AC2: GCP Identity Auth via PTC

### Test 2.1: Happy Path - GCP Identity Token Retrieval
```typescript
// File: src/tools/mcp/gcp-auth.test.ts
describe('GCP Identity Token for PTC', () => {
  it('retrieves GCP identity token for audience-manager', async () => {
    // GIVEN: Valid GCP credentials in environment
    const audience = 'https://audience-manager.run.app';

    // WHEN: Getting identity token
    const token = await getGcpIdentityToken(audience);

    // THEN: Token is valid JWT
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});
```
- [ ] Test passes
- [ ] Production verified

### Test 2.2: GCP Identity Token Passed to allowed_callers
```typescript
it('includes bearer token in auth_context for gcp_identity auth type', async () => {
  // GIVEN: MCP server with authType: gcp_identity
  const mcpConfig = {
    authType: 'gcp_identity',
    audience: 'https://example.run.app',
  };

  // WHEN: Building allowed_callers
  const allowedCallers = await buildAllowedCallersWithAuth([{
    toolName: 'audience_manager_search',
    mcpConfig,
  }]);

  // THEN: auth_context contains bearer token
  expect(allowedCallers[0].auth_context).toEqual({
    type: 'bearer',
    token: expect.any(String),
  });
});
```
- [ ] Test passes

### Test 2.3: GCP Token Caching
```typescript
// File: src/tools/mcp/gcp-auth.test.ts
it('caches GCP identity token to avoid repeated auth calls', async () => {
  // GIVEN: First token retrieval
  const token1 = await getGcpIdentityToken('https://example.run.app');

  // WHEN: Requesting same audience again
  const token2 = await getGcpIdentityToken('https://example.run.app');

  // THEN: Same token returned (cached)
  expect(token2).toBe(token1);
});
```
- [ ] Test passes

### Test 2.4: Different Audiences Get Different Tokens
```typescript
it('retrieves separate tokens for different audiences', async () => {
  // GIVEN: Two different Cloud Run services
  const audience1 = 'https://service1.run.app';
  const audience2 = 'https://service2.run.app';

  // WHEN: Getting tokens for each
  const token1 = await getGcpIdentityToken(audience1);
  const token2 = await getGcpIdentityToken(audience2);

  // THEN: Tokens may differ (different audiences)
  // Note: In production they might be same if same SA, but cache keys differ
  expect(token1).toBeDefined();
  expect(token2).toBeDefined();
});
```
- [ ] Test passes

### Test 2.5: Edge Case - GCP Auth Unavailable
```typescript
it('throws descriptive error when GCP auth unavailable', async () => {
  // GIVEN: No GCP credentials
  vi.mocked(isGcpAuthAvailable).mockResolvedValue(false);

  // WHEN/THEN: Attempting to get token throws
  await expect(getGcpIdentityToken('https://x.run.app'))
    .rejects.toThrow(/GCP authentication not available/i);
});
```
- [ ] Test passes

### Test 2.6: Edge Case - Token Expiry Refresh
```typescript
it('refreshes token when cached token is expired', async () => {
  vi.useFakeTimers();

  // GIVEN: Expired cached token
  const expiredToken = makeJwtWithExpiry(-60); // Expired 60s ago

  // WHEN: Requesting token
  const token = await getGcpIdentityToken('https://x.run.app');

  // THEN: New token is fetched (not expired cached one)
  expect(token).not.toBe(expiredToken);
});
```
- [ ] Test passes

### Test 2.7: Edge Case - Impersonation Mode
```typescript
it('uses service account impersonation when GCP_IMPERSONATE_SA set', async () => {
  // GIVEN: Impersonation environment variable
  process.env.GCP_IMPERSONATE_SA = 'sa@project.iam.gserviceaccount.com';

  // WHEN: Getting identity token
  const token = await getGcpIdentityToken('https://x.run.app');

  // THEN: Token obtained via impersonation
  expect(execCalls).toContainEqual(
    expect.objectContaining({ cmd: expect.stringContaining('--impersonate-service-account=') })
  );
});
```
- [ ] Test passes

---

## AC3: Bearer Token Auth (No Regression)

### Test 3.1: Existing Bearer Token Auth Works
```typescript
// File: src/skills/container-builder.test.ts
describe('bearer token auth (regression)', () => {
  it('continues to work for Rube MCP server', async () => {
    // GIVEN: Rube configured with bearer token
    const mcpConfig = {
      authType: 'bearer',
      token: 'rube_api_key_xxx',
    };

    // WHEN: Building allowed_callers
    const allowedCallers = buildAllowedCallers([{
      toolName: 'RUBE_SEARCH_TOOLS',
      mcpConfig,
    }]);

    // THEN: auth_context has bearer token
    expect(allowedCallers[0].auth_context).toEqual({
      type: 'bearer',
      token: 'rube_api_key_xxx',
    });
  });
});
```
- [ ] Test passes

### Test 3.2: Bearer Token Precedence
```typescript
it('uses provided bearer token even when GCP auth available', async () => {
  // GIVEN: Both bearer token and GCP auth available
  const mcpConfig = {
    authType: 'bearer',
    token: 'explicit_bearer_token',
  };

  // WHEN: Building allowed_callers
  const allowedCallers = buildAllowedCallers([{
    toolName: 'some_tool',
    mcpConfig,
  }]);

  // THEN: Uses explicit bearer token (not GCP)
  expect(allowedCallers[0].auth_context.token).toBe('explicit_bearer_token');
});
```
- [ ] Test passes

### Test 3.3: Mixed Auth Types in Single Request
```typescript
it('handles mixed auth types in allowed_callers', async () => {
  // GIVEN: Tools with different auth types
  const tools = [
    { toolName: 'exa_search', mcpConfig: { headers: {} } },
    { toolName: 'rube_search', mcpConfig: { authType: 'bearer', token: 'xxx' } },
    { toolName: 'audience_search', mcpConfig: { authType: 'gcp_identity', audience: 'https://x.run.app' } },
  ];

  // WHEN: Building allowed_callers
  const allowedCallers = await buildAllowedCallersWithAuth(tools);

  // THEN: Each has correct auth_context
  expect(allowedCallers[0].auth_context).toEqual({});
  expect(allowedCallers[1].auth_context.type).toBe('bearer');
  expect(allowedCallers[2].auth_context.type).toBe('bearer'); // GCP identity becomes bearer
});
```
- [ ] Test passes

---

## AC4: Clear Error Messages

### Test 4.1: Auth Failure Logged with Context
```typescript
// File: src/tools/mcp/gcp-auth.test.ts
describe('auth error logging', () => {
  it('logs auth failure with specific error context', async () => {
    // GIVEN: Auth will fail
    vi.mocked(googleAuth.getIdTokenClient).mockRejectedValue(
      new Error('PERMISSION_DENIED: Service account not authorized')
    );

    // WHEN: Attempting to get token
    await getGcpIdentityToken('https://x.run.app').catch(() => {});

    // THEN: Error logged with context
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'gcp.auth.failed',
        audience: 'https://x.run.app',
        error: expect.stringContaining('PERMISSION_DENIED'),
      })
    );
  });
});
```
- [ ] Test passes

### Test 4.2: Langfuse Trace Includes Auth Events
```typescript
it('records auth events in Langfuse trace', async () => {
  // GIVEN: Langfuse tracing enabled
  // WHEN: MCP tool call with auth
  // THEN: Trace contains auth event
  expect(langfuseMock.event).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'tool.mcp.auth',
      metadata: expect.objectContaining({
        authType: expect.any(String),
        toolName: expect.any(String),
      }),
    })
  );
});
```
- [ ] Test passes

### Test 4.3: Error Message Contains Actionable Info
```typescript
it('error message indicates which auth method failed', async () => {
  // GIVEN: GCP identity auth failure
  const error = new GcpAuthError('Token refresh failed', {
    audience: 'https://audience-manager.run.app',
    method: 'google-auth-library',
  });

  // THEN: Message is actionable
  expect(error.message).toContain('audience-manager');
  expect(error.context.method).toBe('google-auth-library');
});
```
- [ ] Test passes

### Test 4.4: Fallback Auth Method Logging
```typescript
it('logs when falling back to gcloud CLI', async () => {
  // GIVEN: google-auth-library returns no token
  vi.mocked(googleAuth.getIdTokenClient).mockResolvedValue({
    getRequestHeaders: () => Promise.resolve({ get: () => null }),
  });

  // WHEN: Getting token (falls back to gcloud)
  await getGcpIdentityToken('https://x.run.app');

  // THEN: Fallback logged
  expect(logger.warn).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'gcp.auth.fallback',
      reason: expect.stringContaining('google-auth-library'),
    })
  );
});
```
- [ ] Test passes

---

## Boundary Conditions

### Test B.1: Empty Tool Name
```typescript
it('handles empty tool name gracefully', async () => {
  // GIVEN: Tool with empty name
  const tools = [{ toolName: '', mcpConfig: { headers: {} } }];

  // WHEN/THEN: Throws or filters out
  expect(() => buildAllowedCallers(tools)).toThrow(/tool name required/i);
  // OR: expect(buildAllowedCallers(tools)).toEqual([]);
});
```
- [ ] Test passes

### Test B.2: Very Long Token
```typescript
it('handles very long bearer tokens', async () => {
  // GIVEN: Extremely long token (e.g., 10KB)
  const longToken = 'x'.repeat(10240);
  const mcpConfig = { authType: 'bearer', token: longToken };

  // WHEN: Building allowed_callers
  const allowedCallers = buildAllowedCallers([{
    toolName: 'test',
    mcpConfig,
  }]);

  // THEN: Token preserved (not truncated)
  expect(allowedCallers[0].auth_context.token).toBe(longToken);
});
```
- [ ] Test passes

### Test B.3: Invalid JWT Format
```typescript
it('handles malformed JWT from GCP gracefully', async () => {
  // GIVEN: Invalid JWT returned
  vi.mocked(execFile).mockResolvedValue({ stdout: 'not-a-jwt\n', stderr: '' });

  // WHEN/THEN: Either accepts or throws with clear message
  // Depending on whether validation is done
});
```
- [ ] Test passes

### Test B.4: Concurrent Auth Requests
```typescript
it('handles concurrent token requests without race conditions', async () => {
  // GIVEN: Multiple concurrent requests for same audience
  const audience = 'https://x.run.app';

  // WHEN: Requesting in parallel
  const [t1, t2, t3] = await Promise.all([
    getGcpIdentityToken(audience),
    getGcpIdentityToken(audience),
    getGcpIdentityToken(audience),
  ]);

  // THEN: All get same token (no duplicate auth calls)
  expect(t1).toBe(t2);
  expect(t2).toBe(t3);
});
```
- [ ] Test passes

---

## Integration Tests

### Test I.1: End-to-End No-Auth Tool Call
```typescript
// File: src/skills/integration.test.ts
describe('MCP auth integration', () => {
  it('no-auth tool (exa) executes via PTC container', async () => {
    // GIVEN: Container with exa skill
    // WHEN: Agent loop calls code_execution that uses exa_search
    // THEN: Tool executes successfully
  });
});
```
- [ ] Manual verification

### Test I.2: End-to-End GCP Identity Tool Call
```typescript
it('gcp_identity tool (audience-manager) executes via PTC container', async () => {
  // GIVEN: Container with audience-manager allowed_caller
  // WHEN: Agent loop calls code_execution that uses audience_manager
  // THEN: Tool executes successfully with GCP identity token
});
```
- [ ] Manual verification

### Test I.3: Auth Type Mapping in servers.ts
```typescript
// File: src/tools/mcp/config.test.ts
describe('MCP server auth configuration', () => {
  it('audience-manager has gcp_identity auth type', () => {
    const config = getMcpServerConfig('audience-manager');
    expect(config.authType).toBe('gcp_identity');
  });

  it('exa has no auth (empty headers)', () => {
    const config = getMcpServerConfig('exa');
    expect(config.headers).toEqual({});
    expect(config.authType).toBeUndefined();
  });

  it('rube has bearer auth', () => {
    const config = getMcpServerConfig('rube');
    expect(config.authType).toBe('bearer');
  });
});
```
- [ ] Test passes

---

## Test Coverage Summary

| AC | Happy Path | Edge Cases | Error Handling | Total |
|----|------------|------------|----------------|-------|
| AC1 | 2 | 2 | 0 | 4 |
| AC2 | 4 | 3 | 1 | 8 |
| AC3 | 3 | 0 | 0 | 3 |
| AC4 | 4 | 0 | 0 | 4 |
| Boundary | 0 | 4 | 0 | 4 |
| Integration | 3 | 0 | 0 | 3 |
| **Total** | **16** | **9** | **1** | **26** |

---

## Files Under Test

| File | Purpose |
|------|---------|
| `src/skills/container-builder.ts` | Build `allowed_callers` with auth context |
| `src/tools/mcp/gcp-auth.ts` | GCP identity token retrieval |
| `src/tools/mcp/servers.ts` | MCP server configurations |
| `src/tools/mcp/auth.ts` | Auth context helpers |

---

## Test Execution Notes

### Prerequisites
- Valid GCP credentials in environment for GCP auth tests
- Mock child_process for gcloud CLI tests
- Mock google-auth-library for unit tests

### Mocking Strategy
- **Unit tests:** Mock all external dependencies (google-auth-library, child_process)
- **Integration tests:** Use real credentials in CI/CD or manual verification

### Test Pattern (from project conventions)
```typescript
// GIVEN: Setup conditions
// WHEN: Execute action
// THEN: Assert outcomes
```

---

## Verification Checklist

- [ ] All unit tests pass locally
- [ ] All tests pass in CI/CD
- [ ] Manual verification in Slack for:
  - [ ] exa_search tool works
  - [ ] audience-manager tool works
  - [ ] msci-reports tool works
  - [ ] rube tools still work
- [ ] Langfuse traces show auth events
- [ ] Error messages are user-friendly
