# Story 5.2: Memory Scopes & Path Builders

Status: ready-for-dev

## Story

As a **developer**,
I want type-safe path builders for memory scopes,
So that memory paths are consistent and typo-proof across the codebase.

## Acceptance Criteria

1. **Given** a global memory need, **When** using `Memory.global()`, **Then** a valid `/memories/global/` path is generated

2. **Given** a user-specific memory need, **When** using `Memory.user(userId)`, **Then** a valid `/memories/users/{userId}/` path is generated

3. **Given** a session-specific memory need, **When** using `Memory.session(threadTs)`, **Then** a valid `/memories/sessions/{threadTs}/` path is generated

4. **Given** a raw string path, **When** passed to memory functions, **Then** TypeScript compile error (branded type enforcement)

5. **Given** any memory path, **When** validated, **Then** path traversal attacks (`../`) are rejected

6. **Given** the memory structure, **When** Claude checks `/memories/`, **Then** all scopes are organized correctly in GCS

## Tasks / Subtasks

- [ ] **Task 1: Create Branded MemoryPath Type** (AC: #4)
  - [ ] Create `src/tools/memory/paths.ts`
  - [ ] Define `MemoryPath` branded type (object pattern per architecture)
  - [ ] Ensure raw strings can't be used as paths
  - [ ] Export type for use in handlers

- [ ] **Task 2: Implement Path Builders** (AC: #1, #2, #3)
  - [ ] Implement `Memory.global(file)` builder
  - [ ] Implement `Memory.user(userId, file)` builder
  - [ ] Implement `Memory.session(threadTs, file)` builder
  - [ ] Implement `Memory.list.*` for directory listing
  - [ ] All builders return `MemoryPath` type

- [ ] **Task 3: Path Validation** (AC: #5)
  - [ ] Implement `validateMemoryPath()` function
  - [ ] Reject paths not starting with `/memories/`
  - [ ] Reject paths containing `../`
  - [ ] Validate file extensions (`.json`, `.md`, `.txt`, `.yaml` only)
  - [ ] Enforce max file size constant (100KB)

- [ ] **Task 4: Input Validation Helpers**
  - [ ] Validate Slack user IDs: `/^[UW][A-Z0-9]+$/`
  - [ ] Validate thread timestamps: `/^\d+\.\d+$/`
  - [ ] Sanitize thread_ts for GCS paths

- [ ] **Task 5: Verification**
  - [ ] Test path builders generate correct paths
  - [ ] Test branded type prevents raw strings at compile time
  - [ ] Test validation rejects malicious paths
  - [ ] Test paths work with GCS handler

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR45 | prd.md | Memory in three scopes: global, user-level, session-level |
| MemoryPath | architecture.md | `{ __brand: 'MemoryPath'; path: string }` object pattern |
| Extensions | project-context.md | Allowed: `.json`, `.md`, `.txt`, `.yaml` only |
| Max Size | project-context.md | 100KB max per memory file |

### File Locations

```
src/tools/memory/
├── paths.ts            # Path builders & validation
├── paths.test.ts
└── handler.ts          # (from 5.1)
```

### Branded MemoryPath Type (MUST MATCH ARCHITECTURE)

```typescript
// src/tools/memory/paths.ts

/**
 * Branded type for memory paths — object pattern per architecture.md
 * 
 * Prevents raw strings from being used as memory paths.
 * All paths must be created via Memory.* builders.
 * 
 * @see architecture.md - Implementation Patterns
 */
export type MemoryPath = {
  readonly __brand: 'MemoryPath';
  readonly path: string;
};

function createMemoryPath(path: string): MemoryPath {
  return { __brand: 'MemoryPath', path };
}

/** Extract raw path string from MemoryPath */
export function getPath(memoryPath: MemoryPath): string {
  return memoryPath.path;
}
```

### Constants

```typescript
// src/tools/memory/paths.ts

/** Max file size for memory files (100KB) */
export const MAX_MEMORY_FILE_SIZE = 100 * 1024;

/** Allowed file extensions for memory files */
export const ALLOWED_EXTENSIONS = ['.json', '.md', '.txt', '.yaml'] as const;

export type AllowedExtension = typeof ALLOWED_EXTENSIONS[number];
```

### Memory Path Builders

```typescript
// src/tools/memory/paths.ts

/**
 * Memory path builders — type-safe construction
 * 
 * Three scopes:
 * - global: Shared learnings across all users
 * - user: Per-user preferences and history
 * - session: Per-thread conversation context
 * 
 * @see FR45 - Memory in three scopes
 */
export const Memory = {
  /**
   * Global memory scope — shared across all users
   */
  global: (file: string): MemoryPath => {
    validateFileName(file);
    return createMemoryPath(`/memories/global/${file}`);
  },
  
  /**
   * User memory scope — per Slack user
   */
  user: (userId: string, file: string): MemoryPath => {
    validateUserId(userId);
    validateFileName(file);
    return createMemoryPath(`/memories/users/${userId}/${file}`);
  },
  
  /**
   * Session memory scope — per Slack thread
   */
  session: (threadTs: string, file: string): MemoryPath => {
    validateThreadTs(threadTs);
    validateFileName(file);
    const sanitizedTs = sanitizeThreadTs(threadTs);
    return createMemoryPath(`/memories/sessions/${sanitizedTs}/${file}`);
  },
  
  /** List directory paths */
  list: {
    global: (): MemoryPath => createMemoryPath('/memories/global/'),
    user: (userId: string): MemoryPath => {
      validateUserId(userId);
      return createMemoryPath(`/memories/users/${userId}/`);
    },
    session: (threadTs: string): MemoryPath => {
      validateThreadTs(threadTs);
      const sanitizedTs = sanitizeThreadTs(threadTs);
      return createMemoryPath(`/memories/sessions/${sanitizedTs}/`);
    },
    all: (): MemoryPath => createMemoryPath('/memories/'),
  },
} as const;
```

### Validation Functions

```typescript
// src/tools/memory/paths.ts
import * as path from 'path';

function validateFileName(file: string): void {
  if (!file) {
    throw new Error('File name required');
  }
  if (file.includes('/') || file.includes('..')) {
    throw new Error(`Invalid file name: ${file}`);
  }
  
  const ext = path.extname(file).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    throw new Error(`Invalid extension: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
}

function validateUserId(userId: string): void {
  // Slack user IDs start with U or W (Enterprise Grid)
  if (!userId || !/^[UW][A-Z0-9]+$/.test(userId)) {
    throw new Error(`Invalid Slack user ID: ${userId}`);
  }
}

function validateThreadTs(threadTs: string): void {
  // Slack timestamps: 1234567890.123456
  if (!threadTs || !/^\d+\.\d+$/.test(threadTs)) {
    throw new Error(`Invalid thread timestamp: ${threadTs}`);
  }
}

/** Sanitize thread_ts for GCS paths (replace . with -) */
function sanitizeThreadTs(threadTs: string): string {
  return threadTs.replace('.', '-');
}
```

### Path Validation for External Input

```typescript
// src/tools/memory/paths.ts

export interface PathValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a memory path from external input (e.g., Claude tool call)
 * 
 * For paths from Claude, not from our code.
 * Internal code should use Memory.* builders.
 */
export function validateMemoryPath(rawPath: string): PathValidation {
  if (!rawPath.startsWith('/memories/')) {
    return { valid: false, error: 'Path must start with /memories/' };
  }
  
  if (rawPath.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }
  
  if (!/^[a-zA-Z0-9\/_.-]+$/.test(rawPath)) {
    return { valid: false, error: 'Path contains invalid characters' };
  }
  
  // Must be within a valid scope (unless root listing)
  const validScopes = ['/memories/global/', '/memories/users/', '/memories/sessions/'];
  const isValidScope = validScopes.some((scope) => rawPath.startsWith(scope));
  
  if (!isValidScope && rawPath !== '/memories/' && rawPath !== '/memories') {
    return { valid: false, error: 'Path must be within global/, users/, or sessions/ scope' };
  }
  
  // Validate extension if it's a file (not directory)
  if (!rawPath.endsWith('/')) {
    const ext = path.extname(rawPath).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
      return { valid: false, error: `Invalid extension: ${ext}` };
    }
  }
  
  return { valid: true };
}
```

### Memory Structure in GCS

```
gs://orion-memories/
├── global/
│   ├── learnings.md
│   └── patterns.md
├── users/
│   └── U12345/
│       ├── preferences.json
│       └── history.md
└── sessions/
    └── 1234567890-123456/     # Note: sanitized (- not .)
        └── context.md
```

### Usage Examples

```typescript
import { Memory, getPath } from '../tools/memory/paths.js';
import { handleMemoryTool } from '../tools/memory/handler.js';

// Type-safe path construction
const userPath = Memory.user('U12345ABC', 'preferences.json');
const globalPath = Memory.global('learnings.md');
const sessionPath = Memory.session('1234567890.123456', 'context.md');

// Use in tool calls
await handleMemoryTool({
  command: 'view',
  path: getPath(userPath),  // Extract string for tool call
}, context);

// List user's memories
const listPath = Memory.list.user('U12345ABC');

// ❌ COMPILE ERROR - raw string not assignable to MemoryPath
// const badPath: MemoryPath = '/memories/global/foo';
```

### Dependencies

- Story 5.1 (Memory Handler) — Uses path validators

### Success Metrics

| Metric | Target |
|--------|--------|
| Type-safety coverage | 100% internal code |
| Path validation accuracy | 100% (no path traversal) |
| Developer ergonomics | Clean API, autocomplete works |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 5 |
| 2025-12-22 | Aligned branded type with architecture (object pattern), added extension/size validation |
