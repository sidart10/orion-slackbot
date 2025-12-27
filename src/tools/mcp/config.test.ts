import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadMcpServersConfig, clearMcpConfigCache } from './config.js';
import { readFileSync } from 'fs';

vi.mock('fs');

// Mock logger to prevent console output during tests
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MCP Config Loader', () => {
  beforeEach(() => {
    clearMcpConfigCache();
    vi.resetAllMocks();
  });

  it('loads and transforms stdio server config (omits type field for SDK default)', () => {
    const mockYaml = `
mcp_servers:
  rube:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@composio/mcp", "start"]
    description: "Test server"
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    const config = loadMcpServersConfig('/test/path');

    // SDK defaults to stdio, so type field is omitted for cleaner config
    expect(config).toEqual({
      rube: {
        command: 'npx',
        args: ['-y', '@composio/mcp', 'start'],
      },
    });
  });

  it('loads and transforms http server config', () => {
    const mockYaml = `
mcp_servers:
  remote:
    enabled: true
    type: http
    url: "https://api.example.com/mcp"
    headers:
      Authorization: "Bearer token123"
    description: "Remote HTTP server"
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    const config = loadMcpServersConfig('/test/path');

    expect(config).toEqual({
      remote: {
        type: 'http',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer token123' },
      },
    });
  });

  it('loads and transforms sse server config', () => {
    vi.resetModules();
    clearMcpConfigCache();
    
    const mockYaml = `
mcp_servers:
  streaming:
    enabled: true
    type: sse
    url: "https://api.example.com/mcp/sse"
    description: "SSE streaming server"
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    const config = loadMcpServersConfig('/test/path');

    expect(config).toEqual({
      streaming: {
        type: 'sse',
        url: 'https://api.example.com/mcp/sse',
      },
    });
  });

  it('filters out disabled servers', () => {
    const mockYaml = `
mcp_servers:
  enabled-server:
    enabled: true
    type: stdio
    command: node
    args: ["server.js"]
  disabled-server:
    enabled: false
    type: stdio
    command: node
    args: ["other.js"]
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    const config = loadMcpServersConfig('/test/path');

    expect(Object.keys(config)).toEqual(['enabled-server']);
    expect(config['disabled-server']).toBeUndefined();
  });

  it('returns empty config when file is missing', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const config = loadMcpServersConfig('/test/path');

    expect(config).toEqual({});
  });

  it('throws on invalid server type', () => {
    const mockYaml = `
mcp_servers:
  bad-server:
    enabled: true
    type: invalid
    command: node
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    expect(() => loadMcpServersConfig('/test/path')).toThrow(
      "MCP server 'bad-server' has invalid type: invalid"
    );
  });

  it('throws on missing command for stdio type', () => {
    const mockYaml = `
mcp_servers:
  bad-server:
    enabled: true
    type: stdio
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    expect(() => loadMcpServersConfig('/test/path')).toThrow(
      "MCP server 'bad-server' is stdio type but missing 'command'"
    );
  });

  it('throws on missing url for http type', () => {
    clearMcpConfigCache();
    const mockYaml = `
mcp_servers:
  bad-http:
    enabled: true
    type: http
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    expect(() => loadMcpServersConfig('/test/path')).toThrow(
      "MCP server 'bad-http' is http type but missing 'url'"
    );
  });

  it('throws on missing url for sse type', () => {
    clearMcpConfigCache();
    const mockYaml = `
mcp_servers:
  bad-sse:
    enabled: true
    type: sse
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    expect(() => loadMcpServersConfig('/test/path')).toThrow(
      "MCP server 'bad-sse' is sse type but missing 'url'"
    );
  });

  it('caches config after first load', () => {
    const mockYaml = `
mcp_servers:
  test:
    enabled: true
    type: stdio
    command: node
    args: []
`;
    vi.mocked(readFileSync).mockReturnValue(mockYaml);

    loadMcpServersConfig('/test/path');
    loadMcpServersConfig('/test/path');

    expect(readFileSync).toHaveBeenCalledTimes(1);
  });
});
