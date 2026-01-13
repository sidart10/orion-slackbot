/**
 * orion_sandbox Tool
 *
 * Executes Python code in a secure GKE sandbox with network access.
 *
 * @see Story 6.2 - orion_sandbox Tool (GKE Agent Sandbox)
 * @see project-context.md lines 69-92 for handler pattern
 */

import type Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { executeSandbox, SandboxTimeoutError } from './sandbox-client.js';
import { isGkeOnlySkill, GKE_ONLY_SKILLS } from './allowed-skills.js';
import { getSkillMetadata } from '../../skills/loader.js';
import { getLangfuse } from '../../observability/langfuse.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import { toolRegistry } from '../registry.js';
import type { OrionSandboxInput, OrionSandboxOutput } from './types.js';
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
 * Extract skill name from skill_doc or skill_script input.
 * @example "skill:webapp-testing" → "webapp-testing"
 * @example "skill:webapp-testing/script.py" → "webapp-testing"
 */
function extractSkillName(input: string): string {
  const withoutPrefix = input.replace(/^skill:/, '');
  return withoutPrefix.split('/')[0];
}

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
 * Set the execution context for the orion_sandbox tool.
 * Must be called before tool execution to ensure proper traceId.
 */
export function setOrionSandboxContext(ctx: { traceId: string }): void {
  currentContext = ctx;
}

/**
 * Clear the execution context after tool execution.
 */
export function clearOrionSandboxContext(): void {
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
export const orionSandboxToolDefinition: Anthropic.Tool = {
  name: 'orion_sandbox',
  description: `FALLBACK GKE sandbox for skills requiring Playwright or local builds.

⚠️ DO NOT USE THIS TOOL for general code execution!
Use code_execution (Anthropic container) instead for:
- Data processing, calculations, transformations
- API calls and HTTP requests
- General Python code

ONLY use orion_sandbox for these GKE-only skills:
- webapp-testing (Playwright browser automation)
- web-artifacts-builder (local filesystem builds)

For skill scripts: skill_script: "skill:webapp-testing/script.py"
For skill docs: skill_doc: "skill:webapp-testing"`,
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
      skill_doc: {
        type: 'string',
        description: 'Load and print a skill SKILL.md file: "skill:skill_name" (prints full markdown)',
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
 * @see Story 6.2 - orion_sandbox Tool
 * @see project-context.md lines 69-92 for handler pattern
 */
export async function orionSandboxHandler(
  input: OrionSandboxInput,
  context: { traceId: string }
): Promise<ToolResult<OrionSandboxOutput>> {
  const { traceId } = context;
  const langfuse = getLangfuse();
  const span = langfuse?.span({ traceId, name: 'tool.orion_sandbox' });
  const startTime = Date.now();

  try {
    let codeToExecute: string;
    let scriptName: string | undefined;

    // Handle skill script execution (aligned with Story 6.1)
    if (input.skill_script) {
      // Validate GKE-only skills BEFORE processing (Story 6.12)
      const skillNameForValidation = extractSkillName(input.skill_script);
      if (!isGkeOnlySkill(skillNameForValidation)) {
        return {
          success: false,
          error: {
            code: 'SKILL_NOT_GKE',
            message: `Skill "${skillNameForValidation}" should use Anthropic container (PTC), not GKE sandbox. GKE is only for: ${GKE_ONLY_SKILLS.join(', ')}`,
            retryable: false,
          },
        };
      }

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

      // Use metadata-only loading (Story 6.1 progressive disclosure)
      const skillMetadata = await getSkillMetadata(traceId);
      const skill = skillMetadata.find((s) => s.name === skillName);

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
    } else if (input.skill_doc) {
      // Validate GKE-only skills BEFORE processing (Story 6.12)
      const skillNameForValidation = extractSkillName(input.skill_doc);
      if (!isGkeOnlySkill(skillNameForValidation)) {
        return {
          success: false,
          error: {
            code: 'SKILL_NOT_GKE',
            message: `Skill "${skillNameForValidation}" should use Anthropic container (PTC), not GKE sandbox. GKE is only for: ${GKE_ONLY_SKILLS.join(', ')}`,
            retryable: false,
          },
        };
      }

      // On-demand SKILL.md loading (progressive disclosure, Story 6.1)
      // This reads the SKILL.md from the Orion filesystem (not from inside the sandbox)
      // and prints it in the sandbox as stdout for Claude to consume.
      const requested = input.skill_doc.replace(/^skill:/, '');
      const skillName = requested.split('/')[0];
      if (!skillName) {
        return {
          success: false,
          error: {
            code: 'TOOL_INVALID_INPUT',
            message: `Invalid skill_doc format: "${input.skill_doc}". Expected: "skill:skill_name"`,
            retryable: false,
          },
        };
      }

      const skillMetadata = await getSkillMetadata(traceId);
      const skill = skillMetadata.find((s) => s.name === skillName);
      if (!skill) {
        return {
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `Skill not found: ${skillName}`,
            retryable: false,
          },
        };
      }

      const skillMdPath = join(skill.skillPath, 'SKILL.md');
      let skillMd: string;
      try {
        skillMd = await readFile(skillMdPath, 'utf-8');
      } catch {
        return {
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `SKILL.md not found for skill "${skillName}" at ${skillMdPath}`,
            retryable: false,
          },
        };
      }
      const encoded = Buffer.from(skillMd, 'utf-8').toString('base64');
      codeToExecute = `import base64\nprint(base64.b64decode("${encoded}").decode("utf-8"))\n`;
      scriptName = `skill_doc:${skillName}`;
    } else if (input.code) {
      codeToExecute = input.code;
    } else {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: 'Either "code", "skill_script", or "skill_doc" must be provided',
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
      event: 'orion_sandbox.start',
      traceId,
      executionType: input.skill_script
        ? 'skill_script'
        : input.skill_doc
          ? 'skill_doc'
          : 'inline_code',
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
      event: 'orion_sandbox.complete',
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
    const isTimeout = error instanceof SandboxTimeoutError;

    span?.end({ metadata: { error: errorMsg, durationMs: duration, isTimeout } });

    logger.error({
      event: 'orion_sandbox.error',
      traceId,
      error: errorMsg,
      isTimeout,
    });

    return {
      success: false,
      error: {
        code: isTimeout ? 'TOOL_TIMEOUT' : 'TOOL_EXECUTION_FAILED',
        message: errorMsg,
        retryable: isTimeout, // Timeouts may succeed on retry with simpler code
      },
    };
  }
}

/**
 * Register orion_sandbox tool with registry.
 *
 * Call this during agent initialization.
 * Use setOrionSandboxContext() before executing to inject proper traceId.
 */
export function registerOrionSandboxTool(): void {
  toolRegistry.registerStaticTool(
    'orion_sandbox',
    async (input: unknown) => {
      // Use currentContext which should be set by caller via setOrionSandboxContext()
      const result = await orionSandboxHandler(input as OrionSandboxInput, currentContext);
      return result;
    },
    orionSandboxToolDefinition
  );
}

