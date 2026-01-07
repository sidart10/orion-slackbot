# Tech-Spec: Programmatic Tool Calling for Multi-Tool Orchestration

**Created:** 2026-01-06
**Status:** Ready for Development
**Priority:** High
**Estimated Complexity:** Medium-High

## Overview

### Problem Statement

When Orion executes many tool calls (5-10+), the following issues occur:

1. **Context pollution**: Each tool result enters Claude's context window, consuming massive tokens (50-100k+)
2. **Missing final responses**: Claude either generates no summary or a truncated one after processing large tool results
3. **Fallback failure**: The current fallback delivers pre-tool "thinking" text instead of the actual analysis
4. **Poor UX**: Users see "Sources: [10 tools]" but no actual answer

**User Impact:** Agent appears broken - tools execute successfully but no analysis is delivered.

### Solution

Implement **Programmatic Tool Calling (PTC)** pattern from Anthropic's best practices:

1. **System prompt guidance**: Teach Claude to use `execute_code` for multi-tool scenarios
2. **MCP tool access in sandbox**: Enhance `mcp-bootstrap.py` to support all MCP servers
3. **Result summarization**: Process/filter data inside sandbox before returning to Claude
4. **Automatic routing** (optional): Intercept 5+ parallel tool calls and route through sandbox

**Expected Results** (per Anthropic benchmarks):
- 37% token reduction on multi-tool workflows
- 98.7% reduction when filtering data in sandbox (150K → 2K tokens)
- Improved accuracy: 25.6% → 28.5% on knowledge retrieval

### Scope

**In Scope:**
- Update system prompt with PTC guidance
- Enhance execute_code tool description for multi-tool use
- Improve mcp-bootstrap.py with better error handling and parallel execution
- Add tool result summarization helper for sandbox
- Update Orion system prompt with when/how to use PTC

**Out of Scope:**
- Automatic interception of tool calls (Phase 2)
- Anthropic's managed PTC beta (requires API changes)
- Automatic tool call clearing beta feature
- Tool discovery/routing (handled by Rube/Composio)

## Context for Development

### Current Architecture

**Already in place:**
1. `execute_code` tool with GKE sandbox (`src/tools/code-execution/tool.ts`)
2. `mcp-bootstrap.py` with `call_tool(server, tool, args)` function
3. MCP servers: `msci-reports`, `audience-manager`, `exa`, `rube`, `genmedia-imagen`, `genmedia-veo`
4. System prompt at `.orion/agents/orion.md`

**The gap:** Claude doesn't know WHEN to use `execute_code` for multi-tool orchestration.

### Codebase Patterns

**MCP Bootstrap (current):**
```python
# Available in sandbox via mcp-bootstrap.py
result = call_tool('msci-reports', 'analyze_report_data', {'job_id': 509454})
servers = list_mcp_servers()  # Returns ['msci-reports', 'exa', ...]
```

**Tool Registry:** Static tools registered in `src/tools/registry.ts`

**System Prompt:** Loaded from `.orion/agents/orion.md` by `src/agent/loader.ts`

### Files to Reference

**Primary Implementation:**
1. `.orion/agents/orion.md` - System prompt (add PTC guidance)
2. `src/tools/code-execution/tool.ts` - execute_code tool (enhance description)
3. `src/tools/code-execution/mcp-bootstrap.py` - MCP access in sandbox (enhance)

**Supporting:**
4. `.orion/config.yaml` - MCP server list
5. `src/config/mcp-servers.ts` - Server config loader
6. `src/config/environment.ts` - MCP_SERVERS_JSON env var

### Technical Decisions

**Decision 1: Prompt-Based PTC First**
- Rationale: Lower risk than automatic interception
- Teach Claude when to choose PTC via system prompt
- Can add automatic routing in Phase 2

**Decision 2: Enhance Existing Infrastructure**
- Rationale: mcp-bootstrap.py and execute_code already work
- Just need better guidance and tooling
- Avoid new dependencies

**Decision 3: Summarization Helpers in Sandbox**
- Rationale: Let Claude write filtering logic, but provide helpers
- `summarize_results(data, max_items=10)` helper function
- Claude controls what enters context

## Implementation Plan

### Phase 1: System Prompt PTC Guidance

#### Task 1.1: Add PTC Section to System Prompt

**File:** `.orion/agents/orion.md`

Add new section after "Tool Usage Guidelines":

```markdown
## Multi-Tool Orchestration (Programmatic Tool Calling)

When you need to call **5 or more tools** to answer a question, use `execute_code` to orchestrate them programmatically. This prevents context overflow and ensures you can deliver a complete analysis.

### When to Use execute_code for Multi-Tool Tasks

Use `execute_code` when:
- Fetching data from multiple reports/sources (e.g., "analyze all Hulu OMITB reports")
- Running the same tool with different parameters (e.g., searching multiple terms)
- Processing large datasets that need filtering before analysis
- Combining results from multiple MCP servers

### How to Use execute_code for MCP Tools

The sandbox provides `call_tool(server, tool, args)` for MCP access:

```python
import json
import asyncio

# Available MCP servers (call list_mcp_servers() to see current list)
# - msci-reports: Report generation and analytics
# - audience-manager: Audience segmentation
# - exa: Web search
# - rube: 500+ app integrations

# Example: Fetch multiple reports and summarize
async def analyze_reports():
    job_ids = [509454, 509559, 509558, 509557, 509560]

    # Fetch all reports in parallel
    results = await asyncio.gather(*[
        call_mcp_tool('msci-reports', 'analyze_report_data', {'job_id': jid})
        for jid in job_ids
    ])

    # Process in sandbox - only summary enters context
    summary = {
        'total_reports': len(results),
        'key_findings': [],
        'patterns': []
    }

    for i, result in enumerate(results):
        # Extract only relevant data
        if 'data' in result:
            summary['key_findings'].append({
                'job_id': job_ids[i],
                'metric': result['data'].get('primary_metric'),
                'value': result['data'].get('value')
            })

    # Return concise summary (not raw data)
    print(json.dumps(summary, indent=2))

asyncio.run(analyze_reports())
```

### Key Principles

1. **Filter in sandbox**: Process/aggregate data before printing results
2. **Parallel execution**: Use `asyncio.gather()` for concurrent tool calls
3. **Concise output**: Only print what's needed for your final answer
4. **Error handling**: Wrap tool calls in try/except for resilience
```

#### Task 1.2: Update execute_code Tool Description

**File:** `src/tools/code-execution/tool.ts`

Update the tool description to emphasize multi-tool orchestration:

```typescript
export const executeCodeToolDefinition: Anthropic.Tool = {
  name: 'execute_code',
  description: `Execute Python code in a secure sandbox with network access.

**IMPORTANT: Use this tool for multi-tool orchestration (5+ tool calls)**

When you need to call multiple MCP tools, write Python code that:
1. Calls tools in parallel using asyncio.gather()
2. Filters/processes results in the sandbox
3. Returns only a concise summary

This prevents context overflow and ensures complete responses.

Available MCP functions:
- call_tool(server, tool, args) - Call an MCP tool
- call_mcp_tool(server, tool, args) - Async version
- list_mcp_servers() - Get available servers

Example for multi-tool orchestration:
\`\`\`python
import asyncio, json

async def main():
    # Fetch multiple reports in parallel
    results = await asyncio.gather(*[
        call_mcp_tool('msci-reports', 'analyze_report_data', {'job_id': jid})
        for jid in [509454, 509559, 509558]
    ])

    # Summarize (only this enters your context)
    summary = [r.get('key_metric') for r in results if r.get('success')]
    print(json.dumps({'findings': summary}))

asyncio.run(main())
\`\`\`

Also use for: complex logic, loops, data processing, HTTP requests.
Timeout: 30s default, 120s max.`,
  input_schema: {
    // ... existing schema
  },
};
```

### Phase 2: Enhance MCP Bootstrap

#### Task 2.1: Add Parallel Execution Helpers

**File:** `src/tools/code-execution/mcp-bootstrap.py`

```python
# Add after existing functions

async def call_tools_parallel(calls: list[tuple[str, str, dict]]) -> list[dict]:
    """
    Execute multiple MCP tool calls in parallel.

    Args:
        calls: List of (server, tool, args) tuples

    Returns:
        List of results in same order as calls

    Example:
        results = await call_tools_parallel([
            ('msci-reports', 'analyze_report_data', {'job_id': 509454}),
            ('msci-reports', 'analyze_report_data', {'job_id': 509559}),
            ('exa', 'web_search_exa', {'query': 'hulu viewership'}),
        ])
    """
    import asyncio
    tasks = [call_mcp_tool(server, tool, args) for server, tool, args in calls]
    return await asyncio.gather(*tasks, return_exceptions=True)


def summarize_results(results: list, max_items: int = 10,
                      extract_keys: list[str] | None = None) -> dict:
    """
    Helper to summarize tool results for concise context.

    Args:
        results: List of tool results
        max_items: Max items to include in summary
        extract_keys: Keys to extract from each result (None = all)

    Returns:
        Summarized dict with counts and key data

    Example:
        summary = summarize_results(results, max_items=5,
                                    extract_keys=['title', 'metric', 'value'])
    """
    successful = [r for r in results if isinstance(r, dict) and r.get('success', True)]
    failed = [r for r in results if isinstance(r, Exception) or
              (isinstance(r, dict) and not r.get('success', True))]

    summary = {
        'total': len(results),
        'successful': len(successful),
        'failed': len(failed),
        'items': []
    }

    for r in successful[:max_items]:
        if extract_keys:
            item = {k: r.get(k) for k in extract_keys if k in r}
        else:
            # Default: take first 5 keys
            item = dict(list(r.items())[:5])
        summary['items'].append(item)

    if len(successful) > max_items:
        summary['truncated'] = len(successful) - max_items

    return summary


def print_summary(data: dict | list, indent: int = 2) -> None:
    """Print data as formatted JSON for clear output."""
    import json
    print(json.dumps(data, indent=indent, default=str))
```

#### Task 2.2: Add Error Handling Wrapper

**File:** `src/tools/code-execution/mcp-bootstrap.py`

```python
async def safe_call_mcp_tool(server: str, tool: str, args: dict,
                              default: dict | None = None) -> dict:
    """
    Call MCP tool with error handling - returns default on failure.

    Useful in parallel execution where one failure shouldn't stop others.

    Example:
        result = await safe_call_mcp_tool(
            'msci-reports', 'analyze_report_data',
            {'job_id': 509454},
            default={'error': True, 'job_id': 509454}
        )
    """
    try:
        return await call_mcp_tool(server, tool, args)
    except Exception as e:
        if default is not None:
            return {**default, 'error_message': str(e)}
        return {'success': False, 'error': str(e), 'server': server, 'tool': tool}
```

### Phase 3: Inject MCP Server List

#### Task 3.1: Pass Server Descriptions to Sandbox

**File:** `src/tools/code-execution/tool.ts`

Update the environment variables passed to sandbox:

```typescript
// In executeCodeHandler, update env building:
const serverDescriptions = getMcpServerConfigs()
  .filter(s => s.enabled)
  .map(s => ({
    name: s.name,
    description: s.description || s.name,
  }));

const env: Record<string, string> = {
  MCP_SERVERS: config.mcpServersJson,
  MCP_SERVER_INFO: JSON.stringify(serverDescriptions),
};
```

**File:** `src/tools/code-execution/mcp-bootstrap.py`

```python
# Add at top, after MCP_SERVERS
MCP_SERVER_INFO = json.loads(os.environ.get('MCP_SERVER_INFO', '[]'))

def get_server_info() -> list[dict]:
    """
    Get descriptions of available MCP servers.

    Returns:
        List of {name, description} dicts

    Example:
        >>> get_server_info()
        [{'name': 'msci-reports', 'description': 'Report generation and analytics'},
         {'name': 'exa', 'description': 'Web search'}]
    """
    return MCP_SERVER_INFO
```

### Phase 4: Add Context Overflow Detection (Optional)

#### Task 4.1: Detect Large Tool Result Sets

**File:** `src/agent/loop.ts`

Add detection after tool results are collected:

```typescript
// After toolResults are collected (around line 940)
const totalResultSize = toolResults.reduce((sum, r) => {
  const content = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
  return sum + content.length;
}, 0);

// Log warning for potential context issues
if (totalResultSize > 50000) { // ~12.5k tokens
  logger.warn({
    event: 'agent.loop.large_tool_results',
    totalResultSize,
    toolCount: toolResults.length,
    traceId: context.traceId,
    recommendation: 'Consider using execute_code for multi-tool orchestration',
  });
}
```

## Acceptance Criteria

### AC1: System Prompt Guides PTC Usage
- **Given:** User asks to analyze multiple reports
- **When:** Claude reads the system prompt
- **Then:** Claude chooses `execute_code` with parallel MCP calls instead of 10 separate tool_use blocks

### AC2: Multi-Tool Orchestration Works
- **Given:** Claude uses execute_code with `call_tools_parallel()`
- **When:** Code executes in sandbox
- **Then:** All MCP tools are called, results are summarized, only summary enters context

### AC3: Context Pollution Reduced
- **Given:** Task requiring 10 MCP tool calls
- **When:** Using PTC pattern vs. direct tool calls
- **Then:** Context usage reduced by 30%+ (measure via Langfuse)

### AC4: Final Response Delivered
- **Given:** Multi-tool task with PTC
- **When:** Sandbox returns summarized results
- **Then:** Claude generates complete analysis (no missing responses)

### AC5: Error Resilience
- **Given:** One tool fails in parallel batch
- **When:** Using `safe_call_mcp_tool()` or `return_exceptions=True`
- **Then:** Other results still processed, partial summary returned

### AC6: MCP Server Discovery
- **Given:** Claude needs to know available servers
- **When:** Calling `list_mcp_servers()` or `get_server_info()`
- **Then:** Returns current enabled servers with descriptions

## Testing Strategy

### Unit Tests

**File:** `src/tools/code-execution/mcp-bootstrap.test.py` (new)

```python
def test_call_tools_parallel():
    # Mock MCP responses
    results = await call_tools_parallel([
        ('test-server', 'tool1', {'arg': 1}),
        ('test-server', 'tool2', {'arg': 2}),
    ])
    assert len(results) == 2

def test_summarize_results():
    results = [
        {'success': True, 'value': 100, 'extra': 'data'},
        {'success': True, 'value': 200, 'extra': 'more'},
        {'success': False, 'error': 'failed'},
    ]
    summary = summarize_results(results, max_items=2, extract_keys=['value'])
    assert summary['total'] == 3
    assert summary['successful'] == 2
    assert summary['failed'] == 1
    assert len(summary['items']) == 2

def test_safe_call_mcp_tool_error():
    result = await safe_call_mcp_tool('bad-server', 'tool', {}, default={'fallback': True})
    assert result.get('fallback') == True or result.get('success') == False
```

### Integration Tests

1. **E2E Multi-Tool Test:**
   - Trigger "analyze 5 Hulu reports" in Slack
   - Verify Claude uses execute_code
   - Verify summary is returned (not raw data)
   - Verify no missing response

2. **Context Usage Comparison:**
   - Same task with PTC vs. direct tools
   - Measure token usage via Langfuse
   - Verify 30%+ reduction

### Manual Testing

1. Slack: "@orion can you analyze all the recent Hulu OMITB reports and find patterns?"
2. Verify Claude uses execute_code with parallel calls
3. Verify complete analysis is delivered
4. Check Langfuse for token counts

## Monitoring & Observability

### Key Metrics

1. **PTC Adoption Rate**
   - Event: `execute_code.start` with `executionType: 'inline_code'`
   - Track: % of multi-tool tasks using PTC
   - Target: >50% for 5+ tool scenarios

2. **Context Efficiency**
   - Compare: `totalInputTokens` for PTC vs. direct tool calls
   - Target: 30% reduction on multi-tool tasks

3. **Response Delivery Rate**
   - Event: `agent.loop.yielding_response`
   - Track: % with `usedFallback: false`
   - Target: >95% (up from current)

4. **Large Result Warnings**
   - Event: `agent.loop.large_tool_results`
   - Track: Frequency and if Claude adapts
   - Alert: >20% of requests hitting this

### Langfuse Events

```typescript
langfuse.event({
  name: 'ptc_usage',
  metadata: {
    traceId,
    toolCount: estimatedToolCount,
    usedPtc: true,
    contextSavings: estimatedSavings,
  },
});
```

## Rollback Plan

**Phase 1 Rollback (System Prompt):**
- Revert `.orion/agents/orion.md` changes
- Risk: Low (just prompt changes)

**Phase 2 Rollback (MCP Bootstrap):**
- Revert `mcp-bootstrap.py` additions
- Existing `call_tool()` function unchanged
- Risk: Low (additive changes only)

**Emergency Mitigation:**
- If PTC causes issues, can disable via prompt guidance
- Direct tool calls still work as before

## Dependencies

**No New Dependencies Required**
- Uses existing execute_code sandbox
- Uses existing mcp-bootstrap.py
- Uses existing MCP server infrastructure

**Documentation:**
- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Claude Docs: Programmatic Tool Calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)

## Implementation Checklist

### Phase 1: Prompt Guidance
- [ ] Task 1.1: Add PTC section to `.orion/agents/orion.md`
- [ ] Task 1.2: Update execute_code tool description
- [ ] Manual test: Verify Claude uses PTC for multi-tool request

### Phase 2: Enhanced Bootstrap
- [ ] Task 2.1: Add `call_tools_parallel()` helper
- [ ] Task 2.2: Add `summarize_results()` helper
- [ ] Task 2.2: Add `safe_call_mcp_tool()` wrapper
- [ ] Unit tests for new helpers
- [ ] Manual test: Execute parallel MCP calls in sandbox

### Phase 3: Server Discovery
- [ ] Task 3.1: Pass MCP_SERVER_INFO to sandbox
- [ ] Add `get_server_info()` function
- [ ] Test: Verify Claude can discover available servers

### Phase 4: Monitoring (Optional)
- [ ] Task 4.1: Add large result warning log
- [ ] Add Langfuse events for PTC tracking
- [ ] Create dashboard for PTC adoption

### Post-Deployment
- [ ] Monitor PTC adoption rate for 48h
- [ ] Compare token usage before/after
- [ ] Verify missing response rate decreases
- [ ] Document findings in retrospective
