# Story 4.1: Subagent Spawner

Status: ready-for-dev

## Story

As an **orchestrator agent**,
I want to spawn parallel subagents for specialized tasks,
So that complex research can run concurrently and complete faster.

## Acceptance Criteria

1. **Given** a task requiring parallel execution, **When** the orchestrator calls `spawnSubagent()`, **Then** a new `messages.create()` call is made with isolated context

2. **Given** a subagent is spawned, **When** it receives context, **Then** only task-relevant context is passed (not full parent history)

3. **Given** multiple subagents, **When** spawned together, **Then** they execute in parallel via `Promise.all()` (max 3 concurrent)

4. **Given** a subagent execution, **When** it completes, **Then** its result is returned to the orchestrator for aggregation

5. **Given** a subagent failure, **When** an error occurs, **Then** it's handled gracefully without crashing other subagents

6. **Given** any subagent execution, **When** it runs, **Then** a child span is created in Langfuse linked to the parent trace

7. **Given** subagent execution, **When** tools are needed, **Then** subagents have access to the same tool registry as the parent

8. **Given** subagent execution, **When** running, **Then** a 60-second timeout via AbortController prevents hangs

9. **Given** subagent agent loop, **When** iterating, **Then** max 10 iterations prevents infinite loops

## Tasks / Subtasks

- [ ] **Task 1: Create Subagent Spawner** (AC: #1, #2, #8, #9)
  - [ ] Create `src/agent/subagents/spawner.ts`
  - [ ] Implement `spawnSubagent(context: SubagentContext)` function
  - [ ] Create isolated messages array per subagent
  - [ ] Pass curated context (task + relevant history only)
  - [ ] Add AbortController with 60s timeout
  - [ ] Add max 10 iterations guard on agent loop

- [ ] **Task 2: Implement Parallel Orchestration** (AC: #3)
  - [ ] Create `src/agent/subagents/orchestrator.ts`
  - [ ] Implement `runParallelSubagents(tasks: SubagentTask[], traceId: string)`
  - [ ] Use `Promise.all()` for concurrent execution
  - [ ] Limit concurrency to 3 subagents max via `p-limit`
  - [ ] Handle partial failures

- [ ] **Task 3: Context Isolation** (AC: #2)
  - [ ] Define `SubagentContext` interface in `types.ts`
  - [ ] Implement context extraction from parent
  - [ ] Ensure subagent messages don't leak to parent
  - [ ] Pass only task-relevant constraints

- [ ] **Task 4: Error Handling** (AC: #5)
  - [ ] Wrap each subagent in try/catch
  - [ ] Return error result (not throw) on failure
  - [ ] Log failures with traceId context
  - [ ] Continue other subagents on individual failure

- [ ] **Task 5: Observability** (AC: #6)
  - [ ] Create child span for each subagent
  - [ ] Link to parent trace via `parentObservationId`
  - [ ] Capture input task, output result, duration
  - [ ] Log subagent model/token usage with traceId

- [ ] **Task 6: Tool Access** (AC: #7)
  - [ ] Pass tool registry to subagent via `toolRegistry.getToolsForClaude()`
  - [ ] Subagent runs its own agent loop (pattern from Story 2.2)
  - [ ] Tool results stay within subagent context

- [ ] **Task 7: Verification**
  - [ ] Spawn single subagent, verify result
  - [ ] Spawn 3 parallel subagents, verify all complete
  - [ ] Simulate 1 failure, verify others succeed
  - [ ] Verify 60s timeout triggers on hang
  - [ ] Verify 10-iteration limit stops infinite loops
  - [ ] Check Langfuse shows child spans with traceId

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR3 | prd.md | System spawns subagents for parallel task execution with isolated context |
| NFR5 | prd.md | Max 3 concurrent subagents per request |
| AR (Subagent) | architecture.md | Parallel `messages.create()` calls + `Promise.all()` |

### Project Context Rules (CRITICAL)

From `project-context.md` — these rules are **mandatory**:

| Rule | Implementation |
|------|----------------|
| ESM imports with `.js` extension | All imports must use `.js` suffix |
| AbortController 60s timeout | Wrap each `messages.create()` with timeout |
| Max 10 agent loop iterations | Counter in while loop with break |
| traceId in every log entry | Pass traceId to all logger calls |
| Tool errors never throw | Return `ToolResult<T>` with success/error |

### File Locations

```
src/agent/subagents/
├── spawner.ts          # spawnSubagent() function
├── spawner.test.ts
├── orchestrator.ts     # runParallelSubagents()
├── orchestrator.test.ts
└── types.ts            # SubagentContext, SubagentResult, SubagentTask
```

### Type Definitions

```typescript
// src/agent/subagents/types.ts

export interface SubagentContext {
  /** What the subagent should accomplish */
  task: string;
  
  /** Parent-curated context (not full history) */
  relevantHistory?: string;
  
  /** Boundaries for the subagent */
  constraints?: string[];
  
  /** Specialized system prompt (optional) */
  systemPrompt?: string;
  
  /** Parent trace ID for observability — REQUIRED */
  parentTraceId: string;
}

export interface SubagentResult {
  success: boolean;
  content: string;
  sources?: string[];
  error?: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

export interface SubagentTask {
  id: string;
  context: SubagentContext;
}
```

### Subagent Spawner Implementation

```typescript
// src/agent/subagents/spawner.ts
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/environment.js';
import { toolRegistry } from '../../tools/registry.js';
import { langfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import type { SubagentContext, SubagentResult } from './types.js';

const anthropic = new Anthropic();

const MAX_ITERATIONS = 10;
const SUBAGENT_TIMEOUT_MS = 60_000;

/**
 * Spawn a subagent with isolated context.
 * 
 * Subagents run their own agent loop, independent of parent.
 * Results are returned, not merged into parent messages.
 * 
 * @see Story 4.1 - Subagent Spawner
 * @see Project Context - 60s timeout, max 10 iterations
 */
export async function spawnSubagent(
  context: SubagentContext
): Promise<SubagentResult> {
  const { parentTraceId } = context;
  
  const span = langfuse.span({
    name: 'subagent.execution',
    parentObservationId: parentTraceId,
    input: { task: context.task },
  });
  
  const startTime = Date.now();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), SUBAGENT_TIMEOUT_MS);
  
  try {
    const messages: Anthropic.MessageParam[] = [];
    
    // Add curated context if provided
    if (context.relevantHistory) {
      messages.push({
        role: 'user',
        content: `Context:\n${context.relevantHistory}`,
      });
      messages.push({
        role: 'assistant',
        content: 'I understand the context. What would you like me to do?',
      });
    }
    
    // Add the task
    messages.push({
      role: 'user',
      content: buildTaskPrompt(context),
    });
    
    const systemPrompt = context.systemPrompt ?? buildDefaultSubagentPrompt();
    
    let response = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: toolRegistry.getToolsForClaude(),
    }, { signal: abortController.signal });
    
    let totalInputTokens = response.usage.input_tokens;
    let totalOutputTokens = response.usage.output_tokens;
    let iterations = 0;
    
    // Subagent agent loop with guards
    while (response.stop_reason === 'tool_use') {
      iterations++;
      
      if (iterations >= MAX_ITERATIONS) {
        logger.warn({
          event: 'subagent.max_iterations',
          traceId: parentTraceId,
          task: context.task.slice(0, 50),
          iterations,
        });
        break;
      }
      
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );
      
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const result = await toolRegistry.executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            parentTraceId
          );
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        })
      );
      
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      
      response = await anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: toolRegistry.getToolsForClaude(),
      }, { signal: abortController.signal });
      
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
    }
    
    // Extract final text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const content = textBlocks.map((b) => b.text).join('\n');
    
    const duration = Date.now() - startTime;
    
    span.end({
      output: { contentLength: content.length },
      metadata: {
        success: true,
        durationMs: duration,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        iterations,
      },
    });
    
    logger.info({
      event: 'subagent.complete',
      traceId: parentTraceId,
      task: context.task.slice(0, 50),
      durationMs: duration,
      tokens: totalInputTokens + totalOutputTokens,
      iterations,
    });
    
    return {
      success: true,
      content,
      tokenUsage: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const errorMessage = isTimeout 
      ? 'Subagent timed out after 60 seconds'
      : (error instanceof Error ? error.message : String(error));
    
    span.end({
      metadata: {
        success: false,
        durationMs: duration,
        error: errorMessage,
        isTimeout,
      },
    });
    
    logger.error({
      event: 'subagent.failed',
      traceId: parentTraceId,
      task: context.task.slice(0, 50),
      error: errorMessage,
      isTimeout,
    });
    
    return {
      success: false,
      content: '',
      error: errorMessage,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildTaskPrompt(context: SubagentContext): string {
  let prompt = `Task: ${context.task}`;
  
  if (context.constraints?.length) {
    prompt += `\n\nConstraints:\n${context.constraints.map((c) => `- ${c}`).join('\n')}`;
  }
  
  prompt += '\n\nComplete this task and provide a clear, concise result.';
  
  return prompt;
}

function buildDefaultSubagentPrompt(): string {
  return `You are a specialized subagent focused on completing a specific task.

Guidelines:
- Focus only on the assigned task
- Use tools as needed to gather information
- Be concise in your response
- Cite sources when referencing external information
- If you cannot complete the task, explain why`;
}
```

### Parallel Orchestrator

```typescript
// src/agent/subagents/orchestrator.ts
import pLimit from 'p-limit';
import { spawnSubagent } from './spawner.js';
import { langfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import type { SubagentTask, SubagentResult } from './types.js';

const MAX_CONCURRENT_SUBAGENTS = 3;

export interface ParallelResults {
  results: Array<{ taskId: string; result: SubagentResult }>;
  successCount: number;
  failureCount: number;
  totalDuration: number;
}

/**
 * Run multiple subagents in parallel with concurrency limit.
 * 
 * @see Story 4.1 - NFR5: Max 3 concurrent subagents
 * @see Project Context - Promise.all with individual try/catch
 */
export async function runParallelSubagents(
  tasks: SubagentTask[],
  parentTraceId: string
): Promise<ParallelResults> {
  const span = langfuse.span({
    name: 'subagent.parallel',
    traceId: parentTraceId,
    input: { taskCount: tasks.length },
  });
  
  const startTime = Date.now();
  const limit = pLimit(MAX_CONCURRENT_SUBAGENTS);
  
  logger.info({
    event: 'subagent.parallel.start',
    traceId: parentTraceId,
    taskCount: tasks.length,
    maxConcurrent: MAX_CONCURRENT_SUBAGENTS,
  });
  
  // Execute all tasks with concurrency limit
  // Each subagent has its own try/catch — one failure doesn't kill others
  const promises = tasks.map((task) =>
    limit(async () => {
      const result = await spawnSubagent({
        ...task.context,
        parentTraceId,
      });
      return { taskId: task.id, result };
    })
  );
  
  const results = await Promise.all(promises);
  
  const successCount = results.filter((r) => r.result.success).length;
  const failureCount = results.filter((r) => !r.result.success).length;
  const totalDuration = Date.now() - startTime;
  
  span.end({
    output: { successCount, failureCount },
    metadata: { totalDurationMs: totalDuration },
  });
  
  logger.info({
    event: 'subagent.parallel.complete',
    traceId: parentTraceId,
    successCount,
    failureCount,
    totalDurationMs: totalDuration,
  });
  
  return {
    results,
    successCount,
    failureCount,
    totalDuration,
  };
}
```

### Dependencies

- Story 2.2 (Agent Loop) — Parent agent loop pattern, tool execution
- Story 3.2 (Tool Registry) — `toolRegistry.getToolsForClaude()`, `toolRegistry.executeTool()`
- Story 1.2 (Langfuse) — Child span linking via `parentObservationId`

### Package Dependencies

```bash
pnpm add p-limit@^5.0.0
```

Note: `p-limit` v5 is ESM-only, compatible with project's ESM setup.

### Success Metrics

| Metric | Target |
|--------|--------|
| Subagent success rate | >95% |
| Parallel speedup | >2x vs sequential |
| Context isolation | 100% (no leakage) |
| Timeout enforcement | 100% at 60s |
| Loop guard enforcement | 100% at 10 iterations |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 4 |
| 2025-12-22 | Added AbortController timeout, max iterations guard, traceId logging |
