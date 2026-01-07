import { describe, it, expect } from 'vitest';
import { extractImageUrls } from './image-upload.js';

describe('extractImageUrls', () => {
  it('extracts gs:// image URLs (png/jpg/jpeg/gif/webp) and deduplicates', () => {
    const text =
      'Generated: gs://bucket/path/a.png and gs://bucket/path/a.png plus gs://bucket/b.jpg';
    const urls = extractImageUrls(text);
    expect(urls).toEqual(['gs://bucket/path/a.png', 'gs://bucket/b.jpg']);
  });

  it('does not treat gs:// mp4 as an image URL (video not supported here)', () => {
    const text = 'Video: gs://bucket/out/sample_0.mp4';
    const urls = extractImageUrls(text);
    expect(urls).toEqual([]);
  });

  it('extracts signed GCS URLs and generic http image URLs', () => {
    const text =
      'See https://storage.googleapis.com/bucket/file.webp?X-Goog-Signature=abc and https://example.com/x.png';
    const urls = extractImageUrls(text);
    expect(urls).toEqual([
      'https://storage.googleapis.com/bucket/file.webp?X-Goog-Signature=abc',
      'https://example.com/x.png',
    ]);
  });
});


