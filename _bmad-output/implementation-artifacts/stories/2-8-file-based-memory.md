# Story 2.8: File-Based Memory

Status: ready-for-dev

## Story

As a **user**,
I want Orion to remember important information between sessions,
So that I don't have to re-explain context.

## Acceptance Criteria

1. **Given** the orion-context/ directory exists, **When** Orion identifies information worth remembering, **Then** it is saved to orion-context/ as a file

2. **Given** the gather phase executes, **When** searching for context, **Then** it searches orion-context/ for relevant memories

3. **Given** user preferences are identified, **When** they are saved, **Then** user preferences are stored in orion-context/user-preferences/

4. **Given** conversation summaries are created, **When** they are saved, **Then** conversation summaries are stored in orion-context/conversations/

5. **Given** knowledge is captured, **When** it is saved, **Then** knowledge is stored in orion-context/knowledge/

## Tasks / Subtasks

- [ ] **Task 1: Create Memory Layer** (AC: #1)
  - [ ] Create `src/memory/index.ts`
  - [ ] Implement `saveMemory()` function
  - [ ] Implement `searchMemory()` function
  - [ ] Define memory types (preference, conversation, knowledge)

- [ ] **Task 2: Implement File Operations** (AC: #1)
  - [ ] Create `src/memory/storage.ts`
  - [ ] Implement `writeMemoryFile()` function
  - [ ] Implement `readMemoryFile()` function
  - [ ] Use structured filenames (timestamp + type)

- [ ] **Task 3: Implement Memory Search** (AC: #2)
  - [ ] Create `searchOrionContext()` function
  - [ ] Search by keywords
  - [ ] Rank by relevance
  - [ ] Limit results

- [ ] **Task 4: Handle User Preferences** (AC: #3)
  - [ ] Define preference schema
  - [ ] Create per-user preference files
  - [ ] Load preferences at gather phase

- [ ] **Task 5: Handle Conversation Summaries** (AC: #4)
  - [ ] Generate summaries at thread end
  - [ ] Store with thread ID reference
  - [ ] Enable retrieval for context

- [ ] **Task 6: Handle Knowledge Storage** (AC: #5)
  - [ ] Define knowledge schema
  - [ ] Store domain-specific knowledge
  - [ ] Enable search retrieval

- [ ] **Task 7: Verification** (AC: all)
  - [ ] Save a user preference
  - [ ] Verify it's retrieved in later conversation
  - [ ] Save knowledge and search for it

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR31 | architecture.md | File-based persistent memory in orion-context/ |

### Directory Structure

```
orion-context/
├── conversations/           # Thread summaries
│   └── C123_1702848000.md   # {channel}_{timestamp}.md
├── user-preferences/        # Per-user preferences
│   └── U123.yaml            # {user_id}.yaml
└── knowledge/               # Domain knowledge
    └── audience-segments.md # Named knowledge files
```

### src/memory/index.ts

```typescript
export type MemoryType = 'conversation' | 'preference' | 'knowledge';

export interface Memory {
  type: MemoryType;
  key: string;
  content: string;
  metadata: {
    userId?: string;
    channelId?: string;
    createdAt: string;
    tags?: string[];
  };
}

export async function saveMemory(memory: Memory): Promise<void> {
  const path = getMemoryPath(memory);
  await writeFile(path, formatMemoryContent(memory));
}

/**
 * Search memory files using keyword matching.
 * Implementation: scan files in orion-context/, rank by keyword matches.
 */
export async function searchMemory(
  query: string,
  type?: MemoryType
): Promise<Memory[]> {
  const searchDir = type ? getTypeDirectory(type) : ORION_CONTEXT_ROOT;
  const files = await listMemoryFiles(searchDir);
  
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  const results: Array<{ memory: Memory; score: number }> = [];

  for (const file of files) {
    const memory = await parseMemoryFile(file);
    if (!memory) continue;
    
    const content = memory.content.toLowerCase();
    const score = keywords.reduce((acc, keyword) => {
      return acc + (content.includes(keyword) ? 1 : 0);
    }, 0);
    
    if (score > 0) {
      results.push({ memory, score });
    }
  }

  // Sort by relevance score, return top 10
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.memory);
}
```

### src/memory/storage.ts

```typescript
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter'; // For YAML frontmatter parsing
import type { Memory, MemoryType } from './index';

export const ORION_CONTEXT_ROOT = './orion-context';

const TYPE_DIRECTORIES: Record<MemoryType, string> = {
  conversation: 'conversations',
  preference: 'user-preferences',
  knowledge: 'knowledge',
};

export function getTypeDirectory(type: MemoryType): string {
  return join(ORION_CONTEXT_ROOT, TYPE_DIRECTORIES[type]);
}

export async function listMemoryFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries
      .filter(e => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.yaml')))
      .map(e => join(e.parentPath || dir, e.name));
  } catch {
    return []; // Directory may not exist yet
  }
}

export async function parseMemoryFile(filepath: string): Promise<Memory | null> {
  try {
    const content = await readFile(filepath, 'utf-8');
    
    if (filepath.endsWith('.yaml')) {
      // Parse YAML preference files
      const data = YAML.parse(content);
      return {
        type: 'preference',
        key: filepath,
        content: JSON.stringify(data),
        metadata: { createdAt: new Date().toISOString() },
      };
    }
    
    // Parse Markdown with frontmatter
    const { data: frontmatter, content: body } = matter(content);
    return {
      type: (frontmatter.type as MemoryType) || 'knowledge',
      key: filepath,
      content: body,
      metadata: {
        createdAt: frontmatter.createdAt || new Date().toISOString(),
        tags: frontmatter.tags,
        userId: frontmatter.userId,
        channelId: frontmatter.channelId,
      },
    };
  } catch {
    return null;
  }
}
```

### References

- [Source: _bmad-output/epics.md#Story 2.8] — Original story
- [Source: _bmad-output/architecture.md#Memory Architecture] — Memory decisions

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Completion Notes List

- File-based memory enables agentic search via Claude SDK
- **v1 uses keyword search**—embeddings can be added in v2 for semantic matching
- YAML for structured data (preferences), Markdown for prose (knowledge, conversations)
- `gray-matter` package parses Markdown frontmatter for metadata

### File List

Files to create:
- `src/memory/index.ts`
- `src/memory/storage.ts`

Files to modify:
- `src/agent/loop.ts` (integrate memory search in gather)

