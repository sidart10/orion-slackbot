/**
 * Gather phase: select relevant thread snippets + scan local `orion-context/`.
 *
 * NOTE: This is intentionally lightweight (no embeddings) and bounded for speed.
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see AC#3 - Gather from threadHistory + orion-context/ with relevance ranking
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, join, basename } from 'node:path';

export interface ContextSource {
  type: 'thread' | 'file';
  /** Human-readable source title (shown to users) */
  title: string;
  /** Stable reference (debuggable, not necessarily user-friendly) */
  reference: string;
  /** URL for clickable link (optional) */
  url?: string;
  excerpt?: string;
}

export interface GatherResult {
  contextText: string;
  sources: ContextSource[];
}

export interface GatherContextParams {
  userMessage: string;
  threadHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Path to scan; defaults to `orion-context` (repo root relative). */
  orionContextRoot?: string;
  /** Max thread snippets to include (default 5). */
  maxThreadSnippets?: number;
  /** Max files to read during scan (default 50). */
  maxFiles?: number;
  /** Skip files larger than this (default 100_000). */
  maxFileBytes?: number;
  /** Max total bytes read across all files (default 250_000). */
  maxTotalBytes?: number;
  /** Max file excerpts to include (default 5). */
  maxExcerpts?: number;
  /** Max directory depth under orionContextRoot (default 6). */
  maxDepth?: number;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'do',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'so',
  'that',
  'the',
  'then',
  'to',
  'we',
  'what',
  'when',
  'where',
  'why',
  'with',
  'you',
  'your',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function scoreOverlap(queryTokens: Set<string>, candidateText: string): number {
  if (queryTokens.size === 0) return 0;
  const tokens = new Set(tokenize(candidateText));
  let score = 0;
  for (const t of queryTokens) {
    if (tokens.has(t)) score += 1;
  }
  return score;
}

function buildThreadContext(params: {
  userMessage: string;
  threadHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxThreadSnippets: number;
}): { text: string; sources: ContextSource[] } {
  const queryTokens = new Set(tokenize(params.userMessage));
  const scored = params.threadHistory
    .map((m, idx) => ({
      idx,
      role: m.role,
      content: m.content,
      score: scoreOverlap(queryTokens, m.content),
    }))
    .filter((m) => m.content.trim().length > 0 && m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.maxThreadSnippets);

  if (scored.length === 0) {
    return { text: '', sources: [] };
  }

  const lines: string[] = ['Thread context (most relevant):'];
  const sources: ContextSource[] = [];
  for (const m of scored) {
    const excerpt = m.content.length > 500 ? `${m.content.slice(0, 500)}…` : m.content;
    lines.push(`- (${m.role}) ${excerpt}`);
    sources.push({
      type: 'thread',
      title: `Thread message #${m.idx + 1}`,
      reference: `threadHistory[${m.idx}]`,
      excerpt,
    });
  }

  return { text: lines.join('\n'), sources };
}

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.yaml', '.yml', '.json']);

function findExcerpt(params: { content: string; tokens: string[] }): string {
  const haystack = params.content;
  const haystackLower = haystack.toLowerCase();
  let firstIdx = -1;
  for (const t of params.tokens) {
    const idx = haystackLower.indexOf(t);
    if (idx !== -1) {
      firstIdx = firstIdx === -1 ? idx : Math.min(firstIdx, idx);
    }
  }
  if (firstIdx === -1) {
    return haystack.length > 300 ? `${haystack.slice(0, 300)}…` : haystack;
  }

  const start = Math.max(0, firstIdx - 150);
  const end = Math.min(haystack.length, firstIdx + 250);
  const excerpt = haystack.slice(start, end);
  return (start > 0 ? '…' : '') + excerpt + (end < haystack.length ? '…' : '');
}

async function scanOrionContext(params: {
  rootDir: string;
  queryTokens: Set<string>;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxExcerpts: number;
  maxDepth: number;
}): Promise<{ text: string; sources: ContextSource[] }> {
  const results: Array<{ score: number; filePath: string; excerpt: string }> = [];
  let filesRead = 0;
  let bytesRead = 0;

  const queue: Array<{ dir: string; depth: number }> = [{ dir: params.rootDir, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    if (next.depth > params.maxDepth) continue;

    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = (await readdir(next.dir, { withFileTypes: true })) as unknown as Array<{
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }>;
    } catch {
      // Missing directory or unreadable path: treat as empty.
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ dir: join(next.dir, entry.name), depth: next.depth + 1 });
        continue;
      }

      if (!entry.isFile()) continue;
      if (filesRead >= params.maxFiles) break;
      if (bytesRead >= params.maxTotalBytes) break;

      const fullPath = join(next.dir, entry.name);
      const ext = fullPath.toLowerCase().slice(fullPath.lastIndexOf('.'));
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      let size = 0;
      try {
        const s = await stat(fullPath);
        size = typeof s.size === 'number' ? s.size : 0;
      } catch {
        continue;
      }

      if (size <= 0 || size > params.maxFileBytes) continue;
      if (bytesRead + size > params.maxTotalBytes) continue;

      let content: string;
      try {
        content = await readFile(fullPath, 'utf-8');
      } catch {
        continue;
      }

      filesRead += 1;
      bytesRead += size;

      const score = scoreOverlap(params.queryTokens, content);
      if (score <= 0) continue;

      const excerpt = findExcerpt({
        content,
        tokens: Array.from(params.queryTokens),
      });

      results.push({ score, filePath: fullPath, excerpt });
    }
  }

  if (results.length === 0) {
    return { text: '', sources: [] };
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, params.maxExcerpts);

  const lines: string[] = ['Local context (most relevant):'];
  const sources: ContextSource[] = [];
  for (const r of top) {
    const ref = relative(process.cwd(), r.filePath);
    const fileTitle = basename(ref);
    lines.push(`- ${ref}\n  ${r.excerpt.replace(/\n+/g, ' ').trim()}`);
    sources.push({
      type: 'file',
      title: fileTitle,
      reference: ref,
      excerpt: r.excerpt,
    });
  }

  return { text: lines.join('\n'), sources };
}

export async function gatherContext(params: GatherContextParams): Promise<GatherResult> {
  const maxThreadSnippets = params.maxThreadSnippets ?? 5;
  const maxFiles = params.maxFiles ?? 50;
  const maxFileBytes = params.maxFileBytes ?? 100_000;
  const maxTotalBytes = params.maxTotalBytes ?? 250_000;
  const maxExcerpts = params.maxExcerpts ?? 5;
  const maxDepth = params.maxDepth ?? 6;

  const queryTokens = new Set(tokenize(params.userMessage));

  const thread = buildThreadContext({
    userMessage: params.userMessage,
    threadHistory: params.threadHistory,
    maxThreadSnippets,
  });

  const root = resolve(process.cwd(), params.orionContextRoot ?? 'orion-context');
  const local = await scanOrionContext({
    rootDir: root,
    queryTokens,
    maxFiles,
    maxFileBytes,
    maxTotalBytes,
    maxExcerpts,
    maxDepth,
  });

  const parts = [thread.text, local.text].filter((p) => p.trim().length > 0);
  const contextText = parts.join('\n\n');

  return {
    contextText,
    sources: [...thread.sources, ...local.sources],
  };
}


