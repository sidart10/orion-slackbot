---
date: 2026-01-12T15:30:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-skills-path-fix.md
---

# Plan Handoff: Fix Skills Mount Path

## Summary
Fix the skills system so Claude can find skills at the correct Anthropic container path (`/skills/{name}/`) instead of the wrong guessed paths (`/mnt/skills`, etc.), and remove duplicate built-in skills.

## Plan Created
`thoughts/shared/plans/PLAN-skills-path-fix.md`

## Key Technical Decisions
- **Use `/skills/{name}/`**: This is the documented Anthropic container mount path
- **Remove built-in duplicates**: xlsx, pdf, docx are Anthropic pre-built - no need to upload them
- **Simplify prompt**: Trust Anthropic's automatic metadata injection instead of complex path-finding

## Task Overview
1. **Update buildSkillsHint paths** - Change from `/mnt/skills` to `/skills/{name}/`
2. **Remove built-in duplicates** - Delete .skills/xlsx/, .skills/pdf/, .skills/docx/
3. **Update registry** - Ensure built-ins are included without local files
4. **Simplify instructions** - Remove complex path-finding code
5. **Update tests** - Reflect new behavior
6. **Clear cache** - Remove stale skill IDs

## Research Findings

### From Anthropic Documentation
- **Mount path**: `/skills/{directory}/` (from [Skills API Guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide))
- **Automatic injection**: "Claude sees metadata for each Skill (name, description) in the system prompt"
- **File loading**: "Skill files are copied into the container at `/skills/{directory}/`"

### Current Implementation Issues
- `prompt-builder.ts:96-97` uses wrong paths: `/mnt/skills`, `/mnt/user/skills`
- `.skills/xlsx/SKILL.md` has no scripts (just instructions) - useless without Anthropic's built-in
- `samba-slides` skill has proper structure but Claude can't find it due to wrong path

### What Works Correctly
- `api-client.ts` - Uploads skills correctly to Anthropic API
- `sync-service.ts` - Proper versioning and caching
- `container-builder.ts` - Builds container param correctly
- `registry.ts` - Has `ANTHROPIC_BUILTIN_SKILLS` set properly

## Assumptions Made
- `/skills/{name}/` is the correct path for all Anthropic container environments
- Anthropic automatically injects skill metadata when container param includes skills
- Built-in skills (xlsx, pdf, docx, pptx) work without any local files
- Custom skills with `requirements.txt` will NOT work (no runtime pip install)

## For Next Steps
- User should review plan at: `thoughts/shared/plans/PLAN-skills-path-fix.md`
- After approval, run `/implement_plan` with the plan path
- Consider testing with a simple skill first (e.g., summarize) to verify path works
