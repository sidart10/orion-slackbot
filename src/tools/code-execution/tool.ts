/**
 * execute_code Tool
 *
 * Executes Python code in a secure GKE sandbox with network access.
 *
 * @see Story 6.2 - execute_code Tool (GKE Agent Sandbox)
 * @see project-context.md lines 69-92 for handler pattern
 */

import type Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { executeSandbox } from './sandbox-client.js';
import { getSkills } from '../../skills/loader.js';
import { getLangfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import { toolRegistry } from '../registry.js';
import type { ExecuteCodeInput, ExecuteCodeOutput } from './types.js';
import type { ToolResult } from '../../utils/tool-result.js';

// Cache the MCP bootstrap script
let mcpBootstrapCache: string | null = null;

// Fallback MCP bootstrap stub when file cannot be loaded
const MCP_BOOTSTRAP_FALLBACK = `
import os, json
MCP_SERVERS = json.loads(os.environ.get('MCP_SERVERS', '{}'))

def call_tool(server, tool, args):
    raise RuntimeError("MCP bootstrap not available - httpx required")

def list_mcp_servers():
    return list(MCP_SERVERS.keys())
`;

/**
 * Load MCP bootstrap script for injection into sandbox.
 * Cached after first load.
 */
async function getMcpBootstrap(): Promise<string> {
  if (mcpBootstrapCache !== null) {
    return mcpBootstrapCache;
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const bootstrapPath = join(__dirname, 'mcp-bootstrap.py');
    const content = await readFile(bootstrapPath, 'utf-8');

    // Validate we got actual content (handles mock returning undefined)
    if (content && typeof content === 'string' && content.length > 0) {
      mcpBootstrapCache = content;
      return mcpBootstrapCache;
    }

    // Fall through to fallback
    mcpBootstrapCache = MCP_BOOTSTRAP_FALLBACK;
    return mcpBootstrapCache;
  } catch {
    // Fallback if file not found - provide minimal stub
    mcpBootstrapCache = MCP_BOOTSTRAP_FALLBACK;
    return mcpBootstrapCache;
  }
}

// Context holder for traceId injection
let currentContext: { traceId: string } = { traceId: 'unknown' };

/**
 * Set the execution context for the execute_code tool.
 * Must be called before tool execution to ensure proper traceId.
 */
export function setExecuteCodeContext(ctx: { traceId: string }): void {
  currentContext = ctx;
}

/**
 * Clear the execution context after tool execution.
 */
export function clearExecuteCodeContext(): void {
  currentContext = { traceId: 'unknown' };
}

/**
 * Reset internal caches for testing.
 * @internal
 */
export function __resetCacheForTests(): void {
  mcpBootstrapCache = null;
}

/**
 * Tool definition for Claude.
 */
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
 * Execute code handler — MUST return ToolResult, NEVER throw.
 *
 * @see Story 6.2 - execute_code Tool
 * @see project-context.md lines 69-92 for handler pattern
 */
export async function executeCodeHandler(
  input: ExecuteCodeInput,
  context: { traceId: string }
): Promise<ToolResult<ExecuteCodeOutput>> {
  const { traceId } = context;
  const langfuse = getLangfuse();
  const span = langfuse?.span({ traceId, name: 'tool.execute_code' });
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
      const skill = skills.find((s) => s.name === skillName);

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

      const script = skill.scripts.find((s) => s.name === scriptFile);
      if (!script) {
        return {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: `Script not found: ${scriptFile} in skill ${skillName}. Available: ${skill.scripts.map((s) => s.name).join(', ')}`,
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

    // Inject MCP bootstrap script for MCP tool access (AC#3, Task 4)
    const mcpBootstrap = await getMcpBootstrap();
    const codeWithMcp = `${mcpBootstrap}\n\n# User code below\n${codeToExecute}`;

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

    // Build environment with MCP servers config
    const env: Record<string, string> = {
      MCP_SERVERS: config.mcpServersJson,
    };
    if (input.args) {
      env.ARGS = JSON.stringify(input.args);
    }

    // Execute in GKE Sandbox
    const result = await executeSandbox({
      code: codeWithMcp,
      timeout,
      env,
    });

    const duration = Date.now() - startTime;

    span?.end({
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

    span?.end({ metadata: { error: errorMsg, durationMs: duration } });

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
 * Register execute_code tool with registry.
 *
 * Call this during agent initialization.
 * Use setExecuteCodeContext() before executing to inject proper traceId.
 */
export function registerExecuteCodeTool(): void {
  toolRegistry.registerStaticTool(
    'execute_code',
    async (input: unknown) => {
      // Use currentContext which should be set by caller via setExecuteCodeContext()
      const result = await executeCodeHandler(input as ExecuteCodeInput, currentContext);
      return result;
    },
    executeCodeToolDefinition
  );
}

