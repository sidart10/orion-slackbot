# Test Suite - Orion Slack Agent

## Overview

This directory contains the test suite for the Orion Slack Agent project, following ATDD (Acceptance Test-Driven Development) principles.

## Directory Structure

```
tests/
├── unit/                # Unit tests (mirrors src/ structure)
│   ├── agent/           # Agent module tests
│   ├── config/          # Configuration tests
│   ├── files/           # File handling tests
│   ├── memory/          # Memory system tests
│   ├── observability/   # Observability tests
│   ├── skills/          # Skills tests
│   ├── slack/           # Slack integration tests
│   │   ├── citations/
│   │   ├── files/
│   │   ├── handlers/
│   │   ├── prompts/
│   │   ├── status/
│   │   └── utils/
│   ├── tools/           # Tools tests
│   │   ├── mcp/
│   │   ├── memory/
│   │   ├── orion-sandbox/
│   │   └── summarize/
│   └── utils/           # Utility tests
├── factories/           # Test data factories using @faker-js/faker
├── helpers/             # Test utilities and mock builders
├── integration/         # Integration tests (require real services)
└── README.md           # This file
```

## Path Aliases

Tests use TypeScript path aliases for clean imports:

| Alias | Maps To | Usage |
|-------|---------|-------|
| `@/*` | `src/*` | Import source code: `import { foo } from '@/module/file.js'` |
| `@test/*` | `tests/*` | Import test utilities: `import { factory } from '@test/factories/factory.js'` |

**Example:**
```typescript
// In tests/unit/tools/executor.test.ts
import { executeTool } from '@/tools/executor.js';        // src/tools/executor.ts
import { createAgentContext } from '@test/factories/agent-factory.js';  // tests/factories/agent-factory.ts
```

## Test Types

### Unit Tests

**Location:** `tests/unit/**/*.test.ts` (centralized, mirrors `src/`)

**Characteristics:**
- Fast (<1s per file)
- Fully mocked dependencies
- No network/database/external service access
- Run in CI on every commit

**Run:**
```bash
pnpm test                    # All unit tests
pnpm test sandbox-client     # Specific file pattern
pnpm test:coverage           # With coverage report
```

**Example:**
```typescript
// tests/unit/tools/orion-sandbox/sandbox-client.test.ts
import { executeSandbox } from '@/tools/orion-sandbox/sandbox-client.js';
import { createMockSandboxDeps } from '@test/helpers/k8s-mocks.js';

it('creates SandboxClaim with correct spec', async () => {
  const mockFetch = vi.fn();
  const deps = createMockSandboxDeps({ fetch: mockFetch });

  await executeSandbox({ code: 'print(1)', timeout: 30 }, deps);

  // Assert K8s API called with correct body
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/sandboxclaims'),
    expect.objectContaining({ method: 'POST' })
  );
});
```

### Integration Tests

**Location:** `tests/integration/*.integration.test.ts`

**Characteristics:**
- Slow (10-60s per test)
- Real external services (K8s, GCP, etc.)
- Require infrastructure setup
- **Skipped by default** (use `test.skip`)
- Run manually before deployment

**Prerequisites:**
1. GKE cluster deployed (`infra/gke-sandbox/`)
2. kubectl configured with credentials
3. Port-forward running: `kubectl port-forward svc/sandbox-router-svc 8080:8080`
4. Environment variables set (see below)

**Run:**
```bash
# Set up environment (one-time)
export GCP_PROJECT_ID=ai-workflows-459123
export GKE_CLUSTER_NAME=orion-sandbox-cluster
export GKE_CLUSTER_REGION=us-central1
export GKE_SANDBOX_ROUTER_URL=http://localhost:8080

# Start port-forward (separate terminal)
kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default

# Run integration tests
pnpm test tests/integration/sandbox-client.integration.test.ts
```

**Example:**
```typescript
// tests/integration/sandbox-client.integration.test.ts
it.skip('should execute code via full K8s lifecycle', async () => {
  const result = await executeSandbox({ code: 'print(2+2)', timeout: 30 });

  expect(result.stdout).toBe('4\n');
  expect(result.return_code).toBe(0);

  // Verify no orphaned K8s resources
  const claims = await listSandboxClaims();
  expect(claims.filter(c => c.metadata.name.startsWith('orion-exec-'))).toHaveLength(0);
}, 60000);
```

## Test Factories

**Location:** `tests/factories/`

**Purpose:** Generate realistic test data using `@faker-js/faker`.

**Pattern:**
```typescript
import { createAgentContext } from '@test/factories/agent-factory.js';

// Default random data
const context = createAgentContext();

// Override specific fields
const context = createAgentContext({
  userId: 'U_SPECIFIC',
  threadHistory: [{ role: 'user', content: 'Hello' }],
});
```

**Available Factories:**
- `agent-factory.ts` - Agent contexts, loop options, mock streams
- (Add more as needed)

## Test Helpers

**Location:** `tests/helpers/`

**Purpose:** Mock builders and test utilities.

**K8s Mocks (`k8s-mocks.ts`):**
```typescript
import {
  createMockSandboxDeps,
  createMockFetchSequenceSuccess,
} from '@test/helpers/k8s-mocks.js';

// Mock entire K8s lifecycle
const mockFetch = vi.fn();
const responses = createMockFetchSequenceSuccess('claim-123', '4\n');
responses.forEach(r => mockFetch.mockResolvedValueOnce(r));

const deps = createMockSandboxDeps({ fetch: mockFetch });
await executeSandbox({ code: 'print(2+2)' }, deps);
```

## ATDD Workflow

### RED Phase (Test First)

1. Write failing integration test (proves requirement)
2. Write failing unit tests (document behavior)
3. Run tests -> verify RED (failure messages clear)

### GREEN Phase (Implement)

1. Implement minimal code to pass one test
2. Run test -> verify GREEN
3. Repeat for next test

### REFACTOR Phase (Improve)

1. All tests GREEN
2. Improve code quality
3. Extract duplications
4. Re-run tests -> verify still GREEN

## Best Practices

### Given-When-Then Structure

```typescript
test('should display error for invalid credentials', async () => {
  // GIVEN: User is on login page
  await page.goto('/login');

  // WHEN: User submits invalid credentials
  await page.fill('[data-testid="email"]', 'invalid@example.com');
  await page.click('[data-testid="submit"]');

  // THEN: Error message is displayed
  await expect(page.locator('[data-testid="error"]')).toBeVisible();
});
```

### One Assertion Per Test

```typescript
// Good: Single assertion
test('returns stdout', async () => {
  const result = await executeSandbox({ code: 'print(1)' });
  expect(result.stdout).toBe('1\n');
});

test('returns zero exit code', async () => {
  const result = await executeSandbox({ code: 'print(1)' });
  expect(result.return_code).toBe(0);
});

// Avoid: Multiple assertions (not atomic)
test('returns correct result', async () => {
  const result = await executeSandbox({ code: 'print(1)' });
  expect(result.stdout).toBe('1\n');  // If this fails, we don't know about next one
  expect(result.return_code).toBe(0);
});
```

### Use Factories for Data

```typescript
// Good: Random data via factory
const user = createUser();
expect(user.email).toMatch(/@/);

// Avoid: Hardcoded data
const user = { email: 'test@example.com' }; // Collision risk
```

### Dependency Injection for Mocking

```typescript
// Good: Injectable dependencies
async function myFunction(
  input: string,
  deps?: { fetch?: typeof fetch }
): Promise<string> {
  const fetchFn = deps?.fetch ?? fetch;
  const response = await fetchFn('https://api.example.com');
  return response.text();
}

// Test
const mockFetch = vi.fn().mockResolvedValue({ text: async () => 'mock' });
await myFunction('test', { fetch: mockFetch });

// Avoid: Global mocks
vi.stubGlobal('fetch', mockFetch); // Harder to reason about
```

## Common Commands

```bash
# Run all unit tests
pnpm test

# Run specific test file
pnpm test sandbox-client

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run integration tests (manual)
pnpm test tests/integration/

# Run all tests (including integration - CI)
pnpm test:all
```

## Debugging Tests

### Vitest UI

```bash
pnpm test:ui
```

Opens interactive UI at http://localhost:51204/__vitest__/

### Debug Specific Test

```typescript
import { describe, it, expect } from 'vitest';

it.only('debugs this test', async () => {
  // Only this test runs
  console.log('Debug output');
  expect(true).toBe(true);
});
```

### VS Code Debugging

Add breakpoint in test file, then:
1. Set breakpoint in `.test.ts` file
2. Run: `pnpm test --no-coverage sandbox-client`
3. Attach debugger

## Coverage Thresholds

**Current thresholds** (vitest.config.ts):
```typescript
thresholds: {
  statements: 85,
  branches: 78,
  functions: 85,
  lines: 85,
}
```

**View coverage:**
```bash
pnpm test:coverage
open coverage/index.html
```

## CI/CD

**GitHub Actions** (`.github/workflows/ci.yml`):
- Runs on every PR
- Unit tests only (integration tests skipped)
- Requires passing tests + coverage thresholds
- Blocks merge if tests fail

**Integration tests:**
- Run manually before deployment
- Verify on staging environment
- Document results in PR description

## Resources

- [Vitest Docs](https://vitest.dev/)
- [Testing Best Practices](../docs/testing-standards.md)
- [ATDD Workflow](../_bmad/bmm/workflows/testarch/atdd/)
- [Test Quality Standards](../_bmad/bmm/testarch/knowledge/test-quality.md)
