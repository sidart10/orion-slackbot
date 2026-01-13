---
date: 2026-01-13T07:55:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-mcp-file-access-phase3.md
---

# Plan Handoff: MCP Tool File Access (Phase 3)

## Summary

Created a plan to enable MCP tools (like genmedia-imagen, genmedia-veo) to access user-uploaded files from Slack. This closes the gap where Claude can SEE images but MCP tools can't USE them for editing.

**Key insight:** The original plan assumed base64 data. Actually, Vertex AI tools need **GCS URIs**.

## Plan Created

`thoughts/shared/plans/PLAN-mcp-file-access-phase3.md`

## Key Technical Decisions

1. **GCS Upload (NOT base64)**: Vertex AI tools require GCS URIs, not base64 data
   - Upload to `gs://orion-genmedia/user_uploads/{traceId}/{filename}`
   - Same bucket as genmedia outputs (`imagen_outputs/`, `veo_outputs/`)

2. **Support Images AND Videos**: Both media types get GCS URIs
   - Images: For imagen editing tools
   - Videos: For veo tools (image-to-video, etc.)

3. **Dual Upload Strategy**: Files go to BOTH Anthropic (Claude vision) AND GCS (MCP tools)
   - Videos are GCS-only (Anthropic doesn't support video)

4. **Reuse Existing Patterns**: `@google-cloud/storage` already installed, bucket exists

## Task Overview (8 tasks)

1. **GCS Upload Client** - New `src/files/gcs-upload.ts`
2. **Video Support** - Add VIDEO category to FILE_LIMITS
3. **Ingestion Update** - Upload images/videos to GCS alongside Anthropic
4. **FileContext Interface** - Type with `fileId` and `gcsUri`
5. **Agent Loop Update** - Accept `fileContext` option
6. **System Prompt** - Include file table with GCS URIs for MCP tools
7. **Handler Updates** - Pass file context through
8. **Tests** - Cover new functionality

## Research Findings

- `orion-genmedia` bucket already exists (used for imagen/veo outputs)
- `@google-cloud/storage` already a dependency
- Video support NOT in current FILE_LIMITS - needs to be added
- Existing GCS patterns in `src/tools/memory/storage.ts` can be reused

## Assumptions Made

- [ ] **VERIFY:** genmedia tools accept GCS URI in parameter (check tool schema)
- [ ] Cloud Run service account already has GCS write access to `orion-genmedia`

## For Next Steps

1. Review plan at: `thoughts/shared/plans/PLAN-mcp-file-access-phase3.md`
2. **Spike:** Check genmedia tool schemas for parameter names before Task 6
3. After approval, run `/implement_plan` with the plan path

## What Changed from Original Plan

| Original (PLAN-file-upload-multimodal.md) | Updated (PLAN-mcp-file-access-phase3.md) |
|-------------------------------------------|------------------------------------------|
| Store base64 in FileContext | Store GCS URI in FileContext |
| base64 in system prompt | GCS URI table in system prompt |
| Images only | Images AND videos |
| New bucket path | Same bucket as genmedia outputs |
