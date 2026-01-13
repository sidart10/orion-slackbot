# Task 02: Update Ingestion to Track File Category

**Status:** COMPLETE
**Completed:** 2026-01-12

## Summary

Updated `FileIngestionResult` to include a `category` field that indicates how the file should be routed for content block creation.

## Changes Made

### 1. Added FileCategory Type (src/slack/files/types.ts)

```typescript
export type FileCategory = 'image' | 'document' | 'text';
```

### 2. Updated FileIngestionResult Interface

Added optional `category` field:
- `'image'` → Use `ImageBlock` (no citations)
- `'document'` → Use `DocumentBlock` (with citations)
- `'text'` → Use `DocumentBlock` or text extraction

### 3. Added getFileCategoryForRouting() Helper

Maps FILE_LIMITS categories to FileCategory:
- `IMAGE` → `'image'`
- `PDF` → `'document'`
- `CSV`, `TEXT` → `'text'`

### 4. Updated ingestSlackFile() (src/files/ingestion.ts)

Added category determination on successful upload:
```typescript
const category = getFileCategoryForRouting(downloadedFile.mimetype);
return {
  success: true,
  fileId: fileMetadata.id,
  slackFile,
  category: category ?? undefined,
};
```

## Files Modified

- `src/slack/files/types.ts` - Added FileCategory type and getFileCategoryForRouting()
- `src/files/ingestion.ts` - Import helper and set category on success

## Test Results

- `npm run build` - PASSES
- `npm test src/files/ingestion.test.ts` - PASSES (8/8)
- `npm test src/agent/document-blocks.test.ts` - PASSES (37/37)

## Backward Compatibility

The `category` field is optional, so existing code continues to work. It's only populated on successful ingestion.

## Next Tasks

Task 4 should update `src/agent/loop.ts` to:
1. Use `contentBlocks` from `buildDocumentBlocks()` result
2. Handle mixed content types (images + documents)
3. Maintain backward compatibility with `documentBlocks` parameter
