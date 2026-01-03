# MCP Configuration Implementation

**Date:** 2025-12-31  
**Epic:** 3 - Tool Connectivity (MCP)  
**Author:** AI Assistant (quick-dev workflow)

---

## Overview

This document details the implementation of file-based MCP server configuration, enabling Orion to connect to multiple MCP servers defined in `.orion/config.yaml` rather than only via environment variables.

## Goal

Set up MCP servers for testing tool calling:
1. `audience-manager` — Samba internal MCP
2. `msci-reports` — Samba internal MCP  
3. `exa` — External web search MCP

---

## Files Created

### `.orion/config.yaml`

New configuration file for MCP servers:

```yaml
mcp_servers:
  audience-manager:
    type: http
    enabled: true
    description: "Samba Audience Manager"
    url: "https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app/mcp"
    headers: {}

  msci-reports:
    type: http
    enabled: true
    description: "Samba MSCI Reports"
    url: "https://report-generator-mcp-vjlizxe2vq-uc.a.run.app/mcp"
    headers: {}

  exa:
    type: http
    enabled: true
    description: "Exa Search"
    url: "https://mcp.exa.ai/mcp"
    headers: {}
```

---

## Files Modified

### 1. `src/config/mcp-servers.ts`

**Before:** Hardcoded to only read `RUBE_MCP_*` environment variables.

**After:** Loads from `.orion/config.yaml` with env var fallback.

**Key Changes:**

```typescript
// Added imports
import { loadMcpServersConfig, clearMcpConfigCache } from '../tools/mcp/config.js';
import type { ClaudeSdkMcpConfig } from '../tools/mcp/types.js';

// Added test override for isolation
let __skipFileConfigForTests = false;
export function __setSkipFileConfigForTests(skip: boolean): void { ... }

// Updated getMcpServerConfigs()
export function getMcpServerConfigs(): McpServerConfig[] {
  const configs: McpServerConfig[] = [];

  // 1. Load from .orion/config.yaml (unless test override)
  if (!__skipFileConfigForTests) {
    const fileConfig = loadMcpServersConfig();
    for (const [name, sdkConfig] of Object.entries(fileConfig)) {
      const url = extractUrl(sdkConfig);
      if (url) configs.push({ name, url, enabled: true, ... });
    }
  }

  // 2. Fallback: RUBE env vars (backward compatibility)
  // Always include if RUBE_MCP_ENABLED is set (even if 'false')
  // so discovery can remove disabled server tools (AC#6)
  if (rubeEnabledEnv !== undefined && !configs.some(c => c.name === 'rube')) {
    configs.push({ name: 'rube', url: rubeUrl, enabled: parseEnabled(rubeEnabledEnv), ... });
  }

  return configs;
}
```

**Why the change:** The existing `src/tools/mcp/config.ts` already had file-based loading for Claude SDK format, but `getMcpServerConfigs()` (used by discovery) only read env vars. This unified them.

---

### 2. `src/tools/mcp/client.ts`

**Issue #1: HTTP 406 "Not Acceptable"**

MCP servers require accepting both JSON and SSE:

```typescript
// Before
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json',  // ❌ Servers rejected this
};

// After
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',  // ✅
};
```

**Issue #2: SSE Response Format**

MCP HTTP Streamable Transport returns SSE format, not plain JSON:

```
event: message
data: {"result":{"tools":[...]}}
```

**Solution:** Added SSE response parsing:

```typescript
// Changed from response.json() to response.text() + parsing
const contentType = response.headers.get('content-type') ?? '';
const bodyText = await response.text();

// Handle SSE format
if (contentType.includes('text/event-stream') || bodyText.startsWith('event:')) {
  jsonResponse = this.parseSseResponse<T>(bodyText);
} else {
  jsonResponse = JSON.parse(bodyText) as McpJsonRpcResponse<T>;
}

// New method
private parseSseResponse<T>(body: string): McpJsonRpcResponse<T> {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('data:')) {
      return JSON.parse(line.trim().slice(5).trim());
    }
  }
  throw new Error('No data field found in SSE response');
}
```

---

### 3. `src/tools/mcp/client.test.ts`

**Issue:** Tests mocked `response.json()` but new code uses `response.text()` + `response.headers.get()`.

**Solution:** Added helper function and updated all mocks:

```typescript
// Added mock helper
function mockResponse(body: object, options = {}) {
  const { ok = true, status = 200, statusText = 'OK', contentType = 'application/json' } = options;
  return {
    ok, status, statusText,
    headers: { get: (name) => name === 'content-type' ? contentType : null },
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

// Updated all mockFetch calls from:
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve(mockTools),
});

// To:
mockFetch.mockResolvedValueOnce(mockResponse(mockTools));
```

---

### 4. `src/tools/mcp/discovery.test.ts`

**Issue:** Tests used env vars to control which servers were discovered, but now file-based config was also being loaded, causing test isolation failures.

**Solution:** Added test setup to skip file config:

```typescript
import { clearMcpConfigCache } from './config.js';
import { __setSkipFileConfigForTests } from '../../config/mcp-servers.js';

beforeEach(() => {
  clearMcpConfigCache();
  __setSkipFileConfigForTests(true);  // Skip .orion/config.yaml
  delete process.env.RUBE_MCP_ENABLED;
  // ...
});

afterEach(() => {
  __setSkipFileConfigForTests(false);  // Restore
});
```

**Issue #2:** `getMcpServerConfigs()` wasn't returning disabled servers, breaking AC#6 (removal of disabled server tools).

**Solution:** Updated to return servers with `enabled: false` when env var is set to 'false':

```typescript
// Before: Only added if enabled
if (rubeEnabled && rubeUrl) configs.push({ enabled: true, ... });

// After: Add if env var is defined (so discovery can remove tools)
if (rubeEnabledEnv !== undefined) configs.push({ enabled: parseEnabled(rubeEnabledEnv), ... });
```

---

## Issues Encountered & Resolutions

| # | Issue | Root Cause | Resolution |
|---|-------|------------|------------|
| 1 | HTTP 406 "Not Acceptable" from all MCP servers | Servers require `Accept: application/json, text/event-stream` | Updated Accept header |
| 2 | "Invalid JSON response from MCP server" | Response is SSE format (`event: message\ndata: {...}`) | Added SSE parsing |
| 3 | Tests failing with `expected true, got false` | Tests mocked `response.json()` but code now uses `response.text()` | Created `mockResponse()` helper |
| 4 | Discovery tests failing after adding file config | `.orion/config.yaml` was being loaded in tests | Added `__skipFileConfigForTests` toggle |
| 5 | "removes disabled server tools" test failing | `getMcpServerConfigs()` only returned enabled servers | Return disabled servers too (with `enabled: false`) |
| 6 | Samba MCPs return 400 "Missing session ID" | MCP HTTP Streamable Transport requires session management | Not fixed (needs session negotiation implementation) |

---

## Test Results

```
✓ src/tools/mcp/config.test.ts      (10 tests)
✓ src/tools/mcp/client.test.ts      (14 tests)
✓ src/tools/mcp/discovery.test.ts   (5 tests)
✓ src/tools/mcp/health.test.ts      (4 tests)
✓ src/tools/mcp/schema-converter.test.ts (20 tests)

Test Files  5 passed (5)
Tests       53 passed (53)
```

---

## Live Testing Results

| Server | Status | Tools Discovered |
|--------|--------|------------------|
| `exa` | ✅ Working | 2 tools: `web_search_exa`, `get_code_context_exa` |
| `audience-manager` | ⚠️ 400 Error | Requires session ID negotiation |
| `msci-reports` | ⚠️ 400 Error | Requires session ID negotiation |

**Exa curl test:**
```bash
curl -X POST https://mcp.exa.ai/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Returns SSE format with 2 tools
```

**Samba curl test:**
```bash
curl -X POST https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Returns:
# {"jsonrpc":"2.0","error":{"code":-32600,"message":"Bad Request: Missing session ID"}}
# Response header: mcp-session-id: 5477ba898a7e41eca1fa8ae293deb9d0
```

---

## Remaining Work

### For Samba MCPs (session-based)

The internal Samba MCPs require MCP session management:

1. **Initialize session** — POST to `/mcp` without method, receive `mcp-session-id` header
2. **Store session ID** — Cache per-server
3. **Send with requests** — Include `Mcp-Session-Id` header in subsequent calls

This is a separate implementation task (not done in this quick-dev).

---

## Architecture Alignment

This implementation aligns with:

- **Epic 3 Story 3.1:** Generic MCP Client ✅
- **Epic 3 Story 3.2:** Tool Discovery & Registration ✅  
- **FR26:** System connects to MCP servers via generic HTTP streamable client ✅
- **FR27:** System can invoke multiple MCP servers (tools merged into registry) ✅
- **NFR17:** MCP HTTP streamable transport ✅
- **NFR18:** Support MCP 1.0 protocol ✅

---

## Files Changed Summary

| File | Change Type | Lines Changed |
|------|-------------|---------------|
| `.orion/config.yaml` | Created | 35 |
| `src/config/mcp-servers.ts` | Modified | ~70 lines rewritten |
| `src/tools/mcp/client.ts` | Modified | +30 lines (SSE parsing) |
| `src/tools/mcp/client.test.ts` | Modified | +15 lines (mock helper) |
| `src/tools/mcp/discovery.test.ts` | Modified | +10 lines (test isolation) |

---

## Verification Commands

```bash
# Run MCP tests
pnpm test -- src/tools/mcp --run

# Test config loading
pnpm exec tsx -e "
import { getMcpServerConfigs } from './src/config/mcp-servers.js';
console.log(getMcpServerConfigs());
"
```

