---
date: 2026-01-13T09:30:00Z
type: completion
status: complete-with-limitations
plan_file: thoughts/shared/plans/PLAN-mcp-file-access-phase3.md
---

# Completion: MCP Tool File Access (Phase 3)

## Status: COMPLETE with Known Limitations

The core infrastructure for MCP tool file access is **implemented and working**:
- User uploads images → GCS URI generated → System prompt includes URI table
- Claude can see the image AND MCP tools receive the GCS URI

## What Works

| Feature | Status | Notes |
|---------|--------|-------|
| GCS Upload | ✅ Working | `src/files/gcs-upload.ts` |
| Dual upload (Anthropic + GCS) | ✅ Working | Images go to both |
| Video upload (GCS only) | ✅ Working | Videos bypass Anthropic |
| FileContext interface | ✅ Working | `src/files/types.ts` |
| System prompt injection | ✅ Working | GCS URI table shown to Claude |
| Handler integration | ✅ Working | Both app-mention and user-message |
| `imagen_t2i` (text-to-image) | ✅ Working | Generates new images from prompts |

## Known Limitations

### Image Editing Tools Are Problematic

The `mcp-imagen-go` server's editing tools have significant usability issues:

1. **Hardcoded editing model**: The editing model (`imagen-3.0-capability-001`) is hardcoded in upstream code - NOT configurable via `.orion/config.yaml`

2. **Complex mask requirements**: Editing tools require:
   - `mask_mode` (required) - e.g., `MASK_MODE_FOREGROUND`, `MASK_MODE_SEMANTIC`
   - `segmentation_classes` (for semantic mode) - integer IDs for object types

3. **No simple "edit this image" tool**: Only `imagen_edit_inpainting_insert` and `imagen_edit_inpainting_remove` with mask parameters

4. **Result**: When users say "edit this image to add X", the tool often produces unexpected results because mask parameters aren't intuitive

### Affected Tools

| Tool | Issue |
|------|-------|
| `imagen_edit_inpainting_insert` | Requires mask_mode, results unpredictable |
| `imagen_edit_inpainting_remove` | Requires mask_mode, results unpredictable |

### Unaffected Tools

| Tool | Status |
|------|--------|
| `imagen_t2i` | Works well for text-to-image generation |
| `veo_t2v` | Works for text-to-video |
| `veo_i2v` | Should work for image-to-video (uses GCS URI) |

## Future Considerations

When revisiting image editing, consider:
1. **Custom MCP server** - Build one with simpler editing interface
2. **Direct Vertex AI SDK** - More control over parameters
3. **Alternative APIs** - Stability AI, Replicate, etc.
4. **Upstream contribution** - Add configurable editing model to `mcp-imagen-go`

## Files Implemented

| File | Purpose |
|------|---------|
| `src/files/gcs-upload.ts` | GCS upload client |
| `src/files/gcs-upload.test.ts` | Tests |
| `src/files/types.ts` | FileContext interface, buildFileContextPrompt |
| `src/files/types.test.ts` | Tests |
| `src/files/ingestion.ts` | Dual upload logic |
| `src/agent/loop.ts` | System prompt injection |
| `src/slack/handlers/app-mention.ts` | Handler integration |
| `src/slack/handlers/user-message.ts` | Handler integration |

## Recommendation

**Use as-is for now.** The infrastructure is solid:
- Image generation (`imagen_t2i`) works great
- Video generation (`veo_t2v`, `veo_i2v`) works
- File upload pipeline is complete

Image editing can be improved in a future iteration with a better MCP server or alternative approach.
