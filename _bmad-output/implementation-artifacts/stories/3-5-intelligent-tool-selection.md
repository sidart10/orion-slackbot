# Story 3.5: Intelligent Tool Selection

Status: ready-for-dev

## Story

As a **user**,
I want Orion to choose the right tool for each task,
So that I get the best results without specifying tools.

## Acceptance Criteria

1. **Given** multiple tools are available, **When** the agent processes a request, **Then** it selects appropriate tools from available options (FR28)

2. **Given** tools are being selected, **When** selection occurs, **Then** tool selection is based on the request context and tool capabilities

3. **Given** tools are selected, **When** debugging is needed, **Then** the agent explains tool choices in traces (for debugging)

4. **Given** no suitable tool exists, **When** fallback is needed, **Then** the agent falls back to code generation (Epic 4)

## Tasks / Subtasks

- [ ] **Task 1: Define Tool Selection Logic** (AC: #1, #2)
  - [ ] Create `src/tools/selection.ts`
  - [ ] Match request intent to tool capabilities
  - [ ] Rank tools by relevance
  - [ ] Return ordered tool list

- [ ] **Task 2: Use Tool Descriptions** (AC: #2)
  - [ ] Include tool descriptions in selection
  - [ ] Consider tool input schemas
  - [ ] Match required parameters

- [ ] **Task 3: Log Selection Reasoning** (AC: #3)
  - [ ] Log selected tools in trace
  - [ ] Include selection rationale
  - [ ] Track selection patterns

- [ ] **Task 4: Implement Code Gen Fallback** (AC: #4)
  - [ ] Detect when no tool matches
  - [ ] Trigger code generation path
  - [ ] Log fallback events

- [ ] **Task 5: Verification** (AC: all)
  - [ ] Request requiring specific tool
  - [ ] Verify correct tool selected
  - [ ] Request with no matching tool
  - [ ] Verify fallback triggered

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR28 | prd.md | Select appropriate tools |
| AR15 | architecture.md | Tool fallback to code generation |

### Tool Selection Flow

```
User Request
    │
    ▼
[Parse Intent] ─────────────────────────────────────────┐
    │                                                   │
    ▼                                                   │
[Match to Tools] ─── No match ──▶ [Code Generation]    │
    │                                                   │
   Match                                                │
    │                                                   │
    ▼                                                   │
[Rank by Relevance]                                     │
    │                                                   │
    ▼                                                   │
[Select Top Tool(s)]                                    │
    │                                                   │
    ▼                                                   │
[Execute] ◀─────────────────────────────────────────────┘
```

### References

- [Source: _bmad-output/epics.md#Story 3.5] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Claude SDK likely handles tool selection automatically
- Add logging to understand selection patterns
- Code generation fallback is implemented in Epic 4

### File List

Files to create:
- `src/tools/selection.ts`

Files to modify:
- `src/agent/loop.ts` (integrate selection)

