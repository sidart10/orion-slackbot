# Story 3.0: Vercel Sandbox Agent Runtime

Status: in-progress

## Story

As a **developer**,
I want the Anthropic SDK to run in a Vercel Sandbox,
So that the agent can execute Claude API calls with proper isolation and timeout handling.

## Background

The previous E2B implementation was a workaround. Vercel Sandbox provides first-party support for running Node.js code in isolated MicroVMs.

**See:** 
- `_bmad-output/sprint-change-proposal-vercel-migration-2025-12-18.md`
- `docs/vercel-sandbox-claude-sdk.md` (Vercel's official guide)

## Dependencies

| Story | Status | What This Story Needs From It |
|-------|--------|-------------------------------|
| 1-8 | ready-for-dev | Vercel project setup, `vercel.json` |
| 1-9 | ready-for-dev | Slack integration on Vercel |
| 2.1-2.9 | ✅ done | Agent loop, Claude SDK integration code |

## Acceptance Criteria

1. **Given** Vercel Sandbox is configured, **When** the agent script is executed, **Then** Anthropic SDK runs `messages.create()` successfully

2. **Given** a Vercel Sandbox is created, **When** the Anthropic SDK is installed, **Then** it is available for the agent script

3. **Given** the agent completes processing, **When** the response is ready, **Then** it updates the Slack message via callback

4. **Given** Vercel Sandbox is unavailable or times out, **When** a request arrives, **Then** user receives a graceful error message with code `SANDBOX_CREATION_FAILED` or `SANDBOX_TIMEOUT`

5. **Given** the Vercel integration is working, **When** I send "Hello" to Orion in Slack, **Then** I receive a proper Claude API response

6. **Given** sandbox execution occurs, **When** the execution completes, **Then** it is wrapped in a Langfuse observation with timing, token usage, and result metadata

## Tasks / Subtasks

- [ ] **Task 1: Add Vercel Sandbox Dependencies**
  - [ ] Install `@vercel/sandbox` package
  - [ ] Install `ms` package for timeout handling
  - [ ] Install `@types/ms` as dev dependency
  - [ ] Remove `@e2b/code-interpreter` from dependencies
  - [ ] Verify `@slack/web-api` is already installed (from Epic 1)
  - [ ] Update `package.json`

- [ ] **Task 2: Create Vercel Sandbox Runtime**
  - [ ] Create `src/sandbox/vercel-runtime.ts`
  - [ ] Implement `createVercelSandbox()` function with retry logic
  - [ ] Implement `executeAgentInSandbox()` function
  - [ ] Implement `parseAgentOutput()` helper function
  - [ ] Configure sandbox with Node.js 22 runtime
  - [ ] Configure vCPUs: 4 (recommended for Claude)
  - [ ] Set default timeout: 10 minutes (`ms('10m')`)

- [ ] **Task 3: Install Anthropic SDK in Sandbox**
  - [ ] Run `npm install @anthropic-ai/sdk` in sandbox working directory
  - [ ] Verify installation successful (exit code 0)
  - [ ] Add retry logic for transient npm failures

- [ ] **Task 4: Create Agent Execution Script**
  - [ ] Build agent script dynamically (see Dev Notes for template)
  - [ ] Write script to sandbox filesystem using `writeFiles()`
  - [ ] Pass `ANTHROPIC_API_KEY` to sandbox environment
  - [ ] Execute with `node agent.mjs`
  - [ ] Capture stdout/stderr for response
  - [ ] Handle Claude API errors (rate limits, context length, invalid key)

- [ ] **Task 5: Implement Slack Callback**
  - [ ] Accept Slack `channel`, `messageTs`, `token` in execution input
  - [ ] On completion, call `chat.update` to replace "thinking" message
  - [ ] Format response using Slack mrkdwn (AR21-AR23)
  - [ ] Wrap Slack update in try-catch (log errors, don't throw)

- [ ] **Task 6: Implement Langfuse Tracing**
  - [ ] Wrap sandbox execution in `startActiveObservation` (AR11)
  - [ ] Log sandbox creation, SDK install, agent execution as generations
  - [ ] Include duration, token usage (promptTokens, completionTokens), success/failure
  - [ ] Use proper Langfuse observation API

- [ ] **Task 7: Update Environment Configuration**
  - [ ] Remove `E2B_API_KEY` from `src/config/environment.ts`
  - [ ] Remove `USE_E2B_SANDBOX` flag
  - [ ] Remove `e2bApiKey` from production `required` array
  - [ ] OIDC token is auto-injected by Vercel (no config needed)
  - [ ] Update `.env.example`

- [ ] **Task 8: Migrate from E2B**
  - [ ] Delete `src/sandbox/agent-runtime.ts`
  - [ ] Delete `src/sandbox/agent-runtime.test.ts`
  - [ ] Delete `e2b-template/` directory entirely
  - [ ] Modify `src/sandbox/index.ts` to export Vercel implementation
  - [ ] Update callers to use new interface (see Interface Migration)
  - [ ] Update type exports

- [ ] **Task 9: Error Handling & Graceful Degradation**
  - [ ] Handle sandbox creation failures → `SANDBOX_CREATION_FAILED`
  - [ ] Handle sandbox timeout (10 min default) → `SANDBOX_TIMEOUT`
  - [ ] Handle SDK install failures → `SANDBOX_SETUP_FAILED`
  - [ ] Handle agent execution failures → `AGENT_EXECUTION_FAILED`
  - [ ] Return user-friendly error messages via OrionError (AR18)
  - [ ] Log errors with structured JSON (AR12)
  - [ ] Implement exponential backoff for sandbox creation retries (NFR15)

- [ ] **Task 10: Verification**
  - [ ] Run standalone verification script (see Dev Notes)
  - [ ] Deploy to Vercel
  - [ ] Send "Hello" message to Orion in Slack
  - [ ] Verify proper Claude API response (via Anthropic SDK)
  - [ ] Verify Langfuse trace shows sandbox execution with token usage
  - [ ] Test timeout handling with long query
  - [ ] Verify error messages are user-friendly

## Dev Notes

### SDK Decision

This story uses the **Anthropic SDK** (`@anthropic-ai/sdk`) with `messages.create()` for MVP simplicity.

| SDK | Package | API | Use Case |
|-----|---------|-----|----------|
| **Anthropic SDK** (this story) | `@anthropic-ai/sdk` | `messages.create()` | Direct API calls, no subprocess needed |
| Claude Agent SDK (future) | `@anthropic-ai/claude-agent-sdk` | `query()` | Tool-use agents, requires Claude Code CLI subprocess |

Claude Agent SDK upgrade is tracked separately when tool-use within sandbox is needed.

### Async Execution Pattern

Vercel Pro has 60s function timeout, but sandbox can run up to 10 minutes. Solution:

```
Slack Event → Vercel Function
    │
    ├── Ack immediately (return 200 within 3s)
    ├── Post "Processing..." message to Slack
    │
    └── Trigger executeAgentInSandbox() ──────┐
                                               │
        ═══ Function returns, async continues ═│
                                               ▼
                                       Vercel Sandbox (up to 10 min)
                                               │
                                               ├── Install Anthropic SDK
                                               ├── Write agent.mjs
                                               ├── Execute agent
                                               │
                                               ▼
                                       Claude API → Parse Response
                                               │
                                               ▼
                                       Slack chat.update (callback)
                                               │
                                               ▼
                                       sandbox.stop()
```

The Slack integration (Story 1-9) handles the async dispatch pattern.

### Interface Migration

**Old E2B Interface:**
```typescript
interface SandboxExecutionInput {
  prompt: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  threadHistory?: string[];
  traceId?: string;
}
```

**New Vercel Interface:**
```typescript
interface SandboxExecutionInput {
  userMessage: string;
  threadHistory: string[];
  slackChannel: string;
  slackMessageTs: string;
  slackToken: string;
  traceId?: string;
}
```

Update all callers in `src/slack/handlers/` to use the new field names.

### Complete Vercel Sandbox Implementation

```typescript
// src/sandbox/vercel-runtime.ts
import ms from 'ms';
import { Sandbox } from '@vercel/sandbox';
import { WebClient } from '@slack/web-api';
import { langfuse } from '../observability/langfuse';
import { createOrionError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface SandboxExecutionInput {
  userMessage: string;
  threadHistory: string[];
  slackChannel: string;
  slackMessageTs: string;
  slackToken: string;
  traceId?: string;
}

export interface SandboxExecutionResult {
  success: boolean;
  response?: string;
  error?: string;
  tokenUsage?: { input: number; output: number };
  duration: number;
}

const DEFAULT_TIMEOUT = ms('10m');
const SANDBOX_VCPUS = 4;
const MAX_RETRIES = 3;

/**
 * Parse agent script output from stdout
 */
function parseAgentOutput(stdout: string): { 
  text: string; 
  tokenUsage?: { input: number; output: number };
  error?: string;
} {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.error) {
      return { text: '', error: parsed.error };
    }
    return {
      text: parsed.text || '',
      tokenUsage: parsed.tokenUsage,
    };
  } catch {
    // If not JSON, treat as raw text output
    return { text: stdout.trim() };
  }
}

/**
 * Create sandbox with retry logic for transient failures (NFR15)
 */
async function createSandboxWithRetry(): Promise<Sandbox> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const sandbox = await Sandbox.create({
        resources: { vcpus: SANDBOX_VCPUS },
        timeout: DEFAULT_TIMEOUT,
        runtime: 'node22',
      });
      
      logger.info({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'sandbox_created',
        sandboxId: sandbox.sandboxId,
        attempt: attempt + 1,
      });
      
      return sandbox;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      logger.warn({
        timestamp: new Date().toISOString(),
        level: 'warn',
        event: 'sandbox_creation_retry',
        attempt: attempt + 1,
        error: lastError.message,
      });
      
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  throw createOrionError('SANDBOX_CREATION_FAILED', {
    message: lastError?.message || 'Failed to create sandbox after retries',
    userMessage: 'I\'m having trouble starting up. Please try again in a moment.',
    recoverable: true,
  });
}

export async function executeAgentInSandbox(
  input: SandboxExecutionInput
): Promise<SandboxExecutionResult> {
  const startTime = Date.now();
  let sandbox: Sandbox | null = null;
  
  // Create Langfuse observation
  const trace = langfuse.trace({
    name: 'sandbox-execution',
    metadata: {
      slackChannel: input.slackChannel,
      messageTs: input.slackMessageTs,
    },
  });

  try {
    // Create sandbox with retry
    const createSpan = trace.span({ name: 'sandbox-create' });
    sandbox = await createSandboxWithRetry();
    createSpan.end({ output: { sandboxId: sandbox.sandboxId } });

    // Install Anthropic SDK
    const installSpan = trace.span({ name: 'install-sdk' });
    const installSDK = await sandbox.runCommand({
      cmd: 'npm',
      args: ['install', '@anthropic-ai/sdk'],
      cwd: '/vercel/sandbox',
    });
    
    if (installSDK.exitCode !== 0) {
      installSpan.end({ level: 'ERROR', statusMessage: 'SDK install failed' });
      throw createOrionError('SANDBOX_SETUP_FAILED', {
        message: `npm install failed: ${installSDK.stderr}`,
        userMessage: 'Agent setup failed. Please try again.',
        recoverable: true,
      });
    }
    installSpan.end();

    // Build and write agent script
    const agentScript = buildAgentScript(input);
    await sandbox.writeFiles([{
      path: '/vercel/sandbox/agent.mjs',
      content: Buffer.from(agentScript),
    }]);

    // Execute agent
    const executeSpan = trace.span({ name: 'execute-agent' });
    const result = await sandbox.runCommand({
      cmd: 'node',
      args: ['agent.mjs'],
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      },
    });

    if (result.exitCode !== 0) {
      executeSpan.end({ level: 'ERROR', statusMessage: result.stderr });
      throw createOrionError('AGENT_EXECUTION_FAILED', {
        message: `Agent exited with code ${result.exitCode}: ${result.stderr}`,
        userMessage: 'I encountered an error processing your request.',
        recoverable: true,
      });
    }

    // Parse response
    const output = parseAgentOutput(result.stdout);
    
    if (output.error) {
      executeSpan.end({ level: 'ERROR', statusMessage: output.error });
      throw createOrionError('AGENT_EXECUTION_FAILED', {
        message: output.error,
        userMessage: 'I encountered an error processing your request.',
        recoverable: true,
      });
    }
    
    executeSpan.end({
      output: { responseLength: output.text.length },
    });

    // Update trace with token usage
    if (output.tokenUsage) {
      trace.update({
        usage: {
          promptTokens: output.tokenUsage.input,
          completionTokens: output.tokenUsage.output,
        },
      });
    }

    // Update Slack message (with error handling)
    try {
      const slackClient = new WebClient(input.slackToken);
      await slackClient.chat.update({
        channel: input.slackChannel,
        ts: input.slackMessageTs,
        text: output.text,
      });
    } catch (slackError) {
      logger.error({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'slack_update_failed',
        error: slackError instanceof Error ? slackError.message : String(slackError),
        channel: input.slackChannel,
        messageTs: input.slackMessageTs,
      });
      // Don't throw - the agent succeeded, just Slack update failed
    }

    const duration = Date.now() - startTime;
    trace.update({ output: { success: true, duration } });

    return {
      success: true,
      response: output.text,
      tokenUsage: output.tokenUsage,
      duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'sandbox_execution_failed',
      error: errorMessage,
      duration,
      traceId: input.traceId,
    });

    // Determine error code and user message
    let errorCode = 'SANDBOX_EXECUTION_FAILED';
    let userMessage = 'I encountered an error. Please try again.';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      errorCode = 'SANDBOX_TIMEOUT';
      userMessage = 'Your request took too long. Please try a simpler question.';
    } else if (errorMessage.includes('rate') || errorMessage.includes('429')) {
      userMessage = 'I\'m receiving too many requests. Please wait a moment.';
    } else if (errorMessage.includes('context') || errorMessage.includes('tokens')) {
      userMessage = 'Your conversation is too long. Please start a new thread.';
    }

    // Update Slack with error message
    try {
      const slackClient = new WebClient(input.slackToken);
      await slackClient.chat.update({
        channel: input.slackChannel,
        ts: input.slackMessageTs,
        text: userMessage,
      });
    } catch {
      // Ignore Slack update errors in error path
    }

    trace.update({ 
      output: { success: false, error: errorCode, duration },
      level: 'ERROR',
    });

    return {
      success: false,
      error: errorMessage,
      duration,
    };

  } finally {
    if (sandbox) {
      try {
        await sandbox.stop();
        logger.info({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'sandbox_stopped',
        });
      } catch (stopError) {
        logger.warn({
          timestamp: new Date().toISOString(),
          level: 'warn',
          event: 'sandbox_stop_warning',
          error: stopError instanceof Error ? stopError.message : String(stopError),
        });
      }
    }
  }
}
```

### Agent Script Template

```typescript
function buildAgentScript(input: SandboxExecutionInput): string {
  const escapedMessage = JSON.stringify(input.userMessage);
  const escapedHistory = JSON.stringify(input.threadHistory);

  return `
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function main() {
  const userMessage = ${escapedMessage};
  const threadHistory = ${escapedHistory};

  // Build messages array from thread history
  const messages = threadHistory.map((msg, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: msg,
  }));
  messages.push({ role: 'user', content: userMessage });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: \`You are Orion, a helpful AI assistant. 
Follow these formatting rules for Slack:
- Use *bold* for emphasis (not **)
- Use _italic_ for secondary emphasis
- Use bullet points with •
- Never use blockquotes
- Never use emojis unless requested\`,
      messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    
    console.log(JSON.stringify({
      text,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    }));
  } catch (err) {
    // Handle specific Claude API errors
    let errorMessage = err.message || 'Unknown error';
    
    if (err.status === 429) {
      errorMessage = 'rate_limit_exceeded';
    } else if (err.status === 400 && err.message?.includes('context')) {
      errorMessage = 'context_length_exceeded';
    } else if (err.status === 401) {
      errorMessage = 'invalid_api_key';
    }
    
    console.log(JSON.stringify({ error: errorMessage }));
    process.exit(1);
  }
}

main();
`;
}
```

### Standalone Verification Script

Run this to verify sandbox works before full integration:

```typescript
// scripts/verify-sandbox.ts
import ms from 'ms';
import { Sandbox } from '@vercel/sandbox';

async function verify() {
  console.log('Creating sandbox...');
  const sandbox = await Sandbox.create({
    resources: { vcpus: 4 },
    timeout: ms('5m'),
    runtime: 'node22',
  });
  console.log(`✓ Sandbox created: ${sandbox.sandboxId}`);

  console.log('Installing Anthropic SDK...');
  const install = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '@anthropic-ai/sdk'],
  });
  if (install.exitCode !== 0) {
    console.error('✗ Install failed:', install.stderr);
    process.exit(1);
  }
  console.log('✓ Anthropic SDK installed');

  console.log('Verifying import...');
  await sandbox.writeFiles([{
    path: '/vercel/sandbox/verify.mjs',
    content: Buffer.from(`
import Anthropic from '@anthropic-ai/sdk';
console.log('SDK version:', Anthropic.VERSION || 'loaded');
`),
  }]);
  
  const verify = await sandbox.runCommand({
    cmd: 'node',
    args: ['verify.mjs'],
  });
  console.log(verify.stdout);
  
  await sandbox.stop();
  console.log('✓ Sandbox stopped');
  console.log('\n✅ Verification complete!');
}

verify().catch(console.error);
```

Run with: `node --env-file .env.local --experimental-strip-types scripts/verify-sandbox.ts`

### Error Codes Reference

| Code | Trigger | User Message |
|------|---------|--------------|
| `SANDBOX_CREATION_FAILED` | Sandbox.create() fails after retries | "I'm having trouble starting up. Please try again." |
| `SANDBOX_TIMEOUT` | 10-minute timeout exceeded | "Your request took too long. Please try simpler question." |
| `SANDBOX_SETUP_FAILED` | npm install fails | "Agent setup failed. Please try again." |
| `AGENT_EXECUTION_FAILED` | Script execution fails | "I encountered an error processing your request." |

### Slack Message Format Example

```
*Response from Orion*

Here's what I found:

• First key point with _emphasis_ on important details
• Second point with clear, actionable information
• Third point summarizing the conclusion

Let me know if you need more details.
```

### Files to Create

| File | Purpose |
|------|---------|
| `src/sandbox/vercel-runtime.ts` | Vercel Sandbox implementation |
| `src/sandbox/vercel-runtime.test.ts` | Tests |
| `scripts/verify-sandbox.ts` | Standalone verification |

### Files to Delete

| File | Reason |
|------|--------|
| `src/sandbox/agent-runtime.ts` | E2B implementation |
| `src/sandbox/agent-runtime.test.ts` | E2B tests |
| `e2b-template/` | Entire folder |

### Key Differences from E2B

| Aspect | E2B (Old) | Vercel Sandbox (New) |
|--------|-----------|---------------------|
| SDK Used | Python workaround | Node.js Anthropic SDK |
| Runtime | Python | Node.js 22 |
| Auth | E2B_API_KEY | OIDC (auto via Vercel) |
| Integration | External service | Native Vercel |
| Cold Start | ~5s | ~3s |
| Retry Logic | None | Exponential backoff |

### Warm Pool (Future Optimization)

For production, consider warm pool pattern:
- Keep sandboxes pre-initialized with SDK installed
- Expected improvement: ~10s → ~1s cold start
- Track as separate optimization story

## Related Stories

- **1-8** (Vercel Project Setup) — Prerequisite
- **1-9** (Vercel Slack Integration) — Prerequisite, triggers this sandbox
- **3-1** (MCP Client Infrastructure) — Uses this sandbox
- **4-2** (Sandbox Environment) — Uses same sandbox
