/**
 * MCP server configuration (env-driven MVP).
 *
 * Story 3.2: Tool Discovery & Registration
 *
 * Env surface (MVP):
 * - RUBE_MCP_URL
 * - RUBE_API_KEY
 * - RUBE_MCP_ENABLED
 */
export type McpServerConfig = {
  name: string;
  url: string;
  enabled: boolean;
  bearerToken?: string;
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
};

function parseEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

export function getMcpServerConfigs(): McpServerConfig[] {
  const rubeEnabled = parseEnabled(process.env.RUBE_MCP_ENABLED);

  // Return configured servers with enabled flag so discovery can remove disabled servers' tools.
  return [
    {
      name: 'rube',
      url: process.env.RUBE_MCP_URL ?? '',
      enabled: rubeEnabled,
      bearerToken: process.env.RUBE_API_KEY ?? '',
      // Defaults aligned with src/tools/mcp/client.ts
      connectionTimeoutMs: 5000,
      requestTimeoutMs: 30000,
    },
  ];
}


