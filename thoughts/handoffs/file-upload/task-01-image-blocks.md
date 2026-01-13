# Task 01: Add Image Block Support

**Status:** COMPLETE
**Completed:** 2026-01-12

## Summary

Extended `src/agent/document-blocks.ts` to support `image` content blocks alongside document blocks. Images now use the proper Anthropic API format with `type: 'image'` and `source: { type: 'file', file_id }` without the `title` or `citations` fields that documents use.

## Changes Made

### 1. Added ImageBlock Interface

```typescript
export interface ImageBlock {
  type: 'image';
  source: {
    type: 'file';
    file_id: string;
  };
}
```

NOTE: Images do NOT support `title` or `citations` fields - including them may cause API errors.

### 2. Added ContentBlock Union Type

```typescript
export type ContentBlock = DocumentBlock | ImageBlock;
```

### 3. Added BuildContentBlocksResult Interface

New result type with:
- `contentBlocks: ContentBlock[]` - All blocks (documents + images)
- `documentBlocks: DocumentBlock[]` - Only documents (backward compatibility)
- `imageBlocks: ImageBlock[]` - Only images
- `errors`, `processedFiles`, `failedFiles` (unchanged)

### 4. Added Helper Functions

- `buildImageBlock(fileId: string): ImageBlock` - Creates image block
- `isImageMimeType(mimeType: string): boolean` - Uses `FILE_LIMITS.IMAGE.mimeTypes`

### 5. Updated buildDocumentBlocks()

Now routes based on MIME type:
- `image/*` -> `ImageBlock` (no citations)
- `application/pdf`, `text/*`, etc. -> `DocumentBlock` (with citations)

Returns `BuildContentBlocksResult` with all three arrays for backward compatibility.

## Files Modified

- `src/agent/document-blocks.ts` - Main implementation
- `src/agent/document-blocks.test.ts` - Added 17 new tests (37 total)

## Test Results

```
37 tests passing
- buildDocumentBlock: 3 tests
- buildImageBlock: 2 tests
- isImageMimeType: 8 tests
- buildDocumentBlocks: 19 tests (including 8 new image routing tests)
- validateSlackFiles: 4 tests
- formatFileErrors: 3 tests
```

## Build Verification

- `npm run build` - PASSES
- `npm run typecheck` on document-blocks.ts - PASSES

## Backward Compatibility

The function still returns `documentBlocks` array for callers that expect `DocumentBlock[]`. New code should use `contentBlocks` which contains both types.

## Next Tasks

Task 02 should update `src/agent/loop.ts` to use the new `contentBlocks` array when building messages for Claude.
