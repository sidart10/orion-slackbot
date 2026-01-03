# Story 6.2: execute_code Tool (GKE Agent Sandbox)

Status: done

## Story

As the **Orion agent**,
I want an `execute_code` tool that runs Python code in a secure sandbox with network access,
So that Skills can programmatically orchestrate MCP tools and perform complex workflows.

## Background

GKE Agent Sandbox (Phase 1, verified 2026-01-03) provides network-enabled Python execution that Anthropic's container cannot support. See `project-context.md` for connection details and `infra/gke-sandbox/README.md` for operations.

## Acceptance Criteria

1. **Given** Claude requests code execution, **When** the `execute_code` tool is invoked, **Then** code runs in GKE Agent Sandbox

2. **Given** Python code with network calls, **When** executed, **Then** HTTP requests succeed (network access verified)

3. **Given** code that calls MCP tools, **When** executed, **Then** MCP tools are accessible via SDK or HTTP

4. **Given** a skill script path, **When** `execute_code` is called with `skill:` prefix, **Then** the script from `.skills/{name}/scripts/` is executed

5. **Given** code execution completes, **When** returning, **Then** stdout, stderr, return_code, and execution time are captured

6. **Given** code execution fails, **When** error occurs, **Then** error is returned gracefully (no agent crash)

7. **Given** execution timeout (30s default), **When** exceeded, **Then** execution is terminated and timeout error returned

8. **Given** any execution, **When** complete, **Then** Langfuse span captures execution details

## Tasks / Subtasks

- [x] **Task 1: Create execute_code Tool Definition** (AC: #1)
  - [x] Create `src/tools/code-execution/tool.ts`
  - [x] Define tool schema with `code`, `timeout`, `skill_script` parameters
  - [x] Register with tool registry using `registerStaticTool()`
  - [x] Validate tool name is `execute_code` (snake_case)

- [x] **Task 2: GKE Sandbox Client** (AC: #1, #2, #3)
  - [x] Create `src/tools/code-execution/sandbox-client.ts`
  - [x] Implement `executeSandbox(options: SandboxOptions): Promise<SandboxResult>`
  - [x] Configure Sandbox Router endpoint from `config.gkeSandboxRouterUrl`
  - [x] Handle HTTP communication with sandbox router
  - [x] Parse sandbox response (stdout, stderr, return_code)

- [x] **Task 3: Skill Script Execution** (AC: #4)
  - [x] Parse `skill:` prefix from tool input
  - [x] Resolve script path from skills loader (Story 6.1)
  - [x] Check `skill.hasExecutableScripts` before accessing scripts
  - [x] Read script content and inject into sandbox
  - [x] Pass arguments as JSON environment variable

- [x] **Task 4: MCP Integration in Sandbox** (AC: #3)
  - [x] Create MCP client bootstrap script for sandbox
  - [x] Inject MCP server URLs into sandbox environment
  - [x] Provide helper functions: `call_mcp_tool(server, tool, args)`
  - [x] Document available MCP tools in sandbox context

- [x] **Task 5: Error Handling & Timeout** (AC: #6, #7)
  - [x] Configure timeout per execution (default 30s, max 120s)
  - [x] Use `AbortSignal.timeout()` with buffer
  - [x] Handle sandbox timeout gracefully
  - [x] Catch and format Python exceptions
  - [x] Return `ToolResult<T>` with structured error (NEVER throw)

- [x] **Task 6: Environment Configuration**
  - [x] Add `gkeSandboxRouterUrl` to `src/config/environment.ts`
  - [x] Add `mcpServersJson` to `src/config/environment.ts`
  - [x] Add to production required check

- [x] **Task 7: Observability** (AC: #8)
  - [x] Create Langfuse span for each execution
  - [x] Log code hash (not full code) for security
  - [x] Track execution duration, success/failure
  - [x] Include skill name if skill script

- [x] **Task 8: Verification**
  - [x] Test basic Python execution (arithmetic)
  - [x] Test network access (HTTP request to external API)
  - [x] Test skill script execution with `skill:` prefix
  - [x] Test MCP tool call from sandbox
  - [x] Test timeout handling
  - [x] Test error scenarios
  - [ ] Measure warm execution latency (<2s target) - requires live GKE cluster
  - [ ] Measure cold execution latency (<10s target) - requires live GKE cluster

## Dev Notes

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR19 | prd.md | Generate code on-the-fly to solve problems |
| FR20 | prd.md | Execute code in sandboxed environment |
| FR21 | prd.md | API calls to external services from code |
| AR | architecture.md:299-398 | GKE Agent Sandbox ADR |
| Logging | project-context.md | ALL logs must include `traceId` |
| Tool names | project-context.md | Must be `snake_case` |
| Tool handlers | project-context.md:69-92 | MUST return `ToolResult<T>`, NEVER throw |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |

### File Locations (src)

```
src/tools/code-execution/
├── tool.ts              # Tool definition & handler
├── tool.test.ts
├── sandbox-client.ts    # GKE Sandbox communication
├── sandbox-client.test.ts
├── mcp-bootstrap.py     # MCP helper injected into sandbox
├── types.ts             # Execution types
└── index.ts             # Re-exports
```

### Environment Configuration (Task 6 — REQUIRED FIRST)

```typescript
// src/config/environment.ts — ADD THESE FIELDS

export const config = {
  // ... existing fields ...

  // GKE Agent Sandbox (Story 6.2)
  gkeSandboxRouterUrl: process.env.GKE_SANDBOX_ROUTER_URL ?? 
    'http://sandbox-router-svc.default.svc.cluster.local:8080',
  
  // MCP servers for injection into sandbox
  mcpServersJson: process.env.MCP_SERVERS_JSON ?? '{}',
} as const;

// Add to production required check if needed
```

### Types (Aligned with Story 6.1)

```typescript
// src/tools/code-execution/types.ts
import type { ToolResult } from '../../types/tools.js';

export interface ExecuteCodeInput {
  code?: string;
  skill_script?: string;  // Format: "skill:skill_name/script_name.py" or "skill_name/script_name.py"
  args?: Record<string, unknown>;
  timeout?: number;
}

export interface ExecuteCodeOutput {
  stdout: string;
  stderr: string;
  return_code: number;
  execution_time_ms: number;
}

// Handler returns ToolResult per project-context.md
export type ExecuteCodeResult = ToolResult<ExecuteCodeOutput>;
```

### Tool Definition

```typescript
// src/tools/code-execution/tool.ts
import type Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';  // REQUIRED: explicit import
import { createHash } from 'crypto';
import { executeSandbox } from './sandbox-client.js';
import { getSkills } from '../../skills/loader.js';
import { langfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import { toolRegistry } from '../registry.js';
import { config } from '../../config/environment.js';
import type { ExecuteCodeInput, ExecuteCodeOutput } from './types.js';
import type { ToolResult } from '../../types/tools.js';

// Tool definition for Claude
export const executeCodeToolDefinition: Anthropic.Tool = {
  name: 'execute_code',
  description: `Execute Python code in a secure sandbox with network access.

Use this tool when you need to:
- Run complex logic with loops, conditionals, or data processing
- Call multiple MCP tools programmatically
- Make HTTP requests to external APIs
- Execute skill scripts for orchestrated workflows

The sandbox has:
- Python 3.11 with common packages (requests, pandas, numpy, etc.)
- Network access to call APIs and MCP servers
- 30-second default timeout (configurable up to 120s)

For skill scripts, use: skill_script: "skill:skill_name/script_name.py"`,
  input_schema: {
    type: 'object' as const,
    properties: {
      code: {
        type: 'string',
        description: 'Python code to execute. Print results to stdout.',
      },
      skill_script: {
        type: 'string',
        description: 'Path to skill script: "skill:skill_name/script_name.py"',
      },
      args: {
        type: 'object',
        description: 'Arguments passed to skill script as JSON (available as ARGS env var)',
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in seconds (default: 30, max: 120)',
      },
    },
  },
};

/**
 * Execute code handler — MUST return ToolResult, NEVER throw
 * 
 * @see Story 6.2 - execute_code Tool
 * @see project-context.md lines 69-92 for handler pattern
 */
export async function executeCodeHandler(
  input: ExecuteCodeInput,
  context: { traceId: string }
): Promise<ToolResult<ExecuteCodeOutput>> {
  const { traceId } = context;
  const span = langfuse.span({ name: 'tool.execute_code', traceId });
  const startTime = Date.now();
  
  try {
    let codeToExecute: string;
    let scriptName: string | undefined;
    
    // Handle skill script execution (aligned with Story 6.1)
    if (input.skill_script) {
      // Parse skill: prefix if present (Story 6.1 format)
      const scriptPath = input.skill_script.replace(/^skill:/, '');
      const [skillName, scriptFile] = scriptPath.split('/');
      
      if (!skillName || !scriptFile) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Invalid skill_script format: "${input.skill_script}". Expected: "skill:skill_name/script_name.py"`,
            retryable: false,
          },
        };
      }
      
      const skills = await getSkills(traceId);
      const skill = skills.find(s => s.name === skillName);
      
      // Check skill exists and has executable scripts (Story 6.1 alignment)
      if (!skill) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Skill not found: ${skillName}`,
            retryable: false,
          },
        };
      }
      
      if (!skill.hasExecutableScripts || !skill.scripts) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Skill "${skillName}" has no executable scripts`,
            retryable: false,
          },
        };
      }
      
      const script = skill.scripts.find(s => s.name === scriptFile);
      if (!script) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Script not found: ${scriptFile} in skill ${skillName}. Available: ${skill.scripts.map(s => s.name).join(', ')}`,
            retryable: false,
          },
        };
      }
      
      codeToExecute = await readFile(script.path, 'utf-8');
      scriptName = input.skill_script;
      
      // Inject args as environment variable
      if (input.args) {
        codeToExecute = `import os, json\nARGS = json.loads(os.environ.get('ARGS', '{}'))\n${codeToExecute}`;
      }
    } else if (input.code) {
      codeToExecute = input.code;
    } else {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: 'Either "code" or "skill_script" must be provided',
          retryable: false,
        },
      };
    }
    
    const timeout = Math.min(input.timeout ?? 30, 120);
    
    // Log code hash, not full code (security)
    const codeHash = createHash('sha256').update(codeToExecute).digest('hex').slice(0, 16);
    
    logger.info({
      event: 'execute_code.start',
      traceId,
      hasSkillScript: !!scriptName,
      codeHash,
      codeLength: codeToExecute.length,
      timeout,
    });
    
    // Execute in GKE Sandbox
    const result = await executeSandbox({
      code: codeToExecute,
      timeout,
      env: input.args ? { ARGS: JSON.stringify(input.args) } : undefined,
    });
    
    const duration = Date.now() - startTime;
    
    span.end({
      output: {
        success: result.return_code === 0,
        return_code: result.return_code,
        stdout_length: result.stdout.length,
        stderr_length: result.stderr.length,
      },
      metadata: { durationMs: duration, scriptName, codeHash },
    });
    
    logger.info({
      event: 'execute_code.complete',
      traceId,
      success: result.return_code === 0,
      durationMs: duration,
    });
    
    return {
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        return_code: result.return_code,
        execution_time_ms: duration,
      },
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    
    span.end({ metadata: { error: errorMsg, durationMs: duration } });
    
    logger.error({
      event: 'execute_code.error',
      traceId,
      error: errorMsg,
    });
    
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: errorMsg,
        retryable: false,
      },
    };
  }
}

/**
 * Register execute_code tool with registry
 * 
 * Call this during agent initialization.
 */
export function registerExecuteCodeTool(): void {
  toolRegistry.registerStaticTool(
    'execute_code',
    async (input: unknown) => {
      // Wrapper to match registry signature
      // traceId should be injected by caller via context
      const result = await executeCodeHandler(
        input as ExecuteCodeInput,
        { traceId: 'unknown' }  // Will be overridden by executor
      );
      return result;
    },
    executeCodeToolDefinition
  );
}
```

### Sandbox Client Implementation

```typescript
// src/tools/code-execution/sandbox-client.ts
import { config } from '../../config/environment.js';

export interface SandboxOptions {
  code: string;
  timeout: number;
  env?: Record<string, string>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  return_code: number;
}

/**
 * Execute code in GKE Agent Sandbox
 * 
 * Uses Sandbox Router deployed in Phase 1.
 * See: infra/gke-sandbox/
 * 
 * @throws Error on network/sandbox failures (caught by handler)
 */
export async function executeSandbox(options: SandboxOptions): Promise<SandboxResult> {
  const routerUrl = config.gkeSandboxRouterUrl;
  
  const response = await fetch(`${routerUrl}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: options.code,
      timeout_seconds: options.timeout,
      environment: options.env,
      template: 'python-runtime-template',
    }),
    // Timeout with buffer for network overhead
    signal: AbortSignal.timeout(options.timeout * 1000 + 5000),
  });
  
  if (!response.ok) {
    throw new Error(`Sandbox execution failed: ${response.status} ${response.statusText}`);
  }
  
  const result = await response.json();
  
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    return_code: result.return_code ?? 0,
  };
}
```

### MCP Bootstrap Script

```python
# src/tools/code-execution/mcp-bootstrap.py
# Injected into sandbox to provide MCP tool access

import os
import json
import httpx

MCP_SERVERS = json.loads(os.environ.get('MCP_SERVERS', '{}'))

async def call_mcp_tool(server: str, tool: str, args: dict) -> dict:
    """
    Call an MCP tool from within the sandbox.
    
    Example:
        result = await call_mcp_tool('confluence', 'search_content', {'query': 'project requirements'})
    """
    if server not in MCP_SERVERS:
        raise ValueError(f"Unknown MCP server: {server}. Available: {list(MCP_SERVERS.keys())}")
    
    server_url = MCP_SERVERS[server]
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{server_url}/tools/call",
            json={"name": tool, "arguments": args},
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()

# Synchronous wrapper for convenience
def call_tool(server: str, tool: str, args: dict) -> dict:
    import asyncio
    return asyncio.run(call_mcp_tool(server, tool, args))
```

### Example: Skill with Executable Script

```
.skills/confluence-research/
├── SKILL.md
└── scripts/
    ├── deep_research.py
    └── requirements.txt
```

**SKILL.md:**
```markdown
---
name: confluence_research
description: Search and synthesize information from Confluence documentation.
version: 1.0.0
---

# Confluence Research Skill

## When to Use
- User asks "What does the wiki say about X?"
- User needs internal documentation

## Complex Research Workflow

For deep research across multiple pages, use the execute_code tool:

```
execute_code(skill_script="skill:confluence_research/deep_research.py", args={"query": "user's question"})
```
```

**scripts/deep_research.py:**
```python
import json
import os

ARGS = json.loads(os.environ.get('ARGS', '{}'))
query = ARGS.get('query', '')

# Use the injected MCP helper
from mcp_bootstrap import call_tool

# Search for relevant pages
search_results = call_tool('confluence', 'search_content', {'query': query, 'limit': 10})

# Analyze each page
findings = []
for result in search_results.get('results', []):
    page = call_tool('confluence', 'get_page', {'page_id': result['id']})
    findings.append({
        'title': page['title'],
        'url': page['url'],
        'excerpt': page['content'][:500],
    })

# Output structured results
print(json.dumps({
    'query': query,
    'findings': findings,
    'total_pages_analyzed': len(findings),
}, indent=2))
```

### Dependencies (Story Prerequisites)

| Dependency | Story | What It Provides |
|------------|-------|------------------|
| Skills Loader | 6.1 | `getSkills()` with `scripts` and `hasExecutableScripts` |
| Tool Registry | 3.2 | `registerStaticTool()` for execute_code |
| MCP Client | 3.1 | MCP server URLs for sandbox injection |
| Langfuse | 1.2 | Observability spans |
| GKE Sandbox | Infra Phase 1 | Sandbox Router deployed |

### Infrastructure Reference

Phase 1 deployment (verified 2026-01-03):
- Cluster: `orion-sandbox-cluster` (us-central1)
- SandboxTemplate: `python-runtime-template`
- WarmPool: 2 replicas
- Sandbox Router: `sandbox-router-svc.default.svc.cluster.local:8080`

See: `infra/gke-sandbox/` for manifests, `project-context.md` for connection details.

### Success Metrics

| Metric | Target |
|--------|--------|
| Execution latency (warm) | <2s |
| Execution latency (cold) | <10s |
| Success rate | >95% |
| Network connectivity | 100% |
| MCP tool access | 100% |

### Anti-Patterns to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| Log full code content | Log code hash/length only |
| Execute without timeout | Always set timeout (max 120s) |
| Throw from handler | Return `{ success: false, error: {...} }` |
| Hardcode sandbox URL | Use `config.gkeSandboxRouterUrl` |
| Import without `.js` extension | `import from './sandbox-client.js'` |
| Access `skill.scripts` without check | Check `skill.hasExecutableScripts` first |
| Parse skill_script without handling prefix | Strip `skill:` prefix if present |

## Dev Agent Record

### Implementation Plan
- Created execute_code tool with handler following ToolResult pattern (NEVER throw)
- Implemented GKE Sandbox Client communicating with sandbox-router-svc
- Added skill script execution with skill: prefix parsing and Story 6.1 alignment
- Created mcp-bootstrap.py for MCP tool access from within sandbox
- Added gkeSandboxRouterUrl and mcpServersJson to environment config
- Implemented Langfuse spans with code hash logging (not full code)
- Timeout handling with 30s default, 120s max, AbortSignal.timeout with buffer

### Completion Notes
✅ Story 6.2 implementation complete
- 31 tests passing in code-execution module (after review fixes)
- All 8 tasks implemented per story specification
- Follows project-context.md patterns: ESM imports, ToolResult returns, traceId logging
- Latency verification (Task 8.7, 8.8) deferred to live GKE cluster testing

## File List

| Action | File Path |
|--------|-----------|
| Created | src/tools/code-execution/types.ts |
| Created | src/tools/code-execution/tool.ts |
| Created | src/tools/code-execution/tool.test.ts |
| Created | src/tools/code-execution/sandbox-client.ts |
| Created | src/tools/code-execution/sandbox-client.test.ts |
| Created | src/tools/code-execution/mcp-bootstrap.py |
| Created | src/tools/code-execution/index.ts |
| Modified | src/config/environment.ts |
| Modified | src/tools/index.ts |

## Change Log

| Date | Change |
|------|--------|
| 2026-01-02 | Story created for GKE Agent Sandbox integration |
| 2026-01-02 | **Validation review (SM)**: Critical fixes: (1) Added ToolResult return type, (2) Added gkeSandboxRouterUrl to environment config, (3) Fixed sandbox router URL to match infra, (4) Added readFile import, (5) Added registerStaticTool() registration pattern, (6) Aligned with Story 6.1 Skill interface (hasExecutableScripts check, skill: prefix handling), (7) Added code hash logging, (8) Added verification latency tests |
| 2026-01-03 | **Implementation complete (Dev)**: All 8 tasks done; 28 tests passing; ready for review |
| 2026-01-03 | **Code review (Dev)**: Fixed 4 critical + 3 medium issues: (1) MCP bootstrap now injected into sandbox code, (2) MCP_SERVERS env var passed to sandbox, (3) Added registerExecuteCodeTool export to src/tools/index.ts, (4) Fixed traceId propagation via context pattern (setExecuteCodeContext/clearExecuteCodeContext), (5) Added MCP injection tests, (6) Added gkeSandboxRouterUrl validation comment, (7) 31 tests passing |
