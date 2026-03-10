# Codebase Report: Pre-Mortem Deployment & Configuration Risk Verification
Generated: 2026-02-25

## Summary

Seven risk areas investigated for the planned technical-debt remediation (rename orion→samba,
production validation hardening, ESLint/Vitest config, dependency upgrade, Docker deployment).
All claims below are VERIFIED by direct file reads.

---

## Questions Answered

### Q1: Production validation block — what currently exists in environment.ts

**Location:** `src/config/environment.ts` lines 150–173  
**Status:** ✓ VERIFIED

The production validation block already exists. It throws on missing values for:

```typescript
// Lines 151–166
if (config.nodeEnv === 'production') {
  const required = [
    'slackBotToken',
    'slackSigningSecret',
    'anthropicApiKey',
    'anthropicModel',
    'gcsMemoriesBucket',
    'langfusePublicKey',
    'langfuseSecretKey',
  ] as const;

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable for ${key}`);
    }
  }
}
```

**Hardcoded defaults that the plan wants to remove:**

| Line | Key | Hardcoded Default | Risk if removed |
|------|-----|-------------------|-----------------|
| 62 | `slackBotToken` | `''` | Empty string already fails prod validation |
| 70 | `anthropicApiKey` | `''` | Same — already guarded |
| 122 | `gcsMemoriesBucket` | `''` | Same — already guarded |
| 125–127 | Langfuse keys | `''` / `'https://cloud.langfuse.com'` | Already guarded for public/secret keys |
| 138–139 | `gkeSandboxRouterUrl` | `'http://sandbox-router-svc.default.svc.cluster.local:8080'` | NOT in prod validation list — removing default would break local dev if var unset |
| 142 | `gcpProjectId` | `'ai-workflows-459123'` | NOT validated — removing default exposes a live project ID in source |
| 143 | `gkeClusterName` | `'orion-sandbox-cluster'` | NOT validated — also contains "orion" name |
| 144 | `gkeClusterRegion` | `'us-central1'` | Low risk |

**Key finding:** `SLACK_APP_TOKEN` (line 63) is in the config object but NOT in the production
required-fields list. If it is required for Socket Mode, production would silently start with
an empty value despite the validation block passing.

---

### Q2: Docker / deployment files — risk from package.json name change

**Files found:** ✓ VERIFIED

| File | Line(s) | Hardcoded "orion" value |
|------|---------|------------------------|
| `package.json` | 2 | `"name": "orion-slack-agent"` |
| `package.json` | 18 | `docker:build` script tags image `-t orion-slack-agent` |
| `docker/Dockerfile` | 29, 31 | `COPY .orion` dir and `orion-context` dir — filesystem paths, not pkg name |
| `docker-compose.yml` | 4 | Service name `orion:` |
| `docker-compose.yml` | 19, 21 | Volume mounts `.orion` and `orion-context` — filesystem paths |
| `cloud-run-service.yaml` | 12 | `name: orion-slack-agent` (Cloud Run service name) |
| `cloud-run-service.yaml` | 33 | Image: `…/orion/orion-slack-agent:latest` (Artifact Registry repo path) |
| `cloudbuild.yaml` | 16, 18, 26, 34, 36, 63, 64 | Image tags and Cloud Run deploy all use `orion-slack-agent` |

**Risk assessment:**
- The `package.json` `name` field is cosmetic for a server app — Node.js does not use it at
  runtime. Renaming it does NOT break the running container.
- The `docker:build` script in package.json tags the local image `orion-slack-agent`. This is
  a local dev convenience only; CI uses `cloudbuild.yaml` which has its own tags. Renaming the
  npm script tag would mean the local tag differs from the CI tag — acceptable but worth noting.
- `cloud-run-service.yaml` and `cloudbuild.yaml` reference `orion-slack-agent` as the Cloud Run
  service name AND as the Artifact Registry image path (`…/orion/orion-slack-agent`). These are
  INFRA identifiers — renaming them requires a coordinated Cloud Run service rename AND a new
  Artifact Registry repository. This is high-risk if done mid-flight.
- `docker-compose.yml` service name `orion:` and volume paths `.orion`/`orion-context` are
  filesystem directory names that also need renaming if the directory rename proceeds.
- `src/observability/langfuse.ts` line 86: `service: 'orion-slack-agent'` is hardcoded in the
  structured log helper — this is what populates the `service` field in Langfuse event metadata.

---

### Q3: Langfuse dashboard filters — "orion" references in observability

**Status:** ✓ VERIFIED

Langfuse receives the string `'orion-slack-agent'` via the structured logger's `service` field
(hardcoded at `src/observability/langfuse.ts:86`):

```typescript
// langfuse.ts line 84–89
logger[level]({
  event,
  service: 'orion-slack-agent',   // ← hardcoded
  ...data,
});
```

The `Langfuse` client constructor (`langfuse.ts` lines 122–126) does NOT pass a `release` or
`serviceName` field — those would be Langfuse dashboard filter dimensions. There is no
`LANGFUSE_RELEASE` env var or `release:` config key anywhere in the codebase.

**Scope of Langfuse impact from a rename:**
- The `service: 'orion-slack-agent'` string appears in log events that are sent as Langfuse
  event metadata. If Langfuse dashboards filter by this metadata key, historical traces will
  split between `orion-slack-agent` and `samba-slack-agent` at the rename boundary.
- No Langfuse `release` tag, `version` tag, or project-level service name was found — the
  dashboard impact is limited to event metadata filtering, not trace grouping.

---

### Q4: package.json docker:build script

**Location:** `package.json` line 18  
**Status:** ✓ VERIFIED

```json
"docker:build": "docker build -f docker/Dockerfile -t orion-slack-agent ."
```

The image tag `orion-slack-agent` is hardcoded in the script. This is a local convenience
script only; the production CI/CD path is `cloudbuild.yaml` which is independent.

---

### Q5: ESLint config format

**Location:** `eslint.config.js` (root of project)  
**Status:** ✓ VERIFIED — already using flat config format

The project is already on ESLint's new flat config format (ESLint v9 style), NOT the legacy
`.eslintrc` format. The plan's mention of "migrating to flat config" is moot — it is already
done.

**Current config summary:**
- File: `eslint.config.js` (ESM, `export default [...]`)
- ESLint version: `^8.57.1` (devDependency) — note: flat config was backported to ESLint 8
- Uses: `@eslint/js`, `@typescript-eslint/eslint-plugin` v6, `eslint-plugin-filenames`
- Enforces kebab-case filenames via `filenames/match-regex`
- `@typescript-eslint` is v6 — the latest is v8; upgrading would change plugin import paths
  from `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` to the unified
  `typescript-eslint` package

---

### Q6: Vitest config

**Location:** `vitest.config.ts` (root of project)  
**Status:** ✓ VERIFIED

Key characteristics:
- Vitest version: `^1.6.0` (latest is v3.x — two major versions behind)
- Coverage provider: `v8` via `@vitest/coverage-v8@1.6.1`
- Test include paths: `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`, `scripts/**/*.test.ts`
- Coverage thresholds enforced: statements 85%, branches 78%, functions 85%, lines 85%
- Path aliases: `@` → `src/`, `@test` → `tests/`

**Upgrade risk:** Vitest v1→v3 is a two-major-version jump. Breaking changes include:
- `globals: true` behavior changes
- Coverage provider API changes
- Pool/worker config renamed
- Path alias resolution changes

---

### Q7: pnpm-lock.yaml

**Status:** ✓ VERIFIED

```
-rw-r--r--  1 sid  staff  167K  Jan 21 11:31  pnpm-lock.yaml
```

- Size: **167 KB** — substantial lockfile indicating a large dependency tree
- `pnpm@9.15.0` is declared as `packageManager` in package.json
- The lockfile is committed and used with `--frozen-lockfile` in `docker/Dockerfile` line 10
- Any dependency upgrade will invalidate the lockfile and require `pnpm install` to regenerate,
  which means the Docker build will fail on the frozen lockfile step until the updated
  `pnpm-lock.yaml` is committed

---

## Key Pre-Mortem Risk Summary

| Risk | Severity | File | Notes |
|------|----------|------|-------|
| Cloud Run service rename | HIGH | `cloud-run-service.yaml:12`, `cloudbuild.yaml:34` | Renaming Cloud Run service requires traffic migration |
| Artifact Registry path rename | HIGH | `cloud-run-service.yaml:33`, `cloudbuild.yaml:16–64` | `…/orion/orion-slack-agent` is a GCP repo path |
| `.orion` dir rename | MEDIUM | `docker/Dockerfile:29`, `docker-compose.yml:19`, `src/config/environment.ts:22` | Config loader reads `.orion/config.yaml` by path |
| `orion-context` dir rename | MEDIUM | `docker/Dockerfile:31`, `docker-compose.yml:21` | Memory persistence directory |
| GKE cluster name default | LOW–MEDIUM | `environment.ts:143` | `'orion-sandbox-cluster'` hardcoded default |
| GKE sandbox tool name | LOW | `src/tools/orion-sandbox/tool.ts` | Tool registered as `orion_sandbox` |
| Langfuse service metadata | LOW | `langfuse.ts:86` | `service: 'orion-slack-agent'` splits dashboard history |
| `SLACK_APP_TOKEN` not in prod validation | LOW | `environment.ts:63,152–166` | Not in required[] list |
| Vitest v1→v3 upgrade | MEDIUM | `vitest.config.ts` | Two major versions, known breaking changes |
| pnpm-lock.yaml + frozen-lockfile | MEDIUM | `docker/Dockerfile:10` | Any dep upgrade must commit updated lockfile |
| ESLint flat config migration | NONE | `eslint.config.js` | Already on flat config — no migration needed |

