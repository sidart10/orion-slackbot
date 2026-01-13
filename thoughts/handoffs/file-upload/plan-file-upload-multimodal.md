---
date: 2026-01-12T18:00:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-file-upload-multimodal.md
---

# Plan Handoff: File Upload & Multimodal Support (Updated)

## Summary

Updated plan to fix file uploads in Orion and add proper multimodal support. The core issue is that images are being sent as `document` blocks when they should be sent as `image` blocks. Updated technical choices based on April 2025 Anthropic API changes.

## Plan Created

`thoughts/shared/plans/PLAN-file-upload-multimodal.md`

## Key Technical Decisions

### 1. Images via Files API (Updated from base64)
- **Previous plan:** Use base64 encoding for images
- **Updated:** Use Files API + `image` blocks with `file_id` reference
- **Rationale:** Anthropic Files API now supports images (April 2025 beta). Provides:
  - 500MB limit (vs 5MB for base64)
  - Consistency with existing PDF handling
  - No payload overhead from encoding
  - Better performance for large images

### 2. Excel/CSV as extracted text
- **Decision:** Parse to text strings and send as text content
- **Rationale:** Anthropic API doesn't support spreadsheets as content blocks
- **Library:** Use `xlsx` npm package for Excel parsing

### 3. MCP tool file access via base64 context
- **Decision:** Store base64 data alongside Files API upload for MCP tools
- **Rationale:** MCP tools receive text parameters, not Anthropic file_ids. Base64 is required for tools like genmedia to receive image data.
- **Note:** This means images are both uploaded to Files API (for Claude) AND stored as base64 (for MCP tools)

### 4. PDFs stay on current path
- **Decision:** No changes needed
- **Rationale:** Existing Files API → document block flow works correctly

## Task Overview

| Phase | Tasks | Deliverable |
|-------|-------|-------------|
| **Phase 1 (MVP)** | Tasks 1, 2, 4, 6, 7 | Images + PDFs working |
| **Phase 2** | Task 3 | Excel/CSV text extraction |
| **Phase 3** | Task 5 | MCP tool file passing |

### Detailed Tasks:
1. **Add Image Block Support** - Extend document-blocks.ts for `image` content blocks
2. **Update Ingestion** - Track file category (image/document/text)
3. **Handle Excel/CSV** - Text extraction with xlsx library
4. **Update Agent Loop** - Accept mixed content block types
5. **Enable MCP Tool Access** - File context with base64 for tools
6. **Update Handlers** - Wire up new content block flow
7. **Add Tests** - Comprehensive test coverage

## Research Findings

### Validated (from validation agent):
- `src/files/api-client.ts:13` - Already has Files API beta header `files-api-2025-04-14`
- `src/agent/document-blocks.ts:72-86` - Only creates `document` blocks, needs `image` block path
- `src/files/ingestion.ts:168-176` - All files go through Files API (good for images too now)
- `src/agent/loop.ts:800-820` - Document block injection works, just needs image support

### API Changes (April 2025):
- Files API now supports images alongside PDFs
- Images can use `file_id` in `image` content blocks: `{ type: 'file', file_id: '...' }`
- Image limits via Files API: 500MB per file, 8000x8000 pixels max
- Base64 still works but limited to 5MB

## Assumptions Made

- **Files API image support is stable** - Currently beta, should be GA soon
- **MCP tools expect base64** - Verified: tools receive text parameters, not file references
- **xlsx library handles common Excel files** - May need iteration for complex spreadsheets
- **Image ordering matters** - Anthropic docs suggest images before text for best results

## Risks Identified (Pre-Mortem Complete)

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| **No rollback strategy** | HIGH | Backward compat REQUIRED in Task 4 | ✅ Added to plan |
| **Image citation behavior** | MEDIUM | Test in Task 1, omit if errors | ✅ Added to plan |
| **MCP tool integration speculative** | MEDIUM | Spike required before Task 5 | ✅ Added to plan |
| Excel parsing complexity | MEDIUM | Start with simple extraction | Noted |
| Large image memory | LOW | Optimize later if needed | Noted |

### Pre-Mortem Run
- **Date:** 2026-01-12
- **Mode:** Deep
- **Tigers:** 2 (1 HIGH, 1 MEDIUM) - mitigated
- **Elephants:** 1 (MEDIUM) - mitigated with spike gate

## For Next Steps

1. **Review plan:** `thoughts/shared/plans/PLAN-file-upload-multimodal.md`
2. **Choose starting phase:**
   - Phase 1 MVP: Get images working (Tasks 1, 2, 4, 6, 7)
   - Or full implementation (all 7 tasks)
3. **After approval:** Run `/implement_plan thoughts/shared/plans/PLAN-file-upload-multimodal.md`

## Verification Checklist

After implementation, verify:
- [ ] Upload PNG → Orion describes content
- [ ] Upload JPEG → Orion analyzes photo
- [ ] Upload PDF → existing behavior preserved
- [ ] Upload CSV → Orion reads data (Phase 2)
- [ ] Upload Excel → Orion reads spreadsheet (Phase 2)
- [ ] Upload image + use genmedia → tool receives data (Phase 3)
- [ ] Upload >5MB image → works (Files API)
- [ ] Upload .zip → clear error message
