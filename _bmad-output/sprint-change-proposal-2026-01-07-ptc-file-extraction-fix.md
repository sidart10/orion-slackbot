# Sprint Change Proposal: PTC File Extraction Fix

**Date:** 2026-01-07
**Triggered By:** Story 6.10 (Skill Migration Testing) BLOCKED
**Change Scope:** MODERATE
**Status:** APPROVED

---

## 1. Issue Summary

### Problem Statement

Story 6.10 is BLOCKED because PTC (Programmatic Tool Calling) file output is not being captured. When skills generate files (xlsx, pdf, docx), the file IDs are never extracted from the API response, preventing download and upload to Slack.

### Root Cause

Two code bugs in `src/agent/loop.ts`:

1. **Wrong block type:** Handler checks for `code_execution_tool_result`, but Anthropic's `code_execution_20250825` beta returns `bash_code_execution_tool_result`

2. **Wrong nested structure:** Code expects `content.files[]`, but API actually sends `content.content[]`

```
Expected by our code:
  blockType === 'code_execution_tool_result'
  resultBlock.content.files[{ file_id }]

Actual API response:
  blockType === 'bash_code_execution_tool_result'
  resultBlock.content.content[{ file_id }]
```

### Evidence

- Logs show `ptc_code_execution_started` events but zero `ptc_code_execution_completed`
- Zero `code_execution_tool_result` blocks received (because API sends different type)
- Claude hallucinates fake download URLs instead of real files
- Anthropic docs confirm `bash_code_execution_tool_result` is correct type

---

## 2. Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|------|--------|--------|
| Epic 6 (Skills & Extensions) | In Progress | Story 6.10 BLOCKED |
| All other epics | N/A | No impact |

### Artifact Impact

| Artifact | Change Needed |
|----------|---------------|
| `src/agent/loop.ts` | Add handler for `bash_code_execution_tool_result` |
| `tests/factories/skills-factory.ts` | Update mock to correct block type/structure |
| `_bmad-output/ptc-file-output-investigation.md` | Mark RESOLVED |

### What Does NOT Need to Change

- PRD: No changes
- Architecture: No structural changes
- GCS/Storage: Not involved (files use Anthropic Files API, not GCS)
- UI/UX: Not affected

---

## 3. Recommended Approach

**Selected:** Direct Adjustment (Option 1)

### Phase 1: Unblock Story 6.10 (Immediate)

| Task | File | Change |
|------|------|--------|
| 1.1 | `src/agent/loop.ts` | Add `bash_code_execution_tool_result` handler after line 987 |
| 1.2 | `src/agent/loop.ts` | Extract file_ids from `content.content[]` (nested structure) |
| 1.3 | `tests/factories/skills-factory.ts` | Update `createMockCodeExecutionResultWithFiles()` |
| 1.4 | Manual test | Verify PDF/XLSX via #orion-testing Slack channel |

**Effort:** 2-3 hours

### Phase 2: Reliability Before Scale

| Task | File | Change |
|------|------|--------|
| 2.1 | `package.json` | Add `p-limit` dependency |
| 2.2 | `src/slack/utils/file-uploader.ts` | Wrap `Promise.all` with `pLimit(3)` |
| 2.3 | `src/slack/utils/file-uploader.ts` | Add retry with backoff for cleanup |
| 2.4 | Unit tests | Test rate limiting and retry behavior |

**Effort:** 2-3 hours

**Total Effort:** ~1/2 day

---

## 4. Detailed Edit Proposals

### Edit 1: Add `bash_code_execution_tool_result` Handler

**File:** `src/agent/loop.ts`
**Location:** After line 987 (after existing `code_execution_tool_result` handler)

```typescript
// Story 6.10 Fix: Handle bash_code_execution_tool_result (new API format)
if (blockType === 'bash_code_execution_tool_result') {
  const resultBlock = event.content_block as unknown as {
    content?: {
      type?: string;
      stdout?: string;
      stderr?: string;
      return_code?: number;
      content?: Array<{ file_id?: string }>;
    };
  };

  const innerContent = resultBlock.content;
  const { return_code, stdout, stderr } = innerContent ?? {};

  // Extract file IDs from nested content.content array
  if (innerContent?.content && Array.isArray(innerContent.content)) {
    for (const item of innerContent.content) {
      if (item?.file_id) {
        generatedFileIds.push(item.file_id);
      }
    }
    const extractedCount = innerContent.content.filter(i => i?.file_id).length;
    if (extractedCount > 0) {
      logger.info({
        event: 'agent.loop.files_extracted',
        fileCount: extractedCount,
        fileIds: generatedFileIds.slice(-extractedCount),
        traceId: context.traceId,
      });
    }
  }

  // Log PTC completion
  logger.info({
    event: 'agent.loop.ptc_code_execution_completed',
    returnCode: return_code,
    stdoutLength: stdout?.length ?? 0,
    stderrLength: stderr?.length ?? 0,
    fileCount: generatedFileIds.length,
    blockType: 'bash_code_execution_tool_result',
    traceId: context.traceId,
  });

  // Clear status after PTC completes
  void options.setStatus?.({ phase: 'act' });
}
```

### Edit 2: Update Test Mock Factory

**File:** `tests/factories/skills-factory.ts`
**Function:** `createMockCodeExecutionResultWithFiles`

**OLD:**
```typescript
content_block: {
  type: 'code_execution_tool_result',
  content: {
    return_code: returnCode,
    stdout: `Files created: ${fileIds.join(', ')}`,
    stderr: '',
    files: fileIds.map((id) => ({ file_id: id })),
  },
},
```

**NEW:**
```typescript
content_block: {
  type: 'bash_code_execution_tool_result',
  content: {
    type: 'bash_code_execution_result',
    return_code: returnCode,
    stdout: `Files created: ${fileIds.join(', ')}`,
    stderr: '',
    content: fileIds.map((id) => ({ file_id: id })),
  },
},
```

### Edit 3: Add Rate Limiting to File Uploader

**File:** `src/slack/utils/file-uploader.ts`

**OLD (line 274-277):**
```typescript
const results = await Promise.all(
  fileIds.map((fileId) => this.uploadFile(fileId, channel, threadTs, options))
);
```

**NEW:**
```typescript
import pLimit from 'p-limit';

// Limit concurrent uploads to avoid Slack rate limits (~20/min)
const limit = pLimit(3);
const results = await Promise.all(
  fileIds.map((fileId) => limit(() => this.uploadFile(fileId, channel, threadTs, options)))
);
```

### Edit 4: Add Retry to Cleanup

**File:** `src/slack/utils/file-uploader.ts`

**OLD (lines 207-216):**
```typescript
if (deleteAfterUpload) {
  this.cleanupFile(fileId, traceId).catch((error) => {
    logger.warn({
      event: 'slack.file.cleanup.failed',
      traceId,
      fileId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
```

**NEW:**
```typescript
if (deleteAfterUpload) {
  this.cleanupFileWithRetry(fileId, traceId, 3).catch((error) => {
    logger.warn({
      event: 'slack.file.cleanup.failed_final',
      traceId,
      fileId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

// New method:
private async cleanupFileWithRetry(fileId: string, traceId: string | undefined, maxRetries: number): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.filesClient.deleteFile(fileId, traceId);
      logger.debug({ event: 'slack.file.cleanup.complete', traceId, fileId, attempt });
      return;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      logger.debug({ event: 'slack.file.cleanup.retry', traceId, fileId, attempt, backoffMs });
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}
```

---

## 5. Success Criteria

### Phase 1 (Unblock)

- [ ] `bash_code_execution_tool_result` blocks handled in streaming
- [ ] File IDs extracted from nested `content.content[]` structure
- [ ] Unit tests pass with updated mocks
- [ ] Manual test: "Create a PDF report" returns downloadable file in Slack

### Phase 2 (Reliability)

- [ ] Max 3 concurrent file uploads
- [ ] Cleanup retries 3 times with exponential backoff
- [ ] 10-file batch completes without rate limit errors

---

## 6. Handoff Plan

| Phase | Owner | Deliverable |
|-------|-------|-------------|
| Phase 1 | Dev Agent | PR with block type fix + tests |
| Phase 2 | Dev Agent | PR with rate limiting + retry |
| Verification | Sid | Test in #orion-testing channel |

**Scope Classification:** MODERATE — Direct implementation by development team

---

## 7. File Storage Architecture (Clarification)

For reference, the correct understanding of file storage:

| Storage | Purpose | Files Involved |
|---------|---------|----------------|
| **Anthropic Files API** | Temporary storage for generated files | PDF, Excel, images from skills |
| **GCS (memories bucket)** | Persistent agent knowledge | Text-based memories only |
| **Slack** | Final delivery destination | User-visible files |

**Flow:** Container creates file → Anthropic Files API (file_id) → Download to buffer → Upload to Slack → Delete from Anthropic

GCS is NOT involved in generated file handling.

---

## 8. References

- [Anthropic Code Execution Tool Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)
- [Anthropic Skills Guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
- Story 6.10: `_bmad-output/implementation-artifacts/stories/6-10-skill-migration-testing.md`
- Investigation: `_bmad-output/ptc-file-output-investigation.md`

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-07 | Proposal created |
| 2026-01-07 | Adversarial review completed — simplified scope |
| 2026-01-07 | APPROVED by Sid |
