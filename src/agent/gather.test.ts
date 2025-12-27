/**
 * Tests for gather phase (Story 2.2).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#3 - Gather from threadHistory + orion-context/ with bounded scan
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal Dirent-like shape for our mocks
type MockDirent = { name: string; isDirectory: () => boolean; isFile: () => boolean };

const fsMocks = vi.hoisted(() => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('node:fs/promises', () => fsMocks);

import { gatherContext } from './gather.js';

describe('gatherContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should select relevant thread snippets using keyword overlap', async () => {
    // No files
    fsMocks.readdir.mockResolvedValueOnce([] as MockDirent[]);

    const res = await gatherContext({
      userMessage: 'How do I change the Anthropic model config?',
      threadHistory: [
        { role: 'user', content: 'What is the weather today?' },
        { role: 'assistant', content: 'You can change config in environment.ts' },
        { role: 'user', content: 'Where is the anthropic model set?' },
      ],
      orionContextRoot: 'orion-context',
    });

    expect(res.sources.some((s) => s.type === 'thread')).toBe(true);
    expect(res.contextText).toContain('anthropic');
  });

  it('should scan a bounded subset of orion-context files and return ranked excerpts', async () => {
    // Root has one file + one directory
    fsMocks.readdir
      .mockResolvedValueOnce([
        {
          name: 'prefs.md',
          isDirectory: () => false,
          isFile: () => true,
        },
        {
          name: 'nested',
          isDirectory: () => true,
          isFile: () => false,
        },
      ] as MockDirent[])
      .mockResolvedValueOnce([
        {
          name: 'notes.txt',
          isDirectory: () => false,
          isFile: () => true,
        },
      ] as MockDirent[]);

    fsMocks.stat.mockResolvedValue({ size: 1000 });

    fsMocks.readFile
      .mockResolvedValueOnce('Anthropic model default is set in .orion/config.yaml\n')
      .mockResolvedValueOnce('Nothing relevant here\n');

    const res = await gatherContext({
      userMessage: 'anthropic model default',
      threadHistory: [],
      orionContextRoot: 'orion-context',
      maxFiles: 10,
      maxFileBytes: 50_000,
      maxExcerpts: 5,
    });

    const fileSources = res.sources.filter((s) => s.type === 'file');
    expect(fileSources.length).toBeGreaterThan(0);
    expect(res.contextText).toContain('config.yaml');
  });
});


