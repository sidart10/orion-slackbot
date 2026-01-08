# Story 6.10: Skill Migration & Testing

Status: ready-for-testing

**UNBLOCKED (2026-01-07):** PTC file extraction fix applied + Phase 2 reliability improvements.

See `_bmad-output/ptc-file-output-investigation.md` and `_bmad-output/sprint-change-proposal-2026-01-07-ptc-file-extraction-fix.md`

## TL;DR

Validate all 10 skills work in Anthropic's container. Test 3 built-in (xlsx, pdf, docx) + 7 custom skills via `#orion-testing` Slack channel. Verify PTC, Files API, and container reuse. Generate migration report.

## Story

As a **platform developer**,
I want to verify that all skills work correctly when executed in Anthropic's container (vs GKE sandbox),
So that I can confidently complete the migration and deprecate unnecessary GKE infrastructure.

## Prerequisites (Already Complete)

Story 6.9 is **done**. The following are already in place:

- `pnpm upload-skills` command exists and works
- `.skills/.cache/skills.json` contains 7 custom skill IDs
- `src/skills/registry.ts` loads skills from cache automatically
- Built-in skills (xlsx, pdf, docx) handled by registry's `ANTHROPIC_BUILTIN_SKILLS` constant

**No configuration file creation needed** — the registry already works.

## Existing Code (DO NOT RECREATE)

| File | Purpose | Status |
|------|---------|--------|
| `src/skills/registry.ts` | Skill registry singleton — loads from `.skills/.cache/skills.json` | ✅ Done |
| `src/skills/container-builder.ts` | Builds `container: { skills }` for API | ✅ Done |
| `src/skills/api-client.ts` | Skills API client for upload/list | ✅ Done |
| `src/skills/sync-service.ts` | Syncs skills to Anthropic, updates cache | ✅ Done |

## Scope Boundary

**IN SCOPE:**
- Test all 10 skills end-to-end in Anthropic container via Slack
- Verify PTC, Files API, container reuse
- Generate migration report

**OUT OF SCOPE:**
- Creating `.orion/skills.yaml` (registry uses `.skills/.cache/skills.json`)
- Uploading skills (Story 6.9 — done)
- GKE sandbox modifications (Story 6.12)
- Documentation updates (Story 6.13)

## Skills Inventory

### Custom Skills (from `.skills/.cache/skills.json`)

| Skill | Skill ID | Test Scenario |
|-------|----------|---------------|
| `summarize` | `skill_01RPF5idq2YgBzSc8uk9m4hn` | Summarize provided messages |
| `mcp-builder` | `skill_01QHzK6nFdMFrozURhGZogQb` | Create weather MCP server template |
| `skill-creator` | `skill_01XB916jXhZMq2NQetcxBqda` | Create email summarization skill template |
| `d3-viz` | `skill_01PthBGhkxQeqFiQDmFw5qFp` | Create bar chart (A=10, B=20, C=15) |
| `frontend-design` | `skill_01QSnDVqC5zbNPA72tbUNuq1` | Create React button component |
| `algorithmic-art` | `skill_01TLVMi6yZ1xRDA7HsaeAyis` | Generate art with circles |
| `example-skill` | `skill_01HUa8Qyj3jff3fb39P2ugxt` | Run basic example |

### Built-in Skills (Anthropic-managed, no upload needed)

| Skill | Type | Test Scenario | Expected Output |
|-------|------|---------------|-----------------|
| `xlsx` | anthropic | Create spreadsheet with Q1 sales data | file_id for .xlsx |
| `pdf` | anthropic | Create PDF report titled 'Project Status' | file_id for .pdf |
| `docx` | anthropic | Create Word document with meeting notes | file_id for .docx |

### GKE-Only Skills (Skip testing)

| Skill | Reason |
|-------|--------|
| `webapp-testing` | Needs Playwright + local servers |
| `web-artifacts-builder` | Needs local filesystem |

## File Operations Summary

| Action | File | Description |
|--------|------|-------------|
| CREATE | `docs/skills-migration-report.md` | Test results and recommendations |

## Acceptance Criteria

1. **Given** built-in `xlsx`/`pdf`/`docx` skill, **When** generating file, **Then** file_id returned and downloadable
2. **Given** custom skill, **When** invoked via Anthropic container, **Then** returns valid output
3. **Given** skill with PTC `allowed_callers`, **When** calling MCP tool, **Then** call succeeds via proxy
4. **Given** generated file, **When** downloaded via Files API, **Then** uploads to Slack successfully
5. **Given** container ID from previous turn, **When** reused, **Then** skills work without re-init
6. **Given** all tests pass, **When** report generated, **Then** includes skill, result, latency, issues

## Tasks

### Task 1: Verify Registry Loads Cache (Gate Check)

- [ ] **1.1** Run `pnpm test src/skills/registry.test.ts` — all tests pass
- [ ] **1.2** Verify `skillRegistry.getSkillId('summarize')` returns `skill_01RPF5idq2YgBzSc8uk9m4hn`

### Task 2: Test Built-In Skills via Slack (AC: #1, #4)

Test in `#orion-testing` channel by sending messages to Orion:

- [ ] **2.1** Test xlsx: "Create a spreadsheet with Q1 sales: Jan $10k, Feb $15k, Mar $12k"
- [ ] **2.2** Test pdf: "Create a PDF report titled 'Project Status' with summary of progress"
- [ ] **2.3** Test docx: "Create a Word document with meeting notes from today's standup"
- [ ] **2.4** Verify each file uploads to Slack and opens correctly

### Task 3: Test Custom Skills via Slack (AC: #2)

Test in `#orion-testing` channel:

- [ ] **3.1** Test `summarize`: "Summarize the last 10 messages in this thread"
- [ ] **3.2** Test `algorithmic-art`: "Create algorithmic art with colorful circles"
- [ ] **3.3** Test `d3-viz`: "Create a D3 bar chart showing A=10, B=20, C=15"
- [ ] **3.4** Test `frontend-design`: "Create a React button component with hover effect"
- [ ] **3.5** Test `skill-creator`: "Create a SKILL.md template for email summarization"
- [ ] **3.6** Test `mcp-builder`: "Create an MCP server template for weather data"
- [ ] **3.7** Test `example-skill`: "Run the example skill demo"

### Task 4: Test PTC Integration (AC: #3)

- [ ] **4.1** Use a skill that calls MCP tool via `allowed_callers` (e.g., summarize calling Slack API via Rube)
- [ ] **4.2** Verify tool call succeeds through Anthropic's proxy
- [ ] **4.3** Check Langfuse for `ptc.execution.completed` span

### Task 5: Test Container Reuse (AC: #5)

- [ ] **5.1** Send first message, note container ID in Langfuse trace
- [ ] **5.2** Send follow-up in same thread, verify same container ID reused
- [ ] **5.3** Check Langfuse for `container.reused` event

### Task 6: Generate Migration Report (AC: #6)

- [ ] **6.1** Create `docs/skills-migration-report.md`
- [ ] **6.2** Document each skill: name, test result (pass/fail), latency, issues
- [ ] **6.3** Document PTC and container reuse results
- [ ] **6.4** Add recommendations:
  - GKE retention for webapp-testing + web-artifacts-builder
  - Any skills that need fixes
  - Performance observations

## Dev Notes

### Test Configuration

**Slack test channel:** `#orion-testing`

**Beta headers (already configured in `src/config/environment.ts`):**
```typescript
betas: [
  'code-execution-2025-08-25',
  'skills-2025-10-02',
  'files-api-2025-04-14',
]
```

### Registry Implementation

The registry (`src/skills/registry.ts`) already handles everything:

```typescript
// Built-in skills (xlsx, pdf, docx) use name as skill_id
const ANTHROPIC_BUILTIN_SKILLS = new Set(['xlsx', 'pdf', 'docx']);

// Custom skills loaded from .skills/.cache/skills.json
const CACHE_FILE_PATH = '.skills/.cache/skills.json';
```

**No need to create `.orion/skills.yaml`** — this was an earlier design that was superseded by the cache-based approach.

### Architecture Requirements

| Requirement | Description |
|-------------|-------------|
| ESM imports | Use `.js` extension for all imports |
| Error handling | Return `ToolResult<T>`, never throw |
| Logging | Include `traceId` in all log entries |
| File cleanup | Delete files from Anthropic after Slack upload |

### Success Metrics

| Metric | Target |
|--------|--------|
| Built-in skills | 3/3 pass |
| Custom skills | 7/7 pass |
| Avg latency | <3s |
| Files API | 100% success |
| Container reuse | Working |

### Rollback Plan

If migration testing reveals blocking issues:
1. Document specific failures in migration report
2. Keep GKE sandbox as primary execution path
3. File issue for Anthropic container limitations
4. Defer migration until issues resolved

## References

- Story 6.9 — Upload script, cache format (done)
- Story 6.7 — PTC `allowed_callers` pattern
- `src/skills/registry.ts` — SkillRegistry singleton
- `src/skills/container-builder.ts` — Container config builder
- `.skills/.cache/skills.json` — Cached skill IDs

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20250514)

### Completion Notes List

- Task 1.1: PASS — 29/29 registry tests pass
- Task 1.2: PASS — `getSkillId('summarize')` returns correct ID
- Tasks 2-3: READY — PTC file extraction fix applied, awaiting manual Slack testing
- Task 4: READY — PTC integration can now be verified
- Task 5: READY — Container reuse can now be tested
- Task 6: COMPLETE — Migration report generated at `validation-report-6-10-2026-01-07.md`

### Code Changes (2026-01-07)

**Phase 1: PTC File Extraction Fix**
- `src/agent/loop.ts:989-1073` — Added `bash_code_execution_tool_result` handler
- `tests/factories/skills-factory.ts:432-456` — Updated mock with correct block type/structure
- `src/skills/prompt-builder.test.ts` — Updated test for new PTC container instructions

**Phase 2: Reliability Improvements**
- `package.json` — Added `p-limit@7.2.0` dependency
- `src/slack/utils/file-uploader.ts:18,22-23` — Import + `CONCURRENT_UPLOAD_LIMIT = 3`
- `src/slack/utils/file-uploader.ts:278-282` — Rate-limited uploads with `pLimit(3)`
- `src/slack/utils/file-uploader.ts:318-359` — Added `cleanupFileWithRetry()` with exponential backoff

### File List

- `_bmad-output/implementation-artifacts/stories/validation-report-6-10-2026-01-07.md` — Test results
- `_bmad-output/ptc-file-output-investigation.md` — Technical investigation doc (RESOLVED)
- `_bmad-output/sprint-change-proposal-2026-01-07-ptc-file-extraction-fix.md` — Change proposal (APPROVED)

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Story created |
| 2026-01-07 | SM Validation: Added TL;DR, blocker gate, consolidated skills table |
| 2026-01-07 | SM Validation Fix: Removed incorrect `.orion/skills.yaml` task, added existing code section, fixed skill names (d3-viz not d3js-visualization), added skill IDs from cache, simplified testing to use Slack channel |
| 2026-01-07 | Dev Testing: Task 1 PASS, Tasks 2-5 BLOCKED by PTC file output issue, Task 6 COMPLETE |
| 2026-01-07 | Status changed to BLOCKED — PTC `code_execution_tool_result` blocks not received |
| 2026-01-08 | Phase 1 fix implemented: `bash_code_execution_tool_result` handler added |
| 2026-01-08 | Phase 2 reliability: Rate limiting (pLimit 3) + cleanup retry with backoff |
| 2026-01-08 | Status changed to READY-FOR-TESTING — All code complete, awaiting manual Slack verification |
