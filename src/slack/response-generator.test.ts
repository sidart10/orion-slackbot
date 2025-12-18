/**
 * Tests for Response Generator
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack
 */

import { describe, it, expect } from 'vitest';
import { generatePlaceholderResponse } from './response-generator.js';

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

