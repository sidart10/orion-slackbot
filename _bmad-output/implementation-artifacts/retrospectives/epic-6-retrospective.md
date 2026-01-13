# Epic 6 Retrospective: Skills & Extensions Framework

**Date:** 2026-01-12
**Epic:** 6 - Skills & Extensions Framework
**Stories Completed:** 13 (6.1 - 6.13)

---

## Summary

Epic 6 underwent a major course correction mid-execution: the original GKE Agent Sandbox approach was replaced with Anthropic's managed container via the Skills API. This pivot eliminated ~90% of infrastructure complexity while enabling Programmatic Tool Calling (PTC) for efficient multi-tool orchestration. The epic delivered a complete skills framework with custom skill uploads, Files API integration, and graceful fallback to GKE for edge cases.

---

## Stories Delivered

| Story | Title | Description |
|-------|-------|-------------|
| 6.1 | Agent Skills Loader | Progressive disclosure - metadata-only loading from `.skills/` directory |
| 6.2 | Skills API Client | Upload skills to Anthropic, create cache file for skill ID mapping |
| 6.3 | Skills Container Config | `container: { skills }` parameter + container ID lifecycle management |
| 6.4 | Skill Registry Service | Centralized registry wrapping cache + built-in skills (xlsx, pdf, docx) |
| 6.5 | Files API Client | Upload/download files from Anthropic Files API |
| 6.6 | Files API Slack Integration | Download generated files, upload to Slack |
| 6.7 | Programmatic Tool Calling (PTC) Core | `allowed_callers` for MCP tool access from Anthropic's container |
| 6.8 | PTC Observability | Langfuse tracing for PTC executions |
| 6.9 | Upload Custom Skills Script | `pnpm upload-skills` CLI command |
| 6.10 | Skill Migration & Testing | Validate all skills work in Anthropic container |
| 6.11 | Prompt Builder Cleanup | Remove legacy GKE-specific hints |
| 6.12 | GKE Sandbox Scope Reduction | Keep GKE for 2 edge-case skills only |
| 6.13 | Documentation Update | Architecture ADR + operational docs |

---

## What Went Well

### Major Course Correction Executed Cleanly
- Discovered during Story 6.3 that Anthropic's container supports Skills + PTC + MCP via `allowed_callers`
- Sprint change proposal (2026-01-07) approved and executed within hours
- Old stories 6.2-6.3 archived, replaced by 6.2-6.13 with clearer scope
- The pivot reduced ongoing infrastructure cost from ~$150/month to ~$35/month (GKE fallback only)

### API Integration Done Right
- Skills API client properly handles upload, list, retrieve with content hashing
- Files API client correctly extracts file IDs from nested `content.content[]` structure (after fix)
- Container lifecycle management enables session reuse across conversation turns
- Beta headers consolidated in `config.anthropic.allBetas` for consistency

### Technical Debt Addressed Proactively
- Story 6.4 code review caught O(n) lookup in `getSkillMetadata()` - fixed with secondary index
- Story 6.12 created single source of truth for GKE-only skills (`allowed-skills.ts`)
- Registry properly handles missing/corrupt cache files with graceful degradation

### Strong Test Coverage
- Full test suite: 1392 tests passing at epic completion
- Story 6.4: 29 registry tests covering all initialization scenarios
- Story 6.5: 20 Files API tests including size limits and error handling
- Factory patterns established for consistent test mocking

---

## Lessons Learned

### Initial Architecture Assumptions Were Wrong
- ADR-2026-01-03 assumed "Anthropic's container has NO network access" - this was incomplete
- MCP tools ARE accessible via `allowed_callers` because Anthropic routes them externally
- **Learning:** Validate infrastructure assumptions early with proof-of-concept tests before committing to complex solutions

### Progressive Disclosure Required Multiple Iterations
- Story 6.1 initially injected full skill content (~15k tokens per conversation)
- Sprint change (2026-01-02) corrected to metadata-only (~1.2k tokens)
- **Learning:** The Agent Skills open standard (agentskills.io) should have been consulted earlier

### API Block Types Changed Without Notice
- Story 6.10 was BLOCKED because code expected `code_execution_tool_result` but API returned `bash_code_execution_tool_result`
- Nested structure was also different: `content.files[]` vs `content.content[]`
- **Learning:** When integrating beta APIs, verify exact block types by logging raw responses before building handlers

### Two-Phase Sprint Changes Work Well
- First proposal (2026-01-02): Skills architecture fix - metadata-only loading
- Second proposal (2026-01-07): Full migration to Anthropic container
- Each proposal had clear scope, impact analysis, and success criteria
- **Learning:** Course corrections are healthy when they're well-documented and properly scoped

---

## Technical Patterns Established

### Skills Registry Pattern
```typescript
// Singleton registry with dual index for O(1) lookups
class SkillRegistry {
  private skills = new Map<string, SkillRegistryEntry>();      // name -> entry
  private skillIdIndex = new Map<string, SkillRegistryEntry>(); // skillId -> entry
}
```
- Built-in skills (xlsx, pdf, docx) use name as skill_id
- Custom skills map local name to Anthropic skill_id
- `getContainerSkills()` returns API-ready `ContainerSkillReference[]`

### Files API Integration Pattern
```typescript
// Flow: Container creates file -> Files API -> Buffer -> Slack -> Delete
const fileIds = extractFileIds(response);  // Parse from bash_code_execution_tool_result
const buffer = await filesClient.downloadFile(fileId);
await slackClient.files.uploadV2({ file: buffer, channel, thread_ts });
await filesClient.deleteFile(fileId);  // Cleanup
```
- Rate limiting with `pLimit(3)` for concurrent uploads
- Retry with exponential backoff for cleanup failures
- Structured error codes: `FILE_NOT_FOUND`, `FILE_TOO_LARGE`, `RATE_LIMITED`

### GKE-Only Skills Allowlist Pattern
```typescript
// Single source of truth: src/tools/orion-sandbox/allowed-skills.ts
export const GKE_ONLY_SKILLS = ['webapp-testing', 'web-artifacts-builder'] as const;
export function isGkeOnlySkill(name: string): name is GkeOnlySkill {
  return (GKE_ONLY_SKILLS as readonly string[]).includes(name);
}
```
- `orion_sandbox` tool rejects non-GKE skills with `SKILL_NOT_GKE` error
- `upload-skills.ts` warns when uploading GKE-only skills
- Clear JSDoc explains criteria for adding to allowlist

### Container Lifecycle Pattern
```typescript
// Reuse container across conversation turns
const containerLifecycle = {
  containerId: undefined as string | undefined,
  set(id: string) { this.containerId = id; },
  get() { return this.containerId; },
};
// Include in container param for session reuse
container: existingContainerId ? { id: existingContainerId, skills: [...] } : { skills: [...] }
```

---

## Technical Debt Identified

### Minor Items
1. **Built-in skills list hardcoded:** `ANTHROPIC_BUILTIN_SKILLS = ['xlsx', 'pdf', 'docx']` may become stale
   - Acceptable tech debt - one-line change when Anthropic adds new built-ins
   - No discovery API exists yet

2. **PTC timeout handling:** Container expiration (`container_expired`) logged but not gracefully recovered
   - Container refresh happens on next request, so impact is minimal

3. **Skill metadata `execution` field:** Story 6.12 Task 3.1 was skipped (not needed for allowlist enforcement)
   - Type extension deferred to when/if needed

### Documentation Gaps
1. Update `project-context.md` with:
   - Skills registry singleton pattern
   - Files API flow diagram
   - GKE-only skill criteria

2. `SKILL.md` template in `.skills/` needs update for Anthropic container context

---

## Recommendations for Future Epics

### Process Improvements
1. **Validate beta API contracts early:** Log raw streaming events before building handlers
2. **Sprint changes need clear blocking gates:** Story 6.10 was blocked but 6.12 could have started earlier
3. **Two-pass review works well:** Implementation pass + code review pass caught issues before merge

### Technical Recommendations
1. **Container reuse is valuable:** Eliminates cold-start latency (~2-3s saved per turn)
2. **Skills with bundled scripts work:** Python scripts in skill directories execute correctly
3. **Files API cleanup should be async:** Don't block response on file deletion

### Architecture Guidance
1. **Prefer Anthropic container for new skills:** Only use GKE if Playwright or local filesystem required
2. **PTC is powerful but adds complexity:** Best for multi-tool orchestration, not simple single-tool calls
3. **Cache files need expiry strategy:** `.skills/.cache/skills.json` grows indefinitely

---

## Metrics

| Metric | Value |
|--------|-------|
| Stories Completed | 13 |
| Stories Archived | 2 (old 6.2, 6.3) |
| Test Count at Completion | 1392 (2 skipped) |
| Sprint Change Proposals | 2 (2026-01-02, 2026-01-07) |
| New Skills Migrated | 7 custom + 3 built-in |
| GKE-Only Skills Retained | 2 (webapp-testing, web-artifacts-builder) |

### Story Complexity Distribution
| Story | Points | Complexity | Notes |
|-------|--------|------------|-------|
| 6.1 | 1 | Low | Refactored after sprint change |
| 6.2 | 3 | Medium | Skills API client + cache |
| 6.3 | 2 | Medium | Container config |
| 6.4 | 2 | Medium | Registry + secondary index |
| 6.5 | 3 | Medium | Files API client |
| 6.6 | 3 | Medium | Slack integration |
| 6.7 | 5 | High | PTC core implementation |
| 6.8 | 1 | Low | Langfuse events |
| 6.9 | 1 | Low | CLI script |
| 6.10 | 3 | High | Blocked by API format bug |
| 6.11 | 1 | Low | Cleanup |
| 6.12 | 2 | Medium | GKE scope reduction |
| 6.13 | 1 | Low | Docs |
| **Total** | **28** | |

---

## Key Artifacts

### New Modules Created
- `src/skills/api-client.ts` - Skills API CRUD operations
- `src/skills/registry.ts` - Centralized skill registry singleton
- `src/skills/sync-service.ts` - Skill upload + cache management
- `src/skills/container-builder.ts` - Container parameter construction
- `src/files/api-client.ts` - Files API upload/download/delete
- `src/tools/orion-sandbox/allowed-skills.ts` - GKE-only skill allowlist

### Configuration Added
- `.skills/.cache/skills.json` - Skill ID mapping cache
- `config.anthropic.allBetas` - Consolidated beta headers

### Architecture Documentation
- ADR-2026-01-07: Anthropic Skills + Files API Adoption
- `sprint-change-proposal-2026-01-02-skills-architecture-fix.md`
- `sprint-change-proposal-2026-01-07-skills-migration-to-anthropic.md`
- `sprint-change-proposal-2026-01-07-ptc-file-extraction-fix.md`
- `tech-spec-skills-migration-to-anthropic-container.md`

---

## Conclusion

Epic 6 delivered a complete skills framework despite requiring two significant course corrections. The pivot from GKE-only to Anthropic container was the right call - it reduced infrastructure complexity, eliminated cold-start latency for most skills, and enabled PTC for efficient multi-tool orchestration. The most valuable learning was validating infrastructure assumptions early: the initial "no network access" assumption was partially incorrect and led to over-engineering.

The patterns established - skills registry, container lifecycle, GKE allowlist, Files API flow - provide a solid foundation for adding new skills. The remaining GKE infrastructure serves as a reliable fallback for edge cases requiring Playwright or local filesystem access.

**Epic Status:** Complete
**Infrastructure Cost Reduction:** ~75% ($150/mo -> $35/mo estimated)
**Skills Migrated:** 10/12 (83%) to Anthropic container
