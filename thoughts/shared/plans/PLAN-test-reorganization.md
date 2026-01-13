# Plan: Test Suite Reorganization

## Goal

Reorganize the test suite from co-located tests (`src/**/*.test.ts`) to a centralized `tests/` directory structure that mirrors the source. This provides:
- Cleaner `src/` directory with only production code
- Easier build exclusion (no need for glob patterns)
- Clear separation of concerns
- Industry-standard Node.js/TypeScript layout

## Technical Choices

- **Test Framework**: Keep Vitest (already configured)
- **Directory Structure**: `tests/unit/` mirrors `src/` exactly
- **Import Paths**: Use TypeScript path aliases for clean imports
  - `@/` → `src/` (source code)
  - `@test/` → `tests/` (test utilities)
- **Coverage**: Keep existing thresholds (85/78/85/85)
- **Factories/Helpers**: Keep in `tests/` (already there)

## Current State Analysis

### Current Structure:
```
src/
├── **/*.test.ts          # 108 unit test files (CO-LOCATED)
├── tools/
│   ├── executor.ts
│   ├── executor.test.ts   # <-- Move to tests/
│   └── ...
└── ...

tests/
├── factories/            # 5 factory files ✓ (keep)
├── helpers/              # 1 helper file ✓ (keep)
├── integration/          # 2 integration tests ✓ (keep)
└── README.md             # ✓ (update)
```

### Target Structure:
```
src/                      # Production code ONLY
├── tools/
│   ├── executor.ts
│   └── (no .test.ts)
└── ...

tests/
├── unit/                 # NEW - mirrors src/
│   ├── tools/
│   │   ├── executor.test.ts
│   │   └── ...
│   ├── agent/
│   ├── slack/
│   └── ...
├── factories/            # Shared test data factories
├── helpers/              # Shared test utilities
├── integration/          # Integration tests
└── README.md
```

### Key Files:
- `vitest.config.ts` - Must update `include` pattern
- `tests/README.md` - Update documentation
- `tsconfig.json` / `tsconfig.build.json` - Verify excludes

## Tasks

### Task 1: Create Directory Structure
Create the `tests/unit/` directory mirroring `src/` subdirectories.

- [ ] Create `tests/unit/` directory
- [ ] Create subdirectories matching `src/`:
  - `tests/unit/agent/`
  - `tests/unit/config/`
  - `tests/unit/files/`
  - `tests/unit/memory/`
  - `tests/unit/observability/`
  - `tests/unit/skills/`
  - `tests/unit/slack/` (and nested `handlers/`, `citations/`, `status/`, `prompts/`, `utils/`)
  - `tests/unit/tools/` (and nested `memory/`, `mcp/`, `orion-sandbox/`, `summarize/`)
  - `tests/unit/utils/`

**Files to create:**
- Directory structure only

### Task 2: Move Test Files
Move all 108 test files from `src/` to `tests/unit/` preserving directory structure.

- [ ] Move `src/**/*.test.ts` files to corresponding `tests/unit/**/*.test.ts`
- [ ] Preserve exact directory structure
- [ ] Use `git mv` to preserve history

**Example moves:**
```
src/tools/executor.test.ts → tests/unit/tools/executor.test.ts
src/agent/orion.test.ts → tests/unit/agent/orion.test.ts
src/slack/handlers/app-mention.test.ts → tests/unit/slack/handlers/app-mention.test.ts
```

**Files to modify:**
- Git operation (move 108 files)

### Task 3: Configure Path Aliases
Set up TypeScript path aliases for clean imports.

- [ ] Update `tsconfig.json` with `paths` and `baseUrl` (keep rootDir for production)
- [ ] Create `tsconfig.test.json` extending base WITHOUT rootDir restriction (TIGER FIX)
- [ ] Update `vitest.config.ts` with `resolve.alias` to match
- [ ] Check ESLint has `eslint-import-resolver-typescript` (ELEPHANT FIX)

**TSConfig changes (tsconfig.json):**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@test/*": ["tests/*"]
    }
    // Keep rootDir: "./src" for production builds
  }
}
```

**New tsconfig.test.json (TIGER MITIGATION):**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "."  // Override to allow tests/ directory
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

**Vitest config changes:**
```typescript
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@test': resolve(__dirname, 'tests'),
    },
  },
  // ... rest of config
});
```

**Files to modify:**
- `tsconfig.json` (add baseUrl + paths)
- `tsconfig.test.json` (NEW - without rootDir restriction)
- `vitest.config.ts` (add aliases)

### Task 4: Update Import Paths
Update all import statements in moved test files to use path aliases.

- [ ] Update imports from `./` or `../` to `@/` patterns
- [ ] Update imports from `../../tests/` to `@test/` patterns
- [ ] Verify all imports resolve correctly

**Import pattern changes:**
```typescript
// BEFORE (co-located with relative paths):
import { executeTool } from './executor.js';
import { createAgentContext } from '../../tests/factories/agent-factory.js';

// AFTER (centralized with path aliases):
import { executeTool } from '@/tools/executor.js';
import { createAgentContext } from '@test/factories/agent-factory.js';
```

**Files to modify:**
- All 108 moved test files

### Task 5: Update Vitest Test Include Pattern
Update `vitest.config.ts` to find tests in new location.

- [ ] Update `include` pattern to `['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts']`
- [ ] Optionally add `scripts/**/*.test.ts` if needed
- [ ] Keep coverage settings unchanged (exclude `tests/`)

**Files to modify:**
- `vitest.config.ts` (test patterns only - aliases done in Task 3)

### Task 6: Update TSConfig Build Excludes
Ensure build configuration excludes tests.

- [ ] Verify `tsconfig.build.json` excludes `tests/` directory
- [ ] Update exclude pattern if needed

**Files to modify:**
- `tsconfig.build.json` (if needed)

### Task 7: Update Documentation
Update documentation to reflect new structure.

- [ ] Update `tests/README.md` to reflect centralized structure
- [ ] Remove references to "co-located" tests
- [ ] Update path examples in README
- [ ] Document the path aliases (`@/` and `@test/`)

**Files to modify:**
- `tests/README.md`

### Task 8: Verify and Test
Run full test suite and verify everything works.

- [ ] Run `pnpm test` - all tests pass
- [ ] Run `pnpm test:coverage` - coverage thresholds met
- [ ] Run `pnpm typecheck` - no TypeScript errors
- [ ] Run `pnpm lint` - no linting errors
- [ ] Verify `pnpm build` excludes test files

**Commands to run:**
```bash
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm build
```

## Success Criteria

### Automated Verification:
- [ ] `pnpm test` - All 108+ tests pass
- [ ] `pnpm test:coverage` - Coverage thresholds met (85/78/85/85)
- [ ] `pnpm typecheck` - No TypeScript errors
- [ ] `pnpm lint` - No linting errors
- [ ] `pnpm build` - No test files in `dist/`

### Manual Verification:
- [ ] `src/` contains no `.test.ts` files
- [ ] `tests/unit/` structure mirrors `src/` exactly
- [ ] All test imports resolve correctly
- [ ] Factory imports work from new locations
- [ ] Git history preserved for moved files

## Risks (Pre-Mortem)

### Tigers:
- **Import path breakage** (HIGH)
  - Mitigation: Automated script to update imports with verification
  - Consider using `tsconfig` path aliases for cleaner imports

- **Coverage drop if tests excluded** (MEDIUM)
  - Mitigation: Run coverage before/after, compare reports

### Elephants:
- **108 files = many potential merge conflicts** (MEDIUM)
  - Note: Coordinate with any in-flight PRs
  - Best done during low-activity period

- **IDE import resolution caching** (LOW)
  - Note: May need TypeScript server restart

## Out of Scope

- **Test file renaming** - Keep `.test.ts` convention
- **Factory reorganization** - Already well-structured in `tests/factories/`
- **Integration test changes** - Already in correct location
- **Source code path aliases** - Only adding aliases for test files (source stays with relative imports)

## Implementation Script

For Task 2 and 3, consider using a migration script:

```bash
#!/bin/bash
# Move test files preserving git history
cd "$(git rev-parse --show-toplevel)"

# Find all test files in src/
find src -name "*.test.ts" | while read file; do
  # Calculate new path
  newpath="${file/src/tests\/unit}"
  newdir=$(dirname "$newpath")

  # Create directory and move file
  mkdir -p "$newdir"
  git mv "$file" "$newpath"
done
```

Then run a separate script or use `sed` to update imports.

## Risk Mitigations (Pre-Mortem)

### Tigers Addressed:

1. **rootDir conflict** (HIGH)
   - **Issue:** `tsconfig.json` has `rootDir: "./src"` which prevents TypeScript from compiling files outside `src/`
   - **Mitigation:** Create `tsconfig.test.json` that:
     - Extends base tsconfig
     - Removes `rootDir` restriction
     - Adds `tests/` to include
     - Used by Vitest only (not production build)
   - **Added to:** Task 3 (Configure Path Aliases)

2. **Import update scale** (MEDIUM)
   - **Issue:** 113+ relative imports need updating across 81 files - error-prone manually
   - **Mitigation:** Write migration script to automate import updates:
     ```bash
     # Convert ./ imports to @/ imports
     # Convert ../../tests/ to @test/
     # Run after file move, before verification
     ```
   - **Added to:** New Task 4a (Run Migration Script)

### Elephants Noted:

1. **ESLint alias resolution** (MEDIUM)
   - **Issue:** ESLint may not resolve `@/` aliases without plugin
   - **Mitigation:** Check for `eslint-import-resolver-typescript` in devDependencies
   - **Action:** Add if missing, configure in `.eslintrc`
   - **Added to:** Task 3 verification

### Pre-Mortem Run:
- Date: 2026-01-13
- Mode: quick
- Tigers: 2 (both mitigated)
- Elephants: 1 (noted)
- Paper Tigers: 3 (CI, coverage, build - all fine)

## Rollback Plan

If issues arise:
1. `git reset --hard HEAD~1` (if committed)
2. Revert vitest.config.ts change
3. All tests remain in original location
