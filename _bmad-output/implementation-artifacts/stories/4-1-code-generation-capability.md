# Story 4.1: Code Generation Capability

Status: ready-for-dev

## Story

As a **user**,
I want Orion to write code when no tool exists,
So that I can accomplish tasks without waiting for integrations.

## Acceptance Criteria

1. **Given** the agent needs to perform an action, **When** no MCP tool exists for the task, **Then** the agent generates executable code (FR19)

2. **Given** code is being generated, **When** language selection occurs, **Then** code is generated in Python or JavaScript as appropriate

3. **Given** code is generated, **When** tracing is active, **Then** the generated code is included in the Langfuse trace

4. **Given** MCP tools fail, **When** fallback is needed, **Then** code generation is the fallback when MCP tools fail (AR15)

5. **Given** code is being generated, **When** the user is waiting, **Then** the user is informed that code is being generated

## Tasks / Subtasks

- [ ] **Task 1: Create Code Generation Module** (AC: #1)
  - [ ] Create `src/tools/sandbox/generator.ts`
  - [ ] Implement `generateCode()` function
  - [ ] Use Claude SDK code generation capabilities
  - [ ] Return structured code block

- [ ] **Task 2: Implement Language Selection** (AC: #2)
  - [ ] Detect appropriate language from task
  - [ ] Support Python for data processing
  - [ ] Support JavaScript for web tasks
  - [ ] Include language in code block

- [ ] **Task 3: Add Code to Langfuse Trace** (AC: #3)
  - [ ] Create span for code generation
  - [ ] Include generated code in output
  - [ ] Log language and purpose

- [ ] **Task 4: Integrate as Tool Fallback** (AC: #4)
  - [ ] Detect when no tool matches
  - [ ] Trigger code generation
  - [ ] Log fallback event

- [ ] **Task 5: Notify User** (AC: #5)
  - [ ] Update status to "writing code..."
  - [ ] Show code generation in response
  - [ ] Format code blocks for Slack

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Request with no matching tool
  - [ ] Verify code is generated
  - [ ] Check code appears in trace
  - [ ] Verify user notification

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR19 | prd.md | Generate executable code |
| AR15 | architecture.md | Tool fallback to code generation |

### Code Generation Pattern

```typescript
interface GeneratedCode {
  language: 'python' | 'javascript';
  code: string;
  purpose: string;
  dependencies?: string[];
}

async function generateCode(
  task: string,
  context: AgentContext
): Promise<GeneratedCode> {
  // Use Claude SDK to generate appropriate code
  // Return structured code block
}
```

### References

- [Source: _bmad-output/epics.md#Story 4.1] — Original story
- [Source: technical-research#2.7 Code Generation] — Code gen patterns

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Claude SDK has built-in code generation via Write/Bash tools
- Python preferred for data processing, JS for web
- Always show generated code to user for transparency

### File List

Files to create:
- `src/tools/sandbox/generator.ts`

Files to modify:
- `src/tools/selection.ts` (add fallback)

