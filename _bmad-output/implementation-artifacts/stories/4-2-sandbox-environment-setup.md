# Story 4.2: Sandbox Environment Setup

Status: ready-for-dev

## Story

As a **developer**,
I want generated code to run in a secure sandbox,
So that untrusted code cannot harm the system.

## Acceptance Criteria

1. **Given** code has been generated, **When** the sandbox is initialized, **Then** the Claude Agent SDK built-in sandbox is configured (AR16)

2. **Given** the sandbox is running, **When** filesystem access is attempted, **Then** the sandbox has no filesystem access outside its container

3. **Given** the sandbox is running, **When** network access is attempted, **Then** the sandbox has no network escape capabilities (NFR8)

4. **Given** the sandbox is running, **When** resources are used, **Then** resource limits (CPU, memory, time) are enforced

5. **Given** sandbox initialization, **When** tracing is active, **Then** sandbox initialization is traced in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Configure Claude SDK Sandbox** (AC: #1)
  - [ ] Create `src/tools/sandbox/config.ts`
  - [ ] Configure sandbox settings
  - [ ] Enable sandbox in agent options

- [ ] **Task 2: Restrict Filesystem Access** (AC: #2)
  - [ ] Define allowed paths (none by default)
  - [ ] Block escape attempts
  - [ ] Use container isolation

- [ ] **Task 3: Configure Network Restrictions** (AC: #3)
  - [ ] Allow outbound HTTP for API calls
  - [ ] Block inbound connections
  - [ ] Log network activity

- [ ] **Task 4: Set Resource Limits** (AC: #4)
  - [ ] Set CPU limit
  - [ ] Set memory limit (256MB)
  - [ ] Set execution timeout (30s)

- [ ] **Task 5: Add Langfuse Tracing** (AC: #5)
  - [ ] Create span for sandbox init
  - [ ] Log configuration
  - [ ] Track sandbox lifecycle

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Execute code in sandbox
  - [ ] Attempt filesystem escape
  - [ ] Verify resource limits
  - [ ] Check Langfuse traces

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR16 | architecture.md | Claude Agent SDK built-in sandbox |
| NFR8 | prd.md | Network sandboxing |

### Sandbox Configuration

```typescript
interface SandboxConfig {
  filesystem: {
    allowedPaths: string[];
    readOnly: boolean;
  };
  network: {
    allowOutbound: boolean;
    allowedHosts?: string[];
  };
  resources: {
    maxCpuSeconds: number;
    maxMemoryMb: number;
    maxExecutionMs: number;
  };
}

const DEFAULT_CONFIG: SandboxConfig = {
  filesystem: {
    allowedPaths: [],
    readOnly: true,
  },
  network: {
    allowOutbound: true, // For API calls
    allowedHosts: undefined, // All hosts
  },
  resources: {
    maxCpuSeconds: 10,
    maxMemoryMb: 256,
    maxExecutionMs: 30_000,
  },
};
```

### References

- [Source: _bmad-output/epics.md#Story 4.2] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Claude SDK provides sandbox capabilities
- Filesystem isolation is critical for security
- Network access needed for API calls (FR21)

### File List

Files to create:
- `src/tools/sandbox/config.ts`
- `src/tools/sandbox/index.ts`

