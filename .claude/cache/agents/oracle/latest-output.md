# Research Report: GCS Bucket Lifecycle Policies for Automatic File Cleanup
Generated: 2026-01-13

## Summary

GCS supports prefix-scoped lifecycle policies using the `matchesPrefix` condition, allowing you to auto-delete files under `user_uploads/` without affecting other bucket paths. The policy is applied via a JSON config file and the `gcloud storage buckets update` command. A 7-day TTL is recommended for user-uploaded temporary files.

## Questions Answered

### Q1: How to add a lifecycle policy scoped to a specific prefix (`user_uploads/`)?

**Answer:** Use the `matchesPrefix` condition in your lifecycle rule. This targets only objects whose names start with the specified prefix.

**Source:** [Google Cloud Blog - Prefix/Suffix Lifecycle Rules](https://cloud.google.com/blog/products/storage-data-transfer/understanding-cloud-storages-new-prefix-and-suffix-lifecycle-rules/)

**Confidence:** High

### Q2: What's the gcloud CLI command to add/update lifecycle policy?

**Answer:** 
```bash
gcloud storage buckets update gs://orion-genmedia --lifecycle-file=lifecycle.json
```

**Source:** [Google Cloud - Managing Lifecycles](https://docs.cloud.google.com/storage/docs/managing-lifecycles)

**Confidence:** High

### Q3: Can this be done without affecting existing files in other prefixes?

**Answer:** Yes. The `matchesPrefix` condition ensures only objects matching that prefix are affected. However, **CRITICAL CAVEAT**: The `--lifecycle-file` flag **replaces** all existing lifecycle rules, not merges. You must include any existing rules in your new config file.

**Source:** [Google Cloud - Managing Lifecycles](https://docs.cloud.google.com/storage/docs/managing-lifecycles)

**Confidence:** High

### Q4: What's a reasonable TTL for user-uploaded files?

**Answer:** 7 days recommended. Rationale:
- Files are only needed during the conversation/session
- 7 days provides buffer for debugging/support cases
- Minimizes storage costs while avoiding premature deletion
- Industry practice: temporary/processing files typically 1-7 days

**Source:** [Google Cloud - Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)

**Confidence:** High

## Detailed Findings

### Finding 1: matchesPrefix Condition

**Source:** [Google Cloud Blog](https://cloud.google.com/blog/products/storage-data-transfer/understanding-cloud-storages-new-prefix-and-suffix-lifecycle-rules/)

**Key Points:**
- `matchesPrefix` accepts an array of prefixes (can target multiple)
- Condition is GA and available via API, gcloud, gsutil, and console
- Each rule can combine multiple conditions (all must match)

**JSON Structure:**
```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 7,
          "matchesPrefix": ["user_uploads/"]
        }
      }
    ]
  }
}
```

### Finding 2: Lifecycle Update Behavior

**Source:** [Google Cloud - Managing Lifecycles](https://docs.cloud.google.com/storage/docs/managing-lifecycles)

**Key Points:**
- `--lifecycle-file` **REPLACES** entire lifecycle config (does not merge)
- To add rules while preserving existing ones:
  1. First get current config: `gcloud storage buckets describe gs://BUCKET --format="default(lifecycle_config)"`
  2. Edit JSON to include old + new rules
  3. Apply combined config
- Changes can take **up to 24 hours** to take effect
- To clear all rules: `gcloud storage buckets update gs://BUCKET --clear-lifecycle`

### Finding 3: Age Calculation

**Source:** [Google Cloud - Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)

**Key Points:**
- Age is calculated from object creation time
- Condition satisfied at midnight UTC after the age is reached
- Example: Object created 2026-01-10 10:00 UTC + 7 days = deletes on/after 2026-01-18 00:00 UTC
- There may be a lag between condition met and action taken

## Complete Implementation

### Step 1: Check for Existing Lifecycle Rules

```bash
gcloud storage buckets describe gs://orion-genmedia --format="default(lifecycle_config)"
```

### Step 2: Create lifecycle.json

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 7,
          "matchesPrefix": ["user_uploads/"]
        }
      }
    ]
  }
}
```

**Note:** If Step 1 shows existing rules, include them in this file before applying.

### Step 3: Apply the Policy

```bash
gcloud storage buckets update gs://orion-genmedia --lifecycle-file=lifecycle.json
```

### Step 4: Verify

```bash
gcloud storage buckets describe gs://orion-genmedia --format="default(lifecycle_config)"
```

## Caveats and Gotchas

| Caveat | Impact | Mitigation |
|--------|--------|------------|
| Replaces all rules | Could delete existing policies | Always check existing config first |
| Up to 24 hour delay | Files won't delete immediately | Don't rely on instant deletion |
| Midnight UTC rounding | Age calculation isn't precise | Add 1 day buffer for critical timing |
| Can't undo deletions | Once deleted, gone forever | Ensure prefix is correct before applying |

## Recommendations

### For This Codebase

1. **Use 7-day TTL** - Balances storage cost vs. debugging needs
2. **Check existing rules first** - Bucket may already have lifecycle policies for `imagen_outputs/` or `veo_outputs/`
3. **Add Pub/Sub notifications** (optional) - Monitor lifecycle deletions via Cloud Pub/Sub

### Implementation Notes

- The `user_uploads/` prefix is sufficient - trailing slash helps avoid accidental matches
- No trailing `*` needed - prefix matching is implicit
- Consider adding a rule for incomplete multipart uploads if using them

## Sources

1. [Object Lifecycle Management | Cloud Storage](https://docs.cloud.google.com/storage/docs/lifecycle) - Official documentation on lifecycle conditions and actions
2. [Managing Object Lifecycles](https://docs.cloud.google.com/storage/docs/managing-lifecycles) - gcloud CLI commands and procedures
3. [Understanding Cloud Storage's New Prefix and Suffix Lifecycle Rules](https://cloud.google.com/blog/products/storage-data-transfer/understanding-cloud-storages-new-prefix-and-suffix-lifecycle-rules/) - Detailed explanation of matchesPrefix feature
4. [Configuration Examples](https://docs.cloud.google.com/storage/docs/lifecycle-configurations) - Example JSON configurations
5. [GCS Lifecycle Policies with Prefix & Suffix (Medium)](https://medium.com/google-cloud/gcs-lifecycle-policies-with-prefix-suffix-677e1792181b) - Community walkthrough

## Open Questions

- Does `orion-genmedia` bucket currently have any lifecycle rules? (Check before applying)
- Should `imagen_outputs/` and `veo_outputs/` also have lifecycle policies? (Generated media may also be temporary)
