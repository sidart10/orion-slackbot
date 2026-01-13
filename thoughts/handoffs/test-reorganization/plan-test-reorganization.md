---
date: 2026-01-13T03:15:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-test-reorganization.md
---

# Plan Handoff: Test Suite Reorganization

## Summary

Created a comprehensive plan to reorganize 108 unit test files from co-located (`src/**/*.test.ts`) to centralized (`tests/unit/**/*.test.ts`) structure, mirroring the source directory layout.

## Plan Created

`thoughts/shared/plans/PLAN-test-reorganization.md`

## Key Technical Decisions

- **Centralized layout**: Moving all tests to `tests/unit/` mirroring `src/` structure (industry standard for Node.js/TypeScript)
- **Path aliases**: Using `@/` for src and `@test/` for tests - cleaner imports
- **Preserve git history**: Use `git mv` for all file moves
- **Keep existing factories/helpers**: Already well-organized in `tests/factories/` and `tests/helpers/`

## Task Overview

1. **Create Directory Structure** - Create `tests/unit/` subdirectories mirroring `src/`
2. **Move Test Files** - Move 108 test files using `git mv`
3. **Configure Path Aliases** - Set up `@/` and `@test/` in tsconfig + vitest
4. **Update Import Paths** - Convert all imports to use path aliases
5. **Update Vitest Test Patterns** - Change `include` pattern
6. **Update TSConfig Build** - Verify build excludes
7. **Update Documentation** - Update `tests/README.md` with alias docs
8. **Verify and Test** - Full test suite verification

## Research Findings

- **108 unit test files** currently co-located in `src/`
- **10 support files** already in `tests/` (factories, helpers, integration tests)
- **Vitest config** at `vitest.config.ts:7` includes `['src/**/*.test.ts', 'scripts/**/*.test.ts']`
- **Coverage thresholds**: 85/78/85/85 (statements/branches/functions/lines)

## Subdirectories to Create

Based on current `src/` structure:
- `tests/unit/agent/`
- `tests/unit/config/`
- `tests/unit/files/`
- `tests/unit/memory/`
- `tests/unit/observability/`
- `tests/unit/skills/`
- `tests/unit/slack/handlers/`
- `tests/unit/slack/citations/`
- `tests/unit/slack/prompts/`
- `tests/unit/slack/status/`
- `tests/unit/slack/utils/`
- `tests/unit/tools/memory/`
- `tests/unit/tools/mcp/`
- `tests/unit/tools/orion-sandbox/`
- `tests/unit/tools/summarize/`
- `tests/unit/utils/`

## Assumptions Made

- User prefers centralized test structure (confirmed via interview)
- Git history preservation is important (using `git mv`)
- No need for TypeScript path aliases at this time
- Existing factory/helper structure is satisfactory

## Risks Identified

- **HIGH**: Import path breakage across 108 files
  - Mitigation: Automated migration script provided in plan
- **MEDIUM**: Potential merge conflicts if other PRs in flight
  - Mitigation: Coordinate timing

## For Next Steps

1. User should review plan at: `thoughts/shared/plans/PLAN-test-reorganization.md`
2. After approval, run `/implement_plan` with the plan path
3. Consider doing this during low-activity period to avoid merge conflicts
4. Budget ~30-60 minutes for full migration and verification
