/**
 * Diagnostic script: Check tool search configuration
 * Run with: npx tsx scripts/diagnose-tool-search.ts
 */

import { config } from '../src/config/environment.js';
import { supportsToolSearch } from '../src/agent/model-capabilities.js';
import { toolRegistry } from '../src/tools/registry.js';
import { discoverAllTools } from '../src/tools/mcp/discovery.js';

interface ToolWithDefer {
  name: string;
  defer_loading?: boolean;
}

async function diagnose(): Promise<void> {
  console.log('\n=== TOOL SEARCH DIAGNOSTIC ===\n');

  // 1. Check config
  console.log('1. CONFIGURATION:');
  console.log('   TOOL_SEARCH_ENABLED:', config.toolSearch.enabled);
  console.log('   CORE_TOOLS:', config.toolSearch.coreTools.join(', '));
  console.log('   ANTHROPIC_MODEL:', config.anthropicModel);

  // 2. Check model capability
  const modelSupported = supportsToolSearch(config.anthropicModel);
  console.log('\n2. MODEL CAPABILITY:');
  console.log('   supportsToolSearch("' + config.anthropicModel + '"):', modelSupported);

  // 3. Discover MCP tools
  console.log('\n3. MCP TOOL DISCOVERY:');
  const result = await discoverAllTools('diagnostic');
  if (result.success) {
    console.log('   Discovery SUCCESS:', result.data.registered, 'tools registered');
  } else {
    console.log('   Discovery FAILED:', result.error.code, '-', result.error.message);
  }

  // 4. Check registry
  const tools = toolRegistry.getToolsForClaude() as ToolWithDefer[];
  const deferredCount = tools.filter((t) => t.defer_loading === true).length;
  const coreCount = tools.length - deferredCount;

  console.log('\n4. TOOL REGISTRY:');
  console.log('   Total tools:', tools.length);
  console.log('   Core tools (no defer_loading):', coreCount);
  console.log('   Deferred tools (defer_loading: true):', deferredCount);

  // 5. Final verdict
  const toolSearchEnabled = config.toolSearch.enabled && modelSupported;
  const willIncludeToolSearch = deferredCount > 0 && toolSearchEnabled;

  console.log('\n5. VERDICT:');
  console.log('   toolSearchEnabled:', toolSearchEnabled);
  console.log('   willIncludeToolSearchTool:', willIncludeToolSearch);

  if (!willIncludeToolSearch) {
    console.log('\n   ⚠️  PROBLEM: tool_search_tool_bm25 will NOT be included!');
    if (!config.toolSearch.enabled) {
      console.log('   → Fix: Set TOOL_SEARCH_ENABLED=true');
    }
    if (!modelSupported) {
      console.log('   → Fix: Model "' + config.anthropicModel + '" does not match tool search patterns');
    }
    if (deferredCount === 0) {
      console.log('   → Fix: No MCP tools discovered - check MCP server connectivity');
    }
  } else {
    console.log('\n   ✓ tool_search_tool_bm25 WILL be included');
    console.log('   If Claude still uses code_execution first, it is a prompt/model behavior issue.');
  }

  // List deferred tools
  if (deferredCount > 0) {
    console.log('\n6. DEFERRED TOOLS (first 10):');
    tools
      .filter((t) => t.defer_loading === true)
      .slice(0, 10)
      .forEach((t) => console.log('   -', t.name));
  }
}

diagnose().catch(console.error);
