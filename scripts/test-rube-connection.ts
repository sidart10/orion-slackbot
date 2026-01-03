#!/usr/bin/env npx tsx
/**
 * Test script to verify Rube MCP connection from Orion's perspective.
 * 
 * Usage: npx tsx scripts/test-rube-connection.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

interface McpServerConfig {
  type: string;
  enabled: boolean;
  description?: string;
  url?: string;
  headers?: Record<string, string>;
}

interface OrionConfig {
  mcp_servers: Record<string, McpServerConfig>;
}

async function testRubeConnection(): Promise<void> {
  console.log('🔍 Testing Rube MCP connection from Orion...\n');

  // 1. Load config from .orion/config.yaml
  const configPath = join(process.cwd(), '.orion', 'config.yaml');
  let config: OrionConfig;
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    config = parseYaml(content) as OrionConfig;
  } catch (error) {
    console.error('❌ Failed to load .orion/config.yaml:', error);
    process.exit(1);
  }

  // 2. Find rube config
  const rubeConfig = config.mcp_servers?.rube;
  if (!rubeConfig) {
    console.error('❌ No "rube" server found in .orion/config.yaml');
    process.exit(1);
  }

  console.log('📋 Rube configuration found:');
  console.log(`   URL: ${rubeConfig.url}`);
  console.log(`   Enabled: ${rubeConfig.enabled}`);
  console.log(`   Has Auth: ${rubeConfig.headers?.Authorization ? 'Yes' : 'No'}\n`);

  if (!rubeConfig.enabled) {
    console.error('❌ Rube server is disabled in config');
    process.exit(1);
  }

  if (!rubeConfig.url) {
    console.error('❌ Rube server URL is missing');
    process.exit(1);
  }

  // 3. Test connection using MCP protocol
  console.log('🔗 Testing MCP connection...\n');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  if (rubeConfig.headers?.Authorization) {
    headers['Authorization'] = rubeConfig.headers.Authorization;
  }

  // Test 1: Initialize handshake
  console.log('   Step 1: MCP Initialize...');
  try {
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        clientInfo: { name: 'orion-slack-agent', version: '1.0.0' },
      },
    };

    const initResponse = await fetch(rubeConfig.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(initRequest),
    });

    if (!initResponse.ok) {
      const errorBody = await initResponse.text();
      console.log(`   ⚠️  Initialize returned ${initResponse.status}`);
      console.log(`   Response: ${errorBody.slice(0, 200)}`);
      console.log('   (Some MCP servers work without initialize - continuing...)\n');
    } else {
      const initResult = await initResponse.json();
      console.log(`   ✅ Initialize successful`);
      if (initResult.result?.serverInfo) {
        console.log(`   Server: ${initResult.result.serverInfo.name} v${initResult.result.serverInfo.version || 'unknown'}`);
      }
      console.log('');
    }
  } catch (error) {
    console.log(`   ⚠️  Initialize failed: ${error}`);
    console.log('   (Continuing to test tools/list...)\n');
  }

  // Test 2: List tools
  console.log('   Step 2: List available tools...');
  try {
    const listRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };

    const listResponse = await fetch(rubeConfig.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(listRequest),
    });

    if (!listResponse.ok) {
      const errorBody = await listResponse.text();
      console.error(`   ❌ tools/list failed with ${listResponse.status}`);
      console.error(`   Response: ${errorBody.slice(0, 500)}`);
      process.exit(1);
    }

    const contentType = listResponse.headers.get('content-type') || '';
    const bodyText = await listResponse.text();
    
    let result: { result?: { tools?: Array<{ name: string; description?: string }> } };
    
    // Handle SSE format
    if (contentType.includes('text/event-stream') || bodyText.startsWith('event:')) {
      const dataLine = bodyText.split('\n').find(l => l.trim().startsWith('data:'));
      if (dataLine) {
        result = JSON.parse(dataLine.slice(dataLine.indexOf(':') + 1).trim());
      } else {
        throw new Error('No data in SSE response');
      }
    } else {
      result = JSON.parse(bodyText);
    }

    const tools = result.result?.tools || [];
    console.log(`   ✅ Found ${tools.length} tools\n`);

    if (tools.length === 0) {
      console.log('   ⚠️  No tools returned - this might be expected for Rube');
      console.log('   (Rube tools are discovered dynamically via RUBE_SEARCH_TOOLS)\n');
    } else {
      console.log('   Available tools:');
      tools.slice(0, 20).forEach((tool, i) => {
        console.log(`   ${i + 1}. ${tool.name}`);
        if (tool.description) {
          console.log(`      ${tool.description.slice(0, 80)}...`);
        }
      });
      if (tools.length > 20) {
        console.log(`   ... and ${tools.length - 20} more`);
      }
    }

  } catch (error) {
    console.error(`   ❌ tools/list failed: ${error}`);
    process.exit(1);
  }

  console.log('\n✅ Rube MCP connection test complete!');
  console.log('   Orion can connect to Rube at runtime.\n');
}

testRubeConnection().catch(console.error);

