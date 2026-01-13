# Task 04: Update Agent Loop for Mixed Content

**Status:** COMPLETE
**Completed:** 2026-01-12

## Summary

Updated `src/agent/loop.ts` to support mixed content blocks (images + documents) with full backward compatibility for the deprecated `documentBlocks` parameter.

## Changes Made

### 1. Added ImageBlockParam Interface

```typescript
export interface ImageBlockParam {
  type: 'image';
  source: {
    type: 'file';
    file_id: string;
  };
}
```

NOTE: Images do NOT support `title` or `citations` fields.

### 2. Added ContentBlockParam Union Type

```typescript
export type ContentBlockParam = DocumentBlockParam | ImageBlockParam;
```

### 3. Updated AgentLoopOptions

Added new `contentBlocks` parameter and deprecated `documentBlocks`:

```typescript
contentBlocks?: ContentBlockParam[];  // New - supports images + documents
documentBlocks?: DocumentBlockParam[]; // @deprecated - backward compat
```

### 4. Message Building Logic Updates

- Accepts both `contentBlocks` (new) and `documentBlocks` (deprecated)
- Merges both with deduplication by file_id
- Orders content: images first, then documents, then text
- Logs deprecation warning when only `documentBlocks` used

### 5. Citation Metadata Updates

- Only document blocks generate citation metadata (images don't support citations)
- Variables renamed: `documentBlocksForMetadata` for clarity

## Files Modified

- `src/agent/loop.ts`

## Backward Compatibility

The plan required backward compatibility as a blocking requirement:

1. ✅ `documentBlocks` parameter still accepted
2. ✅ Deprecation warning logged when `documentBlocks` used without `contentBlocks`
3. ✅ If both provided, they're merged (deduplicated by file_id)
4. ✅ Existing callers continue working without changes

## Build Verification

- `npm run build` - PASSES

## Content Block Ordering

Per Anthropic documentation, content is ordered:
1. Image blocks (best for multimodal analysis)
2. Document blocks (PDFs, text files)
3. Text block (user's actual message)

## Next Tasks

Task 6 should update Slack handlers to use the new `contentBlocks` parameter instead of `documentBlocks`.
