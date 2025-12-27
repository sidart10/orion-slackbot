# Story 5.1: Memory Tool Handler (GCS Backend)

Status: ready-for-dev

## Story

As an **agent**,
I want to persist memories to durable storage via the Anthropic Memory Tool pattern,
So that I can remember context across sessions and Cloud Run restarts.

## Acceptance Criteria

1. **Given** Claude calls the `memory` tool with `view` command, **When** executed, **Then** the specified path is read from GCS and returned

2. **Given** Claude calls the `memory` tool with `create` command, **When** executed, **Then** a new file is written to GCS at the specified path

3. **Given** Claude calls the `memory` tool with `update` command, **When** executed, **Then** the existing file at the path is replaced in GCS

4. **Given** Claude calls the `memory` tool with `delete` command, **When** executed, **Then** the file at the path is removed from GCS

5. **Given** a memory operation, **When** the path doesn't start with `/memories/`, **Then** an error is returned (path validation)

6. **Given** any memory operation, **When** complete, **Then** a Langfuse span captures the operation, path, and success/failure

7. **Given** the `context-management-2025-06-27` beta header, **When** Claude starts a task, **Then** Claude automatically checks `/memories` for relevant context

## Tasks / Subtasks

- [ ] **Task 1: Register Memory Tool** (AC: #7)
  - [ ] Add `'memory'` to `TOOL_NAMES` in `src/tools/registry.ts`
  - [ ] Register handler in `toolHandlers` record
  - [ ] Include in Claude's tools array

- [ ] **Task 2: Create GCS Storage Layer** (AC: #1, #2, #3, #4)
  - [ ] Create `src/tools/memory/storage.ts`
  - [ ] Implement `readFile()`, `writeFile()`, `deleteFile()`, `listFiles()`
  - [ ] Accept bucket as parameter (no config import)
  - [ ] Use bucket from `GCS_MEMORIES_BUCKET` env var
  - [ ] Handle GCS errors with retryable flag

- [ ] **Task 3: Create Memory Handler** (AC: #1, #2, #3, #4)
  - [ ] Create `src/tools/memory/handler.ts`
  - [ ] Implement `handleMemoryTool()` returning `ToolResult<MemoryData>`
  - [ ] Handle `view` command → GCS read
  - [ ] Handle `create` command → GCS write
  - [ ] Handle `update` command → GCS overwrite
  - [ ] Handle `delete` command → GCS delete

- [ ] **Task 4: Path Validation** (AC: #5)
  - [ ] Inline basic validation (full validation in Story 5.2)
  - [ ] Validate paths start with `/memories/`
  - [ ] Reject paths containing `../`

- [ ] **Task 5: Observability** (AC: #6)
  - [ ] Create Langfuse span per operation: `tool.memory.{command}`
  - [ ] Log command, path, success/failure, duration
  - [ ] Include traceId in all logs

- [ ] **Task 6: Verification**
  - [ ] Create a memory file via tool
  - [ ] View the created file
  - [ ] Update the file
  - [ ] Delete the file
  - [ ] Verify all operations in GCS console
  - [ ] Check Langfuse spans

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR44 | prd.md | System maintains persistent memory via Memory Tool pattern with GCS backend |
| AR29-31 | architecture.md | Anthropic Memory Tool → GCS handler pattern |
| ToolResult | architecture.md | ALL tool handlers return `ToolResult<T>` type |
| TOOL_NAMES | architecture.md | ALL tools registered in `TOOL_NAMES` registry |
| Span Naming | project-context.md | Format: `{component}.{operation}` |

### File Locations

```
src/tools/
├── registry.ts             # Add 'memory' to TOOL_NAMES
└── memory/
    ├── handler.ts          # Memory tool handler
    ├── handler.test.ts
    ├── storage.ts          # GCS client wrapper
    └── storage.test.ts
```

### Tool Registry Integration (MANDATORY)

```typescript
// src/tools/registry.ts — ADD 'memory' to existing registry
export const TOOL_NAMES = [
  'memory',
  // ... other tools
] as const;

export type ToolName = typeof TOOL_NAMES[number];

// Register handler
import { handleMemoryTool } from './memory/handler.js';

export const toolHandlers: Record<ToolName, ToolHandler> = {
  memory: handleMemoryTool,
  // ... other handlers
};
```

### Memory Handler Implementation

```typescript
// src/tools/memory/handler.ts
import { readFile, writeFile, deleteFile, listFiles } from './storage.js';
import { langfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import type { ToolResult, ToolError } from '../../types/tools.js';

export interface MemoryToolInput {
  command: 'view' | 'create' | 'update' | 'delete';
  path: string;
  content?: string;
}

export interface MemoryData {
  content: string;
  path: string;
}

/**
 * Handle Anthropic Memory Tool calls
 * 
 * @see FR44 - Persistent memory via Memory Tool pattern
 * @see AR29-31 - Memory Tool → GCS handler
 */
export async function handleMemoryTool(
  input: MemoryToolInput,
  context: { traceId: string; bucket: string }
): Promise<ToolResult<MemoryData>> {
  const spanName = `tool.memory.${input.command}`;
  const span = langfuse.span({
    name: spanName,
    traceId: context.traceId,
    input: { command: input.command, path: input.path },
  });
  
  const startTime = Date.now();
  
  try {
    // Basic path validation (full validation in Story 5.2)
    if (!input.path.startsWith('/memories/')) {
      return {
        success: false,
        error: {
          code: 'MEMORY_NOT_FOUND',
          message: 'Path must start with /memories/',
          retryable: false,
        },
      };
    }
    
    if (input.path.includes('..')) {
      return {
        success: false,
        error: {
          code: 'MEMORY_WRITE_FAILED',
          message: 'Path traversal not allowed',
          retryable: false,
        },
      };
    }
    
    const gcsPath = input.path.replace('/memories/', '');
    let resultContent: string;
    
    switch (input.command) {
      case 'view':
        if (input.path.endsWith('/')) {
          const files = await listFiles(context.bucket, gcsPath);
          resultContent = files.join('\n');
        } else {
          resultContent = await readFile(context.bucket, gcsPath);
        }
        break;
        
      case 'create':
      case 'update':
        if (!input.content) {
          return {
            success: false,
            error: {
              code: 'MEMORY_WRITE_FAILED',
              message: 'Content required for create/update',
              retryable: false,
            },
          };
        }
        await writeFile(context.bucket, gcsPath, input.content);
        resultContent = `File ${input.command}d at ${input.path}`;
        break;
        
      case 'delete':
        await deleteFile(context.bucket, gcsPath);
        resultContent = `File deleted at ${input.path}`;
        break;
        
      default:
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Unknown command: ${input.command}`,
            retryable: false,
          },
        };
    }
    
    const duration = Date.now() - startTime;
    
    span.end({
      output: { success: true },
      metadata: { durationMs: duration },
    });
    
    logger.info({
      event: 'tool.memory.success',
      traceId: context.traceId,
      command: input.command,
      path: input.path,
      durationMs: duration,
    });
    
    return {
      success: true,
      data: { content: resultContent, path: input.path },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRetryable = isGcsRetryable(error);
    const errorCode = errorMessage.includes('not found') 
      ? 'MEMORY_NOT_FOUND' 
      : 'MEMORY_WRITE_FAILED';
    
    span.end({
      metadata: { success: false, error: errorMessage },
    });
    
    logger.error({
      event: 'tool.memory.failed',
      traceId: context.traceId,
      command: input.command,
      path: input.path,
      error: errorMessage,
    });
    
    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        retryable: isRetryable,
      },
    };
  }
}

function isGcsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    // GCS 503 Service Unavailable is retryable
    return error.message.includes('503') || error.message.includes('UNAVAILABLE');
  }
  return false;
}
```

### GCS Storage Implementation

```typescript
// src/tools/memory/storage.ts
import { Storage, Bucket } from '@google-cloud/storage';

const storage = new Storage();
const bucketCache = new Map<string, Bucket>();

function getBucket(bucketName: string): Bucket {
  if (!bucketCache.has(bucketName)) {
    bucketCache.set(bucketName, storage.bucket(bucketName));
  }
  return bucketCache.get(bucketName)!;
}

export async function readFile(bucketName: string, path: string): Promise<string> {
  const bucket = getBucket(bucketName);
  const file = bucket.file(path);
  const [exists] = await file.exists();
  
  if (!exists) {
    throw new Error(`File not found: ${path}`);
  }
  
  const [content] = await file.download();
  return content.toString('utf-8');
}

export async function writeFile(bucketName: string, path: string, content: string): Promise<void> {
  const bucket = getBucket(bucketName);
  const file = bucket.file(path);
  await file.save(content, {
    contentType: 'text/plain',
    metadata: { cacheControl: 'no-cache' },
  });
}

export async function deleteFile(bucketName: string, path: string): Promise<void> {
  const bucket = getBucket(bucketName);
  const file = bucket.file(path);
  const [exists] = await file.exists();
  
  if (!exists) {
    throw new Error(`File not found: ${path}`);
  }
  
  await file.delete();
}

export async function listFiles(bucketName: string, prefix: string): Promise<string[]> {
  const bucket = getBucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  return files.map((f) => `/memories/${f.name}`);
}
```

### Memory Tool Definition for Claude

```typescript
// Tool definition to include in Claude's tools array
export const memoryToolDefinition = {
  name: 'memory',
  description: `Access persistent memory storage.

Operations:
- view: Read a file or list a directory (path ending with /)
- create: Create a new memory file
- update: Update an existing memory file  
- delete: Remove a memory file

Paths must start with /memories/ and follow:
- /memories/global/ - Shared learnings
- /memories/users/{userId}/ - User preferences
- /memories/sessions/{threadTs}/ - Session context`,
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: ['view', 'create', 'update', 'delete'],
      },
      path: {
        type: 'string',
        description: 'Path starting with /memories/',
      },
      content: {
        type: 'string',
        description: 'Content for create/update',
      },
    },
    required: ['command', 'path'],
  },
};
```

### Beta Header for Context Management

```typescript
// In agent loop when calling Claude
const response = await anthropic.messages.create({
  model: config.anthropic.model,
  messages,
  tools: [...tools, memoryToolDefinition],
  betas: ['context-management-2025-06-27'],
});
```

### Environment Variables

```bash
GCS_MEMORIES_BUCKET=orion-memories
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Package Dependencies

```json
{
  "@google-cloud/storage": "^7.7.0"
}
```

### Dependencies

- Story 5.2 (Path Builders) — Full path validation (basic validation inline here)
- Story 1.2 (Langfuse) — Observability

### Success Metrics

| Metric | Target |
|--------|--------|
| Memory operation latency | <500ms |
| Operation success rate | >99% |
| Storage reliability | 99.9% (GCS SLA) |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 5 |
| 2025-12-22 | Aligned with ToolResult pattern, TOOL_NAMES registry, span naming |
