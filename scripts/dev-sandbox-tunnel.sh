#!/bin/bash
# Auto-restarting port-forward for local development
# Run this in a separate terminal: ./scripts/dev-sandbox-tunnel.sh

set -e

echo "🔧 Starting sandbox-router tunnel (auto-restart enabled)"
echo "   Press Ctrl+C to stop"
echo ""

while true; do
  echo "$(date '+%H:%M:%S') - Connecting to sandbox-router-svc..."

  # Check kubectl context
  CONTEXT=$(kubectl config current-context 2>/dev/null || echo "none")
  if [[ "$CONTEXT" != *"orion-sandbox-cluster"* ]]; then
    echo "⚠️  Wrong kubectl context: $CONTEXT"
    echo "   Run: gcloud container clusters get-credentials orion-sandbox-cluster --region=us-central1 --project=ai-workflows-459123"
    exit 1
  fi

  # Start port-forward (blocks until it dies)
  kubectl port-forward svc/sandbox-router-svc 8080:8080 -n default 2>&1 || true

  echo "$(date '+%H:%M:%S') - Connection lost, restarting in 2s..."
  sleep 2
done
