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

    // Thread sources are now built at handler level via buildThreadSources()
    // which has access to rich metadata for clickable permalinks.
    // gatherContext only returns context text for thread snippets, not sources.
    // See Tech-Spec: Source Citations Fix.
    expect(res.sources.some((s) => s.type === 'thread')).toBe(false);
    expect(res.contextText).toContain('anthropic');
  });

  it('should scan orion-context files for LLM context (sources not exposed)', async () => {
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

    // File sources are NOT exposed (users can't click to verify local files)
    // See Tech-Spec: Source Citations Fix - "clickable sources only" policy
    const fileSources = res.sources.filter((s) => s.type === 'file');
    expect(fileSources.length).toBe(0);
    // But context text IS still populated for LLM use
    expect(res.contextText).toContain('config.yaml');
  });
});


