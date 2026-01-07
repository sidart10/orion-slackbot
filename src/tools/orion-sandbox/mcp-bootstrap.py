# MCP Bootstrap Script
# Injected into sandbox to provide MCP tool access
#
# @see Story 6.2 - execute_code Tool (GKE Agent Sandbox)
# @see AC#3 - MCP tools accessible via SDK or HTTP

import os
import json

try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

MCP_SERVERS = json.loads(os.environ.get('MCP_SERVERS', '{}'))


async def call_mcp_tool(server: str, tool: str, args: dict) -> dict:
    """
    Call an MCP tool from within the sandbox.

    Example:
        result = await call_mcp_tool('confluence', 'search_content', {'query': 'project requirements'})

    Args:
        server: Name of the MCP server (e.g., 'confluence', 'rube')
        tool: Name of the tool to call
        args: Arguments to pass to the tool

    Returns:
        Tool result as a dictionary

    Raises:
        ValueError: If server is not configured
        RuntimeError: If httpx is not available
    """
    if not _HTTPX_AVAILABLE:
        raise RuntimeError(
            "httpx is not available. Install with: pip install httpx"
        )

    if server not in MCP_SERVERS:
        available = list(MCP_SERVERS.keys()) if MCP_SERVERS else ['none']
        raise ValueError(
            f"Unknown MCP server: {server}. Available: {available}"
        )

    server_url = MCP_SERVERS[server]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{server_url}/tools/call",
            json={"name": tool, "arguments": args},
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()


def call_tool(server: str, tool: str, args: dict) -> dict:
    """
    Synchronous wrapper for call_mcp_tool.

    Example:
        result = call_tool('confluence', 'search_content', {'query': 'requirements'})
    """
    import asyncio
    try:
        # Try to get existing event loop (e.g., in Jupyter/async context)
        loop = asyncio.get_running_loop()
        # If we're in a running loop, use nest_asyncio pattern or run in thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, call_mcp_tool(server, tool, args))
            return future.result()
    except RuntimeError:
        # No running loop, safe to use asyncio.run()
        return asyncio.run(call_mcp_tool(server, tool, args))


def list_mcp_servers() -> list[str]:
    """Return list of available MCP servers."""
    return list(MCP_SERVERS.keys())

