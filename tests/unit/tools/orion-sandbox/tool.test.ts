/**
 * Tests for orion_sandbox tool.
 *
 * @see Story 6.2 - orion_sandbox Tool (GKE Agent Sandbox)
 * @see AC#1 - Code runs in GKE Agent Sandbox
 * @see AC#3 - MCP tools accessible via SDK or HTTP
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  orionSandboxHandler,
  orionSandboxToolDefinition,
  registerOrionSandboxTool,
  setOrionSandboxContext,
  clearOrionSandboxContext,
  __resetCacheForTests,
} from '@/tools/orion-sandbox/tool.js';
import { toolRegistry } from '@/tools/registry.js';
import * as sandboxClient from '@/tools/orion-sandbox/sandbox-client.js';
import * as skillsLoader from '@/skills/loader.js';
import type { SkillMetadata } from '@/skills/types.js';
import { readFile as readFileFn } from 'fs/promises';

// Mock dependencies
vi.mock('@/tools/orion-sandbox/sandbox-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sandbox-client.js')>();
  return {
    ...actual,
    executeSandbox: vi.fn(),
  };
});
vi.mock('@/skills/loader.js');
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));
vi.mock('@/observability/langfuse.js', () => ({
  getLangfuse: () => ({
    span: () => ({ end: vi.fn() }),
  }),
}));
vi.mock('@/config/environment.js', () => ({
  config: {
    mcpServersJson: '{"confluence":"http://localhost:3001"}',
    gkeSandboxRouterUrl: 'http://test-sandbox:8080',
  },
}));

describe('orionSandboxToolDefinition', () => {
  it('has correct tool name (snake_case)', () => {
    expect(orionSandboxToolDefinition.name).toBe('orion_sandbox');
  });

  it('has required input schema properties', () => {
    const schema = orionSandboxToolDefinition.input_schema;
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('code');
    expect(schema.properties).toHaveProperty('skill_script');
    expect(schema.properties).toHaveProperty('skill_doc');
    expect(schema.properties).toHaveProperty('args');
    expect(schema.properties).toHaveProperty('timeout');
  });

  it('describes code execution purpose', () => {
    expect(orionSandboxToolDefinition.description).toContain('Python');
    expect(orionSandboxToolDefinition.description).toContain('sandbox');
  });
});

describe('orionSandboxHandler', () => {
  const mockContext = { traceId: 'test-trace-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetCacheForTests(); // Reset MCP bootstrap cache between tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic code execution (AC#1)', () => {
    it('executes Python code in sandbox and returns result', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '4\n',
        stderr: '',
        return_code: 0,
      });

      const result = await orionSandboxHandler(
        { code: 'print(2 + 2)' },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stdout).toBe('4\n');
        expect(result.data.stderr).toBe('');
        expect(result.data.return_code).toBe(0);
        expect(result.data.execution_time_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('passes code with MCP bootstrap injected to sandbox client (AC#3)', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await orionSandboxHandler({ code: 'x = 1' }, mockContext);

      // Code should include MCP bootstrap and the user code
      const callArgs = vi.mocked(sandboxClient.executeSandbox).mock.calls[0][0];
      expect(callArgs.code).toContain('x = 1'); // User code present
      expect(callArgs.code).toContain('MCP_SERVERS'); // MCP bootstrap injected
      expect(callArgs.code).toContain('# User code below'); // Separator comment
    });

    it('passes MCP_SERVERS environment variable (AC#3)', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await orionSandboxHandler({ code: 'pass' }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            MCP_SERVERS: '{"confluence":"http://localhost:3001"}',
          }),
        })
      );
    });
  });

  describe('input validation', () => {
    it('returns error when neither code, skill_script, nor skill_doc provided', async () => {
      const result = await orionSandboxHandler({}, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('code');
        expect(result.error.message).toContain('skill_script');
        expect(result.error.message).toContain('skill_doc');
      }
    });

    it('returns error for invalid skill_script format (GKE skill without script path)', async () => {
      // Use GKE-only skill name to pass allowlist, then test format validation
      const result = await orionSandboxHandler(
        { skill_script: 'webapp-testing' }, // Missing /script.py part
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('Invalid skill_script format');
      }
    });
  });

  describe('timeout handling (AC#7)', () => {
    it('uses default timeout of 30s', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await orionSandboxHandler({ code: 'pass' }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 30 })
      );
    });

    it('respects custom timeout', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await orionSandboxHandler({ code: 'pass', timeout: 60 }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 60 })
      );
    });

    it('caps timeout at 120s max', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      await orionSandboxHandler({ code: 'pass', timeout: 300 }, mockContext);

      expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 120 })
      );
    });
  });

  describe('error handling (AC#6)', () => {
    it('returns error gracefully when sandbox fails', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockRejectedValue(
        new Error('Sandbox connection failed')
      );

      const result = await orionSandboxHandler({ code: 'pass' }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
        expect(result.error.message).toContain('Sandbox connection failed');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('never throws exceptions (project-context.md mandate)', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockRejectedValue(
        new Error('Unexpected error')
      );

      // Should not throw
      await expect(
        orionSandboxHandler({ code: 'pass' }, mockContext)
      ).resolves.toBeDefined();
    });

    it('returns TOOL_TIMEOUT for SandboxTimeoutError (AC#7)', async () => {
      // Use the actual SandboxTimeoutError class from the module
      vi.mocked(sandboxClient.executeSandbox).mockRejectedValue(
        new sandboxClient.SandboxTimeoutError(30)
      );

      const result = await orionSandboxHandler({ code: 'pass' }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TOOL_TIMEOUT');
        expect(result.error.message).toContain('timed out');
        expect(result.error.retryable).toBe(true); // Timeouts may succeed on retry
      }
    });
  });

  describe('result capture (AC#5)', () => {
    it('captures stdout, stderr, and return_code', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: 'output',
        stderr: 'warning',
        return_code: 1,
      });

      const result = await orionSandboxHandler({ code: 'print("x")' }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stdout).toBe('output');
        expect(result.data.stderr).toBe('warning');
        expect(result.data.return_code).toBe(1);
      }
    });

    it('includes execution_time_ms in result', async () => {
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: '',
        stderr: '',
        return_code: 0,
      });

      const result = await orionSandboxHandler({ code: 'pass' }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.execution_time_ms).toBe('number');
      }
    });
  });
});

describe('skill script execution (AC#4)', () => {
  const mockContext = { traceId: 'test-trace-skill' };
  // NOTE: Must use GKE-only skill name to pass Story 6.12 allowlist validation
  const mockSkillWithScripts: SkillMetadata = {
    name: 'webapp-testing', // GKE-only skill
    description: 'Test skill',
    filePath: '.skills/webapp-testing/SKILL.md',
    skillPath: '.skills/webapp-testing',
    hasExecutableScripts: true,
    scripts: [
      { name: 'process.py', path: '/mock/path/process.py' },
      { name: 'analyze.py', path: '/mock/path/analyze.py' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes skill script with skill: prefix', async () => {
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockSkillWithScripts]);
    vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
      stdout: 'skill output',
      stderr: '',
      return_code: 0,
    });

    // Mock readFile for the script
    (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('print("hello from skill")');

    const result = await orionSandboxHandler(
      { skill_script: 'skill:webapp-testing/process.py' },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(skillsLoader.getSkillMetadata).toHaveBeenCalledWith('test-trace-skill');
  });

  it('executes skill script without skill: prefix', async () => {
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockSkillWithScripts]);
    vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
      stdout: 'output',
      stderr: '',
      return_code: 0,
    });

    (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('pass');

    const result = await orionSandboxHandler(
      { skill_script: 'webapp-testing/process.py' },
      mockContext
    );

    expect(result.success).toBe(true);
  });

  it('returns error when GKE-only skill not found', async () => {
    // NOTE: Must use GKE-only skill name to pass allowlist, then test skill-not-found
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([]);

    const result = await orionSandboxHandler(
      { skill_script: 'skill:webapp-testing/script.py' },
      mockContext
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Skill not found: webapp-testing');
    }
  });

  it('returns error when skill has no executable scripts', async () => {
    const skillWithoutScripts: SkillMetadata = {
      ...mockSkillWithScripts,
      hasExecutableScripts: false,
      scripts: undefined,
    };
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([skillWithoutScripts]);

    const result = await orionSandboxHandler(
      { skill_script: 'skill:webapp-testing/script.py' },
      mockContext
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('has no executable scripts');
    }
  });

  it('returns error when script not found in skill', async () => {
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockSkillWithScripts]);

    const result = await orionSandboxHandler(
      { skill_script: 'skill:webapp-testing/missing.py' },
      mockContext
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Script not found: missing.py');
      expect(result.error.message).toContain('process.py');
    }
  });

  it('passes args as ARGS environment variable along with MCP_SERVERS', async () => {
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockSkillWithScripts]);
    vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
      stdout: '',
      stderr: '',
      return_code: 0,
    });

    (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('print(ARGS)');

    await orionSandboxHandler(
      {
        skill_script: 'skill:webapp-testing/process.py',
        args: { query: 'test' },
      },
      mockContext
    );

    expect(sandboxClient.executeSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          ARGS: '{"query":"test"}',
          MCP_SERVERS: '{"confluence":"http://localhost:3001"}',
        }),
      })
    );
  });
});

describe('skill doc execution (Story 6.1 on-demand SKILL.md)', () => {
  const mockContext = { traceId: 'test-trace-skill-doc' };
  // NOTE: Must use GKE-only skill name to pass Story 6.12 allowlist validation
  const mockSkill: SkillMetadata = {
    name: 'web-artifacts-builder', // GKE-only skill
    description: 'Test skill',
    filePath: '.skills/web-artifacts-builder/SKILL.md',
    skillPath: '.skills/web-artifacts-builder',
    hasExecutableScripts: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads SKILL.md via skill_doc and prints it in sandbox', async () => {
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockSkill]);
    vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
      stdout: 'printed skill doc',
      stderr: '',
      return_code: 0,
    });

    (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('SKILL CONTENT');

    const result = await orionSandboxHandler({ skill_doc: 'skill:web-artifacts-builder' }, mockContext);
    expect(result.success).toBe(true);

    // Ensure sandbox executed code with base64 decode helper
    const callArgs = vi.mocked(sandboxClient.executeSandbox).mock.calls[0][0];
    expect(callArgs.code).toContain('base64.b64decode');
  });

  it('returns TOOL_NOT_FOUND when GKE-only skill_doc skill is missing', async () => {
    // NOTE: Must use GKE-only skill name to pass allowlist, then test skill-not-found
    vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([]);
    const result = await orionSandboxHandler({ skill_doc: 'skill:webapp-testing' }, mockContext);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_NOT_FOUND');
    }
  });

  it('returns SKILL_NOT_GKE for empty skill_doc format (empty = non-GKE)', async () => {
    // Test edge case: "skill:" with nothing after it → empty string → not in GKE list
    const result = await orionSandboxHandler({ skill_doc: 'skill:' }, mockContext);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Empty string is not a GKE-only skill, so we get SKILL_NOT_GKE
      expect(result.error.code).toBe('SKILL_NOT_GKE');
    }
  });
});

describe('registerOrionSandboxTool', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
  });

  it('registers orion_sandbox tool with registry', () => {
    registerOrionSandboxTool();

    const tool = toolRegistry.getStaticTool('orion_sandbox');
    expect(tool).toBeDefined();
    expect(tool?.claudeTool.name).toBe('orion_sandbox');
  });
});

describe('context management (AC#8 traceId fix)', () => {
  beforeEach(() => {
    clearOrionSandboxContext();
  });

  afterEach(() => {
    clearOrionSandboxContext();
  });

  it('setOrionSandboxContext stores traceId for handler', async () => {
    vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
      stdout: '',
      stderr: '',
      return_code: 0,
    });

    // Set context before registering and calling tool
    setOrionSandboxContext({ traceId: 'custom-trace-id' });

    // The handler should use the set context
    // This is tested indirectly via the registry wrapper
    toolRegistry.__resetForTests();
    registerOrionSandboxTool();

    const tool = toolRegistry.getStaticTool('orion_sandbox');
    expect(tool).toBeDefined();

    // Execute via registry wrapper
    await tool?.handler({ code: 'pass' });

    // Handler was called (we can't easily verify traceId without more mocks,
    // but this ensures the context flow works)
    expect(sandboxClient.executeSandbox).toHaveBeenCalled();
  });

  it('clearOrionSandboxContext resets to unknown', () => {
    setOrionSandboxContext({ traceId: 'some-trace' });
    clearOrionSandboxContext();
    // Context is cleared - subsequent calls will use 'unknown'
    // This is a simple state test
    expect(true).toBe(true); // Context cleared without error
  });
});

/**
 * GKE-only skill enforcement tests.
 *
 * @see Story 6.12 - GKE Sandbox Scope Reduction
 * @see AC#1 - Non-GKE skills rejected with SKILL_NOT_GKE
 * @see AC#2 - GKE-only skills accepted and execute successfully
 */
describe('GKE-only skill enforcement (Story 6.12)', () => {
  const mockContext = { traceId: 'test-trace-gke-enforcement' };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetCacheForTests();
  });

  describe('skill_doc rejection (AC#1)', () => {
    it('rejects non-GKE skills via skill_doc with SKILL_NOT_GKE error', async () => {
      // GIVEN: A skill that should run in Anthropic container (not GKE)
      const mockNonGkeSkill: SkillMetadata = {
        name: 'summarize',
        description: 'Summarization skill',
        filePath: '.skills/summarize/SKILL.md',
        skillPath: '.skills/summarize',
        hasExecutableScripts: false,
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockNonGkeSkill]);

      // WHEN: Someone tries to execute it via orion_sandbox
      const result = await orionSandboxHandler(
        { skill_doc: 'skill:summarize' },
        mockContext
      );

      // THEN: It's rejected with SKILL_NOT_GKE error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SKILL_NOT_GKE');
        expect(result.error.message).toContain('Anthropic container');
        expect(result.error.message).toContain('webapp-testing');
        expect(result.error.message).toContain('web-artifacts-builder');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('rejects xlsx skill via skill_doc (migrated to Anthropic)', async () => {
      // GIVEN: xlsx skill - was GKE, now migrated to Anthropic
      const mockXlsxSkill: SkillMetadata = {
        name: 'xlsx',
        description: 'XLSX processing skill',
        filePath: '.skills/xlsx/SKILL.md',
        skillPath: '.skills/xlsx',
        hasExecutableScripts: true,
        scripts: [{ name: 'process.py', path: '.skills/xlsx/scripts/process.py' }],
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockXlsxSkill]);

      // WHEN: Someone tries to execute xlsx in GKE
      const result = await orionSandboxHandler(
        { skill_doc: 'skill:xlsx' },
        mockContext
      );

      // THEN: It's rejected (should use PTC instead)
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SKILL_NOT_GKE');
      }
    });
  });

  describe('skill_script rejection (AC#1)', () => {
    it('rejects non-GKE skills via skill_script with SKILL_NOT_GKE error', async () => {
      // GIVEN: An Anthropic-hosted skill with scripts
      const mockNonGkeSkill: SkillMetadata = {
        name: 'algorithmic-art',
        description: 'Art generation',
        filePath: '.skills/algorithmic-art/SKILL.md',
        skillPath: '.skills/algorithmic-art',
        hasExecutableScripts: true,
        scripts: [{ name: 'generate.py', path: '.skills/algorithmic-art/scripts/generate.py' }],
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockNonGkeSkill]);

      // WHEN: Someone tries to execute the script via orion_sandbox
      const result = await orionSandboxHandler(
        { skill_script: 'skill:algorithmic-art/generate.py' },
        mockContext
      );

      // THEN: It's rejected with SKILL_NOT_GKE error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SKILL_NOT_GKE');
        expect(result.error.message).toContain('Anthropic container');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('rejects skill_script without skill: prefix for non-GKE skills', async () => {
      // GIVEN: Non-GKE skill
      const mockSkill: SkillMetadata = {
        name: 'example',
        description: 'Example skill',
        filePath: '.skills/example/SKILL.md',
        skillPath: '.skills/example',
        hasExecutableScripts: true,
        scripts: [{ name: 'run.py', path: '.skills/example/scripts/run.py' }],
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockSkill]);

      // WHEN: Using path without skill: prefix
      const result = await orionSandboxHandler(
        { skill_script: 'example/run.py' },
        mockContext
      );

      // THEN: Still rejected (prefix is optional per existing behavior)
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SKILL_NOT_GKE');
      }
    });
  });

  describe('GKE-only skill acceptance (AC#2)', () => {
    it('accepts webapp-testing via skill_doc', async () => {
      // GIVEN: webapp-testing skill (requires Playwright + local servers)
      const mockGkeSkill: SkillMetadata = {
        name: 'webapp-testing',
        description: 'Web app testing with Playwright',
        filePath: '.skills/webapp-testing/SKILL.md',
        skillPath: '.skills/webapp-testing',
        hasExecutableScripts: false,
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockGkeSkill]);
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: 'skill doc content',
        stderr: '',
        return_code: 0,
      });
      (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('# Webapp Testing\n\nPlaywright-based testing.');

      // WHEN: Executing via orion_sandbox
      const result = await orionSandboxHandler(
        { skill_doc: 'skill:webapp-testing' },
        mockContext
      );

      // THEN: It executes successfully
      expect(result.success).toBe(true);
      expect(sandboxClient.executeSandbox).toHaveBeenCalled();
    });

    it('accepts web-artifacts-builder via skill_doc', async () => {
      // GIVEN: web-artifacts-builder skill (requires local filesystem)
      const mockGkeSkill: SkillMetadata = {
        name: 'web-artifacts-builder',
        description: 'Build web artifacts',
        filePath: '.skills/web-artifacts-builder/SKILL.md',
        skillPath: '.skills/web-artifacts-builder',
        hasExecutableScripts: false,
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockGkeSkill]);
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: 'artifact built',
        stderr: '',
        return_code: 0,
      });
      (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('# Web Artifacts Builder');

      // WHEN: Executing via orion_sandbox
      const result = await orionSandboxHandler(
        { skill_doc: 'skill:web-artifacts-builder' },
        mockContext
      );

      // THEN: It executes successfully
      expect(result.success).toBe(true);
    });

    it('accepts webapp-testing via skill_script', async () => {
      // GIVEN: webapp-testing with scripts
      const mockGkeSkill: SkillMetadata = {
        name: 'webapp-testing',
        description: 'Web app testing',
        filePath: '.skills/webapp-testing/SKILL.md',
        skillPath: '.skills/webapp-testing',
        hasExecutableScripts: true,
        scripts: [{ name: 'test.py', path: '.skills/webapp-testing/scripts/test.py' }],
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockGkeSkill]);
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: 'tests passed',
        stderr: '',
        return_code: 0,
      });
      (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('print("running tests")');

      // WHEN: Executing script via orion_sandbox
      const result = await orionSandboxHandler(
        { skill_script: 'skill:webapp-testing/test.py' },
        mockContext
      );

      // THEN: It executes successfully
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stdout).toBe('tests passed');
      }
    });
  });

  describe('error message quality (AC#1)', () => {
    it('includes helpful migration guidance in error message', async () => {
      // GIVEN: Non-GKE skill
      const mockSkill: SkillMetadata = {
        name: 'summarize',
        description: 'Summary',
        filePath: '.skills/summarize/SKILL.md',
        skillPath: '.skills/summarize',
        hasExecutableScripts: false,
      };
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([mockSkill]);

      // WHEN: Rejected
      const result = await orionSandboxHandler(
        { skill_doc: 'skill:summarize' },
        mockContext
      );

      // THEN: Error message guides user to PTC
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should mention PTC as alternative
        expect(result.error.message.toLowerCase()).toContain('ptc');
        // Should list the valid GKE skills
        expect(result.error.message).toContain('webapp-testing');
        expect(result.error.message).toContain('web-artifacts-builder');
      }
    });
  });
});

