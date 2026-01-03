# Tech-Spec: Google Cloud Genmedia MCP Deployment

**Created:** 2026-01-02  
**Status:** ✅ COMPLETE  
**Author:** Barry (Quick Flow Solo Dev)  
**Last Review:** 2026-01-02 (3 HIGH, 4 MEDIUM, 2 LOW issues fixed)  
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
  curl -X POST https://mcp-imagen-vjlizxe2vq-uc.a.run.app/mcp \
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

- [x] **AC 2:** Imagen MCP server deployed to Cloud Run ✅ Verified: https://mcp-imagen-vjlizxe2vq-uc.a.run.app
  - Given Dockerfile and cloudbuild config exist
  - When `gcloud run services describe mcp-imagen --region=us-central1`
  - Then service is ACTIVE with HTTP endpoint

- [x] **AC 3:** Veo MCP server deployed to Cloud Run ✅ Verified: https://mcp-veo-vjlizxe2vq-uc.a.run.app
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
  --member="serviceAccount:orion-agent@ai-workflows-459123.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud run services add-iam-policy-binding mcp-veo \
  --region=us-central1 \
  --member="serviceAccount:orion-agent@ai-workflows-459123.iam.gserviceaccount.com" \
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
| `.orion/config.yaml` | Added genmedia-imagen and genmedia-veo server entries with correct URLs |
| `infra/mcp-genmedia/Dockerfile.imagen` | Created; fixed Go version 1.24→1.23 (code review) |
| `infra/mcp-genmedia/Dockerfile.veo` | Created; fixed Go version 1.24→1.23 (code review) |
| `infra/mcp-genmedia/cloudbuild-imagen.yaml` | Created; added IAM grant step (code review) |
| `infra/mcp-genmedia/cloudbuild-veo.yaml` | Created; added IAM grant step (code review) |
| `infra/mcp-genmedia/README.md` | Created; updated with actual URLs and Veo test (code review) |

### Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-01-02 | Barry | Initial implementation: Tasks 1-7 complete |
| 2026-01-02 | Barry (Code Review) | **H1 FIXED:** Corrected config URLs from wrong project hash to actual deployed endpoints |
| 2026-01-02 | Barry (Code Review) | **H3 FIXED:** Changed Go 1.24→1.23 in both Dockerfiles (1.24 doesn't exist) |
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

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Commit `infra/` directory to git ✅ Committed as 7bb2f4b
- [x] [AI-Review][LOW] Migrated from GCR to Artifact Registry (`us-central1-docker.pkg.dev/$PROJECT_ID/orion/`)
- [x] [AI-Review][LOW] Increased Veo memory from 1Gi → 2Gi for video processing

---

## Reference

- [Google Genmedia MCP README](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- [mcp-imagen-go README](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia/mcp-genmedia-go/mcp-imagen-go)
- [mcp-veo-go README](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia/mcp-genmedia-go/mcp-veo-go)

