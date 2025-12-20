import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getToolConfig } from './tools.js';
import * as mcpConfig from '../tools/mcp/config.js';

vi.mock('../tools/mcp/config.js');

describe('getToolConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return allowed tools including mcp', () => {
    vi.mocked(mcpConfig.getMcpServersConfig).mockReturnValue({});
    
    const config = getToolConfig();
    
    expect(config.allowedTools).toContain('mcp');
    expect(config.allowedTools).toContain('Read');
    expect(config.allowedTools).toContain('Bash');
    expect(config.allowedTools).toContain('Grep');
    expect(config.allowedTools).toContain('Glob');
  });

  it('should include MCP servers from config', () => {
    const mockMcpServers = {
      test: { command: 'node', args: [] }
    };
    vi.mocked(mcpConfig.getMcpServersConfig).mockReturnValue(mockMcpServers);

    const config = getToolConfig();

    expect(config.mcpServers).toEqual(mockMcpServers);
  });
});
