---
type: knowledge
name: vercel-bundling-test
category: system
tags:
  - verification
  - vercel
  - bundling
createdAt: 2025-12-21T00:00:00.000Z
updatedAt: 2025-12-21T00:00:00.000Z
---
# Vercel Bundling Test

This file exists to verify that static knowledge files are properly bundled with Vercel deployments.

## Purpose

- Confirms that `orion-context/knowledge/` files are included in the Vercel function bundle
- Verifies that `loadKnowledge()` works correctly on Vercel serverless functions
- Tests that read operations on committed files function as expected

## Technical Details

Files in this directory are:
- **READ-ONLY** in production (Vercel serverless functions are ephemeral)
- Must be committed to git to be included in deployments
- Bundled at deploy time, available for the function's lifetime

## Verification

If you can read this file via `loadKnowledge('vercel-bundling-test')`, the bundling works correctly.

