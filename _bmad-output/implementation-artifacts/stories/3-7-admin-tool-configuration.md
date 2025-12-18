# Story 3.7: Admin Tool Configuration

Status: ready-for-dev

## Story

As a **platform admin**,
I want to enable or disable MCP servers,
So that I can control which integrations are available.

## Acceptance Criteria

1. **Given** MCP servers are configured, **When** an admin modifies .orion/config.yaml, **Then** MCP servers can be enabled or disabled (FR29)

2. **Given** a server is disabled, **When** the agent loads, **Then** disabled servers are not available to the agent

3. **Given** configuration exists, **When** app starts, **Then** tool availability configuration is loaded at startup (FR40)

4. **Given** MVP requirements, **When** config changes, **Then** changes take effect on next restart (no hot reload required for MVP)

5. **Given** configuration changes, **When** server state changes, **Then** configuration changes are logged

## Tasks / Subtasks

- [ ] **Task 1: Define Configuration Schema** (AC: #1)
  - [ ] Update `.orion/config.yaml` schema
  - [ ] Add `enabled` field per server
  - [ ] Add server metadata fields

- [ ] **Task 2: Load Configuration at Startup** (AC: #3)
  - [ ] Read config on app initialization
  - [ ] Parse MCP server settings
  - [ ] Validate configuration

- [ ] **Task 3: Filter Disabled Servers** (AC: #2)
  - [ ] Check `enabled` flag during init
  - [ ] Skip connection for disabled servers
  - [ ] Log skipped servers

- [ ] **Task 4: Log Configuration State** (AC: #5)
  - [ ] Log which servers enabled/disabled
  - [ ] Log on configuration load
  - [ ] Include in startup logs

- [ ] **Task 5: Verification** (AC: all)
  - [ ] Enable server in config
  - [ ] Verify available after restart
  - [ ] Disable server in config
  - [ ] Verify unavailable after restart

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR29 | prd.md | Enable/disable MCP servers |
| FR40 | prd.md | Tool availability configuration |

### Configuration Example

```yaml
# .orion/config.yaml
mcp_servers:
  rube:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@composio/mcp", "start"]
    description: "500+ app integrations"
    
  github:
    enabled: true
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    description: "GitHub repository access"
    
  internal-tools:
    enabled: false  # Disabled for now
    type: http
    url: "https://internal-mcp.company.com"
    description: "Internal company tools"
```

### References

- [Source: _bmad-output/epics.md#Story 3.7] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Hot reload not required for MVP but consider for future
- Log all config changes for audit trail
- Consider adding validation for config schema

### File List

Files to modify:
- `.orion/config.yaml`
- `src/tools/mcp/client.ts` (filter disabled)
- `src/agent/loader.ts` (config loading)

