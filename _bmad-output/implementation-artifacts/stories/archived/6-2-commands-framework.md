# Story 6.2: Commands Framework

Status: ready-for-dev

## Story

As a **developer**,
I want to define custom commands via YAML workflow files,
So that users can trigger specific workflows without natural language ambiguity.

## Acceptance Criteria

1. **Given** a `.orion/commands/` directory with YAML files, **When** the loader runs, **Then** all valid commands are discovered and registered

2. **Given** a command YAML file, **When** parsed, **Then** the command name, description, parameters, and workflow steps are extracted

3. **Given** a user invokes a command (e.g., "run deep-research on X"), **When** detected, **Then** the command workflow is executed

4. **Given** a command with parameters, **When** the user provides them, **Then** parameters are validated (type-checked) and passed to the workflow

5. **Given** command execution, **When** running, **Then** each step is logged to Langfuse with parent trace

6. **Given** invalid command YAML, **When** parsing fails, **Then** an error is logged but other commands still load

7. **Given** commands loaded, **When** a user asks "what can you do?", **Then** available commands are listed (Slack mrkdwn format)

## Tasks / Subtasks

- [ ] **Task 1: Create Commands Loader** (AC: #1, #6)
  - [ ] Create `src/commands/loader.ts`
  - [ ] Implement `loadCommands(traceId: string)` function
  - [ ] Discover YAML files in `.orion/commands/`
  - [ ] Handle missing directory gracefully

- [ ] **Task 2: Command YAML Parser** (AC: #2, #4)
  - [ ] Create `src/commands/parser.ts`
  - [ ] Parse YAML structure with `yaml` package
  - [ ] Extract name, description, parameters
  - [ ] Extract workflow steps
  - [ ] Validate parameter types

- [ ] **Task 3: Command Types** (AC: #2, #4)
  - [ ] Create `src/commands/types.ts`
  - [ ] Define `Command` interface
  - [ ] Define `CommandStep` interface
  - [ ] Define `CommandParameter` interface
  - [ ] Define `CommandMatch` interface

- [ ] **Task 4: Command Detection** (AC: #3)
  - [ ] Create `src/commands/detector.ts`
  - [ ] Detect command invocation patterns via regex
  - [ ] Parse parameters from user message
  - [ ] Return matched command or null

- [ ] **Task 5: Command Executor** (AC: #3, #5)
  - [ ] Create `src/commands/executor.ts`
  - [ ] Execute workflow steps sequentially
  - [ ] Handle step failures with ToolResult pattern
  - [ ] Create Langfuse child spans per step
  - [ ] Integrate with response streaming

- [ ] **Task 6: Commands List** (AC: #7)
  - [ ] Create function to list available commands
  - [ ] Format for Slack mrkdwn (`*bold*` not `**bold**`)
  - [ ] Include in capabilities response

- [ ] **Task 7: Verification**
  - [ ] Create sample command in `.orion/commands/`
  - [ ] Invoke command via message
  - [ ] Verify workflow executes with streaming
  - [ ] Check Langfuse traces have correct parent/child

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR25 | prd.md | Add new Commands via file-based workflow definitions in `.orion/commands/` |
| mrkdwn | project-context.md | Use `*bold*` not `**bold**` for Slack |
| Logging | project-context.md | ALL logs must include `traceId` |
| ToolResult | project-context.md | Tool steps return `ToolResult<T>` not throw |

### File Locations

```
src/commands/
├── loader.ts           # Command discovery
├── loader.test.ts
├── parser.ts           # YAML parser + validation
├── parser.test.ts
├── types.ts            # Command types
├── detector.ts         # Command detection
├── detector.test.ts
├── executor.ts         # Workflow execution
├── executor.test.ts
└── index.ts            # Re-exports

.orion/commands/        # Command definitions
├── deep-research.yaml
├── summarize-thread.yaml
└── prospect-research.yaml
```

### Command YAML Format

```yaml
# .orion/commands/deep-research.yaml
name: deep-research
description: Conduct deep research across Slack, Confluence, and web
version: 1.0.0

# Trigger patterns (user messages that activate this command)
triggers:
  - "deep research on {topic}"
  - "research {topic} deeply"
  - "comprehensive research about {topic}"

# Parameters extracted from triggers
parameters:
  topic:
    type: string
    description: The topic to research
    required: true
  sources:
    type: array
    items: string
    default: ["slack", "confluence", "web"]
    description: Sources to search

# Workflow steps
steps:
  - name: confirm_scope
    type: prompt
    message: "I'll research '{topic}' across {sources}. Proceed?"
    
  - name: search_sources
    type: tool
    tool: deep_research
    args:
      query: "{topic}"
      sources: "{sources}"
    timeout: 60  # seconds
      
  - name: synthesize
    type: prompt
    message: "Here's what I found about {topic}..."
    include_previous_result: true
```

### Command Types

```typescript
// src/commands/types.ts

export interface Command {
  name: string;
  description: string;
  version?: string;
  triggers: string[];  // Pattern strings with {param} placeholders
  parameters: Record<string, CommandParameter>;
  steps: CommandStep[];
  filePath: string;
}

export interface CommandParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
  items?: string;  // For arrays
  enum?: string[];
}

export interface CommandStep {
  name: string;
  type: 'prompt' | 'tool' | 'subagent' | 'condition';
  message?: string;           // For prompt type
  tool?: string;              // For tool type
  args?: Record<string, string>;  // Tool arguments
  include_previous_result?: boolean;
  condition?: string;         // For condition type
  on_true?: string;           // Step to jump to
  on_false?: string;
  timeout?: number;           // Step timeout in seconds
}

export interface CommandMatch {
  command: Command;
  parameters: Record<string, unknown>;
}

export interface ExecutionContext {
  parameters: Record<string, unknown>;
  previousResult?: string;
  traceId: string;  // Required, not optional
  channelId?: string;
  threadTs?: string;
}
```

### Command Loader

```typescript
// src/commands/loader.ts
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { langfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import type { Command } from './types.js';

const COMMANDS_DIR = '.orion/commands';

/**
 * Load all commands from .orion/commands directory
 * 
 * @param traceId - Required for log correlation
 * @see Story 6.2 - Commands Framework
 */
export async function loadCommands(traceId: string): Promise<Command[]> {
  const span = langfuse.span({ name: 'commands.load', traceId });
  
  try {
    // Handle missing directory gracefully
    if (!existsSync(COMMANDS_DIR)) {
      logger.info({
        event: 'commands.directory_missing',
        traceId,
        path: COMMANDS_DIR,
      });
      span.end({ output: { loaded: 0, reason: 'directory_missing' } });
      return [];
    }
    
    const commandPaths = await glob(`${COMMANDS_DIR}/*.yaml`);
    
    logger.info({
      event: 'commands.discovery',
      traceId,
      found: commandPaths.length,
    });
    
    const results = await Promise.allSettled(
      commandPaths.map(async (path) => {
        const content = await readFile(path, 'utf-8');
        const parsed = parseYaml(content) as Omit<Command, 'filePath'>;
        return { ...parsed, filePath: path } as Command;
      })
    );
    
    const commands: Command[] = [];
    const failures: Array<{ path: string; error: string }> = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        commands.push(result.value);
      } else {
        const errorMsg = result.reason?.message ?? String(result.reason);
        failures.push({ path: commandPaths[index], error: errorMsg });
        logger.warn({
          event: 'commands.parse_failed',
          traceId,
          path: commandPaths[index],
          error: errorMsg,
        });
      }
    });
    
    span.end({
      output: { 
        commandCount: commands.length,
        names: commands.map((c) => c.name),
        failures,
      },
    });
    
    logger.info({
      event: 'commands.loaded',
      traceId,
      count: commands.length,
      names: commands.map((c) => c.name),
    });
    
    return commands;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    span.end({ metadata: { error: errorMsg } });
    logger.error({
      event: 'commands.load_error',
      traceId,
      error: errorMsg,
    });
    return [];
  }
}

let cachedCommands: Command[] | null = null;

export async function getCommands(traceId: string): Promise<Command[]> {
  if (!cachedCommands) {
    cachedCommands = await loadCommands(traceId);
  }
  return cachedCommands;
}

export function reloadCommands(): void {
  cachedCommands = null;
}
```

### Command Detector

```typescript
// src/commands/detector.ts
import type { Command, CommandMatch } from './types.js';
import { getCommands } from './loader.js';
import { logger } from '../utils/logger.js';

/**
 * Detect if a user message matches a command trigger
 * 
 * Returns the matched command with extracted parameters, or null.
 * 
 * @param message - User message to check
 * @param traceId - Required for logging
 */
export async function detectCommand(
  message: string,
  traceId: string
): Promise<CommandMatch | null> {
  const commands = await getCommands(traceId);
  
  for (const command of commands) {
    for (const trigger of command.triggers) {
      const match = matchTrigger(message.toLowerCase(), trigger.toLowerCase());
      if (match) {
        logger.info({
          event: 'commands.detected',
          traceId,
          command: command.name,
          trigger,
          parameters: match,
        });
        return {
          command,
          parameters: match,
        };
      }
    }
  }
  
  return null;
}

/**
 * Match a message against a trigger pattern
 * 
 * Trigger: "deep research on {topic}"
 * Message: "deep research on competitor analysis"
 * Returns: { topic: "competitor analysis" }
 */
function matchTrigger(
  message: string,
  trigger: string
): Record<string, string> | null {
  // Convert trigger to regex
  // "deep research on {topic}" -> /^deep research on (.+)$/
  const paramNames: string[] = [];
  const regexPattern = trigger.replace(/\{(\w+)\}/g, (_, name) => {
    paramNames.push(name);
    return '(.+?)';
  });
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  const match = message.match(regex);
  
  if (!match) {
    return null;
  }
  
  // Extract parameters
  const params: Record<string, string> = {};
  paramNames.forEach((name, index) => {
    params[name] = match[index + 1].trim();
  });
  
  return params;
}

/**
 * List available commands for Slack display
 * 
 * Uses Slack mrkdwn format (*bold* not **bold**)
 * 
 * @see project-context.md - Slack mrkdwn rules
 */
export async function listCommands(traceId: string): Promise<string> {
  const commands = await getCommands(traceId);
  
  if (commands.length === 0) {
    return 'No custom commands available.';
  }
  
  const lines = commands.map((cmd) => {
    const trigger = cmd.triggers[0] ?? cmd.name;
    // Use Slack mrkdwn: *bold* not **bold**
    return `• *${cmd.name}*: ${cmd.description}\n  Example: "${trigger}"`;
  });
  
  return `*Available Commands*\n\n${lines.join('\n\n')}`;
}
```

### Command Executor

```typescript
// src/commands/executor.ts
import { langfuse } from '../observability/langfuse.js';
import { toolHandlers } from '../tools/registry.js';
import { logger } from '../utils/logger.js';
import type { Command, CommandStep, ExecutionContext } from './types.js';
import type { ToolResult } from '../types/tools.js';

const DEFAULT_STEP_TIMEOUT = 30_000; // 30 seconds

/**
 * Execute a command workflow
 * 
 * Each step is traced as a child span in Langfuse.
 * Tool steps use ToolResult pattern (no throwing).
 * 
 * @see Story 6.2 - Commands Framework
 * @see project-context.md - ToolResult pattern
 */
export async function executeCommand(
  command: Command,
  context: ExecutionContext
): Promise<ToolResult<string>> {
  const { traceId } = context;
  
  const span = langfuse.span({
    name: 'commands.execute',
    traceId,
    input: { command: command.name, parameters: context.parameters },
  });
  
  logger.info({
    event: 'commands.start',
    traceId,
    command: command.name,
    parameters: context.parameters,
  });
  
  let previousResult: string | undefined;
  
  try {
    for (const step of command.steps) {
      const stepSpan = langfuse.span({
        name: `commands.step.${step.name}`,
        traceId,
        parentSpanId: span.id,
        input: { stepType: step.type, stepName: step.name },
      });
      
      const stepResult = await executeStep(step, {
        ...context,
        previousResult,
      });
      
      if (!stepResult.success) {
        stepSpan.end({ 
          output: { success: false, error: stepResult.error },
        });
        span.end({ output: { success: false, failedStep: step.name } });
        
        logger.warn({
          event: 'commands.step_failed',
          traceId,
          command: command.name,
          step: step.name,
          error: stepResult.error,
        });
        
        return stepResult;
      }
      
      previousResult = stepResult.data;
      stepSpan.end({ 
        output: { success: true, resultLength: previousResult?.length },
      });
    }
    
    span.end({ output: { success: true } });
    
    logger.info({
      event: 'commands.completed',
      traceId,
      command: command.name,
    });
    
    return { 
      success: true, 
      data: previousResult ?? 'Command completed.',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    span.end({
      metadata: { error: errorMsg },
    });
    
    logger.error({
      event: 'commands.error',
      traceId,
      command: command.name,
      error: errorMsg,
    });
    
    return {
      success: false,
      error: {
        code: 'COMMAND_EXECUTION_FAILED',
        message: errorMsg,
        retryable: false,
      },
    };
  }
}

async function executeStep(
  step: CommandStep,
  context: ExecutionContext
): Promise<ToolResult<string>> {
  const { traceId } = context;
  const interpolated = interpolateStep(step, context);
  const timeout = (step.timeout ?? 30) * 1000;
  
  switch (step.type) {
    case 'tool': {
      if (!interpolated.tool) {
        return {
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `Step ${step.name} missing tool`,
            retryable: false,
          },
        };
      }
      
      const handler = toolHandlers[interpolated.tool];
      if (!handler) {
        return {
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `Tool ${interpolated.tool} not found in registry`,
            retryable: false,
          },
        };
      }
      
      // Execute with timeout
      const result = await Promise.race([
        handler(interpolated.args ?? {}, traceId),
        new Promise<ToolResult<string>>((_, reject) =>
          setTimeout(() => reject(new Error('Step timeout')), timeout)
        ),
      ]);
      
      if (result.success) {
        return { 
          success: true, 
          data: typeof result.data === 'string' 
            ? result.data 
            : JSON.stringify(result.data),
        };
      }
      return result as ToolResult<string>;
    }
      
    case 'prompt': {
      // Return message for agent to stream
      let message = interpolated.message ?? '';
      if (step.include_previous_result && context.previousResult) {
        message += `\n\n${context.previousResult}`;
      }
      return { success: true, data: message };
    }
      
    default:
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: `Unknown step type: ${step.type}`,
          retryable: false,
        },
      };
  }
}

function interpolateStep(
  step: CommandStep,
  context: ExecutionContext
): CommandStep {
  const { parameters, previousResult } = context;
  
  const interpolate = (str: string): string => {
    let result = str;
    for (const [key, value] of Object.entries(parameters)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    if (previousResult) {
      result = result.replace(/\{previous_result\}/g, previousResult);
    }
    // Handle channel_id and thread_ts from context
    if (context.channelId) {
      result = result.replace(/\{channel_id\}/g, context.channelId);
    }
    if (context.threadTs) {
      result = result.replace(/\{thread_ts\}/g, context.threadTs);
    }
    return result;
  };
  
  return {
    ...step,
    message: step.message ? interpolate(step.message) : undefined,
    args: step.args
      ? Object.fromEntries(
          Object.entries(step.args).map(([k, v]) => [k, interpolate(v)])
        )
      : undefined,
  };
}
```

### Integration with Agent Loop

```typescript
// In src/agent/loop.ts (Story 2.2)
import { detectCommand } from '../commands/detector.js';
import { executeCommand } from '../commands/executor.js';

// At the start of message handling:
export async function handleMessage(
  message: string,
  channelId: string,
  threadTs: string,
  traceId: string,
  streamer: ResponseStreamer
): Promise<void> {
  // Check for command match first
  const commandMatch = await detectCommand(message, traceId);
  
  if (commandMatch) {
    const result = await executeCommand(commandMatch.command, {
      parameters: commandMatch.parameters,
      traceId,
      channelId,
      threadTs,
    });
    
    if (result.success) {
      // Stream the result to user
      await streamer.append(result.data);
      await streamer.complete();
    } else {
      // Handle error with user-friendly message
      await streamer.append(
        `⚠️ Command failed: ${result.error.message}\n\nTry rephrasing or ask me directly.`
      );
      await streamer.complete();
    }
    return;
  }
  
  // Otherwise, proceed with normal agent loop...
}
```

### Package Dependencies

Per architecture.md:

```json
{
  "yaml": "^2.3.4"
}
```

### Example Command: Summarize Thread

```yaml
# .orion/commands/summarize-thread.yaml
name: summarize-thread
description: Summarize a Slack thread
version: 1.0.0

triggers:
  - "summarize this thread"
  - "summarize thread"
  - "tldr"

parameters: {}

steps:
  - name: get_thread
    type: tool
    tool: slack__get_thread_history
    args:
      channel: "{channel_id}"
      thread_ts: "{thread_ts}"
    timeout: 30
      
  - name: summarize
    type: prompt
    message: "Here's a summary of the thread:"
    include_previous_result: true
```

### Dependencies (Story Prerequisites)

| Dependency | Story | What It Provides |
|------------|-------|------------------|
| Tool Registry | 3.2 | `toolHandlers` map for step execution |
| Agent Loop | 2.2 | Integration point for command detection |
| Response Streaming | 1.5 | `ResponseStreamer` for output |
| Langfuse | 1.2 | `langfuse.span()` with parent/child |
| Logger | 1.1 | Structured logging with traceId |
| ToolResult types | 1.1 | `ToolResult<T>` pattern from `src/types/tools.ts` |

### Success Metrics

| Metric | Target |
|--------|--------|
| Command detection accuracy | >95% |
| Command load time | <500ms |
| Step execution success | >98% |
| Trace parent/child accuracy | 100% |

### Anti-Patterns to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| `**bold**` in Slack | `*bold*` (Slack mrkdwn) |
| Log without traceId | `logger.info({ event: '...', traceId, ... })` |
| `throw new Error()` in steps | Return `{ success: false, error: {...} }` |
| `import { executeTool }` | Use `toolHandlers[toolName]` from registry |
| Ignore step timeout | Use `Promise.race()` with timeout |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 6 |
| 2025-12-22 | Validation review: Fixed Slack mrkdwn, added traceId, fixed tool import, added ToolResult pattern, added step timeout, fixed Langfuse span API |
