# Story 6.1: Agent Skills Loader with GKE Sandbox Integration

Status: done
Completed: 2026-01-03

## Story

As a **developer**,
I want to add new skills by creating SKILL.md files with optional executable scripts,
So that I can extend Orion's capabilities with both instructions AND programmatic tool orchestration.

## Scope Boundary (Non-Negotiable)

- This story **discovers and catalogs** Skills from `.skills/` and exposes **metadata + tool definitions** to the runtime.
- This story does **not** execute skill scripts. Script execution in GKE Sandbox is **Story 6.2**.
- Skill **instructions** are **not** injected into the system prompt at startup; they are loaded **on-demand** (progressive disclosure).

## Current State vs Target State (Authoritative)

### Current State (Implemented)

- **Startup loading is metadata-only**: `getSkillMetadata(traceId)` loads frontmatter only (no instructions) and is cached per-process.
- **System prompt injects hint only**:
  - `src/slack/handlers/user-message.ts` injects `buildSkillsHint(await getSkillMetadata(traceId))`
  - `src/slack/handlers/app-mention.ts` injects `buildSkillsHint(await getSkillMetadata(traceId))`
- **Skill tools are routable**:
  - Skill tools are registered into `toolRegistry` (ensured in the agent loop before tool definitions are built).
  - Tool routing (`src/tools/router.ts`) routes registered skill tools and returns `TOOL_NOT_IMPLEMENTED` until Story 6.2.
- **On-demand SKILL.md reading is supported**: `execute_code` supports `skill_doc: "skill:skill_name"` to print the full SKILL.md content on demand.

### Target State (What this story must enforce)

- **Startup loads metadata only**: frontmatter fields + tool definitions + script catalog; no `instructions` loaded at startup.
- **System prompt injects hint only**: name + description + available tool names + instruction for on-demand loading.
- **Skill tools are usable in runtime**:
  - Tools are registered (eagerly or lazily per decision below) into `toolRegistry` with the `${skillName}__${toolName}` naming convention.
  - Tool routing executes skill tools when the registry says the tool is a skill tool (registry membership is the source of truth; conflicts are prevented at registration time).

## Acceptance Criteria

1. **Given** a `.skills/` directory with SKILL.md files, **When** the loader runs, **Then** all valid skills are discovered and their **metadata** is extracted

2. **Given** a SKILL.md file, **When** parsed for startup, **Then** only frontmatter metadata is loaded (name, description, version/author, tools) and **instructions are not loaded**

3. **Given** invalid or malformed SKILL.md, **When** parsing fails, **Then** an error is logged but other skills still load

4. **Given** loaded skills, **When** the agent prepares the system prompt, **Then** only a **skills hint** (name + description + available skill tools) is injected, plus instructions for how to load full SKILL.md on-demand

5. **Given** skills with tool definitions, **When** loaded, **Then** the tools are validated (snake_case) and added to the tool registry

6. **Given** skill loading, **When** complete, **Then** Langfuse captures which skills were loaded and any failures

7. **Given** the standard, **When** creating skills, **Then** the [Agent Skills open standard](https://agentskills.io) is followed

8. **Given** a skill with `scripts/` directory, **When** loaded, **Then** script paths are cataloged for GKE sandbox execution (see Story 6.2)

9. **Given** a user request matches a skill, **When** that skill is invoked, **Then** the agent loads the full SKILL.md instructions on-demand (via `execute_code`) and follows them

10. **Given** skill instructions that require loops/conditionals or script execution, **When** executed, **Then** the agent routes orchestration through `execute_code` in GKE Sandbox (Story 6.2)

## Tasks / Subtasks

### Refactor Tasks (Required to Close Story)

- [ ] **Task 1: Metadata-Only Loading (Progressive Disclosure Level 1)** (AC: #1-4, #6, #8)
  - [ ] Add `SkillMetadata` type and update loader to return metadata-only at startup
  - [ ] Loader must not load `instructions` into memory during startup metadata load
  - [ ] Add `skillPath` to metadata for on-demand loading
  - [ ] Preserve `scripts` discovery and `hasExecutableScripts`

- [ ] **Task 2: On-Demand Instruction Loading (Progressive Disclosure Level 2)** (AC: #9)
  - [ ] Add helper(s) to load full SKILL.md content on-demand (instructions + optional tools)
  - [ ] Document the intended usage via `execute_code` (Story 6.2 provides execution environment)

- [ ] **Task 3: Skills Hint Prompt Builder (Token Efficient)** (AC: #4)
  - [ ] Replace `buildSkillsPrompt()` with `buildSkillsHint()` that returns **name + description + tool names only**
  - [ ] Include clear instruction for loading full SKILL.md on-demand

- [ ] **Task 4: Update Integration Touchpoints** (AC: #4)
  - [ ] Update `src/slack/handlers/user-message.ts` to inject **skills hint** (not full content)
  - [ ] Update `src/slack/handlers/app-mention.ts` to inject **skills hint** (not full content)
  - [ ] Verify any other call sites (e.g., `src/tools/code-execution/tool.ts`) don’t assume full instructions are preloaded or that `getSkills()` returns full content at startup

- [ ] **Task 5: Tool Registration + Runtime Wiring (Decide + Implement)** (AC: #5)
  - [ ] Decision: register skill tools eagerly from frontmatter metadata at startup (default) vs lazy on-demand
  - [ ] If eager: register tools from frontmatter metadata via `toolRegistry.registerDynamicTool(skillName, toolName, toolDefinition)` during skill load
  - [ ] If lazy: document how/when tools are registered, and how they’re removed/reloaded safely
  - [ ] **Runtime wiring (MANDATORY):** ensure skill tools can be executed end-to-end
    - [ ] Register discovered skill tools into `toolRegistry` in production code paths (not tests-only)
    - [ ] Update `src/tools/router.ts` to route tool calls to skill tools when `toolRegistry.getSkillTool(toolName)` returns a match
    - [ ] Route execution through the skill tool handler (`src/skills/tool-handler.ts`) using the canonical `ToolResult<T>` contract
    - [ ] Maintain conflict safety: if a name conflicts with static/MCP tools, registry must reject and routing must treat registry membership as truth

- [ ] **Task 6: Tool Result Contract Consistency** (Dev Notes: Tool handlers)
  - [ ] Ensure skill tool handler(s) return canonical `ToolResult<T>` from `src/utils/tool-result.ts` (never throw)
  - [ ] Use `TOOL_NOT_IMPLEMENTED` for placeholders until Story 6.2 executes skills

- [ ] **Task 7: Update Tests + Verify Token Reduction** (AC: #1-10)
  - [ ] Update `src/skills/*` tests for metadata-only behavior + skills hint output
  - [ ] Add a regression test ensuring skills injection does not include full SKILL.md body
  - [ ] Verify prompt token reduction (10x+ vs full injection baseline)

### Existing Implementation (Already in Codebase, Superseded by Refactor)

- [x] Initial skills module created (`src/skills/*`) with loader/parser/prompt-builder
- [x] Tool registry supports dynamic skill tool registration (`toolRegistry.registerDynamicTool(...)`)
- [x] Script discovery added (catalog only)
- [x] Initial skills injection implemented in Slack handlers (must be updated to hint-only)

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
├── prompt-builder.ts   # Skills hint builder for system prompt injection (metadata-only)
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

### Skills Loader Implementation (Metadata-Only at Startup)

```typescript
// src/skills/loader.ts (metadata-only load)
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { parseSkillFrontmatterOnly } from './parser.js';
import { getLangfuse } from '../observability/langfuse.js';
import { logger } from '../utils/logger.js';
import type { SkillMetadata, SkillScript } from './types.js';

const SKILLS_DIR = '.skills';

/**
 * Load all skills from the .skills directory
 * 
 * Discovers SKILL.md files, parses frontmatter metadata only, and returns validated skill metadata.
 * Invalid skills are logged but don't prevent other skills from loading.
 * 
 * @param traceId - Required for log correlation
 * @see Story 6.1 - Agent Skills Loader
 */
export async function loadSkillMetadata(traceId: string): Promise<SkillMetadata[]> {
  const langfuse = getLangfuse();
  const span = langfuse?.span({ name: 'skills.load', traceId });
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
    
    // Parse each skill file (frontmatter only)
    const results = await Promise.allSettled(
      skillPaths.map(async (skillPath) => {
        const content = await readFile(skillPath, 'utf-8');
        const meta = parseSkillFrontmatterOnly(content, skillPath);

        // Scripts are discovered from the skill directory (catalog only)
        const skillDir = path.dirname(skillPath);
        const scripts = await discoverScripts(skillDir);

        return {
          ...meta,
          scripts: scripts.length > 0 ? scripts : undefined,
          hasExecutableScripts: scripts.length > 0,
        };
      })
    );
    
    // Collect successful parses
    const skills: SkillMetadata[] = [];
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

// Cache loaded skill metadata (per-process)
let cachedSkillMetadata: SkillMetadata[] | null = null;

/**
 * Get cached skills or load them
 * 
 * Cache is invalidated by calling reloadSkills()
 */
export async function getSkillMetadata(traceId: string): Promise<SkillMetadata[]> {
  if (!cachedSkillMetadata) {
    cachedSkillMetadata = await loadSkillMetadata(traceId);
  }
  return cachedSkillMetadata;
}

/**
 * Invalidate skill cache
 * 
 * Call this when:
 * - Skills directory contents change (in dev with file watching)
 * - Admin requests skill reload
 * - On container restart (automatic - cache is in-memory)
 */
export function reloadSkillMetadata(): void {
  cachedSkillMetadata = null;
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

### Skills Hint Builder (System Prompt Injection)

```typescript
// src/skills/prompt-builder.ts
import type { Skill } from './types.js';

/**
 * Build system prompt section from loaded skill metadata (token efficient)
 * 
 * Returns empty string if no skills loaded.
 * Used by Slack handlers when building the system prompt.
 * 
 * @see Story 2.1 - Agent Loop (system prompt assembly)
 */
export function buildSkillsHint(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return '';
  }
  
  const hints = skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
  
  return `
# Available Skills

${hints}

When a task matches a skill, load its full instructions on-demand:
  execute_code({ code: "cat /skills/{skill-name}/SKILL.md" })
`;
}
```

### Integration Touchpoints (Actual Runtime Locations)

Skills are injected into the system prompt inside the Slack handlers:

- `src/slack/handlers/user-message.ts`
- `src/slack/handlers/app-mention.ts`

These must inject **skills hint only** (metadata), never full SKILL.md body.

### Tool Registration (Integration with Tool Registry)

**CRITICAL:** Skill tools are registered **dynamically** at runtime. They do NOT get added to the static `TOOL_NAMES` const array. This is intentional—skill tools are discovered at startup, not compile time.

**Tool Naming Convention:** `{skill_name}__{tool_name}` (double underscore separator)
- Example: `deep_research__initiate_research`
- Allows routing: parse on `__` to identify skill vs core tools

**Handler Pattern (MANDATORY):** All skill tool handlers MUST return `ToolResult<T>`:

```typescript
// src/skills/tool-handler.ts
import type { ToolResult } from '../utils/tool-result.js';

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

**Registration (actual API):**

```typescript
// src/skills/* (registration happens after loading skill metadata)
import { toolRegistry } from '../tools/registry.js';

toolRegistry.registerDynamicTool(skillName, toolName, {
  name: toolName, // registry will prefix to `${skillName}__${toolName}`
  description: `[${skillName}] ${description}`,
  input_schema: {
    type: 'object',
    properties,
    required,
  },
});
```

Tool naming convention remains: `${skillName}__${toolName}` (double underscore).

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
3. Skills metadata loads **lazily** on first request that needs it
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

## Current Implementation Notes (Superseded by Refactor)

- An initial skills module exists in `src/skills/*` (loader/parser/prompt-builder/tool-handler).
- Current behavior is **not compliant** with progressive disclosure:
  - `buildSkillsPrompt()` includes full `instructions` in the system prompt.
  - Slack handlers inject the full prompt section.
- Skill tool support is **not end-to-end** yet:
  - The registry supports dynamic skill tools, but production registration + routing must be explicitly wired (see Task 5).
  - Skill tool execution remains a placeholder until Story 6.2 (GKE sandbox execution).

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

### Review Fixes Applied (2026-01-03)

- src/tools/router.ts (static ToolResult pass-through; skill tool routing returns canonical ToolResult)
- src/skills/tool-handler.ts (+ tests) (canonical ToolResult + snake_case validation for tool-prefix skill names)
- src/skills/loader.ts (+ tests) (`loadSkillMetadataWithResult()` returns failures)
- src/skills/prompt-builder.ts (+ tests) (on-demand SKILL.md instruction uses `execute_code({ skill_doc: ... })`)
- src/skills/runtime.ts (best-effort runtime wiring: ensure skill tools registered before tool definitions built)
- src/agent/loop.ts (calls `ensureSkillToolsRegistered()` before building tool list)
- src/agent/orion.ts (propagates traceId to execute_code via `setExecuteCodeContext()`/`clearExecuteCodeContext()`)
- src/index.ts (registers `execute_code` tool at startup)
- src/tools/code-execution/{types,tool,tool.test}.ts (adds `skill_doc` input for on-demand SKILL.md)
- src/skills/integration.test.ts (adds metadata/hint path test; keeps full prompt test as deprecated compatibility)

## Change Log

| Date | Change |
|------|--------|
| 2025-12-22 | Story created for Epic 6 |
| 2025-12-22 | Validation review: Added traceId to all logs, tool name validation, cache invalidation docs, fixed directory location |
| 2026-01-02 | Added GKE Sandbox integration, script discovery, updated Skill interface |
| 2026-01-02 | **Validation review (SM)**: Critical fixes: (1) Added ToolResult pattern requirement for skill tool handlers, (2) Clarified dynamic tool registration vs TOOL_NAMES registry, (3) Added ESM .js extension requirement, (4) Consolidated duplicate type definitions, (5) Added startup order & validation strategy, (6) Clarified GKE sandbox scope boundary (discovery only, not execution), (7) Enhanced anti-patterns table |
| 2026-01-03 | Initial skills implementation landed (loader/parser/prompt-builder/tool-handler + registry support), but it injects full SKILL.md content and must be refactored to progressive disclosure. |
| 2026-01-03 | Progressive disclosure course correction approved; refactor required (metadata-only + hint-only). |
| 2026-01-03 | ✅ Refactor completed: metadata-only loading + hint-only prompt injection + on-demand SKILL.md via execute_code + runtime tool registration wired. |

---

## 🚨 Course Correction: Progressive Disclosure Refactor

**Date:** 2026-01-03  
**Status:** COMPLETED  
**Reference:** `_bmad-output/sprint-change-proposal-2026-01-02-skills-architecture-fix.md`

### Problem Summary

The previous implementation injected **full SKILL.md content** into the system prompt at startup. This violates the [Agent Skills open standard](https://agentskills.io) and wastes ~15k tokens per conversation.

**Wrong (Previous):**
```typescript
const skills = await getSkills(trace.id);
const skillsPrompt = buildSkillsPrompt(skills);  // Full content, ~15k tokens
systemPrompt = `${systemPrompt}\n\n${skillsPrompt}`;
```

**Correct (Implemented):**
```typescript
const skills = await getSkillMetadata(trace.id);  // Metadata only, ~1.2k tokens
const skillsHint = buildSkillsHint(skills);       // Name + description only
systemPrompt = `${systemPrompt}\n\n${skillsHint}`;
// Claude reads full SKILL.md via execute_code(skill_doc=...) when triggered
```

### Refactor Plan

Execute the refactor using the **Tasks / Subtasks** section above (Task 1–Task 7). The refactor is complete only when:
- Startup is metadata-only
- System prompt injection is hint-only
- Skill tool registration + routing works end-to-end (Task 5)
- Skill tool handler returns canonical `ToolResult<T>` with `TOOL_NOT_IMPLEMENTED` until Story 6.2

### Success Criteria

- [x] System prompt contains only skill metadata (~100 tokens/skill)
- [x] Claude can read full SKILL.md via `execute_code` when triggered
- [x] Token usage reduced by 10x+ per conversation
- [x] All existing tests pass (updated for new pattern)

### Rollback Plan

Revert to current system prompt injection temporarily. Skills work but waste tokens. No user-facing breakage.
