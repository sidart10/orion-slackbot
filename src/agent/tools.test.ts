/**
 * Tests for Tool Configuration Module
 *
 * @see Story 2.1 - Claude Agent SDK Integration
 * @see AC#1 - Tool configuration for query()
 */

import { describe, it, expect } from 'vitest';
import { toolConfig, getMcpServer, isToolAllowed } from './tools.js';

describe('toolConfig', () => {
  it('should have mcpServers property', () => {
    expect(toolConfig.mcpServers).toBeDefined();
    expect(typeof toolConfig.mcpServers).toBe('object');
  });

  it('should have allowedTools property', () => {
    expect(toolConfig.allowedTools).toBeDefined();
    expect(Array.isArray(toolConfig.allowedTools)).toBe(true);
  });

  it('should include core tools in allowedTools', () => {
    expect(toolConfig.allowedTools).toContain('Read');
    expect(toolConfig.allowedTools).toContain('Write');
    expect(toolConfig.allowedTools).toContain('Bash');
  });

  it('should have empty mcpServers initially (enabled in Story 3.1)', () => {
    expect(Object.keys(toolConfig.mcpServers)).toHaveLength(0);
  });
});

describe('getMcpServer', () => {
  it('should return undefined for non-existent server', () => {
    const server = getMcpServer('nonexistent');
    expect(server).toBeUndefined();
  });

  it('should return undefined for rube (disabled until Story 3.1)', () => {
    const server = getMcpServer('rube');
    expect(server).toBeUndefined();
  });
});

describe('isToolAllowed', () => {
  it('should return true for allowed tools', () => {
    expect(isToolAllowed('Read')).toBe(true);
    expect(isToolAllowed('Write')).toBe(true);
    expect(isToolAllowed('Bash')).toBe(true);
  });

  it('should return false for disallowed tools', () => {
    expect(isToolAllowed('mcp')).toBe(false);
    expect(isToolAllowed('Skill')).toBe(false);
    expect(isToolAllowed('Unknown')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(isToolAllowed('read')).toBe(false);
    expect(isToolAllowed('READ')).toBe(false);
    expect(isToolAllowed('Read')).toBe(true);
  });
});

