# Plan: MCP Tool File Access (Phase 3 of File Upload)

## Goal

Enable MCP tools (like genmedia-imagen, genmedia-veo) to access files uploaded by users in Slack. Currently:
- **Working:** Claude can SEE uploaded images via Files API image blocks
- **Not Working:** MCP tools have NO access to the image/video data for editing/manipulation

This closes the gap so users can say "edit this image to add a smile" and genmedia tools receive the image.

## Technical Choices

- **GCS Upload for MCP Tools**: Upload Slack files to `gs://orion-genmedia/user_uploads/`
  - Rationale: Vertex AI tools require GCS URIs (`gs://bucket/path`), NOT base64 data
  - Uses SAME bucket as genmedia outputs (`imagen_outputs/`, `veo_outputs/`)
  - Consistent pattern, single bucket for all genmedia operations

- **Dual Upload Strategy**: Files uploaded to BOTH Anthropic (for Claude vision) AND GCS (for MCP tools)
  - Rationale: Different systems have different requirements
  - Anthropic Files API → Claude can "see" and analyze
  - GCS URI → MCP tools can use as input

- **Support Images AND Videos**: Both media types get GCS URIs
  - Images: For imagen editing tools (`imagen_edit_inpainting_insert`, etc.)
  - Videos: For veo tools (`veo_i2v` image-to-video, future video editing)
  - Rationale: Same pattern, genmedia supports both

- **Reuse Existing GCS Code**: Use patterns from `src/tools/memory/storage.ts`
  - `@google-cloud/storage` already a dependency
  - Bucket caching pattern already established
  - Rationale: Don't reinvent the wheel

- **File Context Interface**: Pass `FileContext[]` to agent loop with both references
  - Rationale: Model needs to know which files are available and how to reference them in tool calls

## Current State Analysis

### What Exists:
- `src/files/ingestion.ts` - Downloads from Slack, uploads to Anthropic Files API
- `src/agent/document-blocks.ts` - Creates image/document blocks with file_id
- `src/agent/loop.ts` - Includes content blocks in Claude messages
- `src/slack/utils/media-upload.ts` - GCS download utilities (for OUTPUT from tools)
- `src/tools/memory/storage.ts` - **GCS upload utilities we can reuse** (read/write/delete)
- `@google-cloud/storage` - Already a dependency
- `orion-genmedia` bucket - Already exists, used for imagen/veo outputs

### The Gap:
1. **No GCS upload path** - Files go to Anthropic only, not GCS
2. **No file context for MCP** - Model doesn't know uploaded files exist for tool usage
3. **No system prompt guidance** - Model needs to know to use GCS URIs in tool calls

### Key Files:
- `src/files/ingestion.ts` - Add GCS upload
- `src/files/gcs-client.ts` (new) - GCS upload client
- `src/agent/loop.ts` - Add fileContext to options
- `src/agent/orion.ts` - Add file context to system prompt
- `src/slack/handlers/user-message.ts` - Pass file context

## Tasks

### Task 1: Create GCS Upload Client for User Files

Create a GCS upload client for user-uploaded files. Reuse patterns from `src/tools/memory/storage.ts`.

- [ ] Create `src/files/gcs-upload.ts`
- [ ] Implement `uploadFileToGcs(buffer: Buffer, filename: string, mimeType: string, traceId: string): Promise<string>`
- [ ] Upload to `gs://orion-genmedia/user_uploads/{traceId}/{filename}`
- [ ] Return the GCS URI (e.g., `gs://orion-genmedia/user_uploads/abc123/photo.png`)
- [ ] Use bucket name from constant (not env var - `orion-genmedia` is hardcoded like in config.yaml)
- [ ] Handle upload errors gracefully (return undefined, don't throw)
- [ ] Add Langfuse event tracking for GCS uploads

**Files to create:**
- `src/files/gcs-upload.ts`

### Task 2: Add Video Support to File Types

Add video file support to FILE_LIMITS (currently only image/PDF/CSV/text are supported).

- [ ] Add `VIDEO` category to `FILE_LIMITS` in `src/slack/files/types.ts`:
  ```typescript
  VIDEO: {
    extensions: ['.mp4', '.mov', '.webm', '.avi'],
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
    maxSize: 100 * 1024 * 1024, // 100MB (Slack limit)
  },
  ```
- [ ] Add 'video' to `FileCategory` type: `'image' | 'video' | 'document' | 'text'`
- [ ] Update `getFileCategoryForRouting()` to return 'video' for VIDEO category
- [ ] Update `SUPPORTED_EXTENSIONS` and `SUPPORTED_MIME_TYPES` to include video

**Files to modify:**
- `src/slack/files/types.ts`

### Task 3: Update Ingestion to Upload Media to GCS

Modify ingestion to upload images AND videos to both Anthropic AND GCS.

- [ ] Add `gcsUri?: string` to `FileIngestionResult`
- [ ] For image files: Upload to GCS in parallel with Anthropic upload
- [ ] For video files: Upload to GCS ONLY (Anthropic doesn't support video)
- [ ] PDFs/text don't need GCS (MCP tools don't use them)
- [ ] If GCS upload fails, log warning but continue (Anthropic upload is primary for images)
- [ ] Videos without GCS upload = no way to use them, so log error

**Category → Upload decision:**
| Category | Upload to Anthropic | Upload to GCS | Reason |
|----------|---------------------|---------------|--------|
| image    | Yes (Files API)     | Yes           | Claude vision + MCP tools |
| video    | No (unsupported)    | Yes           | MCP tools (veo) only |
| document | Yes (Files API)     | No            | Claude only |
| text     | Yes (Files API)     | No            | Claude only |

**Files to modify:**
- `src/files/ingestion.ts`

### Task 4: Create FileContext Interface

Define the interface for passing file context to agent loop.

- [ ] Create `FileContext` interface in `src/files/types.ts`:
  ```typescript
  export interface FileContext {
    filename: string;
    mimeType: string;
    fileId?: string;      // Anthropic Files API reference (images, PDFs)
    gcsUri?: string;      // GCS URI for MCP tools (images, videos)
    category: 'image' | 'video' | 'document' | 'text';
  }
  ```
- [ ] Add `buildFileContext()` helper to convert `FileIngestionResult[]` to `FileContext[]`
- [ ] Export from `src/files/index.ts`

**Files to create/modify:**
- `src/files/types.ts` (new or add to existing)
- `src/files/index.ts`

### Task 5: Update Agent Loop to Accept FileContext

Modify agent loop to receive and use file context.

- [ ] Add `fileContext?: FileContext[]` to `AgentLoopOptions`
- [ ] Update types in `src/agent/orion.ts`
- [ ] Pass file context through to system prompt builder

**Files to modify:**
- `src/agent/loop.ts`
- `src/agent/orion.ts`

### Task 6: Add System Prompt File Guidance

Add dynamic system prompt section for available files.

- [ ] Create `buildFileContextPrompt(files: FileContext[]): string` helper
- [ ] Only include if files with GCS URIs are present (images/videos)
- [ ] Format:
  ```
  ## User-Uploaded Files

  The following files were uploaded by the user and are available for MCP tools:

  | Filename | Type | GCS URI (for genmedia tools) |
  |----------|------|------------------------------|
  | photo.png | image/png | gs://orion-genmedia/user_uploads/abc123/photo.png |
  | clip.mp4 | video/mp4 | gs://orion-genmedia/user_uploads/abc123/clip.mp4 |

  When using genmedia tools:
  - For image editing (imagen_edit_inpainting_insert, etc.): Use the GCS URI as the input image
  - For video generation from image (veo_i2v): Use the GCS URI as the reference image
  ```
- [ ] Append to system prompt in agent loop when files with GCS URIs exist
- [ ] Skip this section for PDFs/text (they don't have GCS URIs)

**Files to modify:**
- `src/agent/loop.ts` (or new helper file)

### Task 7: Update Slack Handlers to Pass FileContext

Connect file context through the handler chain.

- [ ] In `user-message.ts`: Build `FileContext[]` from ingestion results
- [ ] In `app-mention.ts`: Same
- [ ] Pass `fileContext` to agent loop options

**Files to modify:**
- `src/slack/handlers/user-message.ts`
- `src/slack/handlers/app-mention.ts`

### Task 8: Add Tests

Test the new GCS upload and file context flow.

- [ ] Unit tests for `gcs-upload.ts` (mock GCS)
- [ ] Unit tests for video support in types.ts
- [ ] Unit tests for `buildFileContext()`
- [ ] Unit tests for `buildFileContextPrompt()`
- [ ] Update ingestion tests for GCS upload path
- [ ] Integration test: image upload → GCS URI in file context → system prompt includes URI
- [ ] Integration test: video upload → GCS URI only (no Anthropic upload)

**Files to create/modify:**
- `src/files/gcs-upload.test.ts` (new)
- `src/slack/files/types.test.ts` (update if exists)
- `src/files/ingestion.test.ts` (update)
- `src/agent/loop.test.ts` (update)

## Success Criteria

### Automated Verification:
- [ ] Build passes: `npm run build`
- [ ] Type check: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Lint passes: `npm run lint`

### Manual Verification:
- [ ] Upload image → Check logs for GCS upload success
- [ ] Upload image → System prompt includes GCS URI table
- [ ] Upload image + "describe this image" → Claude describes it (Phase 1 still works)
- [ ] Upload image + "edit to add a smile" → genmedia tool receives GCS URI
- [ ] Upload image + "generate a variation" → genmedia tool receives GCS URI
- [ ] Upload video → GCS upload succeeds, system prompt shows GCS URI
- [ ] Upload video + "create animation from this" → veo tool receives GCS URI
- [ ] Upload PDF → No GCS upload (documents don't need it)
- [ ] GCS upload failure → Overall ingestion still succeeds (graceful degradation)

## Out of Scope

- **GCS bucket lifecycle** - Manual cleanup for now (could add TTL later)
- **Large file optimization** - Streaming upload (not needed for typical Slack files)
- **File deduplication** - Same file uploaded twice = two GCS uploads
- **Access control** - GCS bucket already IAM protected
- **Video analysis by Claude** - Anthropic API doesn't support video content blocks

## Risks (Pre-Mortem)

### Tigers:

- **GCS credentials** (MEDIUM)
  - Cloud Run already has GCS access via service account
  - Local dev may need GOOGLE_APPLICATION_CREDENTIALS
  - **Mitigation:** Test locally with gcloud auth first

- **Parallel upload timing** (LOW)
  - GCS upload runs in parallel with Anthropic
  - If GCS is slow, response time increases
  - **Mitigation:** Don't await GCS if Anthropic succeeds; fire-and-forget with logging

### Elephants:

- **Tool schema validation** (MEDIUM) 🐘
  - Assumes genmedia tools accept GCS URI in specific parameter
  - Need to verify actual parameter name (e.g., `base_image_uri`, `reference_image`, etc.)
  - **Mitigation:** Check genmedia tool discovery output before implementing Task 5

## Dependencies

- `@google-cloud/storage` - Already installed (used by media-upload.ts, memory/storage.ts)
- GCS bucket `orion-genmedia` - Already exists, used for imagen/veo outputs
- No new dependencies required

## Implementation Order

1. **Task 1:** GCS upload client (foundation)
2. **Task 2:** Add video support to file types
3. **Task 3:** Update ingestion with GCS upload
4. **Task 4:** FileContext interface
5. **Task 5 + 6:** Agent loop + system prompt (can be combined)
6. **Task 7:** Handler updates
7. **Task 8:** Tests

Each task builds on the previous. No skipping.

## Spike: Verify genmedia Tool Parameters

**BEFORE Task 5**, verify the actual parameter names:

```bash
# Run tool discovery and check imagen_edit_inpainting_insert schema
# Look for: input_image, base_image, reference_image, image_uri, etc.
```

If the tool expects different parameter format than GCS URI, revise Task 5 approach.
