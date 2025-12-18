# Story 5.1: Subagent Infrastructure

Status: ready-for-dev

## Story

As a **developer**,
I want a framework for spawning specialized subagents,
So that complex tasks can be broken into parallel subtasks.

## Acceptance Criteria

1. **Given** the agent core is working, **When** a complex task requires parallelization, **Then** subagents can be spawned via `spawnSubagent()` pattern (AR9)
2. **Given** subagents are needed, **When** definitions are loaded, **Then** subagent definitions are loaded from .orion/agents/
3. **Given** a subagent is spawned, **When** it initializes, **Then** each subagent has its own system prompt and capabilities
4. **Given** subagents execute, **When** tracing is active, **Then** subagent spawning is traced in Langfuse
5. **Given** the framework is running, **When** concurrency is managed, **Then** the framework supports up to 3 concurrent subagents (NFR5)

## Tasks / Subtasks

- [ ] **Task 1: Create Subagent Module** (AC: #1, #3)
  - [ ] Create `src/agent/subagents/index.ts`
  - [ ] Implement `spawnSubagent()` function
  - [ ] Pass isolated context to subagent
  - [ ] Return subagent result

- [ ] **Task 2: Load Subagent Definitions** (AC: #2)
  - [ ] Create subagent loader
  - [ ] Load from `.orion/agents/`
  - [ ] Parse agent markdown files

- [ ] **Task 3: Create Subagent Definitions** (AC: #2, #3)
  - [ ] Create `.orion/agents/research-agent.md`
  - [ ] Create `.orion/agents/search-agent.md`
  - [ ] Define unique capabilities per agent

- [ ] **Task 4: Add Langfuse Tracing** (AC: #4)
  - [ ] Create span for each subagent
  - [ ] Log subagent type and task
  - [ ] Track subagent duration

- [ ] **Task 5: Implement Concurrency Limit** (AC: #5)
  - [ ] Limit to 3 concurrent subagents
  - [ ] Queue excess subagents
  - [ ] Track active count

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Spawn multiple subagents
  - [ ] Verify concurrency limit
  - [ ] Check Langfuse traces

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| AR9 | architecture.md | Subagents spawned via spawnSubagent() |
| NFR5 | prd.md | Max 3 concurrent subagents |

### spawnSubagent() Pattern

```typescript
async function spawnSubagent(
  agentName: string,
  task: string,
  context: SubagentContext
): Promise<SubagentResult> {
  const definition = await loadAgentPrompt(agentName);
  
  const response = query({
    prompt: task,
    options: {
      systemPrompt: definition.prompt,
      maxTurns: 10,
    }
  });
  
  // Collect and return result
}
```

### File List

Files to create:
- `src/agent/subagents/index.ts`
- `.orion/agents/research-agent.md`
- `.orion/agents/search-agent.md`

