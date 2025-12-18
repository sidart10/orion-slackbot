/**
 * Tests for Agent Loader Module
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see AC#2 - System prompt constructed from .orion/agents/orion.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadAgentPrompt, parseAgentFile, clearAgentCache } from './loader.js';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises');

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('loadAgentPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAgentCache();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should load agent prompt from file', async () => {
    const mockContent = `---
name: orion
description: AI assistant
---

# Orion

You are Orion, an AI assistant.`;

    vi.mocked(fs.readFile).mockResolvedValue(mockContent);

    const prompt = await loadAgentPrompt('orion');

    expect(prompt).toContain('You are Orion');
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('.orion/agents/orion.md'),
      'utf-8'
    );
  });

  it('should cache loaded agents', async () => {
    const mockContent = `---
name: test
---

Test prompt`;

    vi.mocked(fs.readFile).mockResolvedValue(mockContent);

    // First call
    await loadAgentPrompt('test');
    // Second call - should use cache
    await loadAgentPrompt('test');

    // readFile should only be called once
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  it('should throw error when agent file not found', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: file not found'));

    await expect(loadAgentPrompt('nonexistent')).rejects.toThrow(
      'Failed to load agent: nonexistent'
    );
  });

  it('should strip frontmatter from prompt', async () => {
    const mockContent = `---
name: orion
description: AI assistant
model: claude-sonnet-4-20250514
tools: Read,Write
---

The actual prompt content here.`;

    vi.mocked(fs.readFile).mockResolvedValue(mockContent);

    const prompt = await loadAgentPrompt('orion');

    expect(prompt).not.toContain('name: orion');
    expect(prompt).not.toContain('---');
    expect(prompt).toContain('The actual prompt content here.');
  });
});

describe('parseAgentFile', () => {
  it('should parse frontmatter and content', () => {
    const content = `---
name: orion
description: AI assistant
model: claude-sonnet-4-20250514
tools: Read,Write,Bash
---

# Orion

You are Orion.`;

    const result = parseAgentFile(content);

    expect(result.name).toBe('orion');
    expect(result.description).toBe('AI assistant');
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.tools).toEqual(['Read', 'Write', 'Bash']);
    expect(result.prompt).toContain('# Orion');
    expect(result.prompt).toContain('You are Orion.');
  });

  it('should handle missing frontmatter', () => {
    const content = `# Simple Agent

Just a prompt without frontmatter.`;

    const result = parseAgentFile(content);

    expect(result.name).toBe('unknown');
    expect(result.description).toBe('');
    expect(result.prompt).toContain('# Simple Agent');
  });

  it('should handle empty tools field', () => {
    const content = `---
name: basic
---

Basic agent.`;

    const result = parseAgentFile(content);

    expect(result.tools).toBeUndefined();
  });

  it('should trim prompt content', () => {
    const content = `---
name: test
---


   Prompt with whitespace   

`;

    const result = parseAgentFile(content);

    expect(result.prompt).toBe('Prompt with whitespace');
  });
});

describe('clearAgentCache', () => {
  it('should clear the cache allowing fresh loads', async () => {
    const mockContent = `---
name: test
---

Test prompt`;

    vi.mocked(fs.readFile).mockResolvedValue(mockContent);

    // First load
    await loadAgentPrompt('test');
    expect(fs.readFile).toHaveBeenCalledTimes(1);

    // Clear cache
    clearAgentCache();

    // Second load - should read file again
    await loadAgentPrompt('test');
    expect(fs.readFile).toHaveBeenCalledTimes(2);
  });
});

