# Tech-Spec: Google Cloud Genmedia MCP Deployment

**Created:** 2026-01-02  
**Status:** ✅ COMPLETE (Auth + Timeout + Defaults implemented)  
**Author:** Barry (Quick Flow Solo Dev)  
**Last Review:** 2026-01-03 (Adversarial code review - robustness hardening + tests added)  
**Deployed:** 2026-01-03

---

## Overview

### Problem Statement

Orion needs image and video generation capabilities via MCP tools. Google provides reference MCP servers for Vertex AI generative media APIs (Imagen, Veo), but they are self-hosted — not a managed service. We need to deploy these servers to Cloud Run and integrate them with Orion's existing MCP configuration.

### Solution

Deploy `mcp-imagen-go` and `mcp-veo-go` servers from Google's `vertex-ai-creative-studio` repo to Cloud Run with HTTP transport. Add them to `.orion/config.yaml` alongside existing MCP servers (exa, rube, audience-manager, msci-reports).

### Scope

**In Scope:**
- Create GCS bucket `orion-genmedia` for media assets
- Build Docker images for `mcp-imagen-go` and `mcp-veo-go`
- Deploy both servers to Cloud Run (us-central1)
- Configure IAM for Cloud Run invoker access
- Add servers to `.orion/config.yaml`
- Test tool discovery and basic image/video generation

**Out of Scope:**
- Other Genmedia servers (chirp, lyria, avtool, gemini)
- Custom tool wrappers or abstractions
- Streaming video responses to Slack
- Cost monitoring/quotas

---

## Context for Development

### Codebase Patterns

From `project-context.md`:
- ESM imports with `.js` extension
- MCP servers configured in `.orion/config.yaml`
- HTTP transport with SSE response parsing already implemented
- Cloud Run deployment patterns in `cloudbuild.yaml`

### Files to Reference

| File | Purpose |
|------|---------|
| `.orion/config.yaml` | Add new MCP server entries |
| `src/tools/mcp/client.ts` | HTTP client with SSE parsing |
| `src/tools/mcp/discovery.ts` | Tool discovery logic |
| `cloudbuild.yaml` | Existing Cloud Build config |
| `docs/mcp-config-implementation-2025-12-31.md` | MCP integration docs |

### Technical Decisions

1. **Single vs Multi-container:** Deploy as 2 separate Cloud Run services (not combined) — simpler scaling, isolation
2. **Authentication:** IAM-based (Cloud Run invoker role) — Orion service account calls these endpoints
3. **Storage:** New bucket `orion-genmedia` — dedicated, not shared with memories
4. **Transport:** HTTP (not stdio/sse) — matches existing MCP client

---

## Source Repository

**Repo:** https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio  
**Path:** `experiments/mcp-genmedia/mcp-genmedia-go/`  
**License:** Apache 2.0

### Servers to Deploy

| Server | Directory | Tools | Models |
|--------|-----------|-------|--------|
| `mcp-imagen-go` | `mcp-genmedia-go/mcp-imagen-go/` | `imagen_t2i` | Imagen 3, Imagen 4, Imagen 4 Ultra |
| `mcp-veo-go` | `mcp-genmedia-go/mcp-veo-go/` | `veo_t2v`, `veo_i2v` | Veo 2, Veo 3, Veo 3.1 |

---

## Implementation Plan

### Tasks

- [x] **Task 1:** Create GCS bucket `orion-genmedia` in us-central1 (command provided)
  ```bash
  gcloud storage buckets create gs://orion-genmedia \
    --location=us-central1 \
    --uniform-bucket-level-access
  ```

- [x] **Task 2:** Create `infra/mcp-genmedia/` directory structure
  ```
  infra/mcp-genmedia/
  ├── Dockerfile.imagen
  ├── Dockerfile.veo
  ├── cloudbuild-imagen.yaml
  ├── cloudbuild-veo.yaml
  └── README.md
  ```

- [x] **Task 3:** Write Dockerfile for Imagen server
  - Multi-stage build: Go builder → Alpine runtime
  - Clone repo, build `mcp-imagen-go`
  - Set env vars: `PORT=8080`, `PROJECT_ID`, `LOCATION`, `GENMEDIA_BUCKET`
  - CMD: `["./mcp-imagen-go", "--transport", "http"]`

- [x] **Task 4:** Write Dockerfile for Veo server
  - Same pattern as Imagen
  - CMD: `["./mcp-veo-go", "--transport", "http"]`

- [x] **Task 5:** Write Cloud Build configs for both servers
  - Build and push to Artifact Registry
  - Deploy to Cloud Run with env vars
  - Grant invoker role to Orion service account

- [x] **Task 6:** Deploy both services to Cloud Run
  ```bash
  gcloud builds submit --config=infra/mcp-genmedia/cloudbuild-imagen.yaml
  gcloud builds submit --config=infra/mcp-genmedia/cloudbuild-veo.yaml
  ```

- [x] **Task 7:** Update `.orion/config.yaml` with new MCP servers (enabled: true, actual URLs)
  ```yaml
  genmedia-imagen:
    type: http
    enabled: true
    description: "Google Imagen - image generation via Vertex AI (Imagen 3/4/4 Ultra)"
    url: "https://mcp-imagen-201626763325.us-central1.run.app/mcp"
    headers: {}

  genmedia-veo:
    type: http
    enabled: true
    description: "Google Veo - video generation via Vertex AI (Veo 2/3/3.1)"
    url: "https://mcp-veo-201626763325.us-central1.run.app/mcp"
    headers: {}
  ```

- [x] **Task 8:** Test tool discovery ✅ Verified: imagen_t2i, veo_t2v, veo_i2v discovered
  ```bash
  pnpm exec tsx -e "
  import { discoverMcpTools } from './src/tools/mcp/discovery.js';
  const tools = await discoverMcpTools();
  console.log(tools.filter(t => t.name.includes('imagen') || t.name.includes('veo')));
  "
  ```

- [x] **Task 9:** Test image/video generation ✅ Both verified
  ```bash
  curl -X POST https://mcp-imagen-201626763325.us-central1.run.app/mcp \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
    -d '{
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/call",
      "params": {
        "name": "imagen_t2i",
        "arguments": {
          "prompt": "A cat wearing a wizard hat",
          "model": "imagen-4.0-generate-001",
          "aspect_ratio": "1:1"
        }
      }
    }'
  ```

---

### Acceptance Criteria

- [x] **AC 1:** GCS bucket `orion-genmedia` exists in us-central1 ✅ Verified via gcloud
  - Given bucket doesn't exist
  - When `gcloud storage buckets describe gs://orion-genmedia`
  - Then bucket info is returned with location=US-CENTRAL1

- [x] **AC 2:** Imagen MCP server deployed to Cloud Run ✅ https://mcp-imagen-201626763325.us-central1.run.app
  - Given Dockerfile and cloudbuild config exist
  - When `gcloud run services describe mcp-imagen --region=us-central1`
  - Then service is ACTIVE with HTTP endpoint

- [x] **AC 3:** Veo MCP server deployed to Cloud Run ✅ https://mcp-veo-201626763325.us-central1.run.app
  - Given Dockerfile and cloudbuild config exist
  - When `gcloud run services describe mcp-veo --region=us-central1`
  - Then service is ACTIVE with HTTP endpoint

- [x] **AC 4:** Tool discovery finds Imagen tools ✅ Found: imagen_t2i, imagen_edit_inpainting_insert, imagen_edit_inpainting_remove
  - Given servers are deployed and configured in `.orion/config.yaml`
  - When Orion runs tool discovery
  - Then `imagen_t2i` tool is available in tool registry

- [x] **AC 5:** Tool discovery finds Veo tools ✅ Found: veo_t2v, veo_i2v
  - Given servers are deployed and configured
  - When Orion runs tool discovery
  - Then `veo_t2v` and `veo_i2v` tools are available in tool registry

- [x] **AC 6:** Image generation works end-to-end ✅ gs://orion-genmedia/imagen_outputs/1767422351933/sample_0.png
  - Given Imagen server is deployed
  - When calling `imagen_t2i` with a prompt
  - Then image is generated and saved to `gs://orion-genmedia/imagen_outputs/`

- [x] **AC 7:** Video generation works end-to-end ✅ gs://orion-genmedia/veo_outputs/7191046310042887400/sample_0.mp4
  - Given Veo server is deployed
  - When calling `veo_t2v` with a prompt
  - Then video is generated and saved to `gs://orion-genmedia/veo_outputs/`

---

## Additional Context

### Dependencies

| Dependency | Purpose |
|------------|---------|
| Vertex AI API | Already enabled in `ai-workflows-459123` |
| Cloud Run | Deployment target |
| Artifact Registry | Docker image storage |
| GCS | Media asset storage |
| IAM | Service-to-service auth |

### Environment Variables (Cloud Run)

| Variable | Value |
|----------|-------|
| `PROJECT_ID` | `ai-workflows-459123` |
| `LOCATION` | `us-central1` |
| `GENMEDIA_BUCKET` | `orion-genmedia` |
| `PORT` | `8080` |

### IAM Configuration

Orion's service account needs Cloud Run Invoker role on both services:

```bash
gcloud run services add-iam-policy-binding mcp-imagen \
  --region=us-central1 \
  --member="serviceAccount:201626763325-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud run services add-iam-policy-binding mcp-veo \
  --region=us-central1 \
  --member="serviceAccount:201626763325-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### Testing Strategy

1. **Unit:** Not applicable (using upstream Go code)
2. **Integration:** curl tests against Cloud Run endpoints
3. **E2E:** Orion tool discovery and invocation via Slack

### Cost Considerations

- **Imagen 4:** ~$0.04/image
- **Veo 3.1:** ~$0.35/second of video
- **Cloud Run:** Pay per request (minimal for MCP servers)
- **GCS:** Standard storage rates

### Notes

- Servers support aliases: can use "Imagen 4" or "Veo 3.1" instead of full model IDs
- Veo 3.1 supports audio generation (`SupportsGenerateAudio: true`)
- Max video duration: 8 seconds (Veo 3.1)
- Images can be returned as base64 OR saved to GCS

---

## Dev Agent Record

### File List

| File | Change |
|------|--------|
| `.orion/config.yaml` | Added genmedia-imagen and genmedia-veo with authType, defaults, requestTimeoutMs |
| `infra/mcp-genmedia/Dockerfile.imagen` | Created; GOTOOLCHAIN=auto for Go 1.24.3 |
| `infra/mcp-genmedia/Dockerfile.veo` | Created; GOTOOLCHAIN=auto for Go 1.24.3 |
| `infra/mcp-genmedia/cloudbuild-imagen.yaml` | Created; IAM grant + Artifact Registry |
| `infra/mcp-genmedia/cloudbuild-veo.yaml` | Created; IAM grant + Artifact Registry |
| `infra/mcp-genmedia/README.md` | Created; actual URLs and test examples |
| `src/config/mcp-servers.ts` | Added extraction for defaults, authType, requestTimeoutMs from YAML |
| `src/tools/mcp/types.ts` | Added defaults, authType, audience fields to MCP config types |
| `src/tools/mcp/config.ts` | Added passthrough for authType, defaults, requestTimeoutMs in transformToSdkConfig |
| `src/tools/mcp/client.ts` | Added dynamic GCP identity token auth via getAuthHeader() |
| `src/tools/mcp/client.test.ts` | Updated to keep init-timeout tests deterministic (fake timers) |
| `src/tools/mcp/gcp-auth.ts` | **NEW:** GCP identity token fetching with service account impersonation |
| `src/tools/mcp/gcp-auth.test.ts` | **NEW:** Unit tests for GCP auth (google-auth + gcloud fallback) |
| `src/tools/mcp/discovery.ts` | Pass server.defaults to mcpToolToClaude for schema injection |
| `src/tools/mcp/schema-converter.ts` | Inject server defaults into tool descriptions, remove from required |
| `src/tools/mcp/manager.ts` | Added debug logging for requestTimeoutMs on client creation |
| `src/tools/router.ts` | Merge server.defaults with user args; validate Veo duration |
| `src/tools/executor.ts` | Uses timeoutMs from options (passed from orion.ts) |
| `src/agent/orion.ts` | Look up server-specific timeout for MCP tools |
| `src/agent/loop.ts` | Added extractPlainUrls for GCS URL extraction from tool results |
| `src/slack/utils/image-upload.ts` | **NEW:** Download images from GCS and upload to Slack |
| `src/slack/utils/image-upload.test.ts` | **NEW:** URL extraction tests (gs:// + signed URLs) |
| `src/slack/handlers/app-mention.ts` | Integrated image upload for tool results |
| `src/slack/handlers/user-message.ts` | Integrated image upload for tool results |
| `package.json` | Added google-auth-library, execa dependencies |

### Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-01-02 | Barry | Initial implementation: Tasks 1-7 complete |
| 2026-01-02 | Barry (Code Review) | **H1 FIXED:** Corrected config URLs from wrong project hash to actual deployed endpoints |
| 2026-01-02 | Barry (Code Review) | **H3 FIXED:** Added GOTOOLCHAIN=auto for Go 1.24.3 requirement |
| 2026-01-02 | Barry (Code Review) | **M2 FIXED:** Added IAM grant step to Cloud Build configs (automation) |
| 2026-01-02 | Barry (Code Review) | **L1 FIXED:** Updated README with actual URLs and added Veo test example |
| 2026-01-02 | Barry (Code Review) | **L2 FIXED:** Migrated from GCR to Artifact Registry |
| 2026-01-02 | Barry (Code Review) | **M4 FIXED:** Increased Veo memory 1Gi → 2Gi |
| 2026-01-02 | Barry (Code Review) | **M1 FIXED:** Committed infra/ to git (7bb2f4b) |
| 2026-01-03 | Barry | Deployed to Cloud Run with Artifact Registry |
| 2026-01-03 | Barry | Fixed service account (orion-agent → 201626763325-compute) |
| 2026-01-03 | Barry | Fixed GOTOOLCHAIN=auto for Go 1.24.3 requirement |
| 2026-01-03 | Barry | Added substitutions for _TAG (was $COMMIT_SHA) |
| 2026-01-03 | Barry | ✅ All ACs verified - image and video generation working |
| 2026-01-03 | Barry | Added defaults: Imagen 4 + Veo 3.1 as default models |
| 2026-01-03 | Barry | **AUTH:** Added GCP identity token auth for local development |
| 2026-01-03 | Barry | **AUTH:** Added service account impersonation for gcloud CLI fallback |
| 2026-01-03 | Barry | **TIMEOUT:** Fixed 30s hardcoded timeout - now uses server config |
| 2026-01-03 | Barry | **TIMEOUT:** Imagen 60s, Veo 180s timeouts in config |
| 2026-01-03 | Barry | **DEFAULTS:** Inject server defaults into tool descriptions |
| 2026-01-03 | Barry | **DEFAULTS:** Remove defaulted params from required list |
| 2026-01-03 | Barry | **VALIDATION:** Auto-correct invalid Veo duration to nearest valid |
| 2026-01-03 | Barry | **SLACK:** Added image download/upload utility (partial - needs review) |
| 2026-01-03 | Barry (Code Review) | **REVIEW:** Adversarial review completed - 2 CRITICAL, 4 MEDIUM, 3 LOW issues identified |
| 2026-01-03 | Barry (Code Review) | **ACTION ITEMS:** Created 9 follow-up tasks in Review Follow-ups section |
| 2026-01-03 | Barry (Quick-Dev) | **CRITICAL FIXES:** Replaced console.log with logger.debug, added traceId to auth logs |
| 2026-01-03 | Barry (Quick-Dev) | **GCS IMAGE FIX:** Added gs:// URL pattern and GCS client auth for image downloads |
| 2026-01-03 | Barry (Quick-Dev) | **VEO FIX:** Extended duration validation to cover veo_i2v |
| 2026-01-03 | Barry (Quick-Dev) | **AUTH TIMEOUT:** Added 10s timeout to tryGoogleAuthLibrary() |
| 2026-01-03 | Barry (Quick-Dev) | **SA HARDCODE FIX:** Removed hardcoded SA fallback, now requires GCP_IMPERSONATE_SA env |
| 2026-01-03 | Barry (Code Review) | **HARDENING:** `gcp-auth` now uses `execFile` (no shell interpolation), base64url JWT expiry parsing, traceId propagation, and added unit tests for auth + image URL extraction |

---

## Extended Implementation Details (Post-Deployment)

### 1. GCP Identity Token Authentication

Cloud Run services require IAM authentication. Added support for local development:

**Config (`.orion/config.yaml`):**
```yaml
genmedia-imagen:
  type: http
  enabled: true
  url: "https://mcp-imagen-201626763325.us-central1.run.app/mcp"
  authType: gcp_identity      # ← NEW: triggers identity token fetch
  requestTimeoutMs: 60000     # ← NEW: image gen takes ~30s
  defaults:
    model: "imagen-4.0-generate-001"
    gcs_bucket_uri: "gs://orion-genmedia/imagen_outputs/"

genmedia-veo:
  type: http
  enabled: true  
  url: "https://mcp-veo-201626763325.us-central1.run.app/mcp"
  authType: gcp_identity
  requestTimeoutMs: 180000    # ← NEW: video gen takes 60-90s
  defaults:
    model: "veo-3.1-generate-preview"
    generate_audio: false
    duration: 6
    gcs_bucket_uri: "gs://orion-genmedia/veo_outputs/"
```

**New File: `src/tools/mcp/gcp-auth.ts`**
- Primary: `google-auth-library` for ADC (metadata server on GCP, local creds)
- Fallback: `gcloud auth print-identity-token --impersonate-service-account=...`
- Caching: Tokens cached until 5 min before expiry

**Required IAM for local dev:**
```bash
gcloud iam service-accounts add-iam-policy-binding \
  201626763325-compute@developer.gserviceaccount.com \
  --member="user:YOUR_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### 2. Timeout Configuration

**Problem:** `executor.ts` had hardcoded 30s timeout, video gen takes 60-90s.

**Solution:** Pass server-specific timeout through the call chain:

1. `.orion/config.yaml` → `requestTimeoutMs: 180000`
2. `mcp-servers.ts` → `extractRequestTimeoutMs()` extracts from YAML
3. `orion.ts` → Looks up server config by tool name, passes `timeoutMs`
4. `executor.ts` → Uses `options.timeoutMs ?? DEFAULT_TIMEOUT_MS`
5. `client.ts` → Uses `config.requestTimeoutMs` for fetch timeout

### 3. Server Defaults Injection

**Problem:** Claude kept asking for `gcs_bucket_uri` even though it's pre-configured.

**Solution:** Inject defaults into tool schema so Claude knows they exist:

**`schema-converter.ts`:**
```typescript
// Add defaults to description
description += '\n\n**Defaults (can be overridden):**\n';
for (const [key, value] of defaultsForTool) {
  description += `- \`${key}\`: \`${JSON.stringify(value)}\`\n`;
  // Remove from required list
  requiredParams.delete(key);
}
```

**`router.ts`:**
```typescript
// Merge defaults with user args (user wins)
let mergedArgs = server.defaults 
  ? { ...server.defaults, ...params.args }
  : params.args;
```

### 4. Veo Duration Validation

**Problem:** Claude sometimes passes invalid duration (5s) - Veo only supports [4, 6, 8].

**Solution:** Auto-correct in `router.ts`:
```typescript
if (mcpTool.originalName === 'veo_t2v' && mergedArgs.duration !== undefined) {
  const validDurations = [4, 6, 8];
  const dur = Number(mergedArgs.duration);
  if (!validDurations.includes(dur)) {
    const closest = validDurations.reduce((a, b) => 
      Math.abs(b - dur) < Math.abs(a - dur) ? b : a
    );
    mergedArgs = { ...mergedArgs, duration: closest };
  }
}
```

### 5. Image/Video URL Extraction

**Problem:** GCS URLs in tool results weren't being extracted for sources.

**Solution:** Added `extractPlainUrls()` in `loop.ts`:
```typescript
function extractPlainUrls(text: string): Array<{ title: string; url: string }> {
  const urlRegex = /(https?:\/\/[^\s/$.?#].[^\s]*)/g;
  // ... extract and return URLs
}
```

### 6. Slack Image Upload (Partial)

**New File: `src/slack/utils/image-upload.ts`**
- Downloads image from GCS signed URL
- Uploads to Slack via `files.uploadV2`
- Integrated into `app-mention.ts` and `user-message.ts`

**Status:** ⚠️ Images still showing as links - URL extraction may need debugging.
**TODO:** Video download/display not yet implemented.

---

## Current Configuration Summary

**.orion/config.yaml (genmedia section):**
```yaml
genmedia-imagen:
  type: http
  enabled: true
  description: "Google Imagen - image generation via Vertex AI"
  url: "https://mcp-imagen-201626763325.us-central1.run.app/mcp"
  headers: {}
  authType: gcp_identity
  requestTimeoutMs: 60000
  defaults:
    model: "imagen-4.0-generate-001"
    gcs_bucket_uri: "gs://orion-genmedia/imagen_outputs/"

genmedia-veo:
  type: http
  enabled: true
  description: "Google Veo - video generation via Vertex AI"
  url: "https://mcp-veo-201626763325.us-central1.run.app/mcp"
  headers: {}
  authType: gcp_identity
  requestTimeoutMs: 180000
  defaults:
    model: "veo-3.1-generate-preview"
    generate_audio: false
    duration: 6
    gcs_bucket_uri: "gs://orion-genmedia/veo_outputs/"
```

---

## Known Issues / TODO

| Issue | Status | Notes |
|-------|--------|-------|
| Image inline display | ✅ Fixed | Added gs:// URL pattern + GCS client auth for downloads |
| Video inline display | ❌ Not implemented | Would need video download + Slack video upload |
| Multiple processes | ⚠️ Manual | Must `pkill -f orion-slack-agent` before restart |
| Token caching | ✅ Working | 5-min buffer before expiry refresh |
| Console.log in router | ✅ Fixed | Replaced with logger.debug() |
| GCP auth timeout | ✅ Fixed | Added 10s timeout to tryGoogleAuthLibrary() |

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Commit `infra/` directory to git ✅ Committed as 7bb2f4b
- [x] [AI-Review][LOW] Migrated from GCR to Artifact Registry (`us-central1-docker.pkg.dev/$PROJECT_ID/orion/`)
- [x] [AI-Review][LOW] Increased Veo memory from 1Gi → 2Gi for video processing

### Review Follow-ups (AI) - 2026-01-03 Code Review

**Critical:**
- [x] [AI-Review][CRITICAL] Remove `console.log` debug statements in `src/tools/router.ts:71-74` — violates project-context.md, use `logger.debug()` instead ✅ Fixed 2026-01-03
- [x] [AI-Review][CRITICAL] Add `traceId` parameter to auth failure log in `src/tools/mcp/client.ts:138-145` ✅ Fixed 2026-01-03

**Medium:**
- [x] [AI-Review][MEDIUM] Fix image download auth for GCS URLs in `src/slack/utils/image-upload.ts` — either ensure signed URLs or add GCS auth; likely root cause of "images showing as links" ✅ Fixed 2026-01-03 (added GCS client for gs:// downloads)
- [x] [AI-Review][MEDIUM] Extend Veo duration validation to include `veo_i2v` in `src/tools/router.ts:78` — same [4,6,8] constraint applies ✅ Fixed 2026-01-03
- [x] [AI-Review][MEDIUM] Add timeout to `tryGoogleAuthLibrary()` in `src/tools/mcp/gcp-auth.ts` — can hang forever on metadata server issues ✅ Fixed 2026-01-03 (10s timeout)
- [x] [AI-Review][MEDIUM] Update `IMAGE_URL_PATTERN` regex in `src/slack/utils/image-upload.ts` to match `gs://` URLs — Imagen/Veo return GCS paths not HTTP URLs ✅ Fixed 2026-01-03 (added GCS_URI_PATTERN)

**Low:**
- [x] [AI-Review][LOW] Add test coverage for `src/tools/mcp/gcp-auth.ts` — critical auth code with no tests ✅ Fixed 2026-01-03 (added `src/tools/mcp/gcp-auth.test.ts`)
- [x] [AI-Review][LOW] Remove hardcoded service account fallback in `src/tools/mcp/gcp-auth.ts:80` — should require env var ✅ Fixed 2026-01-03 (now requires GCP_IMPERSONATE_SA)
- [x] [AI-Review][LOW] Verify `extractPlainUrls` function exists in `src/agent/loop.ts` or update tech spec File List — function mentioned but not found ✅ Verified: exists as `extractPlainImageUrls` at line 205

### Additional Hardening (AI) - 2026-01-03

- [x] [AI-Review][HIGH] Avoid shell injection in `src/tools/mcp/gcp-auth.ts` by using `execFile` (not `exec` string interpolation)
- [x] [AI-Review][MEDIUM] Fix JWT expiry parsing in `src/tools/mcp/gcp-auth.ts` to use base64url decoding
- [x] [AI-Review][MEDIUM] Prevent timer leaks in `tryGoogleAuthLibrary()` / GCS download timeout guards
- [x] [AI-Review][MEDIUM] Propagate `traceId` into GCP auth + Slack image upload logs (project-context.md rule)

---

## Reference

- [Google Genmedia MCP README](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- [mcp-imagen-go README](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia/mcp-genmedia-go/mcp-imagen-go)
- [mcp-veo-go README](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia/mcp-genmedia-go/mcp-veo-go)

