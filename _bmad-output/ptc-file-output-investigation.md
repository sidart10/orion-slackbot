# PTC File Output Investigation

**Date:** 2026-01-07
**Status:** RESOLVED
**Blocking:** Story 6.10 (Skill Migration Testing) - NOW UNBLOCKED
**Priority:** HIGH

## Resolution

**Root Cause:** Code bug in `src/agent/loop.ts:916`

Our streaming handler checked for `code_execution_tool_result`, but Anthropic's `code_execution_20250825` beta (with bash support) returns `bash_code_execution_tool_result` with a nested structure:

```
Our code expected:  content_block.type === 'code_execution_tool_result'
                    content_block.content.files[]

API actually sends: content_block.type === 'bash_code_execution_tool_result'
                    content_block.content.type === 'bash_code_execution_result'
                    content_block.content.content[{ file_id }]
```

**Fix:** Sprint Change Proposal approved 2026-01-07. See `sprint-change-proposal-2026-01-07-ptc-file-extraction-fix.md`

---

## Original Investigation (Archived)

---

## Problem Statement

When invoking skills via Anthropic's Programmatic Tool Calling (PTC) with file-generating skills (xlsx, pdf, docx), the expected `code_execution_tool_result` content blocks are **never received** in the stream, preventing:

1. Extraction of `file_id` from container execution
2. Download of generated files via Files API
3. Upload of files to Slack

---

## Expected Behavior

Based on Anthropic API documentation and our test fixtures:

```typescript
// Expected stream event
{
  type: 'content_block_start',
  index: 1,
  content_block: {
    type: 'code_execution_tool_result',
    content: {
      return_code: 0,
      stdout: 'Files created...',
      stderr: '',
      files: [{ file_id: 'file_abc123' }]  // <-- We need this
    }
  }
}
```

**Our handler at `src/agent/loop.ts:916`:**
```typescript
if (blockType === 'code_execution_tool_result') {
  // Extract files, log completion, emit Langfuse events
}
```

---

## Actual Behavior

### What We See in Logs

```json
// PTC execution STARTS (many of these):
{"event":"agent.loop.ptc_code_execution_started","serverToolUseId":"srvtoolu_015Yy7S9Hf5B5W8e7Nwo4aLL"}

// PTC execution COMPLETES (zero of these):
// No "ptc_code_execution_completed" events
// No "files_extracted" events
```

### What Claude Does Instead

Claude generates a text response with a **hallucinated download URL**:
```
Here's your report: https://files.slackai.app/f-08233djekh/project_status_report.pdf
```

This URL doesn't exist — Claude fabricated it because no real file_id was available.

---

## Investigation Findings

### 1. Stream Events Received

| Event Type | Count | Notes |
|------------|-------|-------|
| `message_start` | Many | ✅ Normal |
| `content_block_start` (text) | Many | ✅ Normal |
| `content_block_start` (server_tool_use) | Many | ✅ PTC starts |
| `content_block_start` (code_execution_tool_result) | **ZERO** | ❌ Never received |
| `content_block_delta` (text_delta) | Many | ✅ Normal |
| `message_delta` | Many | ✅ Normal |

### 2. Skills Are Loading Correctly

```
12 skills loaded:
- summarize, xlsx, pdf, docx, webapp-testing, web-artifacts-builder
- mcp-builder, frontend-design, example-skill, skill-creator
- algorithmic-art, d3-viz
```

### 3. Container Config Sent Correctly

```json
{
  "container": {
    "type": "anthropic",
    "skills": [
      { "skill_id": "skill_016fkg4MpiJtRKzBF2dBaDzv" },  // xlsx
      { "skill_id": "skill_01R4tgQcXYih9ttqdx84QsjS" },  // pdf
      // ... more skills
    ]
  }
}
```

### 4. Container Truncation Warning

```json
{"event":"skills.container.truncated","requested":12,"included":8}
```

Only 8 of 12 skills are included — possible API limit, but not the root cause.

---

## Hypotheses

### H1: Beta API Limitation (Most Likely)

The `code_execution_tool_result` block type may not be streamed in the current beta. Possible that:
- Results are only available via non-streaming API
- Results require polling a separate endpoint
- Feature not fully implemented in beta

**Evidence:** Zero result blocks across multiple test runs.

### H2: Skill Instructions Don't Produce File Output

The SKILL.md files teach Claude to write Python code that creates local files:
```python
# From pdf/SKILL.md
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
c = canvas.Canvas("hello.pdf", pagesize=letter)
c.save()
```

But they don't instruct Claude to use any special file output mechanism that the container would capture.

**Evidence:** Skills are instructional guides, not container-aware scripts.

### H3: Files API Requires Separate Configuration

The Files API may require explicit opt-in or different container configuration to capture file output.

**Evidence:** We have `files-api-2025-04-14` beta enabled but may need additional config.

### H4: Container Execution Timeout

PTC starts but container execution times out before completion, so no result is returned.

**Evidence:** Unlikely — multiple concurrent executions show no timeout errors.

---

## Code References

### Handler Location
- `src/agent/loop.ts:916` — `code_execution_tool_result` handler
- `src/agent/loop.ts:873` — `server_tool_use` handler (start)

### Test Fixtures
- `tests/factories/skills-factory.ts:427` — `createMockCodeExecutionResultWithFiles`

### Files API Client
- `src/files/api-client.ts:200` — `downloadFile` method
- `src/slack/utils/file-uploader.ts:181` — Slack upload integration

---

## Questions for Anthropic

1. Is `code_execution_tool_result` streamed in the beta, or only available via non-streaming?
2. How do skills produce file output that the container captures?
3. Is there a specific file path or API call (like `save_file()`) that skills should use?
4. What's the max skills per container limit?
5. Are there additional beta headers needed for file output?

---

## Recommended Investigation Steps

### Step 1: Add Raw Event Logging (Quick Win)

Add debug logging to capture ALL stream events:
```typescript
for await (const event of stream) {
  logger.debug({
    event: 'raw_stream_event',
    type: event.type,
    data: JSON.stringify(event).slice(0, 500)
  });
}
```

### Step 2: Test Non-Streaming API

Try `client.messages.create()` without streaming to see if result blocks are in the final response.

### Step 3: Test Simple Skill

Create a minimal skill that just prints to stdout:
```markdown
# Skill: echo-test
Print "SKILL_OUTPUT: Hello World" to stdout.
```

Verify if stdout appears in any response.

### Step 4: Check Anthropic Documentation

Search for:
- "code_execution_tool_result" in beta docs
- "skills file output" examples
- "container files" API reference

### Step 5: Contact Anthropic Support

If steps 1-4 don't resolve, file support ticket with:
- Stream event logs
- Container config
- Expected vs actual behavior

---

## Workaround Options

### Option A: Use GKE Sandbox for File Generation

Keep GKE sandbox as primary for file-generating skills until PTC file output is resolved.

**Pros:** Works today
**Cons:** Maintains GKE infrastructure, higher latency

### Option B: Instruct Claude to Return Base64

Update skills to have Claude return file content as base64 in text response:
```
Return the PDF as base64: data:application/pdf;base64,JVBERi0...
```

**Pros:** Doesn't require PTC file output
**Cons:** Token-expensive, size limits

### Option C: Polling for Files

After PTC completes, poll Files API for recently created files:
```typescript
const recentFiles = await filesClient.list({ since: startTime });
```

**Pros:** May work if files are created but not returned
**Cons:** Uncertain if files are even created

---

## Resolution Criteria

This investigation is RESOLVED when:
1. `code_execution_tool_result` blocks are received with `files` array, OR
2. Alternative file retrieval mechanism is implemented and working, OR
3. Decision made to keep GKE sandbox for file generation

---

## Timeline

| Date | Action | Owner |
|------|--------|-------|
| 2026-01-07 | Investigation created | Dev Agent |
| TBD | Step 1: Raw event logging | Dev |
| TBD | Step 2: Non-streaming test | Dev |
| TBD | Anthropic support ticket | Sid |
| TBD | Resolution | TBD |
