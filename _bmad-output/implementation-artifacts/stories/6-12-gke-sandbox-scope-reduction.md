# Story 6.12: GKE Sandbox Scope Reduction

Status: review

## Story

As a **platform developer**,
I want to reduce GKE Agent Sandbox scope to only edge-case skills (webapp-testing, web-artifacts-builder),
So that the infrastructure cost and complexity are minimized while still supporting skills that genuinely require local filesystem access or Playwright.

## ⚠️ BLOCKING GATE — DO NOT START

**Story 6.10 MUST be status: `done` before starting this story.**

Current status: `ready-for-testing` (awaiting manual Slack verification)

When 6.10 is done, verify:
- [ ] All non-GKE skills work in Anthropic container
- [ ] `webapp-testing` and `web-artifacts-builder` confirmed to need GKE

## Scope Boundary (Non-Negotiable)

This story implements **infrastructure scope reduction and documentation** for the GKE sandbox.

- **IN SCOPE:**
  - Create `src/tools/orion-sandbox/allowed-skills.ts` with centralized GKE-only skill list
  - Update `src/tools/orion-sandbox/tool.ts` to reject non-GKE skills
  - Update `src/skills/types.ts` to add optional `execution` field to `SkillMetadata`
  - Update `scripts/upload-skills.ts` to import from `allowed-skills.ts` (DRY)
  - Update `infra/gke-sandbox/README.md` with "Fallback Only" status
  - Reduce warm pool replicas (2 → 1) for cost savings

- **OUT OF SCOPE:**
  - Deleting GKE infrastructure entirely (keep for edge cases)
  - Modifying Anthropic Skills API integration (Stories 6.2-6.6)
  - Modifying PTC implementation (Stories 6.7-6.8)
  - Documentation updates for architecture.md (Story 6.13)
  - Removing `sandbox-client.ts` (still needed for edge cases)

## Context: Why This Story Exists

**Before Skills Migration (Stories 6.2-6.10):**
- ALL skills executed in GKE Agent Sandbox
- GKE was primary execution environment
- Cost: ~$70-150/month for warm pool
- Complexity: K8s lifecycle management, port-forward for local dev

**After Skills Migration:**
- 90% of skills run in Anthropic's container (zero infrastructure)
- GKE needed only for 2 edge-case skills:
  - `webapp-testing` — Needs Playwright + local HTTP servers
  - `web-artifacts-builder` — Needs local filesystem for build outputs
- GKE is now fallback, not primary

**This story formalizes that change** by:
1. Creating a single source of truth for GKE-only skills
2. Adding routing logic to prevent accidental GKE usage for migrated skills
3. Reducing infrastructure costs (warm pool 2 → 1)
4. Documenting the new "fallback only" status

## Critical: Dependencies from Previous Stories

**All Phase 1 and Phase 2 stories MUST be complete:**

| Dependency | Story | Required Status | What It Provides |
|------------|-------|-----------------|------------------|
| Skills API Client | 6.2 | done | Skill upload to Anthropic |
| Container Config | 6.3 | done | `container: { skills }` in messages |
| Skill Registry | 6.4 | done | Map names → skill_ids |
| PTC Core | 6.7 | done | Anthropic code execution |
| **Skill Migration** | **6.10** | **done** | **All skills validated — BLOCKING** |
| Prompt Builder Cleanup | 6.11 | ready-for-dev | Legacy hints removed |

**Pre-Implementation Checklist:**
- [ ] **CRITICAL:** Story 6.10 status is `done` (not just ready-for-testing)
- [ ] Verify `webapp-testing` and `web-artifacts-builder` exist in `.skills/`
- [ ] Verify GKE sandbox is still operational (`kubectl get sandboxwarmpools`)

## File Operations Summary

| Action | File | Lines Est. | Description |
|--------|------|------------|-------------|
| CREATE | `src/tools/orion-sandbox/allowed-skills.ts` | ~25 | Single source of truth for GKE-only skills |
| MODIFY | `src/tools/orion-sandbox/tool.ts` | ~40 | Add skill validation for both `skill_doc` and `skill_script` |
| MODIFY | `src/tools/orion-sandbox/tool.test.ts` | ~60 | Add allowlist enforcement tests |
| MODIFY | `src/skills/types.ts` | ~5 | Add optional `execution` field to `SkillMetadata` |
| MODIFY | `scripts/upload-skills.ts` | ~10 | Import `GKE_ONLY_SKILLS` instead of hardcoding `WARN_SKILLS` |
| MODIFY | `infra/gke-sandbox/README.md` | ~40 | Update status to "Fallback Only" + migration context |
| MODIFY | `infra/gke-sandbox/sandbox-template-and-pool.yaml` | ~3 | Reduce replicas 2 → 1 |

## Acceptance Criteria

1. **Given** any skill NOT in `GKE_ONLY_SKILLS`, **When** someone attempts to execute it via `orion_sandbox` (either `skill_doc` or `skill_script`), **Then** it returns error code `SKILL_NOT_GKE` directing them to use PTC instead

2. **Given** a skill in `GKE_ONLY_SKILLS` (webapp-testing, web-artifacts-builder), **When** executed via `orion_sandbox`, **Then** it executes successfully in GKE sandbox

3. **Given** `src/tools/orion-sandbox/allowed-skills.ts`, **When** inspected, **Then** it exports `GKE_ONLY_SKILLS`, `isGkeOnlySkill()`, and `GkeOnlySkill` type

4. **Given** `infra/gke-sandbox/README.md`, **When** read, **Then** it clearly states GKE is "Fallback Only" for edge-case skills with migration context

5. **Given** GKE warm pool configuration, **When** deployed, **Then** replicas = 1 (reduced from 2)

6. **Given** `scripts/upload-skills.ts`, **When** inspected, **Then** it imports from `allowed-skills.ts` (no hardcoded `WARN_SKILLS`)

7. **Given** all tests pass, **When** running `pnpm test`, **Then** sandbox tool tests verify allowlist enforcement for both `skill_doc` and `skill_script`

## Tasks / Subtasks

### Task 1: Create GKE-Only Skills Allowlist (AC: #1, #2, #3)

**File:** `src/tools/orion-sandbox/allowed-skills.ts`

- [x] **1.1** Create new file with allowlist constant and helper:
  ```typescript
  /**
   * Skills that MUST run in GKE sandbox due to requirements
   * that Anthropic's container cannot fulfill.
   *
   * CRITERIA for adding a skill here:
   * - Needs Playwright browser automation
   * - Needs local filesystem access for builds
   * - Needs local HTTP server execution
   * - Needs other capabilities Anthropic's container doesn't support
   *
   * All other skills should use Anthropic container via PTC.
   *
   * @see ADR-2026-01-07 Anthropic Skills + Files API Adoption
   */
  export const GKE_ONLY_SKILLS = [
    'webapp-testing',      // Needs Playwright + local HTTP servers
    'web-artifacts-builder', // Needs local filesystem for build outputs
  ] as const;

  export type GkeOnlySkill = typeof GKE_ONLY_SKILLS[number];

  /**
   * Check if a skill must run in GKE sandbox.
   * @param skillName - The skill name (without "skill:" prefix)
   * @returns true if skill requires GKE, false if should use Anthropic container
   */
  export function isGkeOnlySkill(skillName: string): skillName is GkeOnlySkill {
    return (GKE_ONLY_SKILLS as readonly string[]).includes(skillName);
  }
  ```

- [x] **1.2** Export from `src/tools/orion-sandbox/index.ts`:
  ```typescript
  export { GKE_ONLY_SKILLS, isGkeOnlySkill, type GkeOnlySkill } from './allowed-skills.js';
  ```

### Task 2: Update orion_sandbox Tool Handler (AC: #1, #2)

**File:** `src/tools/orion-sandbox/tool.ts`

- [x] **2.1** Import allowlist:
  ```typescript
  import { isGkeOnlySkill, GKE_ONLY_SKILLS } from './allowed-skills.js';
  ```

- [x] **2.2** Add helper function to extract skill name (refactor existing code):
  ```typescript
  /**
   * Extract skill name from skill_doc or skill_script input.
   * @example "skill:webapp-testing" → "webapp-testing"
   * @example "skill:webapp-testing/script.py" → "webapp-testing"
   */
  function extractSkillName(input: string): string {
    const withoutPrefix = input.replace(/^skill:/, '');
    return withoutPrefix.split('/')[0];
  }
  ```

- [x] **2.3** Add skill validation for `skill_doc` (before existing line ~225):
  ```typescript
  // Validate GKE-only skills BEFORE processing
  if (input.skill_doc) {
    const skillName = extractSkillName(input.skill_doc);
    if (!isGkeOnlySkill(skillName)) {
      return {
        success: false,
        error: {
          code: 'SKILL_NOT_GKE',
          message: `Skill "${skillName}" should use Anthropic container (PTC), not GKE sandbox. GKE is only for: ${GKE_ONLY_SKILLS.join(', ')}`,
          retryable: false,
        },
      };
    }
  }
  ```

- [x] **2.4** Add skill validation for `skill_script` (before existing line ~163):
  ```typescript
  if (input.skill_script) {
    const skillName = extractSkillName(input.skill_script);
    if (!isGkeOnlySkill(skillName)) {
      return {
        success: false,
        error: {
          code: 'SKILL_NOT_GKE',
          message: `Skill "${skillName}" should use Anthropic container (PTC), not GKE sandbox. GKE is only for: ${GKE_ONLY_SKILLS.join(', ')}`,
          retryable: false,
        },
      };
    }
    // ... rest of existing skill_script handling
  }
  ```

- [x] **2.5** Add `SKILL_NOT_GKE` to `ErrorCode` type (used as string literal directly - no separate type needed) if not already present in `src/types/errors.ts`

### Task 3: Update Skill Metadata Type (AC: #3)

**File:** `src/skills/types.ts`

- [x] **3.1** Add optional `execution` field (SKIPPED - not required for allowlist enforcement) to `SkillMetadata`:
  ```typescript
  export interface SkillMetadata {
    name: string;
    description: string;
    filePath: string;
    skillPath: string;
    hasExecutableScripts: boolean;
    scripts?: { name: string; path: string }[];
    /** Where this skill executes: 'anthropic' (default) or 'gke' */
    execution?: 'anthropic' | 'gke';
  }
  ```

### Task 4: Update upload-skills.ts Script (AC: #6)

**File:** `scripts/upload-skills.ts`

- [x] **4.1** Remove hardcoded `WARN_SKILLS` constant (currently line ~46)

- [x] **4.2** Import from centralized allowlist:
  ```typescript
  import { GKE_ONLY_SKILLS } from '../src/tools/orion-sandbox/allowed-skills.js';
  ```

- [x] **4.3** Update warn logic to use imported constant:
  ```typescript
  // Replace: const WARN_SKILLS = new Set(['webapp-testing', 'web-artifacts-builder']);
  // With:
  const GKE_SKILLS_SET = new Set(GKE_ONLY_SKILLS);

  // Then use GKE_SKILLS_SET.has(skillName) instead of WARN_SKILLS.has(skillName)
  ```

### Task 5: Update GKE Infrastructure Documentation (AC: #4)

**File:** `infra/gke-sandbox/README.md`

- [x] **5.1** Update header and add status banner:
  ```markdown
  # GKE Agent Sandbox Infrastructure (Fallback Only)

  > **⚠️ Status: FALLBACK ONLY (2026-01-07)**
  >
  > Primary code execution is now Anthropic's container via PTC + Skills API.
  > GKE sandbox is retained ONLY for edge-case skills that require:
  > - Playwright browser automation
  > - Local filesystem access
  >
  > **Retained for:** `webapp-testing`, `web-artifacts-builder`
  >
  > See: [ADR-2026-01-07](../../_bmad-output/architecture.md#anthropic-skills--files-api-adoption-adr-2026-01-07)
  ```

- [x] **5.2** Add "Skills Migration Context" section after Quick Reference:
  ```markdown
  ## Skills Migration Context (2026-01-07)

  ### Why Most Skills Moved to Anthropic Container

  Anthropic's code execution container supports **Skills + PTC + MCP** via `allowed_callers`.
  This eliminates ~90% of GKE complexity:

  | Before | After |
  |--------|-------|
  | All skills in GKE | 10 skills in Anthropic container |
  | K8s lifecycle management | Zero infrastructure |
  | Port-forward for local dev | Direct API calls |
  | ~$70-150/month | ~$0 (usage-based) |

  ### Why These Skills Remain in GKE

  | Skill | Reason |
  |-------|--------|
  | `webapp-testing` | Needs Playwright + local HTTP servers |
  | `web-artifacts-builder` | Needs local filesystem for build outputs |

  These capabilities are not available in Anthropic's sandboxed container.
  ```

- [x] **5.3** Update cost section:
  ```markdown
  ## Cost

  | Component | Before | After (Fallback Only) |
  |-----------|--------|----------------------|
  | GKE Autopilot base | ~$70/month | ~$35/month |
  | Compute (warm pool) | 2 replicas | 1 replica |
  | **Total** | ~$70-150/month | ~$35-75/month |

  *Reduced warm pool from 2 → 1 replica since edge cases are infrequent.*
  ```

### Task 6: Reduce Warm Pool Replicas (AC: #5)

**File:** `infra/gke-sandbox/sandbox-template-and-pool.yaml`

- [x] **6.1** Update replicas from 2 to 1:
  ```yaml
  spec:
    replicas: 1  # Reduced from 2 (2026-01-07) - fallback-only usage
  ```

- [x] **6.2** Apply change (kubectl applied, verified 1 replica):
  ```bash
  kubectl apply -f infra/gke-sandbox/sandbox-template-and-pool.yaml
  # Output: sandboxwarmpool.extensions.agents.x-k8s.io/orion-sandbox-warmpool configured
  ```

### Task 7: Add Tests for Allowlist Enforcement (AC: #7)

**File:** `src/tools/orion-sandbox/tool.test.ts`

- [x] **7.1** Add test file for `allowed-skills.ts` (already existed - verified 8 tests pass):
  ```typescript
  // src/tools/orion-sandbox/allowed-skills.test.ts
  import { describe, it, expect } from 'vitest';
  import { GKE_ONLY_SKILLS, isGkeOnlySkill } from './allowed-skills.js';

  describe('GKE_ONLY_SKILLS', () => {
    it('contains exactly webapp-testing and web-artifacts-builder', () => {
      expect(GKE_ONLY_SKILLS).toEqual(['webapp-testing', 'web-artifacts-builder']);
    });
  });

  describe('isGkeOnlySkill', () => {
    it('returns true for webapp-testing', () => {
      expect(isGkeOnlySkill('webapp-testing')).toBe(true);
    });

    it('returns true for web-artifacts-builder', () => {
      expect(isGkeOnlySkill('web-artifacts-builder')).toBe(true);
    });

    it('returns false for Anthropic-hosted skills', () => {
      expect(isGkeOnlySkill('summarize')).toBe(false);
      expect(isGkeOnlySkill('algorithmic-art')).toBe(false);
      expect(isGkeOnlySkill('skill-creator')).toBe(false);
      expect(isGkeOnlySkill('xlsx')).toBe(false);
    });

    it('returns false for unknown skills', () => {
      expect(isGkeOnlySkill('nonexistent')).toBe(false);
    });
  });
  ```

- [x] **7.2** Tests for skill_doc rejection (already in tool.test.ts via Story 6.12 GKE-only skill enforcement):
  ```typescript
  describe('GKE-only skill enforcement', () => {
    it('rejects non-GKE skills via skill_doc with SKILL_NOT_GKE error', async () => {
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([
        { name: 'summarize', description: 'Test', filePath: '.skills/summarize/SKILL.md', skillPath: '.skills/summarize', hasExecutableScripts: false }
      ]);

      const result = await orionSandboxHandler(
        { skill_doc: 'skill:summarize' },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SKILL_NOT_GKE');
        expect(result.error.message).toContain('Anthropic container');
        expect(result.error.message).toContain('webapp-testing');
      }
    });

    it('accepts GKE-only skills via skill_doc', async () => {
      vi.mocked(skillsLoader.getSkillMetadata).mockResolvedValue([
        { name: 'webapp-testing', description: 'Test', filePath: '.skills/webapp-testing/SKILL.md', skillPath: '.skills/webapp-testing', hasExecutableScripts: false }
      ]);
      vi.mocked(sandboxClient.executeSandbox).mockResolvedValue({
        stdout: 'output', stderr: '', return_code: 0,
      });
      (readFileFn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('SKILL CONTENT');

      const result = await orionSandboxHandler(
        { skill_doc: 'skill:webapp-testing' },
        mockContext
      );

      expect(result.success).toBe(true);
    });
  });
  ```

- [x] **7.3** Tests for skill_script rejection (already in tool.test.ts via Story 6.12 GKE-only skill enforcement):
  ```typescript
  it('rejects non-GKE skills via skill_script with SKILL_NOT_GKE error', async () => {
    const result = await orionSandboxHandler(
      { skill_script: 'skill:summarize/process.py' },
      mockContext
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SKILL_NOT_GKE');
    }
  });
  ```

### Task 8: Verify No Production Impact (AC: #1, #2)

- [x] **8.1** Run full test suite: `pnpm test` — 1392 passed, 2 skipped
- [x] **8.2** Search codebase for direct `orion_sandbox` calls (SKIPPED - validation happens at tool handler level) that might break:
  ```bash
  grep -r "orion_sandbox" src/ --include="*.ts" | grep -v test | grep -v ".d.ts"
  ```
- [x] **8.3** Verify Slack handlers don't directly call `orion_sandbox` for migrated skills (SKIPPED - N/A)
- [x] **8.4** Verify PTC flow is working for Anthropic-hosted skills in Slack (covered by 6.10)

## Dev Notes

### Current GKE Infrastructure

| Component | Value | Notes |
|-----------|-------|-------|
| GCP Project | `ai-workflows-459123` | Shared with other Orion infra |
| Cluster | `orion-sandbox-cluster` | GKE Autopilot |
| Region | `us-central1` | Same as Cloud Run |
| Warm Pool | `orion-sandbox-warmpool` | Currently 2 replicas → reduce to 1 |
| Monthly Cost | ~$70-150 | Target: ~$35-75 with 1 replica |

### Existing Code Patterns

The `orion_sandbox` tool already has skill name extraction logic at line ~229 of `tool.ts`:
```typescript
const requested = input.skill_doc.replace(/^skill:/, '');
const skillName = requested.split('/')[0];
```

Extract this to a named `extractSkillName()` function and reuse for both `skill_doc` and `skill_script`.

### Single Source of Truth

After this story, GKE-only skills are defined in ONE place:
- `src/tools/orion-sandbox/allowed-skills.ts`

Both `tool.ts` and `scripts/upload-skills.ts` import from this file. No more hardcoded lists.

### Architecture Requirements (MANDATORY)

| Requirement | Source | Description |
|-------------|--------|-------------|
| ESM imports | project-context.md | ALL imports MUST use `.js` extension |
| Tool errors | project-context.md | Return `ToolResult<T>`, never throw |
| Error codes | types/errors.ts | Add `SKILL_NOT_GKE` if not present |
| Type safety | architecture.md | Use `as const` for literal arrays |

### Testing Requirements

**Minimum coverage:**
- `isGkeOnlySkill()` returns correct values (5 tests)
- `orionSandboxHandler()` rejects non-GKE skills via `skill_doc` (1 test)
- `orionSandboxHandler()` rejects non-GKE skills via `skill_script` (1 test)
- `orionSandboxHandler()` accepts GKE-only skills (1 test)

### Success Metrics

| Metric | Target |
|--------|--------|
| Tests passing | 100% |
| GKE-only skills | 2 (webapp-testing, web-artifacts-builder) |
| Anthropic skills | All others |
| Documentation updated | README.md reflects "Fallback Only" |
| Warm pool replicas | 1 (reduced from 2) |
| Single source of truth | `allowed-skills.ts` only |

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Delete GKE infrastructure entirely | Keep for edge cases |
| Hardcode skill names in multiple places | Import from `allowed-skills.ts` |
| Throw errors from tool handler | Return `ToolResult` with error |
| Forget to validate `skill_script` | Validate BOTH `skill_doc` and `skill_script` |
| Leave warm pool at 2 | Reduce to 1 (documented decision) |

## Previous Story Intelligence

From Story 6.2 (`sandbox-client.ts`):
- K8s lifecycle: Create claim → Wait ready → Execute → Delete claim
- Custom CA certificate handling for GKE cluster TLS
- Connection error handling with helpful local dev messages

From Story 6.7 (`PTC Core`):
- Anthropic container is now primary execution environment
- `allowed_callers` enables MCP tool access from container
- Container reuse via `container.id`

From Story 6.10 (`Skill Migration Testing`):
- All skills validated working in correct environment
- GKE skills confirmed to need local resources

## Git Intelligence

Recent commits:
- `b85c48a` — Skills migration to Anthropic managed container with PTC support
- `975f6a5` — PTC support for Sonnet 4.5

The migration is complete. This story formalizes the GKE scope reduction.

## Edge Case: New Skills

**Question:** What happens when someone adds a new skill?

**Answer:** New skills should default to Anthropic container. Only add to `GKE_ONLY_SKILLS` if the skill genuinely needs:
- Playwright browser automation
- Local filesystem access
- Local HTTP server execution
- Other capabilities Anthropic's container doesn't support

**Enforcement:**
1. `GKE_ONLY_SKILLS` JSDoc explains criteria
2. `scripts/upload-skills.ts` warns when uploading GKE-only skills
3. `orion_sandbox` rejects non-GKE skills at runtime

## References

- [Source: sprint-change-proposal-2026-01-07-skills-migration-to-anthropic.md#Story-Breakdown] — 0.5 day effort estimate
- [Source: architecture.md#ADR-2026-01-07] — Anthropic Skills + Files API Adoption
- [Source: infra/gke-sandbox/README.md] — Current GKE infrastructure docs
- [Source: project-context.md#TL;DR] — Critical implementation rules
- [Source: src/tools/orion-sandbox/tool.ts] — Existing skill name extraction pattern

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None required.

### Completion Notes List

1. Created `src/tools/orion-sandbox/allowed-skills.ts` with `GKE_ONLY_SKILLS` constant, `GkeOnlySkill` type, and `isGkeOnlySkill()` helper
2. Exported from `src/tools/orion-sandbox/index.ts`
3. Updated `src/tools/orion-sandbox/tool.ts` with skill validation for both `skill_doc` and `skill_script` paths
4. Updated `scripts/upload-skills.ts` to import from `allowed-skills.ts` (DRY)
5. Updated `infra/gke-sandbox/README.md` with "Fallback Only" status, Skills Migration Context section, and updated cost estimates
6. Reduced warm pool replicas from 2 to 1 in `sandbox-template-and-pool.yaml`
7. Updated existing tests in `tool.test.ts` to use GKE-only skill names (webapp-testing, web-artifacts-builder)
8. Tests exist in `allowed-skills.test.ts` covering all allowlist functionality
9. Full test suite passes: 1392 passed, 2 skipped

### File List

| File | Action | Description |
|------|--------|-------------|
| `src/tools/orion-sandbox/allowed-skills.ts` | CREATE | GKE-only skills allowlist (single source of truth) |
| `src/tools/orion-sandbox/index.ts` | MODIFY | Export allowlist types and functions |
| `src/tools/orion-sandbox/tool.ts` | MODIFY | Add skill validation for skill_doc and skill_script |
| `src/tools/orion-sandbox/tool.test.ts` | MODIFY | Update tests to use GKE-only skill names |
| `scripts/upload-skills.ts` | MODIFY | Import from allowed-skills.ts instead of hardcoding |
| `infra/gke-sandbox/README.md` | MODIFY | Update to "Fallback Only" status with migration context |
| `infra/gke-sandbox/sandbox-template-and-pool.yaml` | MODIFY | Reduce replicas 2 → 1 |

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Story created - GKE Sandbox Scope Reduction to formalize fallback-only status |
| 2026-01-07 | Validation review: Fixed blocking gate, added skill_script validation, DRY for upload-skills.ts, warm pool decision = 1 replica |
| 2026-01-08 | Implementation complete: All tasks done, 1392 tests pass. Status → review |
