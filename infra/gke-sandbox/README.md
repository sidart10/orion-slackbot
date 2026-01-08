# GKE Agent Sandbox Infrastructure (Fallback Only)

> **⚠️ Status: FALLBACK ONLY (2026-01-07)**
>
> Primary code execution is now Anthropic's container via PTC + Skills API.
> GKE sandbox is retained ONLY for edge-case skills that require:
> - Playwright browser automation
> - Local filesystem access
>
> **Retained for:** `webapp-testing`, `web-artifacts-builder`
>
> See: [ADR-2026-01-07](../../_bmad-output/architecture.md#anthropic-skills--files-api-adoption-adr-2026-01-07)

Secure Python code execution environment for Orion's edge-case skills requiring local resources.

## Quick Reference

| Property | Value |
|----------|-------|
| **GCP Project** | `ai-workflows-459123` |
| **Cluster** | `orion-sandbox-cluster` |
| **Region** | `us-central1` |
| **Namespace** | `default` |
| **Template** | `python-runtime-template` |
| **Warm Pool** | `orion-sandbox-warmpool` |
| **Router Service** | `sandbox-router-svc:8080` |

## Skills Migration Context (2026-01-07)

### Why Most Skills Moved to Anthropic Container

Anthropic's code execution container supports **Skills + PTC + MCP** via `allowed_callers`.
This eliminates ~90% of GKE complexity:

| Before | After |
|--------|-------|
| All skills in GKE | 10 skills in Anthropic container |
| K8s lifecycle management | Zero infrastructure |
| Port-forward for local dev | Direct API calls |
| ~$70-150/month | ~$0 (usage-based) |

### Why These Skills Remain in GKE

| Skill | Reason |
|-------|--------|
| `webapp-testing` | Needs Playwright + local HTTP servers |
| `web-artifacts-builder` | Needs local filesystem for build outputs |

These capabilities are not available in Anthropic's sandboxed container.

## Why GKE Agent Sandbox?

For edge-case skills, GKE Agent Sandbox provides:
- ✅ Full network access
- ✅ gVisor isolation (secure)
- ✅ Sub-second startup (warm pools)
- ✅ Custom packages via SandboxTemplate
- ✅ Local filesystem for build outputs
- ✅ Playwright browser automation

## Files

| File | Purpose |
|------|---------|
| `sandbox-template-and-pool.yaml` | SandboxTemplate + SandboxWarmPool resources |
| `sandbox-router.yaml` | Router Deployment + ClusterIP Service |

## Operations

### Connect to Cluster

```bash
# Ensure plugin is installed
gcloud components install gke-gcloud-auth-plugin

# Get credentials
gcloud container clusters get-credentials orion-sandbox-cluster \
  --region=us-central1 \
  --project=ai-workflows-459123

# Set plugin mode
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
```

### Check Status

```bash
# All pods
kubectl get pods -n default

# Warm pool status
kubectl get sandboxwarmpools

# Controller status
kubectl get pods -n agent-sandbox-system

# Describe warmpool
kubectl describe sandboxwarmpool orion-sandbox-warmpool
```

### Scale Warm Pool

```bash
# Edit replicas
kubectl patch sandboxwarmpool orion-sandbox-warmpool \
  -p '{"spec":{"replicas":4}}' --type=merge
```

### Redeploy

```bash
# Template and WarmPool
kubectl apply -f sandbox-template-and-pool.yaml

# Router
kubectl apply -f sandbox-router.yaml
```

### Delete (Tear Down)

```bash
# Remove sandbox resources
kubectl delete -f sandbox-template-and-pool.yaml
kubectl delete -f sandbox-router.yaml

# Delete cluster (if needed)
gcloud container clusters delete orion-sandbox-cluster \
  --region=us-central1 \
  --project=ai-workflows-459123 --quiet
```

## Python Client

### Install

```bash
pip install "git+https://github.com/kubernetes-sigs/agent-sandbox.git@main#subdirectory=clients/python/agentic-sandbox-client"
```

### Usage

```python
from agentic_sandbox import SandboxClient

with SandboxClient(
    template_name='python-runtime-template',
    namespace='default'
) as sandbox:
    # Execute Python code
    result = sandbox.run('python3 -c "print(2+2)"')
    print(result.stdout)  # "4"
    
    # Make HTTP requests
    code = '''
import urllib.request
import json
with urllib.request.urlopen("https://httpbin.org/get") as r:
    print(json.loads(r.read()))
'''
    result = sandbox.run(f"python3 -c '{code}'")
    print(result.stdout)
```

### Result Object

```python
result.stdout  # Standard output (string)
result.stderr  # Standard error (string)
# Note: exit_code attribute may vary by client version
```

## Verification Tests

Run from project root:

```bash
source .sandbox-venv/bin/activate
python scripts/test-gke-sandbox.py
```

Expected output:
- Python execution: ✅
- Network connectivity: ✅
- HTTP requests: ✅

## Cost

| Component | Before | After (Fallback Only) |
|-----------|--------|----------------------|
| GKE Autopilot base | ~$70/month | ~$35/month |
| Compute (warm pool) | 2 replicas | 1 replica |
| **Total** | ~$70-150/month | ~$35-75/month |

*Reduced warm pool from 2 → 1 replica since edge cases are infrequent.*

## Troubleshooting

### Warm Pool Pods Pending

```bash
# Check events
kubectl get events -n default --sort-by='.lastTimestamp'

# May need gVisor nodes - Autopilot provisions automatically
kubectl get nodes
```

### Controller Not Running

```bash
# Check controller namespace
kubectl get pods -n agent-sandbox-system

# Reinstall if needed
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.1.0/manifest.yaml
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.1.0/extensions.yaml
```

### kubectl Authentication Failed

```bash
# Reinstall auth plugin
gcloud components install gke-gcloud-auth-plugin

# Add to PATH
export PATH="$(gcloud info --format='value(installation.sdk_root)')/bin:$PATH"
export USE_GKE_GCLOUD_AUTH_PLUGIN=True

# Re-get credentials
gcloud container clusters get-credentials orion-sandbox-cluster \
  --region=us-central1 \
  --project=ai-workflows-459123
```

## References

- [GKE Agent Sandbox Docs](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/agent-sandbox)
- [Agent Sandbox GitHub](https://github.com/kubernetes-sigs/agent-sandbox)
- Sprint Change Proposal: `_bmad-output/sprint-change-proposal-2026-01-03-gke-agent-sandbox.md`
- Architecture ADR: `_bmad-output/architecture.md` (ADR-2026-01-03)

