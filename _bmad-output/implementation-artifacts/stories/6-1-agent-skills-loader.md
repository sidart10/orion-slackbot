# Story 6.1: Agent Skills Loader with GKE Sandbox Integration

Status: review

## Story

As a **developer**,
I want to add new skills by creating SKILL.md files with optional executable scripts,
So that I can extend Orion's capabilities with both instructions AND programmatic tool orchestration.

## Acceptance Criteria

1. **Given** a `.skills/` directory with SKILL.md files, **When** the loader runs, **Then** all valid skills are discovered and parsed

2. **Given** a SKILL.md file, **When** parsed, **Then** the skill name, description, instructions, and optional tools are extracted

3. **Given** invalid or malformed SKILL.md, **When** parsing fails, **Then** an error is logged but other skills still load

4. **Given** loaded skills, **When** the agent initializes, **Then** skill instructions are available for system prompt injection

5. **Given** skills with tool definitions, **When** loaded, **Then** the tools are validated (snake_case) and added to the tool registry

6. **Given** skill loading, **When** complete, **Then** Langfuse captures which skills were loaded and any failures

7. **Given** the standard, **When** creating skills, **Then** the [Agent Skills open standard](https://agentskills.io) is followed

8. **Given** a skill with `scripts/` directory, **When** loaded, **Then** script paths are cataloged for GKE sandbox execution (see Story 6.2)

9. **Given** skill instructions that reference MCP tools, **When** executed, **Then** Claude calls MCP tools directly OR routes to `execute_code` for complex orchestration

## Tasks / Subtasks

- [x] **Task 1: Create Skills Loader** (AC: #1, #3)
  - [x] Create `src/skills/loader.ts`
  - [x] Implement `loadSkills(traceId: string)` function
  - [x] Discover SKILL.md files via glob in `.skills/` directory
  - [x] Handle missing directory gracefully (return empty array)
  - [x] Skip invalid skills with warning log (include traceId)

- [x] **Task 2: SKILL.md Parser** (AC: #2, #5)
  - [x] Create `src/skills/parser.ts`
  - [x] Parse markdown frontmatter (YAML) using `gray-matter`
  - [x] Extract name, description, version
  - [x] Extract instructions from markdown body
  - [x] Extract and validate tool definitions (snake_case names)

- [x] **Task 3: Skill Types** (AC: #2, #5)
  - [x] Create `src/skills/types.ts`
  - [x] Define `Skill` interface
  - [x] Define `SkillTool` interface
  - [x] Export type-safe structures

- [x] **Task 4: System Prompt Injection** (AC: #4)
  - [x] Create `src/skills/prompt-builder.ts`
  - [x] Format skills for system prompt
  - [x] Handle empty skills gracefully
  - [x] Export for use in `src/agent/context.ts`

- [x] **Task 5: Tool Registration** (AC: #5)
  - [x] Validate tool names match `/^[a-z][a-z0-9_]*$/`
  - [x] Register skill tools with tool registry (from Story 3.2)
  - [x] Prefix tools with skill name: `{skill_name}__{tool_name}`
  - [x] Handle tool execution routing via registry

- [x] **Task 6: Observability** (AC: #6)
  - [x] Log skills loaded at startup with traceId
  - [x] Create Langfuse span for loading process
  - [x] Track parse failures with skill path and error

- [x] **Task 7: Verification**
  - [x] Create sample skill in `.skills/example/SKILL.md`
  - [x] Verify skill is discovered and loaded
  - [x] Verify skill appears in system prompt
  - [x] Verify skill tool is registered
  - [x] Test malformed skill handling (invalid YAML, missing fields)

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR24 | prd.md | Add new Skills via Agent Skills open standard (SKILL.md in `.skills/`) |
| AR | architecture.md:113-120 | Custom skill loader reading SKILL.md files |
| Logging | project-context.md | ALL logs must include `traceId` |
| Tool names | project-context.md | Must be `snake_case` |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |
| Tool handlers | project-context.md:69-92 | MUST return `ToolResult<T>`, NEVER throw |
| Test naming | project-context.md:129 | Tests: `kebab-case.test.ts`, co-located |

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

### Skill Types (AUTHORITATIVE — Single Source of Truth)

```typescript
// src/skills/types.ts

/** Tool name validation pattern (snake_case) */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export interface Skill {
  name: string;
  description: string;
  version?: string;
  author?: string;
  instructions: string;       // Markdown content after frontmatter
  tools?: SkillTool[];
  filePath: string;           // For debugging/logging
  
  // GKE Sandbox integration (Story 6.1 catalogs, Story 6.2 executes)
  scripts?: SkillScript[];    // Discovered from scripts/ directory
  hasExecutableScripts: boolean;
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
  items?: string;   // For arrays
  enum?: string[];  // For enums
}

export interface SkillScript {
  name: string;           // e.g., "search_and_aggregate.py"
  path: string;           // Full path for GKE execution
  requirements?: string;  // Path to requirements.txt if present
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

**CRITICAL:** Skill tools are registered **dynamically** at runtime. They do NOT get added to the static `TOOL_NAMES` const array. This is intentional—skill tools are discovered at startup, not compile time.

**Tool Naming Convention:** `{skill_name}__{tool_name}` (double underscore separator)
- Example: `deep_research__initiate_research`
- Allows routing: parse on `__` to identify skill vs core tools

**Handler Pattern (MANDATORY):** All skill tool handlers MUST return `ToolResult<T>`:

```typescript
// src/skills/tool-handler.ts
import type { ToolResult, ToolError } from '../types/tools.js';

/**
 * Execute a skill tool - NEVER throws, always returns ToolResult
 */
export async function executeSkillTool(
  toolName: string,
  input: unknown,
  traceId: string
): Promise<ToolResult<unknown>> {
  try {
    // Parse skill name from tool: "skill_name__tool_name"
    const [skillName, localToolName] = toolName.split('__');
    
    // Route to appropriate skill handler
    const result = await routeToSkill(skillName, localToolName, input, traceId);
    return { success: true, data: result };
  } catch (e) {
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: e instanceof Error ? e.message : String(e),
        retryable: false,
      },
    };
  }
}
```

**Registration:**

```typescript
// In src/skills/loader.ts
import { registerDynamicTool } from '../tools/registry.js';
import type { ToolDefinition } from '../tools/registry.js';

export function registerSkillTools(skills: Skill[], traceId: string): void {
  for (const skill of skills) {
    if (!skill.tools) continue;
    
    for (const tool of skill.tools) {
      const fullName = `${skill.name}__${tool.name}`;
      
      // Use registerDynamicTool (not registerTool) for runtime additions
      registerDynamicTool({
        name: fullName,
        description: `[${skill.name}] ${tool.description}`,
        input_schema: {
          type: 'object',
          properties: tool.parameters,
          required: Object.entries(tool.parameters)
            .filter(([, v]) => (v as { required?: boolean }).required)
            .map(([k]) => k),
        },
      });
      
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

**Registry Update Required (Story 3.2):** Add `registerDynamicTool()` function that:
- Accepts tools at runtime (not compile-time checked)
- Adds to handler map without TOOL_NAMES validation
- Supports removal when skills are reloaded

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

### Startup Order & Validation

**Startup Sequence:**
1. `instrumentation.ts` loads first (OTel)
2. `config/environment.ts` validates env vars
3. Skills load **lazily** on first `getSkills(traceId)` call
4. Skills should NOT block app startup — failures return empty array

**Validation Strategy:**
- Parse SKILL.md → validate required fields (`name`, `description`)
- Invalid skills: log warning with `traceId`, skip (don't cache)
- Valid skills: cache in memory for process lifetime
- Tool name validation: MUST match `/^[a-z][a-z0-9_]*$/`

**Config Access:** Skills loader is a utility, not an entry point. If config values are needed, pass them as parameters—do NOT import `config` directly in `loader.ts`.

### Dependencies (Story Prerequisites)

| Dependency | Story | What It Provides |
|------------|-------|------------------|
| Tool Registry | 3.2 | `registerDynamicTool()` function for runtime skill tool registration |
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
| `throw new Error()` in skill tool handler | Return `{ success: false, error: { code, message, retryable } }` |
| `import from './parser'` without extension | `import from './parser.js'` (MANDATORY) |
| Cache invalid skills | Skip with warning, don't add to cache |
| Block startup on skill load | Load lazily on first request |

## GKE Sandbox Integration

> **Scope Boundary:** This story (6.1) **discovers and catalogs** skill scripts. Story 6.2 **executes** them in GKE Sandbox. Do NOT implement execution logic here—only discovery.

### Why GKE Sandbox?

Anthropic's code execution container has **no network access** and **cannot call MCP tools programmatically**. For complex Skills that need to:

- Call multiple MCP tools in loops/conditionals
- Process results programmatically
- Call external APIs
- Use custom Python packages

...we route execution through GKE Agent Sandbox (deployed in Phase 1).

### Skill Script Discovery

Skills can include executable scripts in a `scripts/` subdirectory:

```
.skills/
└── confluence-research/
    ├── SKILL.md
    └── scripts/
        ├── search_and_aggregate.py
        └── requirements.txt
```

The loader catalogs these scripts and makes them available to the `execute_code` tool (Story 6.2).

### Skill Types

| Type | Detection | Execution |
|------|-----------|-----------|
| **Instruction-only** | No `scripts/` dir | Claude reads instructions, calls tools directly |
| **Script-enabled** | Has `scripts/` dir | Claude can use `execute_code` to run scripts in GKE |

### Skill Interface Reference

See **Skill Types** section above for the authoritative `Skill` and `SkillScript` interfaces. The `scripts` and `hasExecutableScripts` fields are set by the loader during skill discovery.

### Script Discovery Implementation

```typescript
// src/skills/loader.ts - add to loadSkills()

async function discoverScripts(skillDir: string): Promise<SkillScript[]> {
  const scriptsDir = path.join(skillDir, 'scripts');
  
  if (!existsSync(scriptsDir)) {
    return [];
  }
  
  const pyFiles = await glob('*.py', { cwd: scriptsDir });
  const requirementsPath = path.join(scriptsDir, 'requirements.txt');
  const hasRequirements = existsSync(requirementsPath);
  
  return pyFiles.map(file => ({
    name: file,
    path: path.join(scriptsDir, file),
    requirements: hasRequirements ? requirementsPath : undefined,
  }));
}
```

### Relationship to Story 6.2

This story (6.1) **discovers and catalogs** skill scripts.
Story 6.2 (`execute_code` tool) **executes** them in GKE Sandbox.

```
Story 6.1: loadSkills() → { ..., scripts: [...], hasExecutableScripts: true }
                                      │
                                      ▼
Story 6.2: execute_code({ script: "skill:confluence-research/search.py", args: {...} })
                                      │
                                      ▼
           GKE Sandbox → Execute script → Return results
```

## Dev Agent Record

### Implementation Plan

Implemented Agent Skills Loader following the story tasks in order:
1. Created types.ts with Skill, SkillTool, SkillScript interfaces and TOOL_NAME_PATTERN
2. Created parser.ts using gray-matter to parse SKILL.md frontmatter + markdown body
3. Created loader.ts with loadSkills(), loadSkillsWithResult(), getSkills(), reloadSkills() for skill discovery
4. Created prompt-builder.ts for system prompt injection
5. Added registerDynamicTool(), removeSkillTools(), clearSkillTools(), getSkillTool() to registry.ts for runtime skill tool registration
6. Created tool-handler.ts with executeSkillTool() (returns not-implemented until Story 6.2)
7. Created index.ts for module re-exports
8. Created .skills/example/SKILL.md sample skill
9. Added comprehensive test coverage (42 skills tests + 8 registry skill tests = 50 tests passing)

### Completion Notes

- All ACs verified via tests
- Skill loading is lazy (first call to getSkills)
- Invalid skills logged but don't block valid ones
- Script discovery implemented for GKE Sandbox (Story 6.2)
- No lint errors introduced
- Pre-existing test failures in memory/vercel-bundling unrelated to this story

## File List

### New Files

- src/skills/types.ts
- src/skills/types.test.ts
- src/skills/parser.ts
- src/skills/parser.test.ts
- src/skills/loader.ts
- src/skills/loader.test.ts
- src/skills/prompt-builder.ts
- src/skills/prompt-builder.test.ts
- src/skills/tool-handler.ts
- src/skills/tool-handler.test.ts
- src/skills/index.ts
- src/skills/integration.test.ts
- .skills/example/SKILL.md

### Pre-existing Files (not created by this story)

- .skills/summarize/SKILL.md (pre-existing skill, used to verify loader works with multiple skills)

### Modified Files

- src/tools/registry.ts (added skillTools map, registerDynamicTool, removeSkillTools, clearSkillTools, getSkillTool)
- src/tools/registry.test.ts (added skill tool registration tests)
- package.json (added gray-matter, glob dependencies)

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 6 |
| 2025-12-22 | Validation review: Added traceId to all logs, tool name validation, cache invalidation docs, fixed directory location |
| 2026-01-02 | Added GKE Sandbox integration, script discovery, updated Skill interface |
| 2026-01-02 | **Validation review (SM)**: Critical fixes: (1) Added ToolResult pattern requirement for skill tool handlers, (2) Clarified dynamic tool registration vs TOOL_NAMES registry, (3) Added ESM .js extension requirement, (4) Consolidated duplicate type definitions, (5) Added startup order & validation strategy, (6) Clarified GKE sandbox scope boundary (discovery only, not execution), (7) Enhanced anti-patterns table |
| 2026-01-03 | **Implementation complete**: All 7 tasks implemented with 50 tests passing (42 skills + 8 registry). Skills module created with loader, parser, prompt-builder, tool-handler. Registry extended with registerDynamicTool(). Sample skill created in .skills/example/ |
| 2026-01-03 | **Code review (AI)**: Fixed test count (55→50), documented pre-existing .skills/summarize/, added loadSkillsWithResult() to implementation plan. All ACs verified. No HIGH issues. |
