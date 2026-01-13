import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('environment config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load configuration with defaults', async () => {
    process.env.NODE_ENV = 'development'; // Ensure not production for this test
    const { config } = await import('@/config/environment.js');

    expect(config).toBeDefined();
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(['debug', 'info', 'warn', 'error']).toContain(config.logLevel);
  });

  it('should have new configuration fields', async () => {
     process.env.NODE_ENV = 'development';
     process.env.ANTHROPIC_MODEL = 'test-model';
     process.env.GCS_MEMORIES_BUCKET = 'test-bucket';

     const { config } = await import('@/config/environment.js');

     expect(config.anthropicModel).toBe('test-model');
     expect(config.gcsMemoriesBucket).toBe('test-bucket');
  });

  it('should default anthropicModel from .orion/config.yaml when env var not set', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ANTHROPIC_MODEL;

    const { config } = await import('@/config/environment.js');
    expect(config.anthropicModel).toBe('claude-sonnet-4-5-20250929');
  });

  it('should validate required variables in production', async () => {
    process.env.NODE_ENV = 'production';
    // Missing required variables
    process.env.SLACK_BOT_TOKEN = '';

    await expect(import('./environment.js')).rejects.toThrow();
  });

  it('should pass validation in production with all variables', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.SLACK_SIGNING_SECRET = 'test-secret';
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.ANTHROPIC_MODEL = 'claude-test';
    process.env.GCS_MEMORIES_BUCKET = 'memories-test';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';

    const { config } = await import('@/config/environment.js');
    expect(config.nodeEnv).toBe('production');
  });

  // ==========================================================================
  // Story 6.2: Consolidated Beta Headers (AC#5)
  // ==========================================================================

  describe('anthropic.allBetas (Story 6.2 AC#5)', () => {
    it('should have consolidated allBetas array', async () => {
      process.env.NODE_ENV = 'development';
      const { config } = await import('@/config/environment.js');

      // THEN: config.anthropic.allBetas should exist and be an array
      expect(config.anthropic).toBeDefined();
      expect(config.anthropic.allBetas).toBeDefined();
      expect(Array.isArray(config.anthropic.allBetas)).toBe(true);
    });

    it('should include existing betas (context-management, advanced-tool-use)', async () => {
      process.env.NODE_ENV = 'development';
      const { config } = await import('@/config/environment.js');

      // THEN: Should include Story 5.1 (Memory) and Story 6.3 (PTC) betas
      expect(config.anthropic.allBetas).toContain('context-management-2025-06-27');
      expect(config.anthropic.allBetas).toContain('advanced-tool-use-2025-11-20');
    });

    it('should include new skills-related betas', async () => {
      process.env.NODE_ENV = 'development';
      const { config } = await import('@/config/environment.js');

      // THEN: Should include Story 6.2 betas
      expect(config.anthropic.allBetas).toContain('code-execution-2025-08-25');
      expect(config.anthropic.allBetas).toContain('skills-2025-10-02');
      expect(config.anthropic.allBetas).toContain('files-api-2025-04-14');
    });

    it('should have exactly 5 consolidated betas', async () => {
      process.env.NODE_ENV = 'development';
      const { config } = await import('@/config/environment.js');

      // THEN: Should have all 5 required betas
      expect(config.anthropic.allBetas).toHaveLength(5);
    });

    it('should produce valid comma-separated header string', async () => {
      process.env.NODE_ENV = 'development';
      const { config } = await import('@/config/environment.js');

      // THEN: Joining should produce valid header format
      const headerValue = config.anthropic.allBetas.join(',');
      expect(headerValue).toMatch(/^[a-z0-9-]+(-\d{4}-\d{2}-\d{2})?(,[a-z0-9-]+(-\d{4}-\d{2}-\d{2})?)*$/);
      expect(headerValue).toContain('skills-2025-10-02');
    });
  });

  // ==========================================================================
  // Story 6.2: Skills Enabled Config (AC#7)
  // ==========================================================================

  describe('anthropic.skillsEnabled (Story 6.2 AC#7)', () => {
    it('should default skillsEnabled to true', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ANTHROPIC_SKILLS_ENABLED;
      const { config } = await import('@/config/environment.js');

      // THEN: Skills should be enabled by default
      expect(config.anthropic.skillsEnabled).toBe(true);
    });

    it('should disable skills when ANTHROPIC_SKILLS_ENABLED=false', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ANTHROPIC_SKILLS_ENABLED = 'false';
      const { config } = await import('@/config/environment.js');

      // THEN: Skills should be disabled
      expect(config.anthropic.skillsEnabled).toBe(false);
    });

    it('should enable skills when ANTHROPIC_SKILLS_ENABLED=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ANTHROPIC_SKILLS_ENABLED = 'true';
      const { config } = await import('@/config/environment.js');

      // THEN: Skills should be enabled
      expect(config.anthropic.skillsEnabled).toBe(true);
    });

    it('should treat non-false values as true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ANTHROPIC_SKILLS_ENABLED = '1';
      const { config } = await import('@/config/environment.js');

      // THEN: Non-false values should enable skills
      expect(config.anthropic.skillsEnabled).toBe(true);
    });
  });

  // ==========================================================================
  // Story 8.2: Tool Search Configuration (AC#2)
  // ==========================================================================

  describe('toolSearch config (Story 8.2 AC#2)', () => {
    it('should default TOOL_SEARCH_ENABLED to true', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.TOOL_SEARCH_ENABLED;
      const { config } = await import('@/config/environment.js');

      // THEN: Tool search should be enabled by default
      expect(config.toolSearch).toBeDefined();
      expect(config.toolSearch.enabled).toBe(true);
    });

    it('should disable tool search when TOOL_SEARCH_ENABLED=false', async () => {
      process.env.NODE_ENV = 'development';
      process.env.TOOL_SEARCH_ENABLED = 'false';
      const { config } = await import('@/config/environment.js');

      // THEN: Tool search should be disabled
      expect(config.toolSearch.enabled).toBe(false);
    });

    it('should enable tool search when TOOL_SEARCH_ENABLED=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.TOOL_SEARCH_ENABLED = 'true';
      const { config } = await import('@/config/environment.js');

      // THEN: Tool search should be enabled
      expect(config.toolSearch.enabled).toBe(true);
    });

    it('should treat non-false TOOL_SEARCH_ENABLED values as true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.TOOL_SEARCH_ENABLED = '1';
      const { config } = await import('@/config/environment.js');

      // THEN: Non-false values should enable tool search
      expect(config.toolSearch.enabled).toBe(true);
    });

    it('should default CORE_TOOLS to memory, code_execution, summarize', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.CORE_TOOLS;
      const { config } = await import('@/config/environment.js');

      // THEN: Should have default core tools
      expect(config.toolSearch.coreTools).toEqual(['memory', 'code_execution', 'summarize']);
    });

    it('should parse CORE_TOOLS from comma-separated string', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CORE_TOOLS = 'memory,code_execution,summarize,custom_tool';
      const { config } = await import('@/config/environment.js');

      // THEN: Should contain all four tool names
      expect(config.toolSearch.coreTools).toEqual([
        'memory',
        'code_execution',
        'summarize',
        'custom_tool',
      ]);
    });

    it('should trim whitespace from CORE_TOOLS values', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CORE_TOOLS = ' memory , code_execution , summarize ';
      const { config } = await import('@/config/environment.js');

      // THEN: Tools should be trimmed
      expect(config.toolSearch.coreTools).toEqual(['memory', 'code_execution', 'summarize']);
    });

    it('should fall back to defaults when CORE_TOOLS is empty string', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CORE_TOOLS = '';
      const { config } = await import('@/config/environment.js');

      // THEN: Should fall back to default core tools
      expect(config.toolSearch.coreTools).toEqual(['memory', 'code_execution', 'summarize']);
    });

    it('should fall back to defaults when CORE_TOOLS is only whitespace', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CORE_TOOLS = '   ';
      const { config } = await import('@/config/environment.js');

      // THEN: Should fall back to default core tools
      expect(config.toolSearch.coreTools).toEqual(['memory', 'code_execution', 'summarize']);
    });
  });
});
