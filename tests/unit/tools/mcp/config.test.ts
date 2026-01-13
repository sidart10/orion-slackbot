import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadMcpServersConfig, clearMcpConfigCache } from '@/tools/mcp/config.js';
import { readFileSync } from 'fs';

vi.mock('fs');

// Mock logger to prevent console output during tests
vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '@/utils/logger.js';

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Config Validation Warning Tests (Story 8.4 AC6)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('config validation warning (Story 8.4 AC6)', () => {
    it('logs warning for .run.app URL with empty headers and no authType (T2.1)', () => {
      clearMcpConfigCache();
      const mockYaml = `
mcp_servers:
  audience-manager:
    enabled: true
    type: http
    url: "https://audience-manager-mcp-vjlizxe2vq-uc.a.run.app/mcp"
    headers: {}
`;
      vi.mocked(readFileSync).mockReturnValue(mockYaml);

      loadMcpServersConfig('/test/path');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp.config.possible_missing_auth',
          server: 'audience-manager',
        })
      );
    });

    it('does not warn when authType: gcp_identity is configured (T2.2)', () => {
      clearMcpConfigCache();
      const mockYaml = `
mcp_servers:
  genmedia-imagen:
    enabled: true
    type: http
    url: "https://mcp-imagen-201626763325.us-central1.run.app/mcp"
    headers: {}
    authType: gcp_identity
`;
      vi.mocked(readFileSync).mockReturnValue(mockYaml);

      loadMcpServersConfig('/test/path');

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp.config.possible_missing_auth',
        })
      );
    });

    it('does not warn when Authorization header is configured (T2.3)', () => {
      clearMcpConfigCache();
      const mockYaml = `
mcp_servers:
  rube:
    enabled: true
    type: http
    url: "https://some-cloud-run.a.run.app/mcp"
    headers:
      Authorization: "Bearer token123"
`;
      vi.mocked(readFileSync).mockReturnValue(mockYaml);

      loadMcpServersConfig('/test/path');

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp.config.possible_missing_auth',
        })
      );
    });

    it('passes authType through to SDK config for http type (T2.4)', () => {
      clearMcpConfigCache();
      const mockYaml = `
mcp_servers:
  genmedia-imagen:
    enabled: true
    type: http
    url: "https://mcp-imagen.run.app/mcp"
    headers: {}
    authType: gcp_identity
`;
      vi.mocked(readFileSync).mockReturnValue(mockYaml);

      const config = loadMcpServersConfig('/test/path');

      expect(config['genmedia-imagen']).toMatchObject({
        type: 'http',
        authType: 'gcp_identity',
      });
    });

    it('does not warn for non-.run.app URLs without auth (T2.5)', () => {
      clearMcpConfigCache();
      const mockYaml = `
mcp_servers:
  exa:
    enabled: true
    type: http
    url: "https://mcp.exa.ai/mcp"
    headers: {}
`;
      vi.mocked(readFileSync).mockReturnValue(mockYaml);

      loadMcpServersConfig('/test/path');

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mcp.config.possible_missing_auth',
        })
      );
    });
  });
});
