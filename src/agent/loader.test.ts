/**
 * Tests for Agent Loader
 *
 * @see Story 2.1 - Anthropic API Integration
 * @see AC#2 - System prompt constructed from .orion/agents/orion.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';

// Mock fs/promises with memfs
vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock process.cwd
vi.spyOn(process, 'cwd').mockReturnValue('/test-project');

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import {
  loadAgentPrompt,
  clearAgentCache,
  type AgentDefinition,
} from './loader.js';

describe('loadAgentPrompt', () => {
  beforeEach(() => {
    // Reset memfs
    vol.reset();
    // Clear cache between tests
    clearAgentCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should load agent prompt from .orion/agents/{name}.md', async () => {
    const agentContent = `---
name: orion
description: Test agent
---

You are Orion, a helpful assistant.

## Guidelines
- Be helpful
- Be concise`;

    vol.fromJSON({
      '/test-project/.orion/agents/orion.md': agentContent,
    });

    const prompt = await loadAgentPrompt('orion');

    expect(prompt).toContain('You are Orion, a helpful assistant.');
    expect(prompt).toContain('## Guidelines');
  });

  it('should parse frontmatter correctly', async () => {
    const agentContent = `---
name: test-agent
description: A test agent
model: claude-3-opus
tools: search,write
---

This is the prompt content.`;

    vol.fromJSON({
      '/test-project/.orion/agents/test-agent.md': agentContent,
    });

    const prompt = await loadAgentPrompt('test-agent');

    expect(prompt).toBe('This is the prompt content.');
    expect(prompt).not.toContain('name:');
    expect(prompt).not.toContain('---');
  });

  it('should cache loaded agents', async () => {
    const agentContent = `---
name: cached
description: Cached agent
---

Cached prompt.`;

    vol.fromJSON({
      '/test-project/.orion/agents/cached.md': agentContent,
    });

    // Load twice
    const prompt1 = await loadAgentPrompt('cached');
    const prompt2 = await loadAgentPrompt('cached');

    expect(prompt1).toBe(prompt2);
    expect(prompt1).toBe('Cached prompt.');
  });

  it('should throw error for non-existent agent', async () => {
    vol.fromJSON({});

    await expect(loadAgentPrompt('nonexistent')).rejects.toThrow(
      'Failed to load agent: nonexistent'
    );
  });

  it('should handle agent file without frontmatter', async () => {
    const agentContent = `You are a simple agent.

No frontmatter here.`;

    vol.fromJSON({
      '/test-project/.orion/agents/simple.md': agentContent,
    });

    const prompt = await loadAgentPrompt('simple');

    expect(prompt).toBe('You are a simple agent.\n\nNo frontmatter here.');
  });
});

describe('clearAgentCache', () => {
  beforeEach(() => {
    vol.reset();
    clearAgentCache();
  });

  it('should clear the agent cache', async () => {
    const agentContent = `---
name: cleartest
description: Clear test
---

Original content.`;

    vol.fromJSON({
      '/test-project/.orion/agents/cleartest.md': agentContent,
    });

    // Load to cache
    await loadAgentPrompt('cleartest');

    // Update file
    vol.fromJSON({
      '/test-project/.orion/agents/cleartest.md': `---
name: cleartest
description: Clear test
---

Updated content.`,
    });

    // Clear cache
    clearAgentCache();

    // Reload - should get updated content
    const prompt = await loadAgentPrompt('cleartest');
    expect(prompt).toBe('Updated content.');
  });
});

