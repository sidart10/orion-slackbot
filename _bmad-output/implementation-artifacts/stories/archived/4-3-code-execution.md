# Story 4.3: Code Execution

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: Covered by Story 3-0 Vercel Sandbox

## Story

As a **user**,
I want generated code to actually run and produce results,
So that I get actionable output, not just code.

## Acceptance Criteria

1. **Given** code is generated and E2B sandbox is ready, **When** the code is executed, **Then** it runs in the sandboxed environment (FR20)

2. **Given** code is running, **When** output is produced, **Then** execution output (stdout, stderr) is captured

3. **Given** code is running, **When** limits are checked, **Then** execution is subject to timeout limits (default 30s)

4. **Given** execution completes, **When** results are available, **Then** results are returned to the agent for processing

5. **Given** execution occurs, **When** tracing is active, **Then** execution events are logged in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Execution Module** (AC: #1)
  - [ ] Create `src/tools/sandbox/executor.ts`
  - [ ] Implement `executeCode()` function
  - [ ] Use E2B `sandbox.runCode()` for execution
  - [ ] Handle execution lifecycle

- [ ] **Task 2: Capture Output** (AC: #2)
  - [ ] Capture stdout from E2B execution result
  - [ ] Capture stderr from E2B execution result
  - [ ] Handle execution errors
  - [ ] Format output for agent consumption

- [ ] **Task 3: Enforce Timeout** (AC: #3)
  - [ ] Set execution timeout via E2B config
  - [ ] Handle timeout errors gracefully
  - [ ] Return structured timeout error

- [ ] **Task 4: Return Structured Results** (AC: #4)
  - [ ] Define `ExecutionResult` interface
  - [ ] Include output, errors, exit code, duration
  - [ ] Format for agent's next decision

- [ ] **Task 5: Add Langfuse Logging** (AC: #5)
  - [ ] Create execution span
  - [ ] Log code (truncated for large code)
  - [ ] Log output and duration
  - [ ] Track success/failure

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Generate and execute Python code
  - [ ] Generate and execute JavaScript code
  - [ ] Verify output captured correctly
  - [ ] Test timeout behavior
  - [ ] Check Langfuse traces

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR20 | prd.md | Execute code in sandboxed environment |

### E2B Code Execution

E2B provides a simple API for code execution:

```typescript
import { Sandbox } from '@e2b/code-interpreter';

const sandbox = await Sandbox.create();

// Execute Python code
const result = await sandbox.runCode('print("Hello, World!")');
console.log(result.logs.stdout);  // ["Hello, World!"]
console.log(result.logs.stderr);  // []

await sandbox.kill();
```

### src/tools/sandbox/executor.ts

```typescript
import { Sandbox } from '@e2b/code-interpreter';
import { withSandbox, SandboxConfig } from './factory.js';
import { createSpan } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';

export interface GeneratedCode {
  language: 'python' | 'javascript';
  code: string;
  purpose: string;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timedOut: boolean;
  error?: string;
}

/**
 * Execute generated code in E2B sandbox
 */
export async function executeCode(
  generatedCode: GeneratedCode,
  config?: SandboxConfig,
  parentTrace?: any
): Promise<ExecutionResult> {
  const startTime = Date.now();
  
  const span = parentTrace ? createSpan(parentTrace, {
    name: 'code-execution',
    input: {
      language: generatedCode.language,
      purpose: generatedCode.purpose,
      codeLength: generatedCode.code.length,
    },
  }) : null;

  try {
    const result = await withSandbox(async (sandbox) => {
      // E2B Code Interpreter executes Python by default
      // For JavaScript, we'd use a different sandbox template
      const execution = await sandbox.runCode(generatedCode.code);
      
      return {
        success: !execution.error,
        stdout: execution.logs.stdout.join('\n'),
        stderr: execution.logs.stderr.join('\n'),
        exitCode: execution.error ? 1 : 0,
        duration: Date.now() - startTime,
        timedOut: false,
        error: execution.error?.message,
      };
    }, config, parentTrace);

    logger.info({
      event: 'code_executed',
      language: generatedCode.language,
      success: result.success,
      duration: result.duration,
    });

    span?.end({ output: result });
    return result;

  } catch (error) {
    const isTimeout = error instanceof Error && 
      error.message.includes('timeout');

    const result: ExecutionResult = {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      duration: Date.now() - startTime,
      timedOut: isTimeout,
      error: error instanceof Error ? error.message : String(error),
    };

    logger.error({
      event: 'code_execution_failed',
      language: generatedCode.language,
      timedOut: isTimeout,
      error: result.error,
    });

    span?.end({ output: result });
    return result;
  }
}

/**
 * Execute code and return formatted result for agent
 */
export function formatExecutionForAgent(result: ExecutionResult): string {
  if (result.success) {
    return `Code executed successfully:\n\`\`\`\n${result.stdout}\n\`\`\``;
  }
  
  if (result.timedOut) {
    return `Code execution timed out after ${result.duration}ms. Consider simplifying the code or increasing the timeout.`;
  }

  return `Code execution failed:\n\`\`\`\n${result.stderr || result.error}\n\`\`\``;
}
```

### Execution Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Generated Code │────▶│  E2B Sandbox    │────▶│  Execution      │
│  (from 4.1)     │     │  (from 4.2)     │     │  Result         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │  Langfuse Trace │
                        └─────────────────┘
```

### References

- [E2B Code Interpreter](https://e2b.dev/docs/code-interpreter/overview)
- [Source: _bmad-output/epics.md#Story 4.3] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- **E2B replaces "Claude SDK Bash tool"** — E2B provides actual sandboxed execution
- E2B Code Interpreter is optimized for Python; JavaScript requires different template
- Always capture both stdout and stderr
- Consider streaming for long-running code (E2B supports streaming)
- Format execution results for agent's next decision

### File List

Files to create:
- `src/tools/sandbox/executor.ts`

Files to modify:
- `src/tools/sandbox/index.ts` (export executor)
