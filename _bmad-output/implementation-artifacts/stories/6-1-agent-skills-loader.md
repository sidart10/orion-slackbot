# Story 6.1: Agent Skills Loader

Status: ready-for-dev

## Story

As a **developer**,
I want to add new skills by creating SKILL.md files,
So that I can extend Orion's capabilities without changing code.

## Acceptance Criteria

1. **Given** a `.skills/` directory with SKILL.md files, **When** the loader runs, **Then** all valid skills are discovered and parsed

2. **Given** a SKILL.md file, **When** parsed, **Then** the skill name, description, instructions, and optional tools are extracted

3. **Given** invalid or malformed SKILL.md, **When** parsing fails, **Then** an error is logged but other skills still load

4. **Given** loaded skills, **When** the agent initializes, **Then** skill instructions are available for system prompt injection

5. **Given** skills with tool definitions, **When** loaded, **Then** the tools are validated (snake_case) and added to the tool registry

6. **Given** skill loading, **When** complete, **Then** Langfuse captures which skills were loaded and any failures

7. **Given** the standard, **When** creating skills, **Then** the [Agent Skills open standard](https://agentskills.io) is followed

## Tasks / Subtasks

- [ ] **Task 1: Create Skills Loader** (AC: #1, #3)
  - [ ] Create `src/skills/loader.ts`
  - [ ] Implement `loadSkills(traceId: string)` function
  - [ ] Discover SKILL.md files via glob in `.skills/` directory
  - [ ] Handle missing directory gracefully (return empty array)
  - [ ] Skip invalid skills with warning log (include traceId)

- [ ] **Task 2: SKILL.md Parser** (AC: #2, #5)
  - [ ] Create `src/skills/parser.ts`
  - [ ] Parse markdown frontmatter (YAML) using `gray-matter`
  - [ ] Extract name, description, version
  - [ ] Extract instructions from markdown body
  - [ ] Extract and validate tool definitions (snake_case names)

- [ ] **Task 3: Skill Types** (AC: #2, #5)
  - [ ] Create `src/skills/types.ts`
  - [ ] Define `Skill` interface
  - [ ] Define `SkillTool` interface
  - [ ] Export type-safe structures

- [ ] **Task 4: System Prompt Injection** (AC: #4)
  - [ ] Create `src/skills/prompt-builder.ts`
  - [ ] Format skills for system prompt
  - [ ] Handle empty skills gracefully
  - [ ] Export for use in `src/agent/context.ts`

- [ ] **Task 5: Tool Registration** (AC: #5)
  - [ ] Validate tool names match `/^[a-z][a-z0-9_]*$/`
  - [ ] Register skill tools with tool registry (from Story 3.2)
  - [ ] Prefix tools with skill name: `{skill_name}__{tool_name}`
  - [ ] Handle tool execution routing via registry

- [ ] **Task 6: Observability** (AC: #6)
  - [ ] Log skills loaded at startup with traceId
  - [ ] Create Langfuse span for loading process
  - [ ] Track parse failures with skill path and error

- [ ] **Task 7: Verification**
  - [ ] Create sample skill in `.skills/example/SKILL.md`
  - [ ] Verify skill is discovered and loaded
  - [ ] Verify skill appears in system prompt
  - [ ] Verify skill tool is registered
  - [ ] Test malformed skill handling (invalid YAML, missing fields)

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR24 | prd.md | Add new Skills via Agent Skills open standard (SKILL.md in `.skills/`) |
| AR | architecture.md:113-120 | Custom skill loader reading SKILL.md files |
| Logging | project-context.md | ALL logs must include `traceId` |
| Tool names | project-context.md | Must be `snake_case` |

### Canonical Skills Directory

**Use `.skills/` at project root** (per FR24 and architecture.md line 163).

```
.skills/                # Skills directory (file-based)
├── deep-research/
│   └── SKILL.md
├── slack-search/
│   └── SKILL.md
└── code-review/
    └── SKILL.md
```

### File Locations (src)

```
src/skills/
├── loader.ts           # Skill discovery & loading
├── loader.test.ts
├── parser.ts           # SKILL.md parser + validation
├── parser.test.ts
├── prompt-builder.ts   # System prompt injection
├── prompt-builder.test.ts
├── types.ts            # Skill types
└── index.ts            # Re-exports
```

### SKILL.md Format (Agent Skills Standard)

```markdown
---
name: deep-research
description: Conduct comprehensive research across multiple sources
version: 1.0.0
author: Orion Team
tools:
  - name: initiate_research
    description: Start a deep research task
    parameters:
      query:
        type: string
        description: The research topic or question
        required: true
      sources:
        type: array
        items: string
        description: Sources to search (slack, confluence, web)
---

# Deep Research Skill

You are a research specialist. When the user asks for deep research, comprehensive analysis, or investigation of a topic:

## Approach

1. **Clarify scope** - Confirm what sources to search
2. **Search in parallel** - Use subagents for each source
3. **Synthesize** - Combine findings into coherent summary
4. **Cite sources** - Always include references

## Guidelines

- Prioritize recent information
- Cross-reference multiple sources
- Note when sources conflict
- Provide confidence levels for findings
```

### Skill Types

```typescript
// src/skills/types.ts

/** Tool name validation pattern (snake_case) */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export interface Skill {
  name: string;
  description: string;
  version?: string;
  author?: string;
  instructions: string;  // Markdown content after frontmatter
  tools?: SkillTool[];
  filePath: string;      // For debugging
}

export interface SkillTool {
  name: string;
  description: string;
  parameters: Record<string, SkillToolParameter>;
}

export interface SkillToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  items?: string;  // For arrays
  enum?: string[]; // For enums
}
```

### Skills Loader Implementation

```typescript
// src/skills/loader.ts
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parseSkillMd } from './parser.js';
import { langfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import type { Skill } from './types.js';

const SKILLS_DIR = '.skills';

/**
 * Load all skills from the .skills directory
 * 
 * Discovers SKILL.md files, parses them, and returns validated skills.
 * Invalid skills are logged but don't prevent other skills from loading.
 * 
 * @param traceId - Required for log correlation
 * @see Story 6.1 - Agent Skills Loader
 */
export async function loadSkills(traceId: string): Promise<Skill[]> {
  const span = langfuse.span({ name: 'skills.load', traceId });
  const startTime = Date.now();
  
  try {
    // Handle missing directory gracefully
    if (!existsSync(SKILLS_DIR)) {
      logger.info({
        event: 'skills.directory_missing',
        traceId,
        path: SKILLS_DIR,
      });
      span.end({ output: { loaded: 0, reason: 'directory_missing' } });
      return [];
    }
    
    // Find all SKILL.md files
    const skillPaths = await glob(`${SKILLS_DIR}/*/SKILL.md`);
    
    logger.info({
      event: 'skills.discovery',
      traceId,
      found: skillPaths.length,
    });
    
    // Parse each skill file
    const results = await Promise.allSettled(
      skillPaths.map(async (path) => {
        const content = await readFile(path, 'utf-8');
        return parseSkillMd(content, path);
      })
    );
    
    // Collect successful parses
    const skills: Skill[] = [];
    const failures: Array<{ path: string; error: string }> = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        skills.push(result.value);
      } else {
        const errorMsg = result.reason?.message ?? String(result.reason);
        failures.push({ path: skillPaths[index], error: errorMsg });
        logger.warn({
          event: 'skills.parse_failed',
          traceId,
          path: skillPaths[index],
          error: errorMsg,
        });
      }
    });
    
    const duration = Date.now() - startTime;
    
    span.end({
      output: {
        loaded: skills.length,
        failed: failures.length,
        skillNames: skills.map((s) => s.name),
        failures,
      },
      metadata: { durationMs: duration },
    });
    
    logger.info({
      event: 'skills.loaded',
      traceId,
      loaded: skills.length,
      failed: failures.length,
      skillNames: skills.map((s) => s.name),
      durationMs: duration,
    });
    
    return skills;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    span.end({
      metadata: { error: errorMsg },
    });
    
    logger.error({
      event: 'skills.load_error',
      traceId,
      error: errorMsg,
    });
    
    // Return empty array - don't crash on skill loading failure
    return [];
  }
}

// Cache loaded skills (per-process)
let cachedSkills: Skill[] | null = null;

/**
 * Get cached skills or load them
 * 
 * Cache is invalidated by calling reloadSkills()
 */
export async function getSkills(traceId: string): Promise<Skill[]> {
  if (!cachedSkills) {
    cachedSkills = await loadSkills(traceId);
  }
  return cachedSkills;
}

/**
 * Invalidate skill cache
 * 
 * Call this when:
 * - Skills directory contents change (in dev with file watching)
 * - Admin requests skill reload
 * - On container restart (automatic - cache is in-memory)
 */
export function reloadSkills(): void {
  cachedSkills = null;
}
```

### SKILL.md Parser with Validation

```typescript
// src/skills/parser.ts
import matter from 'gray-matter';
import type { Skill, SkillTool } from './types.js';
import { TOOL_NAME_PATTERN } from './types.js';

/**
 * Parse a SKILL.md file into a Skill object
 * 
 * Validates:
 * - Required fields: name, description
 * - Tool names follow snake_case pattern
 * 
 * @throws Error if validation fails
 */
export function parseSkillMd(content: string, filePath: string): Skill {
  // Parse frontmatter
  const { data: frontmatter, content: instructions } = matter(content);
  
  // Validate required fields
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error('SKILL.md missing required field: name');
  }
  
  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    throw new Error('SKILL.md missing required field: description');
  }
  
  // Parse and validate tools if present
  const tools: SkillTool[] | undefined = frontmatter.tools?.map(
    (tool: Record<string, unknown>, index: number) => {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error(`Tool at index ${index} missing name`);
      }
      
      // Validate tool name is snake_case
      if (!TOOL_NAME_PATTERN.test(tool.name)) {
        throw new Error(
          `Tool name "${tool.name}" invalid. Must be snake_case (match ${TOOL_NAME_PATTERN})`
        );
      }
      
      return {
        name: tool.name,
        description: String(tool.description ?? ''),
        parameters: (tool.parameters as Record<string, unknown>) ?? {},
      };
    }
  );
  
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    version: frontmatter.version as string | undefined,
    author: frontmatter.author as string | undefined,
    instructions: instructions.trim(),
    tools,
    filePath,
  };
}
```

### System Prompt Builder

```typescript
// src/skills/prompt-builder.ts
import type { Skill } from './types.js';

/**
 * Build system prompt section from loaded skills
 * 
 * Returns empty string if no skills loaded.
 * Used by src/agent/context.ts when building system prompt.
 * 
 * @see Story 2.1 - Agent Loop (system prompt assembly)
 */
export function buildSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }
  
  const skillSections = skills.map((skill) => {
    return `## Skill: ${skill.name}

${skill.description}

${skill.instructions}`;
  });
  
  return `
# Available Skills

You have the following specialized skills available:

${skillSections.join('\n\n---\n\n')}
`;
}
```

### Integration with Agent Context

```typescript
// In src/agent/context.ts (Story 2.1)
import { getSkills } from '../skills/loader.js';
import { buildSkillsPrompt } from '../skills/prompt-builder.js';

const BASE_SYSTEM_PROMPT = `You are Orion, an AI assistant for enterprise users.
...base prompt...`;

export async function buildSystemPrompt(traceId: string): Promise<string> {
  const skills = await getSkills(traceId);
  const skillsSection = buildSkillsPrompt(skills);
  
  return `${BASE_SYSTEM_PROMPT}\n\n${skillsSection}`;
}
```

### Tool Registration (Integration with Story 3.2)

```typescript
// In src/skills/loader.ts - add after skill parsing
import { registerTool, type ToolDefinition } from '../tools/registry.js';

/**
 * Register skill tools with the tool registry
 * 
 * Tool names are prefixed: {skill_name}__{tool_name}
 * e.g., deep_research__initiate_research
 */
export function registerSkillTools(skills: Skill[], traceId: string): void {
  for (const skill of skills) {
    if (!skill.tools) continue;
    
    for (const tool of skill.tools) {
      const fullName = `${skill.name}__${tool.name}`;
      
      const definition: ToolDefinition = {
        name: fullName,
        description: `[${skill.name}] ${tool.description}`,
        input_schema: {
          type: 'object',
          properties: tool.parameters,
          required: Object.entries(tool.parameters)
            .filter(([, v]) => (v as { required?: boolean }).required)
            .map(([k]) => k),
        },
      };
      
      registerTool(definition);
      
      logger.debug({
        event: 'skills.tool_registered',
        traceId,
        skillName: skill.name,
        toolName: fullName,
      });
    }
  }
}
```

### Package Dependencies

Per architecture.md:

```json
{
  "gray-matter": "^4.0.3",
  "glob": "^10.3.10"
}
```

### Example Skill: Slack Search

```markdown
<!-- .skills/slack-search/SKILL.md -->
---
name: slack_search
description: Search Slack channels for relevant discussions
version: 1.0.0
---

# Slack Search Skill

When the user asks about past discussions, decisions, or context that might be in Slack:

## When to Use

- User asks "What did we decide about X?"
- User asks "Who knows about Y?"
- User wants context from past conversations

## Approach

1. Identify relevant channels
2. Use Slack search API
3. Summarize findings with links
4. Cite message authors and dates
```

### Dependencies (Story Prerequisites)

| Dependency | Story | What It Provides |
|------------|-------|------------------|
| Tool Registry | 3.2 | `registerTool()` function for skill tool registration |
| Agent Context | 2.1 | System prompt assembly that includes skills |
| Langfuse | 1.2 | `langfuse.span()` for observability |
| Logger | 1.1 | Structured logging with traceId |

### Success Metrics

| Metric | Target |
|--------|--------|
| Skill load time | <500ms |
| Parse success rate | >95% |
| Zero runtime failures | Skills don't crash agent |
| Tool name validation | 100% snake_case enforcement |

### Anti-Patterns to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| Log without traceId | `logger.info({ event: '...', traceId, ... })` |
| Use camelCase tool names | Use `snake_case` only |
| Throw on missing directory | Return empty array gracefully |
| Create `.orion/skills/` | Use `.skills/` at project root |

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 6 |
| 2025-12-22 | Validation review: Added traceId to all logs, tool name validation, cache invalidation docs, fixed directory location |
