# MCP Genmedia Servers

Deploy Google's Imagen and Veo MCP servers to Cloud Run for Orion.

## Source

These servers are from [Google's vertex-ai-creative-studio repo](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia/mcp-genmedia-go).

## Servers

| Server | Tools | Models |
|--------|-------|--------|
| `mcp-imagen-go` | `imagen_t2i` | Imagen 3, Imagen 4, Imagen 4 Ultra |
| `mcp-veo-go` | `veo_t2v`, `veo_i2v` | Veo 2, Veo 3, Veo 3.1 |

## Prerequisites

1. **GCS Bucket** for media assets:
   ```bash
   gcloud storage buckets create gs://orion-genmedia \
     --location=us-central1 \
     --uniform-bucket-level-access
   ```

2. **Vertex AI API** enabled (should already be active in `ai-workflows-459123`)

## Deploy

```bash
# Deploy Imagen server
gcloud builds submit --config=infra/mcp-genmedia/cloudbuild-imagen.yaml

# Deploy Veo server
gcloud builds submit --config=infra/mcp-genmedia/cloudbuild-veo.yaml
```

## Grant Invoker Access

After deployment, grant Orion's service account invoker access:

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

## Test

```bash
# Test Imagen
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

# Test Veo
curl -X POST https://mcp-veo-vjlizxe2vq-uc.a.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "veo_t2v",
      "arguments": {
        "prompt": "A cat walking on a beach at sunset",
        "model": "veo-2.0-generate-001",
        "duration_seconds": 4
      }
    }
  }'
```

## Cost Estimates

- Imagen 4: ~$0.04/image
- Veo 3.1: ~$0.35/second of video
- Cloud Run: Pay per request (minimal)

