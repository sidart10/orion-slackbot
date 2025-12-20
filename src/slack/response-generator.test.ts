/**
 * Tests for Response Generator
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack
 */

import { describe, it, expect } from 'vitest';
import { generatePlaceholderResponse, streamFromSource } from './response-generator.js';

describe('generatePlaceholderResponse', () => {
  it('should yield string chunks', async () => {
    const chunks: string[] = [];
    for await (const chunk of generatePlaceholderResponse(5)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => typeof c === 'string')).toBe(true);
  });

  it('should include context count in response', async () => {
    const chunks: string[] = [];
    for await (const chunk of generatePlaceholderResponse(10)) {
      chunks.push(chunk);
    }

    const fullResponse = chunks.join('');
    expect(fullResponse).toContain('10');
  });

  it('should mention future capabilities', async () => {
    const chunks: string[] = [];
    for await (const chunk of generatePlaceholderResponse(1)) {
      chunks.push(chunk);
    }

    const fullResponse = chunks.join('');
    expect(fullResponse).toContain('Story 2.1');
  });

  it('should yield incrementally (not all at once)', async () => {
    const generator = generatePlaceholderResponse(1);
    const first = await generator.next();
    const second = await generator.next();

    expect(first.done).toBe(false);
    expect(second.done).toBe(false);
    expect(first.value).not.toBe(second.value);
  });
});

describe('streamFromSource', () => {
  it('should yield all chunks from an async iterable', async () => {
    async function* mockSource(): AsyncGenerator<string> {
      yield 'chunk1';
      yield 'chunk2';
      yield 'chunk3';
    }

    const chunks: string[] = [];
    for await (const chunk of streamFromSource(mockSource())) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3']);
  });

  it('should handle empty source', async () => {
    async function* emptySource(): AsyncGenerator<string> {
      // yields nothing
    }

    const chunks: string[] = [];
    for await (const chunk of streamFromSource(emptySource())) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([]);
  });

  it('should preserve chunk types', async () => {
    async function* numberSource(): AsyncGenerator<number> {
      yield 1;
      yield 2;
      yield 3;
    }

    const chunks: number[] = [];
    for await (const chunk of streamFromSource(numberSource())) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([1, 2, 3]);
  });

  it('should propagate errors from source', async () => {
    async function* errorSource(): AsyncGenerator<string> {
      yield 'ok';
      throw new Error('Source error');
    }

    const chunks: string[] = [];
    await expect(async () => {
      for await (const chunk of streamFromSource(errorSource())) {
        chunks.push(chunk);
      }
    }).rejects.toThrow('Source error');

    expect(chunks).toEqual(['ok']);
  });
});

