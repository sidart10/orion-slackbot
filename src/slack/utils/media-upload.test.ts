import { describe, it, expect } from 'vitest';
import { extractImageUrls, stripImageUrls } from './media-upload.js';

describe('extractImageUrls', () => {
  it('extracts gs:// media URLs (images and videos) and deduplicates', () => {
    const text =
      'Generated: gs://bucket/path/a.png and gs://bucket/path/a.png plus gs://bucket/b.jpg';
    const urls = extractImageUrls(text);
    expect(urls).toEqual(['gs://bucket/path/a.png', 'gs://bucket/b.jpg']);
  });

  it('extracts gs:// video URLs (mp4, mov, etc.)', () => {
    const text = 'Video: gs://bucket/out/sample_0.mp4 and gs://bucket/out/clip.mov';
    const urls = extractImageUrls(text);
    expect(urls).toEqual(['gs://bucket/out/sample_0.mp4', 'gs://bucket/out/clip.mov']);
  });

  it('extracts signed GCS URLs (googleapis and mtls.cloud.google domains)', () => {
    const text =
      'See https://storage.googleapis.com/bucket/file.webp?X-Goog-Signature=abc and https://storage.mtls.cloud.google.com/bucket/video.mp4';
    const urls = extractImageUrls(text);
    expect(urls).toEqual([
      'https://storage.googleapis.com/bucket/file.webp?X-Goog-Signature=abc',
      'https://storage.mtls.cloud.google.com/bucket/video.mp4',
    ]);
  });

  it('does not extract non-GCS HTTP URLs (security: only trusted sources)', () => {
    const text = 'Random image: https://example.com/x.png should not be extracted';
    const urls = extractImageUrls(text);
    expect(urls).toEqual([]);
  });

  it('extracts Veo URLs WITHOUT file extensions (orion-genmedia/veo_outputs)', () => {
    const text = 'Video: gs://orion-genmedia/veo_outputs/1768251182867/sample_0';
    const urls = extractImageUrls(text);
    expect(urls).toEqual(['gs://orion-genmedia/veo_outputs/1768251182867/sample_0']);
  });

  it('extracts Imagen URLs WITHOUT file extensions (orion-genmedia/imagen_outputs)', () => {
    const text = 'Image: gs://orion-genmedia/imagen_outputs/123456/sample_0';
    const urls = extractImageUrls(text);
    expect(urls).toEqual(['gs://orion-genmedia/imagen_outputs/123456/sample_0']);
  });

  it('extracts signed Veo URLs WITHOUT extensions (mtls.cloud.google.com)', () => {
    const text = 'Video: https://storage.mtls.cloud.google.com/orion-genmedia/veo_outputs/123/sample_0?X-Goog-Signature=abc';
    const urls = extractImageUrls(text);
    expect(urls).toEqual(['https://storage.mtls.cloud.google.com/orion-genmedia/veo_outputs/123/sample_0?X-Goog-Signature=abc']);
  });
});

describe('stripImageUrls', () => {
  it('removes gs:// image URLs from text', () => {
    const text = 'Here is your image: gs://bucket/path/image.png Let me know if you need changes.';
    const result = stripImageUrls(text);
    expect(result).toBe('Here is your image: Let me know if you need changes.');
  });

  it('removes GCS signed URLs (mtls.cloud.google.com domain)', () => {
    const text =
      'Generated: https://storage.mtls.cloud.google.com/orion-genmedia/imagen_outputs/12345/sample_0.png\n\nThe image shows a cat.';
    const result = stripImageUrls(text);
    expect(result).toBe('Generated:\n\nThe image shows a cat.');
  });

  it('removes multiple image URLs from text', () => {
    const text =
      'Image 1: gs://bucket/a.png\nImage 2: https://storage.googleapis.com/bucket/b.jpg\nDone!';
    const result = stripImageUrls(text);
    expect(result).toBe('Image 1:\nImage 2:\nDone!');
  });

  it('cleans up multiple empty lines after URL removal', () => {
    const text = 'Before\n\ngs://bucket/image.png\n\n\nAfter';
    const result = stripImageUrls(text);
    expect(result).toBe('Before\n\nAfter');
  });

  it('strips gs:// video URLs (mp4 now supported)', () => {
    const text = 'Video generated: gs://bucket/video.mp4 Enjoy!';
    const result = stripImageUrls(text);
    expect(result).toBe('Video generated: Enjoy!');
  });

  it('strips Veo URLs WITHOUT extensions (orion-genmedia/veo_outputs)', () => {
    const text = 'Video: gs://orion-genmedia/veo_outputs/1768251182867/sample_0 Enjoy!';
    const result = stripImageUrls(text);
    expect(result).toBe('Video: Enjoy!');
  });

  it('does not remove non-GCS URLs (only trusted sources are handled)', () => {
    const text = 'Check out https://example.com/page and https://other.com/file.png';
    const result = stripImageUrls(text);
    // Non-GCS URLs should remain unchanged
    expect(result).toBe('Check out https://example.com/page and https://other.com/file.png');
  });

  it('returns original text unchanged when no image URLs present', () => {
    const text = "Here's a helpful response with no images.";
    const result = stripImageUrls(text);
    expect(result).toBe("Here's a helpful response with no images.");
  });

  it('preserves trailing spaces in normal text (for streaming word boundaries)', () => {
    const text = 'Hello ';
    const result = stripImageUrls(text);
    // No URLs = no changes, preserves original text including trailing space
    expect(result).toBe('Hello ');
  });

  it('handles empty string', () => {
    expect(stripImageUrls('')).toBe('');
  });
});
