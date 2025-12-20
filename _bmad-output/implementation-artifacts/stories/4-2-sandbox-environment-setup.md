# Story 4.2: Sandbox Environment Setup

Status: ready-for-dev

## ℹ️ RELATED: Story 3.0 (E2B Agent Runtime)

E2B is now also used for **agent runtime** (not just code execution). Story 3.0 sets up E2B for Claude Agent SDK to run. This story (4.2) focuses on code execution within agent responses.

**Dependency:** Story 3.0 should be completed first — it sets up the core E2B integration.

---

## Story

As a **developer**,
I want generated code to run in a secure sandbox,
So that untrusted code cannot harm the system.

## Acceptance Criteria

1. **Given** code has been generated, **When** the sandbox is initialized, **Then** E2B sandbox is created with appropriate runtime (Python/JavaScript)

2. **Given** the sandbox is running, **When** filesystem access is attempted, **Then** the sandbox has isolated filesystem (E2B Firecracker VM)

3. **Given** the sandbox is running, **When** network access is attempted, **Then** outbound HTTP/HTTPS is allowed for API calls (FR21), inbound is blocked

4. **Given** the sandbox is running, **When** resources are used, **Then** E2B enforces timeout limits (default 5 minutes, configurable)

5. **Given** sandbox initialization, **When** tracing is active, **Then** sandbox lifecycle is traced in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Add E2B Dependency** (AC: #1)
  - [ ] Install `@e2b/code-interpreter` package
  - [ ] Add `E2B_API_KEY` to GCP Secret Manager
  - [ ] Add environment variable to Cloud Run config
  - [ ] Create `src/tools/sandbox/e2b-client.ts`

- [ ] **Task 2: Create Sandbox Factory** (AC: #1, #4)
  - [ ] Create `src/tools/sandbox/factory.ts`
  - [ ] Implement `createSandbox()` function
  - [ ] Configure timeout (default 30s for code execution)
  - [ ] Handle sandbox creation errors

- [ ] **Task 3: Configure Sandbox Options** (AC: #2, #3)
  - [ ] Define `SandboxConfig` interface
  - [ ] Set default timeout
  - [ ] Configure environment variables for API keys
  - [ ] E2B provides network/filesystem isolation by default

- [ ] **Task 4: Add Langfuse Tracing** (AC: #5)
  - [ ] Create span for sandbox lifecycle
  - [ ] Log sandbox creation time
  - [ ] Log sandbox destruction
  - [ ] Track sandbox duration

- [ ] **Task 5: Verification** (AC: all)
  - [ ] Create E2B sandbox programmatically
  - [ ] Execute simple code in sandbox
  - [ ] Verify timeout enforcement
  - [ ] Check Langfuse traces

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR16 | architecture.md | Sandbox for code execution (E2B) |
| NFR8 | prd.md | Network sandboxing (E2B Firecracker provides this) |
| FR21 | prd.md | Allow external API calls from generated code |

### E2B Overview

[E2B](https://e2b.dev) provides secure, isolated sandboxes for AI-generated code execution:

- **Firecracker microVMs** — Same technology as AWS Lambda
- **~150ms cold start** — Fast sandbox creation
- **Isolated filesystem** — Each sandbox is ephemeral
- **Network access** — Outbound HTTP/HTTPS allowed by default
- **Python & JavaScript** — Pre-built runtimes available

### src/tools/sandbox/e2b-client.ts

```typescript
import { Sandbox } from '@e2b/code-interpreter';
import { logger } from '../../utils/logger.js';

export interface SandboxConfig {
  timeoutMs?: number;        // Default: 30000 (30s)
  envVars?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Create an E2B sandbox for code execution
 */
export async function createE2BSandbox(
  config?: SandboxConfig
): Promise<Sandbox> {
  const startTime = Date.now();
  
  try {
    const sandbox = await Sandbox.create({
      timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    // Set environment variables if provided
    if (config?.envVars) {
      for (const [key, value] of Object.entries(config.envVars)) {
        await sandbox.process.startAndWait(`export ${key}="${value}"`);
      }
    }

    logger.info({
      event: 'sandbox_created',
      sandboxId: sandbox.sandboxId,
      duration: Date.now() - startTime,
    });

    return sandbox;
  } catch (error) {
    logger.error({
      event: 'sandbox_creation_failed',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Safely close a sandbox
 */
export async function closeSandbox(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.kill();
    logger.info({
      event: 'sandbox_closed',
      sandboxId: sandbox.sandboxId,
    });
  } catch (error) {
    logger.warn({
      event: 'sandbox_close_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### src/tools/sandbox/factory.ts

```typescript
import { Sandbox } from '@e2b/code-interpreter';
import { createE2BSandbox, closeSandbox, SandboxConfig } from './e2b-client.js';
import { createSpan } from '../../observability/tracing.js';

/**
 * Execute code in an E2B sandbox with automatic cleanup
 */
export async function withSandbox<T>(
  fn: (sandbox: Sandbox) => Promise<T>,
  config?: SandboxConfig,
  parentTrace?: any
): Promise<T> {
  const span = parentTrace ? createSpan(parentTrace, {
    name: 'sandbox-execution',
    metadata: { timeoutMs: config?.timeoutMs },
  }) : null;

  const sandbox = await createE2BSandbox(config);
  
  try {
    const result = await fn(sandbox);
    span?.end({ output: { success: true } });
    return result;
  } catch (error) {
    span?.end({ output: { success: false, error: String(error) } });
    throw error;
  } finally {
    await closeSandbox(sandbox);
  }
}
```

### Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `E2B_API_KEY` | GCP Secret Manager | E2B API key for sandbox creation |

### E2B Pricing

- Pay per sandbox minute (~$0.01-0.05/min)
- First 100 hours/month free (hobby tier)
- No infrastructure to manage

### References

- [E2B Documentation](https://e2b.dev/docs)
- [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter)
- [Source: _bmad-output/epics.md#Story 4.2] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- **E2B replaces "Claude SDK sandbox"** — Claude SDK has no built-in sandbox
- E2B uses Firecracker microVMs for true isolation
- Network access enabled by default (needed for FR21)
- Consider pre-warming sandboxes if cold start is an issue
- Upgrade path: GKE Agent Sandbox for custom runtimes

### File List

Files to create:
- `src/tools/sandbox/e2b-client.ts`
- `src/tools/sandbox/factory.ts`
- `src/tools/sandbox/index.ts`

Files to modify:
- `src/config/environment.ts` (add E2B_API_KEY)
