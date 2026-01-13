---
date: 2026-01-13T08:15:00Z
type: validation
status: VALIDATED
plan_file: thoughts/shared/plans/PLAN-mcp-file-access-phase3.md
spike_completed: 2026-01-13T07:53:00Z
---

# Plan Validation: MCP Tool File Access (Phase 3)

## Overall Status: VALIDATED ✓

**Spike Confirmed:** The MCP server accepts GCS URIs via `image_uri` parameter. Plan is ready for implementation.

## Tech Choices Validated

### 1. GCS URI vs Base64 for Vertex AI Tools
**Purpose:** Pass user-uploaded images to genmedia MCP tools
**Status:** VALID ✓ (Spike Confirmed)
**Findings:**
- Raw Vertex AI Imagen **edit** APIs only support `bytesBase64Encoded`
- **BUT** the MCP server abstracts this and accepts GCS URIs via `image_uri` parameter
- MCP server handles downloading from GCS and converting to base64 internally

**Spike Results (2026-01-13):**
```
imagen_edit_inpainting_insert:
  image_uri (required): "The GCS URI of the image to edit"

imagen_edit_inpainting_remove:
  image_uri (required): "The GCS URI of the image to edit"

veo_i2v:
  image_uri (required): "GCS URI of the input image for video generation"
```

**Recommendation:** Proceed with GCS URI approach as planned.

**Sources:**
- Spike script: `scripts/discover-imagen-tools.ts`
- [Imagen Edit API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api-edit)
- [Veo API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)

### 2. `@google-cloud/storage` Node.js Library
**Purpose:** Upload user files to GCS
**Status:** VALID
**Findings:**
- Official Google Cloud client library, actively maintained
- Already used in the codebase (`src/tools/memory/storage.ts`, `src/slack/utils/media-upload.ts`)
- Supports Application Default Credentials (works on Cloud Run)
- Parallelized upload/download options available

**Recommendation:** Keep as-is. Reuse existing patterns from `memory/storage.ts`.

**Sources:**
- [@google-cloud/storage npm](https://www.npmjs.com/package/@google-cloud/storage)
- [GitHub Repository](https://github.com/googleapis/nodejs-storage)

### 3. Dual Upload Strategy (Anthropic + GCS)
**Purpose:** Enable both Claude vision AND MCP tool access
**Status:** VALID (with caveat)
**Findings:**
- Correct approach for images: Claude needs Files API, MCP tools need storage reference
- For videos: GCS-only is correct (Anthropic doesn't support video)
- Memory overhead acceptable for typical Slack file sizes

**Caveat:** If MCP tools need base64 (not GCS URI), the "dual upload" becomes "Anthropic + base64 storage" instead.

**Recommendation:** Valid architecture, but storage format may need adjustment based on spike results.

### 4. Video Support (mp4, mov, webm, avi)
**Purpose:** Enable video uploads for Veo tools
**Status:** VALID
**Findings:**
- Veo accepts GCS URIs for video input
- MP4 is the output format (24fps)
- 100MB limit reasonable for Slack uploads

**Recommendation:** Keep as-is.

### 5. Bucket Path Structure (`user_uploads/`)
**Purpose:** Organize user-uploaded files in GCS
**Status:** VALID
**Findings:**
- Clean separation from tool outputs (`imagen_outputs/`, `veo_outputs/`)
- `orion-genmedia` bucket already exists
- Cloud Run service account already has access

**Recommendation:** Keep as-is. Consider adding TTL policy later for cleanup.

## Model Deprecation Notice

**Imagen 4 Preview Models** will be removed November 30, 2025:
- `imagen-4.0-generate-preview-06-06`
- `imagen-4.0-ultra-generate-preview-06-06`
- `imagen-4.0-fast-generate-preview-06-06`

**Action:** Verify `.orion/config.yaml` uses GA models (`imagen-4.0-generate-001`). Current config shows `imagen-4.0-generate-001` - this is correct.

## Summary

### All Tech Choices Validated ✓
- GCS URI for MCP tools ✓ (spike confirmed)
- `@google-cloud/storage` library ✓
- Video support formats ✓
- Bucket path structure ✓
- Dual upload architecture ✓

### No Changes Required
- Model configuration (already using GA models)
- Plan approach is correct

## For Implementation

Plan is ready to implement as-is. Key details from spike:

| Tool | Parameter | Format |
|------|-----------|--------|
| `imagen_edit_inpainting_insert` | `image_uri` | `gs://bucket/path/image.png` |
| `imagen_edit_inpainting_remove` | `image_uri` | `gs://bucket/path/image.png` |
| `veo_i2v` | `image_uri` | `gs://bucket/path/image.png` |

**System prompt guidance (Task 6) should use:**
```
When using genmedia tools, provide the GCS URI from the table above as the `image_uri` parameter.
```

## Sources

- [Vertex AI Imagen Edit API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api-edit)
- [Vertex AI Imagen Generation API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api)
- [Vertex AI Veo API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [mcp-imagen-go README](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/blob/main/experiments/mcp-genmedia/mcp-genmedia-go/README.md)
- [@google-cloud/storage](https://www.npmjs.com/package/@google-cloud/storage)
