/**
 * Memory Layer Module
 *
 * Implements file-based persistent memory for Orion agent.
 * Stores user preferences, conversation summaries, and knowledge in orion-context/.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#1 - Information saved to orion-context/ as files
 * @see AC#2 - Gather phase searches orion-context/ for relevant memories
 * @see AR31 - File-based persistent memory in orion-context/
 */

import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import matter from 'gray-matter';
import YAML from 'yaml';
import { logger } from '../utils/logger.js';
import {
  ORION_CONTEXT_ROOT,
  TYPE_DIRECTORIES,
  getTypeDirectory,
  listMemoryFiles,
  parseMemoryFile,
} from './storage.js';
import { listKVKeys, loadFromKV } from './vercel-kv-storage.js';

// Re-export for other modules (preferences.ts, conversations.ts, knowledge.ts)
export { ORION_CONTEXT_ROOT };

/**
 * Check if running on Vercel (production)
 * Vercel KV requires KV_REST_API_URL to be set
 */
function isVercelKVAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

/**
 * Memory types supported by the system
 */
export const MemoryType = {
  CONVERSATION: 'conversation',
  PREFERENCE: 'preference',
  KNOWLEDGE: 'knowledge',
} as const;

export type MemoryTypeValue = (typeof MemoryType)[keyof typeof MemoryType];

/**
 * Memory metadata for context and organization
 */
export interface MemoryMetadata {
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Slack user ID (for preferences) */
  userId?: string;
  /** Slack channel ID (for conversations) */
  channelId?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * A memory item stored in orion-context/
 */
export interface Memory {
  /** Type of memory */
  type: MemoryTypeValue;
  /** Unique key/identifier */
  key: string;
  /** Content of the memory */
  content: string;
  /** Metadata for organization */
  metadata: MemoryMetadata;
}

/**
 * Get the file extension for a memory type
 */
function getFileExtension(type: MemoryTypeValue): string {
  return type === MemoryType.PREFERENCE ? '.yaml' : '.md';
}

/**
 * Get the full path for a memory item
 *
 * @param memory - Memory item to get path for
 * @returns Full file path for the memory
 */
export function getMemoryPath(memory: Memory): string {
  const dir = TYPE_DIRECTORIES[memory.type];
  const ext = getFileExtension(memory.type);
  const filename = `${memory.key}${ext}`;
  return join(ORION_CONTEXT_ROOT, dir, filename);
}

/**
 * Format memory content for storage
 *
 * @param memory - Memory to format
 * @returns Formatted content string
 */
function formatMemoryContent(memory: Memory): string {
  if (memory.type === MemoryType.PREFERENCE) {
    // Preferences are stored as YAML
    const data = {
      type: memory.type,
      userId: memory.metadata.userId,
      createdAt: memory.metadata.createdAt,
      ...safeParseJSON(memory.content),
    };
    return YAML.stringify(data);
  }

  // Conversations and Knowledge use Markdown with frontmatter
  const frontmatter: Record<string, unknown> = {
    type: memory.type,
    createdAt: memory.metadata.createdAt,
  };

  if (memory.metadata.userId) frontmatter.userId = memory.metadata.userId;
  if (memory.metadata.channelId) frontmatter.channelId = memory.metadata.channelId;
  if (memory.metadata.tags) frontmatter.tags = memory.metadata.tags;

  return matter.stringify(memory.content, frontmatter);
}

/**
 * Safely parse JSON content
 */
function safeParseJSON(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch {
    return { value: content };
  }
}

/**
 * Save a memory to orion-context/ (AC#1)
 *
 * @param memory - Memory item to save
 */
export async function saveMemory(memory: Memory): Promise<void> {
  const path = getMemoryPath(memory);
  const content = formatMemoryContent(memory);

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  // Write the file
  await writeFile(path, content);

  logger.info({
    event: 'memory_saved',
    type: memory.type,
    key: memory.key,
    path,
  });
}

/**
 * Memory search result with relevance score
 */
export interface MemorySearchResult {
  /** The matched memory */
  memory: Memory;
  /** Relevance score (0-1, normalized by keyword count) */
  relevance: number;
  /** Raw keyword match count */
  rawScore: number;
}

/**
 * Search memory files using keyword matching with scores (AC#2)
 *
 * On Vercel: Searches KV for preferences/conversations, files for knowledge.
 * Locally: Scans files in orion-context/.
 *
 * Ranks by keyword matches, returns top 10 with scores.
 *
 * @param query - Search query string
 * @param type - Optional memory type to filter by
 * @returns Array of matching memories with relevance scores
 * @see Story 2.8 - File-Based Memory
 * @see Task 12: Update Memory Search for KV
 */
export async function searchMemoryWithScores(
  query: string,
  type?: MemoryTypeValue
): Promise<MemorySearchResult[]> {
  // Extract keywords (words > 2 chars)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  const results: Array<{ memory: Memory; score: number }> = [];

  if (isVercelKVAvailable()) {
    // On Vercel: search KV for preferences and conversations
    const kvResults = await searchKVMemories(keywords, type);
    results.push(...kvResults);

    // Knowledge is always file-based (bundled at deploy time)
    if (!type || type === MemoryType.KNOWLEDGE) {
      const knowledgeResults = await searchFileMemories(keywords, MemoryType.KNOWLEDGE);
      results.push(...knowledgeResults);
    }
  } else {
    // Locally: scan all files
    const fileResults = await searchFileMemories(keywords, type);
    results.push(...fileResults);
  }

  // Sort by relevance score, return top 10 with normalized scores
  const maxScore = keywords.length;
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((r) => ({
      memory: r.memory,
      relevance: r.score / maxScore,
      rawScore: r.score,
    }));
}

/**
 * Search Vercel KV for matching memories
 */
async function searchKVMemories(
  keywords: string[],
  type?: MemoryTypeValue
): Promise<Array<{ memory: Memory; score: number }>> {
  const results: Array<{ memory: Memory; score: number }> = [];

  // Search preferences
  if (!type || type === MemoryType.PREFERENCE) {
    const prefKeys = await listKVKeys('preference');
    for (const key of prefKeys) {
      const result = await loadFromKV<Record<string, unknown>>('preference', key);
      if (!result) continue;

      const content = JSON.stringify(result.data).toLowerCase();
      const score = keywords.reduce((acc, kw) => acc + (content.includes(kw) ? 1 : 0), 0);

      if (score > 0) {
        results.push({
          memory: {
            type: MemoryType.PREFERENCE,
            key: `preference:${key}`,
            content: JSON.stringify(result.data),
            metadata: { createdAt: result.createdAt },
          },
          score,
        });
      }
    }
  }

  // Search conversations
  if (!type || type === MemoryType.CONVERSATION) {
    const convKeys = await listKVKeys('conversation');
    for (const key of convKeys) {
      const result = await loadFromKV<{ summary: string }>('conversation', key);
      if (!result) continue;

      const content = (result.data.summary || '').toLowerCase();
      const score = keywords.reduce((acc, kw) => acc + (content.includes(kw) ? 1 : 0), 0);

      if (score > 0) {
        results.push({
          memory: {
            type: MemoryType.CONVERSATION,
            key: `conversation:${key}`,
            content: result.data.summary || '',
            metadata: { createdAt: result.createdAt },
          },
          score,
        });
      }
    }
  }

  return results;
}

/**
 * Search file-based memories (used locally and for knowledge on Vercel)
 */
async function searchFileMemories(
  keywords: string[],
  type?: MemoryTypeValue
): Promise<Array<{ memory: Memory; score: number }>> {
  const searchDir = type ? getTypeDirectory(type) : ORION_CONTEXT_ROOT;
  const files = await listMemoryFiles(searchDir);
  const results: Array<{ memory: Memory; score: number }> = [];

  for (const file of files) {
    const memory = await parseMemoryFile(file);
    if (!memory) continue;

    const content = memory.content.toLowerCase();
    const score = keywords.reduce((acc, keyword) => {
      return acc + (content.includes(keyword) ? 1 : 0);
    }, 0);

    if (score > 0) {
      results.push({ memory, score });
    }
  }

  return results;
}

/**
 * Search memory files using keyword matching (AC#2)
 *
 * Scans files in orion-context/, ranks by keyword matches, returns top 10.
 * Use searchMemoryWithScores for relevance scores.
 *
 * @param query - Search query string
 * @param type - Optional memory type to filter by
 * @returns Array of matching Memory objects, ranked by relevance
 */
export async function searchMemory(
  query: string,
  type?: MemoryTypeValue
): Promise<Memory[]> {
  const results = await searchMemoryWithScores(query, type);
  return results.map((r) => r.memory);
}

