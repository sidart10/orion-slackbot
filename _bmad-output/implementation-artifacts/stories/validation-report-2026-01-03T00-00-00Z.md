# Validation Report

**Document:** `_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md`  
**Checklist:** `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`  
**Date:** 2026-01-03T00-00-00Z

## Summary

- Overall: 3/10 passed (30%)
- Critical Issues: 4

## Section Results

### 1) Alignment to Epic + Current Architecture
Pass Rate: 1/3 (33%)

✓ PASS — Story status matches epic tracking  
Evidence: Story declares `Status: refactor-needed`  
`3:3:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
Status: refactor-needed
`
Evidence: Epic 6 tracks Story 6.1 as `refactor-needed`  
`360:363:_bmad-output/epics.md
| Story | Title | Status |
|-------|-------|--------|
| 6.1 | Agent Skills Loader | refactor-needed |
`

✗ FAIL — Acceptance Criteria conflict with “progressive disclosure” architecture  
Evidence: AC#4 requires full skill instructions injected at init  
`19:22:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
4. **Given** loaded skills, **When** the agent initializes, **Then** skill instructions are available for system prompt injection
`
Evidence: Architecture requires Level 1 metadata only, instructions on-demand  
`111:147:_bmad-output/architecture.md
### Agent Skills Implementation (Progressive Disclosure)
...
| **Level 1: Metadata** | Always (startup) | ~100 tokens/skill | `name` + `description` from YAML frontmatter |
| **Level 2: Instructions** | When triggered | Variable | Full SKILL.md body (read via execute_code) |
...
**Key Principle:** System prompt contains metadata only. Full content loaded on-demand via `execute_code` reading from sandbox filesystem (`/skills/`).
`
Impact: Dev agent may implement/retain the wrong behavior (token blow-up + standard violation).

⚠ PARTIAL — Course correction is documented, but not integrated into the main story contract  
Evidence: Refactor tasks exist, but are unchecked and not promoted to primary AC/Tasks  
`782:833:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
## 🚨 Course Correction: Progressive Disclosure Refactor
...
### Refactor Tasks
...
- [ ] **Task R1: Metadata-Only Loading**
...
- [ ] **Task R5: Update Tests**
`
Impact: A dev agent may treat the story as “done” because earlier tasks are checked, while the “real” required work is hidden later.

---

### 2) Disaster Prevention: Wrong File Locations / Mismatched Integration Points
Pass Rate: 0/2 (0%)

✗ FAIL — Story references a non-existent integration file (`src/agent/context.ts`)  
Evidence: Story states integration in `src/agent/context.ts`  
`447:463:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
### Integration with Agent Context
...
// In src/agent/context.ts (Story 2.1)
import { getSkills } from '../skills/loader.js';
import { buildSkillsPrompt } from '../skills/prompt-builder.js';
...
`
Evidence: In codebase, skills injection happens in Slack handlers  
`329:340:src/slack/handlers/user-message.ts
          // Story 6.1: Inject skills into system prompt (AC#4)
          try {
            const skills = await getSkills(trace.id);
            if (skills.length > 0) {
              const skillsPrompt = buildSkillsPrompt(skills);
              systemPrompt = `${systemPrompt}\n\n${skillsPrompt}`;
              logger.info({
                event: 'skills_injected',
                skillCount: skills.length,
                skillNames: skills.map((s) => s.name),
                traceId: trace.id,
              });
            }
          } catch (skillsError) {
`
Impact: High risk of wrong edits / missed changes during refactor (developer looks in the wrong place).

✗ FAIL — Tool registration guidance in story does not match actual registry API shape  
Evidence: Story proposes an object-style `registerDynamicTool({ ... })` usage  
`509:543:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
// In src/skills/loader.ts
import { registerDynamicTool } from '../tools/registry.js';
...
      registerDynamicTool({
        name: fullName,
        description: `[${skill.name}] ${tool.description}`,
        input_schema: {
          type: 'object',
          properties: tool.parameters,
...
`
Evidence: Codebase implements `ToolRegistry.registerDynamicTool(skillName, toolName, toolDefinition)` (method signature)  
`161:213:src/tools/registry.ts
  registerDynamicTool(
    skillName: string,
    toolName: string,
    toolDefinition: Anthropic.Tool
  ): void {
    const fullName = `${skillName}__${toolName}`;
...
    this.skillTools.set(fullName, {
      claudeTool: { ...toolDefinition, name: fullName },
      skillName,
      originalName: toolName,
    });
`
Impact: Dev agent may implement duplicate APIs or “fix” code toward the wrong interface.

---

### 3) Technical Correctness & Standards (versions, conventions, rules)
Pass Rate: 2/4 (50%)

✓ PASS — `.skills/` directory location is clearly specified  
Evidence:  
`91:103:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
### Canonical Skills Directory

**Use `.skills/` at project root** (per FR24 and architecture.md line 163).
`

✓ PASS — Correctly calls out ESM `.js` import rule and `traceId` logging expectations  
Evidence:  
`79:90:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
### Architecture Requirements (MANDATORY)
...
| Logging | project-context.md | ALL logs must include `traceId` |
| ESM imports | project-context.md:50-58 | ALL imports MUST use `.js` extension |
`

⚠ PARTIAL — “ToolResult<T>, never throw” rule is stated, but story content + repo implementation are inconsistent  
Evidence (rule):  
`88:89:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
| Tool handlers | project-context.md:69-92 | MUST return `ToolResult<T>`, NEVER throw |
`
Evidence (repo implementation uses a custom `SkillToolResult`, not the shared `ToolResult`):  
`15:23:src/skills/tool-handler.ts
export interface SkillToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
`
Impact: The story should be the single source of truth; mismatched result types risk inconsistent error handling contracts.

⚠ PARTIAL — Dependency versions are suggested, but story doesn’t verify against `package.json`  
Evidence:  
`552:559:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
### Package Dependencies
...
  "gray-matter": "^4.0.3",
  "glob": "^10.3.10"
`
Impact: Risk of wrong dependency guidance if versions drift.

---

### 4) LLM Optimization (token efficiency, clarity, non-ambiguity)
Pass Rate: 0/1 (0%)

✗ FAIL — Current documented “mainline” behavior is token-expensive and violates the open-standard intent  
Evidence: The story explicitly states current implementation injects full SKILL.md into the prompt (~15k tokens)  
`788:805:_bmad-output/implementation-artifacts/stories/6-1-agent-skills-loader.md
### Problem Summary

The current implementation injects **full SKILL.md content** into the system prompt at startup. This violates the [Agent Skills open standard](https://agentskills.io) and wastes ~15k tokens per conversation.
...
**Correct (Required):**
...
const skills = await getSkillMetadata(trace.id);  // Metadata only, ~1.2k tokens
`
Impact: Token inefficiency directly hits cost and context budget; it’s a core architectural requirement to fix.

## Failed Items

1. **AC conflict with progressive disclosure** → Update ACs to match architecture (metadata-only startup + on-demand instructions).  
2. **Wrong integration file reference (`src/agent/context.ts`)** → Replace with actual integration points (`src/slack/handlers/user-message.ts`, `src/slack/handlers/app-mention.ts`).  
3. **Tool registration API mismatch** → Update story to mirror actual registry API and prevent reinvention.  
4. **Token-expensive “mainline” behavior** → Promote refactor tasks to the primary Tasks/AC so dev work can’t miss it.

## Partial Items

1. **Course correction exists but is structurally “buried”** → Move refactor tasks up to “Tasks / Subtasks” and/or split into a new story file.  
2. **Tool result contract mismatch risk** → Decide: use shared `ToolResult<T>` everywhere vs keep a dedicated skill tool result type (document + enforce).

## Recommendations

1. **Must Fix**
   - Update Acceptance Criteria to align with progressive disclosure (metadata-only at startup).
   - Replace incorrect integration references (`src/agent/context.ts`) with the actual integration locations.
   - Normalize tool registration guidance to the actual `ToolRegistry.registerDynamicTool(...)` interface.
   - Make remaining refactor work unavoidable (top-level tasks/status).

2. **Should Improve**
   - Add explicit “Out of Scope” statement: 6.1 catalogs scripts only; 6.2 executes in GKE sandbox.
   - Add a short “Implementation Touchpoints” section listing the exact files to change for the refactor.

3. **Consider**
   - Split into two documents: “6.1 (done)” and “6.1b Refactor (ready-for-dev)” to avoid mixed state.


