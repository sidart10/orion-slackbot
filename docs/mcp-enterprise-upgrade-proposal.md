# MCP Client Enterprise Upgrade Proposal

**Author:** Dev Agent (Amelia)  
**Date:** 2025-01-02  
**Status:** Draft - Pending Review  
**Epic:** 3 - Tool Connectivity (MCP)

---

## Executive Summary

The current MCP client implementation works for stateless servers (like Exa) but fails for stateful MCP servers (like Samba's `audience-manager` and `msci-reports`) that require proper session lifecycle management. This document proposes upgrades to bring the MCP implementation to enterprise-grade quality, matching the robustness of Claude.ai and Cursor's MCP integrations.

---

## Current State Assessment

### What Works ✅

| Feature | Implementation | Location |
|---------|---------------|----------|
| HTTP Streamable Transport | JSON-RPC over HTTP with SSE support | `client.ts` |
| Bearer Token Auth | Authorization header injection | `client.ts:323-324` |
| Configurable Timeouts | 5s connection, 30s request defaults | `client.ts:38-41` |
| ToolResult Pattern | Never throws, returns Result type | `client.ts` (all public methods) |
| Session ID Capture | Reads `mcp-session-id` header | `client.ts:354-367` |
| SSE Response Parsing | Extracts JSON from `data:` lines | `client.ts:497-514` |
| Client Manager | Singleton caching per server | `manager.ts` |
| Health Tracking | Available/unavailable status | `health.ts` |
| Tool Discovery | Lists and registers tools | `discovery.ts` |

### What's Missing ❌

| Gap | Severity | Impact |
|-----|----------|--------|
| **MCP Session Lifecycle** | 🔴 Critical | Samba servers return "Missing session ID" or "Invalid request parameters" |
| **Auto Session Reestablishment** | 🟡 High | Expired sessions fail silently instead of reconnecting |
| **Retry with Exponential Backoff** | 🟡 High | Transient network failures immediately fail |
| **Circuit Breaker** | 🟠 Medium | Failing servers slow down all requests |
| **Request Deduplication** | 🟠 Medium | Concurrent first requests may race on initialization |
| **Graceful Shutdown** | 🟢 Low | Sessions left orphaned on process exit |
| **Connection Keep-Alive** | 🟢 Low | Each request opens new TCP connection |

---

## Problem Deep Dive

### MCP Session Lifecycle (Critical)

Per the [MCP Specification](https://spec.modelcontextprotocol.io/specification/), stateful MCP servers require a three-phase handshake:

```
Client                              Server
   |                                   |
   |  1. initialize (request)          |
   |---------------------------------->|
   |                                   |
   |  Response + mcp-session-id header |
   |<----------------------------------|
   |                                   |
   |  2. notifications/initialized     |
   |---------------------------------->|
   |                                   |
   |  3. tools/list, tools/call, etc.  |
   |<=================================>|
```

**Current behavior:** Client skips steps 1-2, sends `tools/list` directly → Server returns error.

**Evidence from testing:**
```
audience-manager: "Invalid request parameters" (no initialized notification)
msci-reports: "Invalid request parameters" (no initialized notification)  
exa: Works (stateless, doesn't require session)
```

### Session Expiry Handling

Sessions can expire due to:
- Server restart/deployment
- Idle timeout (server-dependent, typically 30-60 minutes)
- Server-side eviction (memory pressure)

**Current behavior:** 
- Captures session ID from first response ✅
- Sends session ID on subsequent requests ✅
- On 404 "session not found": clears session and retries once ⚠️
- **Missing:** Full re-initialization (only clears ID, doesn't re-handshake)

---

## Proposed Architecture

### 1. Session State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
┌──────────────┐  initialize   ┌──────────────┐  initialized  │
│ DISCONNECTED │──────────────>│ INITIALIZING │──────────────>│
└──────────────┘               └──────────────┘               │
       ▲                              │                       │
       │                              │ error                 │
       │                              ▼                       │
       │                       ┌──────────────┐               │
       │                       │    FAILED    │               │
       │                       └──────────────┘               │
       │                                                      │
       │         session expired / 404                        │
       └──────────────────────────────────────────────────────┤
                                                              │
                                                              ▼
                                                       ┌──────────────┐
                                                       │   CONNECTED  │
                                                       └──────────────┘
```

### 2. New Client Interface

```typescript
interface McpClientConfig {
  // Existing
  url: string;
  bearerToken?: string;
  requestTimeoutMs?: number;
  connectionTimeoutMs?: number;
  
  // NEW: Session lifecycle
  autoInitialize?: boolean;           // Default: true
  initializeTimeoutMs?: number;       // Default: 10000
  
  // NEW: Retry policy
  retryPolicy?: {
    maxRetries?: number;              // Default: 3
    initialDelayMs?: number;          // Default: 100
    maxDelayMs?: number;              // Default: 5000
    backoffMultiplier?: number;       // Default: 2
    retryableErrors?: string[];       // Default: ['TOOL_UNAVAILABLE', 'TOOL_TIMEOUT']
  };
  
  // NEW: Circuit breaker
  circuitBreaker?: {
    enabled?: boolean;                // Default: true
    failureThreshold?: number;        // Default: 5
    resetTimeoutMs?: number;          // Default: 30000
  };
}

interface McpClientState {
  // Existing
  lastSuccessAt?: Date;
  lastError?: string;
  lastErrorAt?: Date;
  lastLatencyMs?: number;
  
  // NEW: Session state
  sessionState: 'disconnected' | 'initializing' | 'connected' | 'failed';
  sessionId?: string;
  sessionEstablishedAt?: Date;
  
  // NEW: Circuit breaker state
  circuitState: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  circuitOpenedAt?: Date;
}
```

### 3. Initialization Flow

```typescript
async ensureInitialized(): Promise<ToolResult<void>> {
  // Fast path: already initialized
  if (this.state.sessionState === 'connected' && this.sessionId) {
    return { success: true, data: undefined };
  }
  
  // Mutex: prevent concurrent initialization
  if (this.initializationPromise) {
    return this.initializationPromise;
  }
  
  this.initializationPromise = this.doInitialize();
  try {
    return await this.initializationPromise;
  } finally {
    this.initializationPromise = null;
  }
}

private async doInitialize(): Promise<ToolResult<void>> {
  this.state.sessionState = 'initializing';
  
  // Step 1: Send initialize request
  const initResult = await this.sendRawRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { 
      name: 'orion-slack-agent', 
      version: process.env.npm_package_version || '1.0.0' 
    },
  });
  
  if (!initResult.success) {
    this.state.sessionState = 'failed';
    return initResult;
  }
  
  // Session ID captured from response header in sendRawRequest
  
  // Step 2: Send initialized notification (no response expected)
  await this.sendNotification('notifications/initialized', {});
  
  this.state.sessionState = 'connected';
  this.state.sessionEstablishedAt = new Date();
  
  logger.info({
    event: 'mcp.session.initialized',
    serverName: this.serverName,
    sessionId: this.sessionId,
    protocolVersion: '2024-11-05',
  });
  
  return { success: true, data: undefined };
}
```

### 4. Retry with Exponential Backoff

```typescript
private async withRetry<T>(
  operation: () => Promise<ToolResult<T>>,
  context: { method: string; traceId?: string }
): Promise<ToolResult<T>> {
  const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = this.config.retryPolicy;
  
  let lastError: ToolResult<T> | null = null;
  let delay = initialDelayMs;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      logger.info({
        event: 'mcp.retry',
        serverName: this.serverName,
        method: context.method,
        attempt,
        delayMs: delay,
        traceId: context.traceId,
      });
      
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
    
    const result = await operation();
    
    if (result.success) {
      return result;
    }
    
    lastError = result;
    
    // Don't retry non-retryable errors
    if (!result.error.retryable) {
      break;
    }
    
    // Check for session expiry - reinitialize before retry
    if (this.isSessionExpiredError(result.error)) {
      this.sessionId = null;
      this.state.sessionState = 'disconnected';
      await this.ensureInitialized();
    }
  }
  
  return lastError!;
}
```

### 5. Circuit Breaker

```typescript
private checkCircuitBreaker(): ToolResult<void> | null {
  if (!this.config.circuitBreaker.enabled) {
    return null;
  }
  
  if (this.state.circuitState === 'open') {
    const elapsed = Date.now() - (this.state.circuitOpenedAt?.getTime() ?? 0);
    
    if (elapsed < this.config.circuitBreaker.resetTimeoutMs) {
      return {
        success: false,
        error: {
          code: 'TOOL_UNAVAILABLE',
          message: `Circuit breaker open for ${this.serverName}`,
          retryable: true,
        },
      };
    }
    
    // Transition to half-open
    this.state.circuitState = 'half-open';
  }
  
  return null;
}

private recordSuccess(): void {
  this.state.consecutiveFailures = 0;
  if (this.state.circuitState === 'half-open') {
    this.state.circuitState = 'closed';
    logger.info({
      event: 'mcp.circuit.closed',
      serverName: this.serverName,
    });
  }
}

private recordFailure(): void {
  this.state.consecutiveFailures++;
  
  if (this.state.consecutiveFailures >= this.config.circuitBreaker.failureThreshold) {
    this.state.circuitState = 'open';
    this.state.circuitOpenedAt = new Date();
    logger.warn({
      event: 'mcp.circuit.opened',
      serverName: this.serverName,
      failures: this.state.consecutiveFailures,
    });
  }
}
```

---

## Implementation Plan

### Phase 1: Session Lifecycle (P0 - Critical)

**Scope:** Fix the Samba server connectivity issue.

| Task | Effort | Files |
|------|--------|-------|
| Add session state machine to McpClient | 2h | `client.ts` |
| Implement `ensureInitialized()` with handshake | 2h | `client.ts` |
| Add `sendNotification()` for one-way messages | 30m | `client.ts` |
| Update `listTools()` and `callTool()` to call `ensureInitialized()` | 30m | `client.ts` |
| Add initialization mutex (prevent concurrent init) | 1h | `client.ts` |
| Unit tests for session lifecycle | 2h | `client.test.ts` |

**Total: ~8 hours**

### Phase 2: Retry & Resilience (P1 - High)

**Scope:** Handle transient failures gracefully.

| Task | Effort | Files |
|------|--------|-------|
| Add retry policy configuration | 30m | `types.ts` |
| Implement `withRetry()` wrapper | 1h | `client.ts` |
| Add exponential backoff with jitter | 30m | `client.ts` |
| Detect session expiry and reinitialize | 1h | `client.ts` |
| Unit tests for retry behavior | 1h | `client.test.ts` |

**Total: ~4 hours**

### Phase 3: Circuit Breaker (P2 - Medium)

**Scope:** Prevent cascade failures from unhealthy servers.

| Task | Effort | Files |
|------|--------|-------|
| Add circuit breaker state to McpClientState | 30m | `types.ts` |
| Implement circuit breaker logic | 1h | `client.ts` |
| Integrate with health tracking | 30m | `health.ts` |
| Unit tests for circuit breaker | 1h | `client.test.ts` |

**Total: ~3 hours**

### Phase 4: Polish (P3 - Low)

| Task | Effort | Files |
|------|--------|-------|
| Graceful shutdown (session termination) | 1h | `manager.ts` |
| Connection keep-alive hints | 30m | `client.ts` |
| Metrics/observability enhancements | 1h | `client.ts` |

**Total: ~2.5 hours**

---

## Testing Strategy

### Unit Tests

```typescript
describe('McpClient Session Lifecycle', () => {
  it('should initialize session before first request');
  it('should reuse session for subsequent requests');
  it('should reinitialize on session expiry (404)');
  it('should mutex concurrent initialization attempts');
  it('should fail fast when initialization fails');
});

describe('McpClient Retry', () => {
  it('should retry retryable errors with exponential backoff');
  it('should not retry non-retryable errors');
  it('should reinitialize session before retry on expiry');
  it('should respect max retry limit');
});

describe('McpClient Circuit Breaker', () => {
  it('should open circuit after threshold failures');
  it('should reject requests while circuit is open');
  it('should transition to half-open after timeout');
  it('should close circuit on successful request');
});
```

### Integration Tests

```typescript
describe('MCP Server Integration', () => {
  it('should connect to audience-manager with full handshake');
  it('should connect to msci-reports with full handshake');
  it('should connect to exa without handshake (stateless)');
  it('should recover from server restart');
});
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing Exa integration | Low | High | Feature flag for session handshake, auto-detect stateless servers |
| Initialization timeout in cold start | Medium | Medium | Lazy init on first tool call, not on startup |
| Circuit breaker false positives | Medium | Low | Conservative thresholds, half-open recovery |
| Session ID conflicts with concurrent requests | Low | Medium | Mutex on initialization |

---

## Success Criteria

1. **All three MCP servers connect successfully:**
   - `audience-manager`: 7 tools discovered ✅
   - `msci-reports`: 6 tools discovered ✅
   - `exa`: 2 tools discovered ✅

2. **Session resilience:**
   - Automatic recovery from session expiry
   - No manual intervention required

3. **Transient failure handling:**
   - 3 retries with exponential backoff
   - Circuit breaker prevents cascade failures

4. **Observability:**
   - Session state visible in health checks
   - Structured logs for all state transitions

---

## Open Questions

1. **Stateless detection:** Should we auto-detect stateless servers (no session ID returned), or require explicit config?

2. **Initialization timing:** Initialize on app startup (faster first request) or lazy on first tool call (faster cold start)?

3. **Per-server retry config:** Should retry policies be global or configurable per-server?

4. **Session termination:** Should we send `notifications/cancelled` on shutdown, or just let sessions expire?

---

## References

- [MCP Specification - Transport](https://spec.modelcontextprotocol.io/specification/transport/)
- [MCP Specification - Lifecycle](https://spec.modelcontextprotocol.io/specification/lifecycle/)
- [Story 3.1 - Generic MCP Client](../_bmad-output/implementation-artifacts/stories/3-1-generic-mcp-client.md)
- [Story 3.2 - Tool Discovery & Registration](../_bmad-output/implementation-artifacts/stories/3-2-tool-discovery-registration.md)

---

## Approval

| Role | Name | Status |
|------|------|--------|
| Author | Dev Agent | ✅ Draft Complete |
| Architect Review | | ⏳ Pending |
| Tech Lead Review | | ⏳ Pending |
| Implementation | | ⏳ Blocked on review |

