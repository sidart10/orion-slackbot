# Plan: Fix Skills Mount Path and Remove Built-in Duplicates

## Goal

Fix the skills system so Claude can actually find and use skills in Anthropic's container. Currently:
1. **Wrong paths**: `buildSkillsHint` tells Claude to look at `/mnt/skills`, `/mnt/user/skills` - but Anthropic mounts skills at `/skills/{directory}/`
2. **Duplicate built-ins**: `.skills/xlsx/`, `.skills/pdf/`, `.skills/docx/` are copies of Anthropic's built-in skills (instructions only, no scripts) - these should be removed and referenced by ID
3. **Confusing instructions**: The custom path-finding code may conflict with Anthropic's automatic skill injection

## Technical Choices

- **Path**: Use `/skills/{skill_name}/` as the primary path (per Anthropic docs)
- **Built-in handling**: Remove local copies, use `{ type: 'anthropic', skill_id: 'xlsx' }` directly
- **Prompt simplification**: Simplify `buildSkillsHint` since Anthropic injects metadata automatically

## Current State Analysis

### Key Files:
- `src/skills/prompt-builder.ts` - Contains wrong paths (lines 96-97)
- `src/skills/registry.ts` - Has `ANTHROPIC_BUILTIN_SKILLS = new Set(['xlsx', 'pdf', 'docx'])` - correct
- `src/skills/container-builder.ts` - Works correctly with skill IDs
- `.skills/xlsx/`, `.skills/pdf/`, `.skills/docx/` - Should be deleted (built-in duplicates)

### Current Path Logic (Wrong):
```python
for root in ['/mnt/skills', '/mnt/user/skills', 'skills', '.']:
    skill_path = f'{root}/{skill_name}'
```

### Correct Path (Per Anthropic Docs):
```
/skills/{skill_name}/SKILL.md
```

## Tasks

### Task 1: Update `buildSkillsHint` with Correct Path
Update `src/skills/prompt-builder.ts` to use the correct Anthropic container path.

- [ ] Change path search to prioritize `/skills/{skill_name}/`
- [ ] Simplify the path discovery code (Anthropic handles mounting)
- [ ] Update the example Python code to use correct path
- [ ] Remove the multi-path search loop (no longer needed)

**Files to modify:**
- `src/skills/prompt-builder.ts`

### Task 2: Remove Built-in Skill Duplicates
Delete the local copies of Anthropic's built-in skills.

- [ ] Delete `.skills/xlsx/` directory
- [ ] Delete `.skills/pdf/` directory
- [ ] Delete `.skills/docx/` directory
- [ ] Verify registry still correctly identifies these as built-ins

**Files to delete:**
- `.skills/xlsx/`
- `.skills/pdf/`
- `.skills/docx/`

### Task 3: Update Registry to Auto-Include Built-ins
Ensure built-in skills are always included in container parameter without needing local files.

- [ ] Verify `getContainerSkills()` includes built-ins even without local files
- [ ] Add logic to always include xlsx, pdf, docx, pptx as anthropic type
- [ ] Update tests to verify built-in handling

**Files to modify:**
- `src/skills/registry.ts`
- `src/skills/registry.test.ts`

### Task 4: Simplify Skill Instructions
Since Anthropic automatically injects skill metadata, simplify the custom instructions.

- [ ] Remove complex path-finding code from `buildSkillsHint`
- [ ] Keep simple usage instructions
- [ ] Trust Anthropic's automatic progressive disclosure
- [ ] Add note about `/skills/{name}/` being the standard path

**Files to modify:**
- `src/skills/prompt-builder.ts`
- `src/skills/prompt-builder.test.ts`

### Task 5: Update Tests
Update tests to reflect the new simpler behavior.

- [ ] Update `prompt-builder.test.ts` for new path
- [ ] Update `registry.test.ts` for built-in handling without local files
- [ ] Verify all existing tests pass

**Files to modify:**
- `src/skills/prompt-builder.test.ts`
- `src/skills/registry.test.ts`

### Task 6: Clear Skill Cache
Clear the cached skill IDs so removed built-ins don't cause issues.

- [ ] Delete `.skills/.cache/skills.json`
- [ ] Let sync-service regenerate on next startup

**Files to delete:**
- `.skills/.cache/skills.json`

## Success Criteria

### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Type check passes: `npm run typecheck`

### Manual Verification:
- [ ] Ask Orion to "create an excel spreadsheet" - should use xlsx skill
- [ ] Ask Orion to use samba-slides skill - should find it at /skills/samba-slides/
- [ ] Check logs for skill container usage

## Out of Scope
- Creating new custom skills
- Changing the skill upload mechanism (api-client.ts works correctly)
- Modifying container-builder.ts (already correct)
- Adding pptx to built-ins (can be done separately if needed)

## Risks (Pre-Mortem)

### Tigers:
- **Anthropic path may vary by environment** (MEDIUM)
  - Mitigation: Add fallback to `/mnt/skills` if `/skills/` doesn't exist

- **Cache invalidation on deploy** (LOW)
  - Mitigation: Cache is cleared in Task 6, will regenerate

### Elephants:
- **Custom skills may have dependency issues** (MEDIUM)
  - Note: Anthropic container doesn't allow runtime `pip install` - skills with dependencies in requirements.txt won't work unless pre-installed
