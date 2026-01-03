# Sprint Change Proposal: Memory Tool SDK Alignment

**Date**: 2026-01-02
**Triggered By**: Research discovery during Epic 5 implementation review
**Change Scope**: Moderate (requires story modification + artifact updates)
**Priority**: P0 (blocking - current implementation incompatible with Anthropic API)

---

## Section 1: Issue Summary

### Problem Statement

Epic 5 memory implementation uses a **custom tool definition** with wrong command set and response format, instead of using the **official Anthropic SDK `betaMemoryTool` helper** with the `memory_20250818` tool type.

### Discovery Context

During a comprehensive review of the memory implementation against official Anthropic documentation:

1. Navigated to `platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool`
2. Examined `@anthropic-ai/sdk/helpers/beta/memory` in our installed SDK
3. Found type definitions in `@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`

### Evidence

| Aspect | Official API | Our Implementation | Gap |
|--------|--------------|-------------------|-----|
| **Tool Type** | `{ type: "memory_20250818", name: "memory" }` | `{ name: "memory", input_schema: {...} }` | ❌ Wrong type |
| **Commands** | 6: `view`, `create`, `str_replace`, `insert`, `delete`, `rename` | 4: `view`, `create`, `update`, `delete` | ❌ Missing 3 |
| **Response Format** | Line numbers (6-char, right-aligned), file sizes | Plain text, no formatting | ❌ Wrong format |
| **SDK Helper** | `betaMemoryTool(handlers)` exists in SDK | Not used - custom implementation | ❌ Not using SDK |

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|------|--------|--------|
| **Epic 5 (Memory)** | Active | **HIGH** - Stories 5.1, 5.2 need modification |
| Other Epics | N/A | No impact |

### Story Impact

| Story | Current Status | Required Change | Effort |
|-------|---------------|-----------------|--------|
| **5.1** | done | Rewrite handler to use `betaMemoryTool`, add 3 missing command handlers | Medium |
| **5.2** | review | Update exports, minor integration changes | Low |
| **5.3** | ready-for-dev | No change - memory auto-check pattern still valid | None |

### Artifact Conflicts

| Artifact | Section | Required Update |
|----------|---------|-----------------|
| `prd.md` | FR44 | Change commands from "view, create, update, delete" to official 6 commands |
| `architecture.md` | Memory Tool section | Add SDK helper usage, `memory_20250818` type, response format spec |
| `epics.md` | Epic 5 Scope | Update command list |
| Story 5.1 | Acceptance Criteria | Add ACs for `str_replace`, `insert`, `rename`; update existing ACs |
| Story 5.2 | Dev Notes | Minor - handler integration pattern |

### Technical Impact

| Component | File | Change |
|-----------|------|--------|
| Tool Definition | `src/tools/memory/tool.ts` | Replace with `betaMemoryTool` helper |
| Handler | `src/tools/memory/handler.ts` | Implement `MemoryToolHandlers` interface (6 methods) |
| Response Format | `src/tools/memory/handler.ts` | Add line numbers, file sizes per spec |
| Agent Loop | `src/agent/loop.ts` | Use tool from `betaMemoryTool()` call |
| Storage | `src/tools/memory/storage.ts` | **No change** - reusable as-is |
| Paths | `src/tools/memory/paths.ts` | **No change** - reusable as-is |

---

## Section 3: Recommended Approach

### Selected Path: Direct Adjustment ✅

Modify existing stories rather than rollback or scope reduction.

### Rationale

1. **GCS storage layer is correct** - 100% reusable, no changes needed
2. **Path builders are correct** - 100% reusable, no changes needed
3. **SDK helper handles complexity** - Tool type, routing, response parsing automatic
4. **Effort is bounded** - Only handler and tool definition need rewrite
5. **Risk is low** - Well-typed SDK with clear interface

### Effort Estimate

| Task | Effort | Risk |
|------|--------|------|
| Update Story 5.1 ACs | 15 min | Low |
| Rewrite handler with SDK helper | 2-3 hours | Low |
| Implement 3 new commands | 2 hours | Low |
| Response format helpers | 1 hour | Low |
| Update agent loop integration | 30 min | Low |
| Test all 6 commands | 1 hour | Low |
| Update artifacts (PRD, architecture) | 30 min | Low |
| **Total** | **~1 day** | **Low** |

### Timeline Impact

No timeline impact - this replaces remaining Epic 5 work with corrected implementation.

---

## Section 4: Detailed Change Proposals

### 4.1 PRD Update

**File**: `_bmad-output/prd.md`
**Section**: FR44

```
OLD:
FR44: System maintains persistent memory across sessions via Memory Tool pattern 
(view, create, update, delete operations) with Google Cloud Storage backend

NEW:
FR44: System maintains persistent memory across sessions via Anthropic Memory Tool 
(view, create, str_replace, insert, delete, rename operations) using SDK helper 
with Google Cloud Storage backend
```

**Rationale**: Align with official Anthropic API command set.

---

### 4.2 Architecture Update

**File**: `_bmad-output/architecture.md`
**Section**: Memory Tool (lines ~305-380)

```
OLD:
### How Anthropic Memory Tool Works
1. Enable with beta header: `context-management-2025-06-27`
2. Claude calls memory tool with command (view/create/update/delete)
3. Handler executes against GCS
4. Result returned to Claude

NEW:
### How Anthropic Memory Tool Works
1. Enable with beta header: `context-management-2025-06-27`
2. Use SDK helper: `betaMemoryTool(handlers)` from `@anthropic-ai/sdk/helpers/beta/memory`
3. Tool type is `memory_20250818` (set automatically by helper)
4. Implement 6 handlers: view, create, str_replace, insert, delete, rename
5. Handler executes against GCS with formatted responses
6. Response format:
   - Directories: file listing with sizes (e.g., "5.5K\t/memories/global/file.md")
   - Files: content with 6-char right-aligned line numbers
```

**Rationale**: Document correct SDK usage pattern.

---

### 4.3 Story 5.1 Update

**File**: `_bmad-output/implementation-artifacts/stories/5-1-memory-tool-handler.md`

**Title Change**:
```
OLD: Memory Tool Handler (GCS Backend)
NEW: Memory Tool Handler (SDK Helper + GCS Backend)
```

**Acceptance Criteria Changes**:

```
OLD AC #1-4:
1. Given Claude calls memory tool with `view` command...
2. Given Claude calls memory tool with `create` command...
3. Given Claude calls memory tool with `update` command...
4. Given Claude calls memory tool with `delete` command...

NEW AC #1-7:
1. Given Claude calls memory tool with `view` command, When executed, 
   Then files return content with 6-char line numbers; directories return listing with sizes

2. Given Claude calls memory tool with `create` command, When executed, 
   Then new file is written to GCS with success message

3. Given Claude calls memory tool with `str_replace` command, When executed, 
   Then specified text is replaced in file with edited snippet returned

4. Given Claude calls memory tool with `insert` command, When executed, 
   Then text is inserted at specified line number

5. Given Claude calls memory tool with `delete` command, When executed, 
   Then file/directory is removed from GCS

6. Given Claude calls memory tool with `rename` command, When executed, 
   Then file/directory is moved to new path

7. Given memory tool registration, When agent loop runs, 
   Then tool is provided via betaMemoryTool() helper with type memory_20250818
```

**Task Changes**:

```
ADD:
- [ ] **Task 0: Use SDK Helper** 
  - [ ] Import `betaMemoryTool, MemoryToolHandlers` from SDK
  - [ ] Implement all 6 handler methods
  - [ ] Remove custom tool definition (input_schema)
  - [ ] Update agent loop to use SDK helper tool

- [ ] **Task 3a: Implement str_replace Handler**
  - [ ] Find old_str in file content
  - [ ] Replace with new_str (error if not found or multiple matches)
  - [ ] Return edited snippet with line numbers

- [ ] **Task 3b: Implement insert Handler**  
  - [ ] Insert text at specified line number
  - [ ] Return success message

- [ ] **Task 3c: Implement rename Handler**
  - [ ] Move file/directory to new path
  - [ ] Error if source missing or dest exists

- [ ] **Task 3d: Response Formatting**
  - [ ] Directories: file sizes + paths
  - [ ] Files: 6-char right-aligned line numbers, tab-separated
```

**Rationale**: Align with SDK helper pattern and all 6 official commands.

---

### 4.4 Epics.md Update

**File**: `_bmad-output/epics.md`
**Section**: Epic 5 Scope

```
OLD:
- Memory Tool handler (view, create, update, delete operations)

NEW:
- Memory Tool handler via SDK helper (view, create, str_replace, insert, delete, rename)
```

---

## Section 5: Implementation Handoff

### Change Scope Classification: **Moderate**

- Story modification needed
- Artifact updates required
- No fundamental replan

### Handoff Recipients

| Role | Responsibility |
|------|----------------|
| **Dev Team** | Implement handler changes, update tests |
| **PM (self)** | Update PRD, epics, story artifacts |

### Implementation Tasks

1. **Immediate (before dev work)**:
   - [ ] Update Story 5.1 with new ACs and tasks
   - [ ] Mark Story 5.1 status back to "in-progress"
   - [ ] Update PRD FR44
   - [ ] Update architecture.md memory section

2. **Development**:
   - [ ] Rewrite handler using `betaMemoryTool` helper
   - [ ] Implement 6 command handlers
   - [ ] Add response formatting (line numbers, file sizes)
   - [ ] Update agent loop integration
   - [ ] Update/add tests for all commands

3. **Verification**:
   - [ ] Test all 6 commands against GCS
   - [ ] Verify response format matches spec
   - [ ] Confirm Langfuse spans work correctly

### Success Criteria

- [ ] All 6 memory commands functional
- [ ] Tool type is `memory_20250818` (verified in API call)
- [ ] Response format matches Anthropic spec
- [ ] All existing tests pass + new tests for 3 new commands
- [ ] Langfuse observability maintained

---

## Approval

**Awaiting user approval to proceed with implementation.**

Options:
- **Approve**: Proceed with changes as proposed
- **Edit**: Modify specific proposals
- **Reject**: Do not proceed (explain concerns)

