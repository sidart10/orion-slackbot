# Story 5.1: Subagent Infrastructure

Status: cancelled
Cancellation Date: 2025-12-21
Cancellation Reason: SDK provides native subagent spawning via spawnSubagent() capability

## Story

As a **developer**,
I want a framework for spawning specialized subagents,
So that complex tasks can be broken into parallel subtasks.

## Acceptance Criteria

1. **Given** the agent core is working, **When** a complex task requires parallelization, **Then** subagents can be spawned via `spawnSubagent()` pattern (AR9)

2. **Given** subagents are needed, **When** definitions are loaded, **Then** subagent definitions are loaded from `.orion/agents/` using standard front-matter parsing

3. **Given** a subagent is spawned, **When** it initializes, **Then** each subagent has its own system prompt and capabilities

4. **Given** subagents execute, **When** tracing is active, **Then** subagent spawning is traced in Langfuse

5. **Given** the framework is running, **When** concurrency is managed, **Then** the framework supports up to 3 concurrent subagents (NFR5) using standard concurrency control

## Tasks / Subtasks

- [ ] **Task 1: Update Configuration & Dependencies** (AC: #5)
  - [ ] Add `p-limit` and `gray-matter` to dependencies
  - [ ] Update `src/config/environment.ts` to include `maxConcurrentSubagents` (default 3)

- [ ] **Task 2: Expose Query Capability** (AC: #1)
  - [ ] Update `src/agent/orion.ts` to export `queryOrion` helper
  - [ ] Refactor `runOrionAgentDirect` to use `queryOrion` to avoid code duplication
  - [ ] Ensure `queryOrion` supports overriding system prompt and context

- [ ] **Task 3: Create Subagent Types & Interfaces** (AC: #1, #3)
  - [ ] Create `src/agent/subagents/types.ts` with `SubagentConfig`, `SubagentContext`, `SubagentResult`
  - [ ] Define `SubagentDefinition` interface for parsed agent files
  - [ ] Define `SubagentExecutionStatus` enum

- [ ] **Task 4: Create Subagent Definition Loader** (AC: #2)
  - [ ] Create `src/agent/subagents/loader.ts`
  - [ ] Implement `loadSubagentDefinition(name: string)` using `gray-matter`
  - [ ] Parse front matter and extract system prompt
  - [ ] Cache loaded definitions in memory
  - [ ] Use `createOrionError` for standardized error handling

- [ ] **Task 5: Create Subagent Spawn Function** (AC: #1, #3, #5)
  - [ ] Create `src/agent/subagents/spawn.ts`
  - [ ] Initialize `p-limit` with `maxConcurrentSubagents` from config
  - [ ] Implement `spawnSubagent` to use the concurrency limit
  - [ ] Call `queryOrion` with subagent's system prompt and isolated context
  - [ ] Return structured result with `success`, `data`, `error`, `sources`

- [ ] **Task 6: Add Langfuse Tracing** (AC: #4)
  - [ ] Wrap `spawnSubagent` in Langfuse span via `createSpan()`
  - [ ] Log subagent name, task summary, duration
  - [ ] Track tokens used by subagent separately

- [ ] **Task 7: Create Core Subagent Definitions** (AC: #2, #3)
  - [ ] Create `.orion/agents/search-agent.md`
  - [ ] Create `.orion/agents/research-agent.md`
  - [ ] Create `.orion/agents/summarize-agent.md`

- [ ] **Task 8: Create Index Module** (AC: all)
  - [ ] Create `src/agent/subagents/index.ts` exporting public API

- [ ] **Task 9: Verification Tests** (AC: all)
  - [ ] Test: Spawn single subagent successfully
  - [ ] Test: Verify concurrency limit (mocking slow tasks)
  - [ ] Test: Handle subagent failure gracefully
  - [ ] Test: Verify Langfuse spans created correctly

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR9 | architecture.md | Subagents spawned via `spawnSubagent()` pattern with isolated context |
| AR10 | architecture.md | Parallel subagent execution via `Promise.all()` |
| AR11 | architecture.md | ALL handlers MUST be wrapped in Langfuse traces |
| FR3 | prd.md | System spawns subagents for parallel task execution with isolated context windows |
| NFR5 | prd.md | Maximum 3 concurrent subagents per request |

### src/config/environment.ts (Update)

```typescript
export const config = {
  // ... existing config
  
  // Application
  // ...
  maxConcurrentSubagents: parseInt(process.env.MAX_CONCURRENT_SUBAGENTS ?? '3', 10),
} as const;
```

### src/agent/orion.ts (Update)

```typescript
// Add export for queryOrion
export interface QueryOrionOptions {
  prompt: string;
  systemPrompt: string;
  maxTokens?: number;
  // Add other options as needed
}

/**
 * Execute a direct query against the Orion agent model
 * Used by subagents to execute tasks with isolated context
 */
export async function queryOrion(options: QueryOrionOptions): Promise<SDKResponse> {
  const toolConfig = getToolConfig();
  
  return query({
    prompt: options.prompt,
    options: {
      systemPrompt: options.systemPrompt,
      mcpServers: toolConfig.mcpServers,
      allowedTools: toolConfig.allowedTools,
      maxTokens: options.maxTokens,
      // ... other standard options
    }
  });
}
```

### src/agent/subagents/types.ts

```typescript
import type { SubagentDefinition } from './loader'; // inferred

export interface SubagentConfig {
  name: string;
  task: string;
  context: SubagentContext;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface SubagentContext {
  originalQuery: string;
  relevantContext: string;
  userId: string;
  instructions?: string;
}

export interface SubagentResult {
  success: boolean;
  subagent: string;
  task: string;
  data?: SubagentOutput;
  error?: SubagentError;
  metrics: SubagentMetrics;
}

export interface SubagentOutput {
  content: string;
  sources: SubagentSource[];
  confidence: number;
}

export interface SubagentSource {
  type: 'slack' | 'confluence' | 'web' | 'file' | 'unknown';
  title: string;
  url?: string;
  snippet?: string;
}

export interface SubagentError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface SubagentMetrics {
  durationMs: number;
  tokensUsed: { input: number; output: number };
}

export interface SubagentDefinition {
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt: string;
  outputFormat: 'summary' | 'detailed' | 'structured';
  maxTokens: number;
}
```

### src/agent/subagents/loader.ts

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { logger } from '../../utils/logger.js';
import { createOrionError, ErrorCode } from '../../utils/errors.js';
import type { SubagentDefinition } from './types.js';

const AGENTS_DIR = '.orion/agents';
const definitionCache = new Map<string, SubagentDefinition>();

export async function loadSubagentDefinition(name: string): Promise<SubagentDefinition> {
  if (definitionCache.has(name)) {
    return definitionCache.get(name)!;
  }

  const filePath = join(process.cwd(), AGENTS_DIR, `${name}.md`);

  try {
    const fileContent = await readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    // Validate required fields
    if (!data.description || !data.capabilities) {
       throw new Error('Missing required front-matter fields');
    }

    const definition: SubagentDefinition = {
      name: data.name || name,
      description: data.description,
      capabilities: data.capabilities,
      systemPrompt: content.trim(),
      outputFormat: data.outputFormat || 'structured',
      maxTokens: data.maxTokens || 2000,
    };

    definitionCache.set(name, definition);
    return definition;

  } catch (error) {
    logger.error({
      event: 'subagent_definition_load_error',
      name,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw createOrionError(
      ErrorCode.UNKNOWN_ERROR, // Or a specific CONFIG_ERROR if available
      `Failed to load subagent definition: ${name}`,
      { cause: error instanceof Error ? error : undefined }
    );
  }
}
```

### src/agent/subagents/spawn.ts

```typescript
import pLimit from 'p-limit';
import { randomUUID } from 'crypto';
import { config } from '../../config/environment.js';
import { loadSubagentDefinition } from './loader.js';
import { queryOrion } from '../orion.js';
import { createSpan } from '../../observability/tracing.js';
import { logger } from '../../utils/logger.js';
import { createOrionError, ErrorCode } from '../../utils/errors.js';
import type { SubagentConfig, SubagentResult } from './types.js';

// Centralized concurrency limit (NFR5)
const limit = pLimit(config.maxConcurrentSubagents);

export async function spawnSubagent(
  subagentConfig: SubagentConfig,
  parentTrace?: { id: string }
): Promise<SubagentResult> {
  return limit(async () => {
    const taskId = randomUUID();
    const startTime = Date.now();
    
    // Create Langfuse span
    const span = createSpan(parentTrace, {
      name: `subagent:${subagentConfig.name}`,
      input: { task: subagentConfig.task },
      metadata: { taskId, subagent: subagentConfig.name }
    });

    try {
      logger.info({ event: 'subagent_spawn_start', taskId, subagent: subagentConfig.name });

      const definition = await loadSubagentDefinition(subagentConfig.name);
      
      const fullSystemPrompt = `${definition.systemPrompt}\n\nTask Context:\n${subagentConfig.context.relevantContext}`;

      const response = await queryOrion({
        prompt: subagentConfig.task,
        systemPrompt: fullSystemPrompt,
        maxTokens: subagentConfig.maxOutputTokens || definition.maxTokens,
      });

      // Process response...
      // (Implementation details for parsing response, extracting sources, etc.)
      
      const result: SubagentResult = {
        success: true,
        subagent: subagentConfig.name,
        task: subagentConfig.task,
        data: {
          content: response.content as string, // simplified
          sources: [], // extract sources
          confidence: 1.0
        },
        metrics: {
           durationMs: Date.now() - startTime,
           tokensUsed: { input: 0, output: 0 } // get from response
        }
      };

      span.end({ output: result });
      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error({ event: 'subagent_spawn_error', taskId, error });
      
      const result: SubagentResult = {
        success: false,
        subagent: subagentConfig.name,
        task: subagentConfig.task,
        error: {
          code: ErrorCode.UNKNOWN_ERROR,
          message: error instanceof Error ? error.message : String(error),
          recoverable: true
        },
        metrics: { durationMs, tokensUsed: { input: 0, output: 0 } }
      };
      
      span.end({ output: result, level: 'error' });
      return result;
    }
  });
}
```

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List

Files to update:
- `src/config/environment.ts`
- `src/agent/orion.ts`

Files to create:
- `src/agent/subagents/types.ts`
- `src/agent/subagents/loader.ts`
- `src/agent/subagents/spawn.ts`
- `src/agent/subagents/index.ts`
- `src/agent/subagents/loader.test.ts`
- `src/agent/subagents/spawn.test.ts`
- `.orion/agents/search-agent.md`
- `.orion/agents/research-agent.md`
- `.orion/agents/summarize-agent.md`
