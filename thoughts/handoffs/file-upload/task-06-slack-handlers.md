# Task 06: Update Slack Handlers

**Status:** COMPLETE
**Completed:** 2026-01-12

## Summary

Updated both Slack handlers (`user-message.ts` and `app-mention.ts`) to use the new `contentBlocks` parameter, supporting both images and documents.

## Changes Made

### 1. Updated orion.ts

Added `ImageBlockParam`, `ContentBlockParam`, and `contentBlocks` option to `AgentOptions`:

```typescript
export interface ImageBlockParam {
  type: 'image';
  source: { type: 'file'; file_id: string };
}

export type ContentBlockParam = DocumentBlockParam | ImageBlockParam;

export interface AgentOptions {
  // ... existing fields ...
  contentBlocks?: ContentBlockParam[];
  documentBlocks?: DocumentBlockParam[]; // @deprecated
}
```

Updated `runOrionAgent()` to pass both `contentBlocks` and `documentBlocks` to the agent loop.

### 2. Updated user-message.ts

- Changed import from `DocumentBlock` to `ContentBlock`
- Renamed `documentBlocksForAgent` to `contentBlocksForAgent`
- Updated destructuring to include `contentBlocks`, `imageBlocks`, `documentBlocks`
- Enhanced logging to show image and document counts separately
- Updated agent loop call to use `contentBlocks` parameter
- Updated citation metadata to filter only document blocks

### 3. Updated app-mention.ts

Same changes as user-message.ts.

## Files Modified

- `src/agent/orion.ts` - Added types and contentBlocks option
- `src/slack/handlers/user-message.ts` - Use contentBlocks
- `src/slack/handlers/app-mention.ts` - Use contentBlocks

## Build Verification

- `npm run build` - PASSES

## Backward Compatibility

Both handlers can still receive old `DocumentBlock[]` arrays - they just need to be typed as `ContentBlock[]` now (DocumentBlock extends ContentBlock).

## Key Code Changes

### Handler file ingestion section:
```typescript
// Before
let documentBlocksForAgent: DocumentBlock[] = [];
const { documentBlocks, ... } = buildDocumentBlocks(...);
documentBlocksForAgent = documentBlocks;

// After
let contentBlocksForAgent: ContentBlock[] = [];
const { contentBlocks, imageBlocks, documentBlocks, ... } = buildDocumentBlocks(...);
contentBlocksForAgent = contentBlocks;
```

### Agent loop call:
```typescript
// Before
documentBlocks: documentBlocksForAgent as DocumentBlockParam[]

// After
contentBlocks: contentBlocksForAgent as ContentBlockParam[]
```

## Next Tasks

Task 7 should add tests for the Phase 1 changes. The existing tests should still pass; new tests should verify:
- Image blocks are created for image MIME types
- Mixed content blocks are properly ordered (images first)
- Document blocks retain citation support while images don't
