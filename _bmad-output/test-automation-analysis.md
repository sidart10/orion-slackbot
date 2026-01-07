# Test Automation Analysis

**Date:** 2026-01-07
**Analyst:** Murat (TEA - Master Test Architect)
**Project:** orion-slack-agent

---

## Executive Summary

Current test coverage is **84.75%**, which is **0.25% below the 85% threshold**. CI is blocking merges. This analysis identifies coverage gaps, prioritizes targets, and provides a remediation plan.

---

## Current State

### Coverage Metrics

| Metric | Current | Threshold | Status |
|--------|---------|-----------|--------|
| Statements | 84.75% | 85% | :x: FAILING |
| Branches | ~82% | 78% | :white_check_mark: OK |
| Functions | ~88% | 85% | :white_check_mark: OK |
| Lines | 84.75% | 85% | :x: FAILING |

### Test Infrastructure

| Component | Status |
|-----------|--------|
| Framework | Vitest 1.6.0 |
| Config | `vitest.config.ts` with coverage thresholds |
| Test Location | Co-located (`src/**/*.test.ts`) |
| Factories | `tests/factories/agent-factory.ts` (588 lines) |
| Helpers | `tests/helpers/k8s-mocks.ts` |
| Integration Tests | `tests/integration/` (2 files) |

### Test Count by Domain

| Domain | Test Files | Approx Tests |
|--------|------------|--------------|
| `src/slack/` | 16 | ~120 |
| `src/tools/` | 22 | ~150 |
| `src/agent/` | 10 | ~80 |
| `src/memory/` | 6 | ~50 |
| `src/observability/` | 4 | ~30 |
| `src/skills/` | 6 | ~40 |
| `src/utils/` | 5 | ~35 |
| `src/config/` | 2 | ~15 |

---

## Coverage Gap Analysis

### Priority 1 - High Impact Gaps

| File | Coverage | Lines | Impact | Complexity |
|------|----------|-------|--------|------------|
| `src/slack/identity.ts` | 41.44% | 113 | Trace naming | Low |
| `src/slack/utils/image-upload.ts` | 35.56% | 330 | Image handling | Medium |

### Priority 2 - Medium Impact Gaps

| File | Coverage | Lines | Impact | Complexity |
|------|----------|-------|--------|------------|
| `src/tools/context.ts` | 0% | 97 | Tool discovery | Low |
| `src/skills/runtime.ts` | 66.66% | 51 | Skill execution | Low |
| `src/tools/summarize/tool.ts` | 64.5% | 183 | Summarize tool | Medium |

### Priority 3 - Export Barrels (0% - Exclude)

These files contain only re-exports with no logic:

| File | Lines | Recommendation |
|------|-------|----------------|
| `src/tools/index.ts` | 61 | Add to exclusion |
| `src/tools/mcp/index.ts` | 61 | Add to exclusion |
| `src/observability/test-trace.ts` | 135 | Add to exclusion (manual harness) |
| `tests/helpers/k8s-mocks.ts` | 371 | Add to exclusion (test utility) |

---

## Detailed Test Plans

### 1. `src/slack/identity.ts`

**Current Coverage:** 41.44%
**Target Coverage:** 95%+
**Estimated Effort:** 30 minutes

#### Functions to Test

- `getChannelName(client, channelId)` - Cached channel name lookup
- `getUserDisplayName(client, userId)` - Cached user name lookup
- `clearIdentityCache()` - Cache reset utility
- `getIdentityCacheStats()` - Cache monitoring

#### Test Cases

```
[P1] getChannelName - returns cached value on second call
[P1] getChannelName - calls API when cache miss
[P1] getChannelName - caches ID on API failure (graceful degradation)
[P1] getUserDisplayName - returns display_name when available
[P1] getUserDisplayName - falls back to real_name
[P1] getUserDisplayName - falls back to name field
[P1] getUserDisplayName - returns userId on API failure
[P2] clearIdentityCache - resets both channel and user caches
[P2] getIdentityCacheStats - returns correct cache sizes
```

#### Mock Requirements

- `WebClient` with `conversations.info` and `users.info` methods
- Follow existing pattern from `src/slack/permalinks.test.ts`

---

### 2. `src/slack/utils/image-upload.ts`

**Current Coverage:** 35.56%
**Target Coverage:** 90%+
**Estimated Effort:** 45 minutes

#### Functions to Test

- `extractImageUrls(text)` - URL extraction from text
- `uploadImagesFromResponse(client, channelId, threadTs, responseText)` - Main orchestrator
- Internal: `getFilenameFromUrl`, `getMimeType`, `downloadFromGcs`, `downloadFromHttp`, `uploadToSlack`

#### Test Cases

```
[P1] extractImageUrls - finds gs:// URLs (Imagen/Veo format)
[P1] extractImageUrls - finds HTTP image URLs
[P1] extractImageUrls - finds GCS signed URLs
[P1] extractImageUrls - deduplicates URLs
[P1] extractImageUrls - returns empty array for no matches
[P2] getFilenameFromUrl - extracts filename from path
[P2] getFilenameFromUrl - handles query parameters
[P2] getFilenameFromUrl - defaults to image-{timestamp}.png on parse failure
[P2] getMimeType - returns correct MIME for png/jpg/jpeg/gif/webp
[P1] downloadFromGcs - handles invalid URI format
[P1] downloadFromGcs - handles download timeout
[P1] downloadFromHttp - handles non-200 response
[P1] downloadFromHttp - handles fetch abort/timeout
[P1] uploadToSlack - calls filesUploadV2 with correct params
[P1] uploadImagesFromResponse - processes multiple images sequentially
[P1] uploadImagesFromResponse - returns empty array when no URLs found
[P1] uploadImagesFromResponse - returns partial success on mixed results
```

#### Mock Requirements

- `@google-cloud/storage` Storage client
- `global.fetch` for HTTP downloads
- `WebClient.filesUploadV2` for uploads

---

### 3. `src/tools/context.ts`

**Current Coverage:** 0%
**Target Coverage:** 95%+
**Estimated Effort:** 15 minutes

#### Functions to Test

- `getToolContextSummary()` - Generate tool context for system prompt
- `getToolDetails(toolName)` - Returns undefined (SDK handles)
- `searchTools(keyword)` - Returns empty array (SDK handles)
- `ESSENTIAL_TOOL_PATTERNS` - Constant validation

#### Test Cases

```
[P1] getToolContextSummary - returns fallback message when no servers configured
[P1] getToolContextSummary - lists server names when MCP servers configured
[P2] getToolContextSummary - includes essential tool patterns in output
[P2] getToolDetails - returns undefined (SDK handles discovery)
[P2] searchTools - returns empty array (SDK handles discovery)
[P3] ESSENTIAL_TOOL_PATTERNS - contains expected patterns (search, github, slack, etc.)
```

#### Mock Requirements

- `getMcpServersConfig()` from `./mcp/config.js`

---

## Recommended Vitest Config Updates

Add to `vitest.config.ts` exclude list:

```typescript
exclude: [
  'node_modules/',
  'dist/',
  '**/*.test.ts',
  '**/*.d.ts',
  '**/types.ts',
  'src/index.ts',
  // NEW: Export barrels and test utilities
  'src/tools/index.ts',
  'src/tools/mcp/index.ts',
  'src/observability/test-trace.ts',
  'tests/helpers/**',
],
```

**Impact:** Removing ~628 uncovered lines from calculation → ~+0.5% effective coverage

---

## Impact Projection

| Action | Coverage Impact | Effort |
|--------|-----------------|--------|
| Add `identity.ts` tests (9 tests) | +0.4% | 30 min |
| Add `image-upload.ts` tests (16 tests) | +0.3% | 45 min |
| Add `context.ts` tests (6 tests) | +0.15% | 15 min |
| Update vitest exclusion list | +0.5% | 5 min |
| **Total** | **+1.35%** | **~1.5 hrs** |

**Projected Result:** 84.75% → **86.1%** (exceeds 85% threshold)

---

## Minimal Fix Path

If time-constrained, the **minimal fix** to unblock CI:

1. Update vitest exclusion list (+0.5%)
2. Add `identity.ts` tests (+0.4%)

**Total: +0.9%** → 85.65% (threshold met)

---

## Quality Standards Applied

All recommended tests follow project conventions:

- Given-When-Then format (per `paths.test.ts` pattern)
- Co-located with source files
- Mock patterns from `permalinks.test.ts`
- Factory usage from `tests/factories/agent-factory.ts`
- No hard waits or flaky patterns
- Self-cleaning via `beforeEach` reset

---

## Next Steps

1. **Immediate:** Update vitest exclusion list (5 min)
2. **Short-term:** Implement P1 tests for `identity.ts` and `context.ts` (45 min)
3. **Follow-up:** Implement `image-upload.ts` tests when bandwidth allows (45 min)
4. **Optional:** Raise coverage threshold to 87% after stabilization

---

*Generated by TEA (Test Architect) via BMAD automate workflow*
