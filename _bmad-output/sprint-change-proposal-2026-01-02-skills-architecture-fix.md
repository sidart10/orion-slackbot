# Sprint Change Proposal: Skills Architecture Fix

**Date:** 2026-01-02  
**Author:** Dev Agent  
**Reviewed By:** PM Agent (John) — Course Correction Workflow  
**Status:** APPROVED  
**Priority:** HIGH  
**Affected Stories:** 6-1 (Skills Loader), 6-2 (Execute Code Tool)  
**Scope Classification:** Minor (Direct implementation by dev team)

---

## Executive Summary

Story 6-1 (Skills Loader) was implemented incorrectly. The current implementation uses **system prompt injection of full content** instead of proper **progressive disclosure**. This wastes context tokens and defeats the purpose of skills.

**Key Insight:** Agent Skills is now an **open standard** ([agentskills.io](https://agentskills.io/home)) adopted by:
- Claude Code, Cursor, VS Code, GitHub Copilot, OpenAI Codex, Amp, Goose, Letta

The correct approach:
1. Load only **metadata** (name + description) into system prompt (~100 tokens/skill)
2. Claude reads full SKILL.md **on-demand via filesystem** when triggered
3. Our GKE sandbox can serve as the "virtual machine with filesystem access"

---

## Current Implementation (WRONG)

### What We Built

```
.skills/
├── pdf/SKILL.md
├── xlsx/SKILL.md
├── d3js-visualization/SKILL.md
└── ... (12 skills total)

src/skills/
├── loader.ts       # Reads SKILL.md files from disk at startup
├── prompt-builder.ts  # Formats all skills into a giant string
└── types.ts

src/slack/handlers/
├── user-message.ts   # Injects skills string into system prompt
└── app-mention.ts    # Injects skills string into system prompt
```

### The Problem

```typescript
// user-message.ts - CURRENT (WRONG)
const skills = await getSkills(trace.id);
const skillsPrompt = buildSkillsPrompt(skills);  // Loads ALL 12 skills
systemPrompt = `${skillsPrompt}\n\n${systemPrompt}`;  // ~15k tokens wasted
```

**Issues:**
1. **All skills loaded upfront** - Every conversation pays the token cost for all 12 skills
2. **No progressive disclosure** - Claude can't load skills on-demand
3. **No sandbox integration** - Skills can't use their bundled scripts
4. **Violates Anthropic's architecture** - This is not how skills are meant to work

---

## The Open Agent Skills Standard (CORRECT)

### agentskills.io - The Open Standard

From [agentskills.io](https://agentskills.io/home):

> Agent Skills are folders of instructions, scripts, and resources that agents can discover and use to do things more accurately and efficiently.
> 
> The Agent Skills format was originally developed by Anthropic, released as an open standard, and has been adopted by a growing number of agent products.

**Adopted by:** Claude, Claude Code, Cursor, VS Code, GitHub Copilot, OpenAI Codex, Amp, Goose, Letta

### How Skills Should Work

From `docs/anthropic-sdk/agent-skills.md`:

> Skills leverage Claude's VM environment to provide capabilities beyond what's possible with prompts alone. Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials.

### Three-Level Progressive Disclosure

| Level | When Loaded | Token Cost | Content |
|-------|-------------|------------|---------|
| **Level 1: Metadata** | Always (startup) | ~100 tokens/skill | `name` + `description` from YAML frontmatter |
| **Level 2: Instructions** | When triggered | Under 5k tokens | SKILL.md body |
| **Level 3: Resources** | As needed | Effectively unlimited | Bundled files executed via bash |

### Two Integration Paths

**1. Anthropic's Native API (for their hosted sandbox)**
```typescript
// Uses Anthropic's code_execution beta - NOT what we want
container: {
  skills: [{ type: 'anthropic', skill_id: 'pdf' }]
}
```

**2. Self-hosted / Custom Agents (what we should use)**
```typescript
// System prompt contains ONLY metadata
const systemPrompt = `
Available skills (read full content when triggered):
- pdf: Extract text and tables from PDF files. Use when working with PDFs.
- xlsx: Analyze spreadsheets. Use when working with Excel files.

To use a skill: Read /skills/{name}/SKILL.md via execute_code
`;

// Claude triggers via our sandbox:
// execute_code({ code: "cat /skills/pdf/SKILL.md" })
```

**Key Insight:** We can implement the open standard with our **own GKE sandbox** - no need for Anthropic's beta API.

---

## Damage Assessment

### Token Waste

| Metric | Current | Correct | Waste |
|--------|---------|---------|-------|
| Skills loaded at startup | 12 full skills | 12 metadata only | ~14,000 tokens |
| Per-conversation cost | ~15k tokens | ~1,200 tokens | 12x overhead |
| Skills actually used per conversation | 1-2 | 1-2 | Same |

### Architectural Issues

| Issue | Severity | Impact |
|-------|----------|--------|
| No progressive disclosure | HIGH | All skills compete for context |
| Scripts can't execute | HIGH | Skills with Python scripts are broken |
| No on-demand loading | MEDIUM | Can't add more skills without cost |
| Wrong API pattern | MEDIUM | Not using Anthropic's beta features |

### Files Affected

**Incorrectly implemented:**
- `src/skills/loader.ts` - Loads full content, should load metadata only
- `src/skills/prompt-builder.ts` - Builds giant prompt, should be removed
- `src/slack/handlers/user-message.ts` - Injects skills, needs refactor
- `src/slack/handlers/app-mention.ts` - Injects skills, needs refactor

**Missing integration:**
- `src/agent/loop.ts` - Doesn't use `container.skills` or sandbox skill loading
- `src/tools/code-execution/tool.ts` - Skills not in sandbox filesystem

---

## Fix Options

### Option A: Anthropic's Native Skills API (NOT RECOMMENDED)

**Use `container.skills` parameter with Anthropic's code execution beta.**

**Pros:**
- Official skills (pdf, xlsx, docx, pptx) work out of the box

**Cons:**
- Requires Anthropic's beta sandbox (not our GKE sandbox)
- Can't use MCP tools from their sandbox
- Two sandboxes running = complexity
- Beta API - may change
- Lock-in to Anthropic's hosted environment

**Effort:** 3-5 days | **Verdict:** ❌ Not aligned with open standard

---

### Option B: Open Standard with GKE Sandbox (RECOMMENDED)

**Implement [agentskills.io](https://agentskills.io/home) open standard using our existing GKE sandbox.**

```typescript
// Step 1: System prompt contains ONLY metadata (~100 tokens/skill)
const skillsMetadata = skills.map(s => `- ${s.name}: ${s.description}`);
systemPrompt = `
# Available Skills

${skillsMetadata.join('\n')}

When a task matches a skill's description, use execute_code to read its full instructions:
  cat /skills/{skill-name}/SKILL.md

Then follow the instructions in that file.
`;

// Step 2: Skills synced to sandbox filesystem
// /skills/pdf/SKILL.md, /skills/xlsx/SKILL.md, etc.

// Step 3: Claude reads on-demand via execute_code
{
  "name": "execute_code",
  "input": { "code": "cat /skills/pdf/SKILL.md" }
}
```

**Pros:**
- ✅ Uses our existing GKE sandbox
- ✅ Skills can use MCP tools (mcp-bootstrap.py integration)
- ✅ Full control over skill execution
- ✅ Works with ANY community skills (agentskills.io compatible)
- ✅ No vendor lock-in
- ✅ Progressive disclosure works correctly

**Cons:**
- Must sync `.skills/` to sandbox filesystem
- Need to teach Claude when to load skills (system prompt guidance)

**Effort:** 2-3 days | **Verdict:** ✅ Best fit for Orion

---

## Recommended Action

**Option B: Open Standard with GKE Sandbox**

**Rationale:**
1. Follows the **open Agent Skills standard** ([agentskills.io](https://agentskills.io/home))
2. Works like Cursor, VS Code, Claude Code - same pattern
3. Uses our existing GKE sandbox + MCP integration
4. No dependency on Anthropic's beta APIs
5. Community skills work out of the box
6. Can add Anthropic's official skills later if needed

---

## Implementation Plan

### Phase 1: Fix Metadata-Only Loading (Day 1)

1. Modify `src/skills/loader.ts`:
   - Only parse YAML frontmatter (name, description)
   - Don't load full SKILL.md content
   
2. Modify `src/skills/prompt-builder.ts`:
   - Build lightweight metadata list, not full content
   - Include instruction: "Read /skills/{name}/SKILL.md to use a skill"

3. Update handlers to inject metadata only

### Phase 2: Sync Skills to Sandbox (Day 1-2)

1. Modify `src/tools/code-execution/tool.ts`:
   - Before executing code, sync `.skills/` to sandbox `/skills/`
   - Or: Build skills into sandbox container image

2. Test Claude can read SKILL.md via execute_code

### Phase 3: Test Progressive Disclosure (Day 2)

1. Verify Claude only reads SKILL.md when relevant
2. Test skills with bundled scripts work
3. Verify MCP tools work from skill scripts

### Phase 4: Cleanup (Day 2-3)

1. Remove full content injection from handlers
2. Update tests
3. Document new architecture

---

## Files to Change

| File | Change |
|------|--------|
| `src/skills/loader.ts` | Parse frontmatter only |
| `src/skills/prompt-builder.ts` | Build metadata list, not full content |
| `src/slack/handlers/user-message.ts` | Inject metadata only |
| `src/slack/handlers/app-mention.ts` | Inject metadata only |
| `src/tools/code-execution/tool.ts` | Sync skills to sandbox |
| `src/agent/loop.ts` | Update system prompt handling |

---

## Success Criteria

- [ ] System prompt contains only skill metadata (~100 tokens/skill)
- [ ] Claude can read full SKILL.md via execute_code when triggered
- [ ] Skills with Python scripts execute correctly in sandbox
- [ ] MCP tools accessible from skill scripts
- [ ] Token usage reduced by 10x+ per conversation

---

## Rollback Plan

If issues arise:
1. Revert to current system prompt injection (temporary)
2. Skills work but waste tokens
3. No user-facing breakage

---

## Appendix: Agent Skills Open Standard

### Resources

- **Official Site:** [agentskills.io](https://agentskills.io/home)
- **Specification:** [agentskills.io/specification](https://agentskills.io/specification)
- **Integration Guide:** [agentskills.io/integrate-skills](https://agentskills.io/integrate-skills)
- **Example Skills:** [github.com/anthropics/courses/skills](https://github.com/anthropics/courses/tree/master/skills)

### NPM Packages

```bash
# Validate SKILL.md files
npm install agentskills-validate

# Install skills CLI
npm install skills-installer

# Anthropic's Agent SDK (optional)
npm install @anthropic-ai/claude-agent-sdk
```

### SKILL.md Format (from agentskills.io spec)

```yaml
---
name: pdf-processing           # lowercase, hyphens, max 64 chars
description: Extract text from PDF files. Use when working with PDFs.
---

# PDF Processing

## Quick start
...instructions...
```

### Adopted By

| Product | Company | Integration Type |
|---------|---------|------------------|
| Claude | Anthropic | Native API |
| Claude Code | Anthropic | Filesystem |
| Cursor | Cursor | Filesystem |
| VS Code | Microsoft | Extension |
| GitHub Copilot | GitHub | Workspace |
| OpenAI Codex | OpenAI | Filesystem |
| Amp | Sourcegraph | Filesystem |
| Goose | Block | Filesystem |

### How Other Agents Implement Skills

**Cursor / Claude Code / VS Code pattern:**
1. Skills in `.skills/` or `~/.skills/` directory
2. Agent reads SKILL.md metadata at startup
3. Only metadata goes in system prompt
4. Full content read via bash/filesystem when triggered
5. Scripts executed in sandbox/terminal

**This is exactly what we should do with Orion + GKE sandbox.**

---

## Implementation Handoff

### Approval Status

| Item | Status |
|------|--------|
| **PM Review** | ✅ Approved (2026-01-02) |
| **Checklist Complete** | ✅ All 6 sections validated |
| **Scope Classification** | Minor — Direct dev implementation |
| **Epic Impact** | Epic 6 only; no scope change |
| **PRD Alignment** | ✅ Fix aligns with FR24 (Agent Skills open standard) |
| **Architecture Alignment** | ✅ Matches existing ADR pattern (lines 113-129) |

### Routing

**Route To:** Development Team (Dev Agent)

**Deliverables:**
1. Refactored `src/skills/loader.ts` — metadata-only parsing
2. Refactored `src/skills/prompt-builder.ts` — hint format
3. Updated handlers (`user-message.ts`, `app-mention.ts`)
4. Skill sync in `src/tools/code-execution/tool.ts`
5. Updated tests for all changed files

### Story Updates Required

| Story | Action |
|-------|--------|
| **6-1** | Add "Course Correction" section; status → `refactor-needed` |
| **6-2** | Add "Skill Filesystem Integration" section; status → `in-progress` |

### Sprint Status Updates

```yaml
6-1-agent-skills-loader: refactor-needed  # Was: done
6-2-execute-code-tool: in-progress        # Was: done
```

### Success Criteria

- [ ] System prompt contains only skill metadata (~100 tokens/skill)
- [ ] Claude can read full SKILL.md via execute_code when triggered
- [ ] Skills with Python scripts execute correctly in GKE sandbox
- [ ] MCP tools accessible from skill scripts
- [ ] Token usage reduced by 10x+ per conversation
- [ ] All tests passing

### Timeline

| Phase | Effort | Target |
|-------|--------|--------|
| Phase 1: Metadata-only loading | 1.5 hours | Day 1 |
| Phase 2: Skill sync to sandbox | 1.5 hours | Day 1-2 |
| Phase 3: Test progressive disclosure | 1 hour | Day 2 |
| Phase 4: Cleanup + docs | 1 hour | Day 2-3 |
| **Total** | **5 hours** | **2-3 days** |

### Rollback Plan

If issues arise:
1. Revert to current system prompt injection (temporary)
2. Skills work but waste tokens
3. No user-facing breakage

---

## Workflow Completion

| Item | Value |
|------|-------|
| **Workflow** | Correct Course (Sprint Change Management) |
| **Executed By** | PM Agent (John) |
| **Date** | 2026-01-02 |
| **Outcome** | APPROVED — Route to Dev for implementation |

