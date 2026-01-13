import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toolRegistry, parseMcpToolName, type ClaudeToolWithDeferLoading } from '@/tools/registry.js';

// Mock the config module for tool search tests
vi.mock('@/config/environment.js', () => ({
  config: {
    toolSearch: {
      enabled: true,
      coreTools: ['memory', 'code_execution', 'summarize'],
    },
  },
}));

describe('parseMcpToolName (Task 1)', () => {
  it('parses server__tool (split on first __ only)', () => {
    expect(parseMcpToolName('rube__search')).toEqual({
      serverName: 'rube',
      toolName: 'search',
    });

    expect(parseMcpToolName('rube__search__v2')).toEqual({
      serverName: 'rube',
      toolName: 'search__v2',
    });
  });

  it('rejects malformed names', () => {
    expect(parseMcpToolName('search')).toBeNull();
    expect(parseMcpToolName('__search')).toBeNull();
    expect(parseMcpToolName('rube__')).toBeNull();
  });
});

describe('ToolRegistry (Task 1 conflict policy)', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
  });

  it('excludes MCP tool if its unprefixed name conflicts with a static tool name', () => {
    toolRegistry.registerStaticTool(
      'search',
      async () => ({}),
      {
        name: 'search',
        description: 'static search',
        input_schema: { type: 'object', properties: {} },
      }
    );

    const registered = toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'mcp search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);

    expect(registered).toBe(0);
    expect(toolRegistry.getMcpTool('rube__search')).toBeUndefined();
  });

  it('keeps same unprefixed tool name across multiple servers (distinct prefixes)', () => {
    const r1 = toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'rube__search',
          description: 'mcp search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);

    const r2 = toolRegistry.registerMcpTools('exa', [
      {
        originalName: 'search',
        claudeTool: {
          name: 'exa__search',
          description: 'mcp search',
          input_schema: { type: 'object', properties: {} },
        },
      },
    ]);

    expect(r1).toBe(1);
    expect(r2).toBe(1);
    expect(toolRegistry.getMcpTool('rube__search')).toBeDefined();
    expect(toolRegistry.getMcpTool('exa__search')).toBeDefined();
  });

  it('returns deterministic tool list ordering (sorted by name)', () => {
    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'z',
        claudeTool: { name: 'rube__z', input_schema: { type: 'object', properties: {} } },
      },
      {
        originalName: 'a',
        claudeTool: { name: 'rube__a', input_schema: { type: 'object', properties: {} } },
      },
    ]);

    const names = toolRegistry.getToolsForClaude().map((t) => t.name);
    expect(names).toEqual(['rube__a', 'rube__z']);
  });

  it('sorts across static + MCP tools deterministically (Task 6)', () => {
    toolRegistry.registerMcpTools('rube', [
      {
        originalName: 'bbb',
        claudeTool: { name: 'rube__bbb', input_schema: { type: 'object', properties: {} } },
      },
    ]);

    toolRegistry.registerStaticTool(
      'aaa',
      async () => ({}),
      { name: 'aaa', input_schema: { type: 'object', properties: {} } }
    );

    const names = toolRegistry.getToolsForClaude().map((t) => t.name);
    expect(names).toEqual(['aaa', 'rube__bbb']);
  });
});

describe('ToolRegistry - Skill Tools (Story 6.1)', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
  });

  it('registers skill tool with prefixed name', () => {
    toolRegistry.registerDynamicTool('deep_research', 'initiate_search', {
      name: 'initiate_search',
      description: 'Start search',
      input_schema: { type: 'object', properties: {} },
    });

    const tool = toolRegistry.getSkillTool('deep_research__initiate_search');
    expect(tool).toBeDefined();
    expect(tool?.skillName).toBe('deep_research');
    expect(tool?.originalName).toBe('initiate_search');
    expect(tool?.claudeTool.name).toBe('deep_research__initiate_search');
  });

  it('includes skill tools in getToolsForClaude', () => {
    toolRegistry.registerDynamicTool('my_skill', 'my_tool', {
      name: 'my_tool',
      description: 'My tool',
      input_schema: { type: 'object', properties: {} },
    });

    const tools = toolRegistry.getToolsForClaude();
    const names = tools.map((t) => t.name);
    expect(names).toContain('my_skill__my_tool');
  });

  it('removes skill tools by skill name', () => {
    toolRegistry.registerDynamicTool('skill_a', 'tool_1', {
      name: 'tool_1',
      input_schema: { type: 'object', properties: {} },
    });
    toolRegistry.registerDynamicTool('skill_a', 'tool_2', {
      name: 'tool_2',
      input_schema: { type: 'object', properties: {} },
    });
    toolRegistry.registerDynamicTool('skill_b', 'tool_1', {
      name: 'tool_1',
      input_schema: { type: 'object', properties: {} },
    });

    const removed = toolRegistry.removeSkillTools('skill_a');

    expect(removed).toBe(2);
    expect(toolRegistry.getSkillTool('skill_a__tool_1')).toBeUndefined();
    expect(toolRegistry.getSkillTool('skill_a__tool_2')).toBeUndefined();
    expect(toolRegistry.getSkillTool('skill_b__tool_1')).toBeDefined();
  });

  it('clears all skill tools', () => {
    toolRegistry.registerDynamicTool('skill_a', 'tool', {
      name: 'tool',
      input_schema: { type: 'object', properties: {} },
    });
    toolRegistry.registerDynamicTool('skill_b', 'tool', {
      name: 'tool',
      input_schema: { type: 'object', properties: {} },
    });

    toolRegistry.clearSkillTools();

    expect(toolRegistry.getSkillTool('skill_a__tool')).toBeUndefined();
    expect(toolRegistry.getSkillTool('skill_b__tool')).toBeUndefined();
  });

  it('prevents conflict with static tools', () => {
    toolRegistry.registerStaticTool(
      'skill__tool',
      async () => ({}),
      { name: 'skill__tool', input_schema: { type: 'object', properties: {} } }
    );

    toolRegistry.registerDynamicTool('skill', 'tool', {
      name: 'tool',
      input_schema: { type: 'object', properties: {} },
    });

    // Skill tool should not override static tool
    expect(toolRegistry.getSkillTool('skill__tool')).toBeUndefined();
    expect(toolRegistry.getStaticTool('skill__tool')).toBeDefined();
  });

  it('prevents conflict with MCP tools', () => {
    toolRegistry.registerMcpTools('skill', [
      {
        originalName: 'tool',
        claudeTool: { name: 'skill__tool', input_schema: { type: 'object', properties: {} } },
      },
    ]);

    toolRegistry.registerDynamicTool('skill', 'tool', {
      name: 'tool',
      input_schema: { type: 'object', properties: {} },
    });

    // Skill tool should not override MCP tool
    expect(toolRegistry.getSkillTool('skill__tool')).toBeUndefined();
    expect(toolRegistry.getMcpTool('skill__tool')).toBeDefined();
  });

  it('sorts skill tools alongside static and MCP tools', () => {
    toolRegistry.registerStaticTool(
      'aaa',
      async () => ({}),
      { name: 'aaa', input_schema: { type: 'object', properties: {} } }
    );
    toolRegistry.registerMcpTools('mcp', [
      {
        originalName: 'bbb',
        claudeTool: { name: 'mcp__bbb', input_schema: { type: 'object', properties: {} } },
      },
    ]);
    toolRegistry.registerDynamicTool('skill', 'ccc', {
      name: 'ccc',
      input_schema: { type: 'object', properties: {} },
    });

    const names = toolRegistry.getToolsForClaude().map((t) => t.name);
    expect(names).toEqual(['aaa', 'mcp__bbb', 'skill__ccc']);
  });
});

// =============================================================================
// Story 8.2: Tool Search - defer_loading Support
// =============================================================================

describe('ToolRegistry - Tool Search defer_loading (Story 8.2)', () => {
  beforeEach(() => {
    toolRegistry.__resetForTests();
  });

  // --------------------------------------------------------------------------
  // AC1: Tool Definition Enhancement - defer_loading property
  // --------------------------------------------------------------------------

  describe('AC1: defer_loading property', () => {
    it('MCP tools receive defer_loading: true when tool search enabled', () => {
      toolRegistry.registerMcpTools('rube', [
        {
          originalName: 'RUBE_SEARCH_TOOLS',
          claudeTool: {
            name: 'rube__RUBE_SEARCH_TOOLS',
            description: 'Search tools',
            input_schema: { type: 'object', properties: {} },
          },
        },
      ]);

      const tools = toolRegistry.getToolsForClaude() as ClaudeToolWithDeferLoading[];
      const rubeTool = tools.find((t) => t.name === 'rube__RUBE_SEARCH_TOOLS');

      expect(rubeTool).toBeDefined();
      expect(rubeTool?.defer_loading).toBe(true);
    });

    it('static tools do NOT have defer_loading property', () => {
      toolRegistry.registerStaticTool(
        'my_static_tool',
        async () => ({}),
        { name: 'my_static_tool', input_schema: { type: 'object', properties: {} } }
      );

      const tools = toolRegistry.getToolsForClaude() as ClaudeToolWithDeferLoading[];
      const staticTool = tools.find((t) => t.name === 'my_static_tool');

      expect(staticTool).toBeDefined();
      expect(staticTool?.defer_loading).toBeUndefined();
    });

    it('skill tools receive defer_loading: true', () => {
      toolRegistry.registerDynamicTool('my_skill', 'do_something', {
        name: 'do_something',
        input_schema: { type: 'object', properties: {} },
      });

      const tools = toolRegistry.getToolsForClaude() as ClaudeToolWithDeferLoading[];
      const skillTool = tools.find((t) => t.name === 'my_skill__do_something');

      expect(skillTool).toBeDefined();
      expect(skillTool?.defer_loading).toBe(true);
    });

    it('empty MCP tool list returns only core tools without error', () => {
      // Register only static tools
      toolRegistry.registerStaticTool(
        'memory',
        async () => ({}),
        { name: 'memory', input_schema: { type: 'object', properties: {} } }
      );

      const tools = toolRegistry.getToolsForClaude();

      expect(tools.length).toBe(1);
      expect(tools[0]?.name).toBe('memory');
    });
  });

  // --------------------------------------------------------------------------
  // AC3: Tool Registry Enhancement - getCoreTool
  // --------------------------------------------------------------------------

  describe('AC3: getCoreTool method', () => {
    it('returns core tool by name', () => {
      toolRegistry.registerStaticTool(
        'memory',
        async () => ({}),
        {
          name: 'memory',
          description: 'Memory tool',
          input_schema: { type: 'object', properties: {} },
        }
      );

      const tool = toolRegistry.getCoreTool('memory');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('memory');
    });

    it('returns undefined for non-core tool', () => {
      toolRegistry.registerMcpTools('rube', [
        {
          originalName: 'RUBE_SEARCH_TOOLS',
          claudeTool: { name: 'rube__RUBE_SEARCH_TOOLS', input_schema: { type: 'object', properties: {} } },
        },
      ]);

      const tool = toolRegistry.getCoreTool('rube__RUBE_SEARCH_TOOLS');

      expect(tool).toBeUndefined();
    });

    it('returns undefined for null/undefined name', () => {
      expect(toolRegistry.getCoreTool(null)).toBeUndefined();
      expect(toolRegistry.getCoreTool(undefined)).toBeUndefined();
    });

    it('is case-sensitive for tool name matching', () => {
      toolRegistry.registerStaticTool(
        'memory',
        async () => ({}),
        { name: 'memory', input_schema: { type: 'object', properties: {} } }
      );

      expect(toolRegistry.getCoreTool('MEMORY')).toBeUndefined();
      expect(toolRegistry.getCoreTool('Memory')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // AC4: Agent Loop Integration - enableDeferLoading override
  // --------------------------------------------------------------------------

  describe('AC4: enableDeferLoading override', () => {
    it('disables defer_loading when override is false', () => {
      toolRegistry.registerMcpTools('rube', [
        {
          originalName: 'search',
          claudeTool: { name: 'rube__search', input_schema: { type: 'object', properties: {} } },
        },
      ]);

      const tools = toolRegistry.getToolsForClaude({ enableDeferLoading: false }) as ClaudeToolWithDeferLoading[];
      const rubeTool = tools.find((t) => t.name === 'rube__search');

      expect(rubeTool?.defer_loading).toBeUndefined();
    });

    it('enables defer_loading when override is true', () => {
      toolRegistry.registerMcpTools('rube', [
        {
          originalName: 'search',
          claudeTool: { name: 'rube__search', input_schema: { type: 'object', properties: {} } },
        },
      ]);

      const tools = toolRegistry.getToolsForClaude({ enableDeferLoading: true }) as ClaudeToolWithDeferLoading[];
      const rubeTool = tools.find((t) => t.name === 'rube__search');

      expect(rubeTool?.defer_loading).toBe(true);
    });

    it('core tools never get defer_loading even when enabled', () => {
      toolRegistry.registerStaticTool(
        'memory',
        async () => ({}),
        { name: 'memory', input_schema: { type: 'object', properties: {} } }
      );
      toolRegistry.registerStaticTool(
        'code_execution',
        async () => ({}),
        { name: 'code_execution', input_schema: { type: 'object', properties: {} } }
      );

      const tools = toolRegistry.getToolsForClaude({ enableDeferLoading: true }) as ClaudeToolWithDeferLoading[];

      const memoryTool = tools.find((t) => t.name === 'memory');
      const codeExecTool = tools.find((t) => t.name === 'code_execution');

      // Static tools are always-loaded
      expect(memoryTool?.defer_loading).toBeUndefined();
      expect(codeExecTool?.defer_loading).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('handles large number of MCP tools', () => {
      // Register 100+ MCP tools
      const mcpToolsList = Array.from({ length: 150 }, (_, i) => ({
        originalName: `tool_${i}`,
        claudeTool: {
          name: `rube__tool_${i}`,
          input_schema: { type: 'object' as const, properties: {} },
        },
      }));

      toolRegistry.registerMcpTools('rube', mcpToolsList);
      const tools = toolRegistry.getToolsForClaude() as ClaudeToolWithDeferLoading[];

      expect(tools.length).toBe(150);
      // All should have defer_loading (none are core tools)
      const deferredCount = tools.filter((t) => t.defer_loading === true).length;
      expect(deferredCount).toBe(150);
    });

    it('mixed core and non-core tools are categorized correctly', () => {
      // Register a mix of static tools (some core, some not)
      toolRegistry.registerStaticTool(
        'memory',
        async () => ({}),
        { name: 'memory', input_schema: { type: 'object', properties: {} } }
      );
      toolRegistry.registerStaticTool(
        'custom_static',
        async () => ({}),
        { name: 'custom_static', input_schema: { type: 'object', properties: {} } }
      );
      toolRegistry.registerMcpTools('rube', [
        {
          originalName: 'search',
          claudeTool: { name: 'rube__search', input_schema: { type: 'object', properties: {} } },
        },
      ]);

      const tools = toolRegistry.getToolsForClaude() as ClaudeToolWithDeferLoading[];

      // Static tools (both memory and custom_static) should NOT have defer_loading
      const memoryTool = tools.find((t) => t.name === 'memory');
      const customTool = tools.find((t) => t.name === 'custom_static');
      const mcpTool = tools.find((t) => t.name === 'rube__search');

      expect(memoryTool?.defer_loading).toBeUndefined();
      expect(customTool?.defer_loading).toBeUndefined();
      expect(mcpTool?.defer_loading).toBe(true);
    });
  });
});


