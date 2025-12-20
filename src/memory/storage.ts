/**
 * Memory Storage Module
 *
 * Low-level file operations for memory persistence.
 * Handles reading, writing, and listing memory files in orion-context/.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#1 - Information saved to orion-context/ as files
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import matter from 'gray-matter';
import YAML from 'yaml';
import type { Memory, MemoryTypeValue } from './index.js';

/** Root directory for persistent memory storage */
export const ORION_CONTEXT_ROOT = './orion-context';

/**
 * Directory mapping for memory types
 */
export const TYPE_DIRECTORIES: Record<MemoryTypeValue, string> = {
  conversation: 'conversations',
  preference: 'user-preferences',
  knowledge: 'knowledge',
};

/**
 * Get the full directory path for a memory type
 *
 * @param type - Memory type
 * @returns Full path to the type's directory
 */
export function getTypeDirectory(type: MemoryTypeValue): string {
  return join(ORION_CONTEXT_ROOT, TYPE_DIRECTORIES[type]);
}

/**
 * List all memory files in a directory
 *
 * @param dir - Directory to scan
 * @returns Array of file paths (only .md and .yaml files)
 */
export async function listMemoryFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries
      .filter((e) => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.yaml')))
      .map((e) => join(e.parentPath || dir, e.name));
  } catch {
    // Directory may not exist yet
    return [];
  }
}

/**
 * Parse a memory file into a Memory object
 *
 * @param filepath - Path to the file
 * @returns Memory object or null if parsing fails
 */
export async function parseMemoryFile(filepath: string): Promise<Memory | null> {
  try {
    const content = await readFile(filepath, 'utf-8');

    if (filepath.endsWith('.yaml')) {
      // Parse YAML preference files
      const data = YAML.parse(content);
      return {
        type: 'preference',
        key: filepath,
        content: JSON.stringify(data),
        metadata: {
          createdAt: data.createdAt || new Date().toISOString(),
          userId: data.userId,
        },
      };
    }

    // Parse Markdown with frontmatter
    const { data: frontmatter, content: body } = matter(content);
    return {
      type: (frontmatter.type as MemoryTypeValue) || 'knowledge',
      key: filepath,
      content: body,
      metadata: {
        createdAt: frontmatter.createdAt || new Date().toISOString(),
        tags: frontmatter.tags,
        userId: frontmatter.userId,
        channelId: frontmatter.channelId,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Write content to a memory file
 *
 * Creates the directory if it doesn't exist.
 *
 * @param filepath - Full path to the file
 * @param content - Content to write
 */
export async function writeMemoryFile(filepath: string, content: string): Promise<void> {
  const dir = dirname(filepath);
  await mkdir(dir, { recursive: true });
  await writeFile(filepath, content);
}

/**
 * Read content from a memory file
 *
 * @param filepath - Path to the file
 * @returns File content or null if file doesn't exist
 */
export async function readMemoryFile(filepath: string): Promise<string | null> {
  try {
    return await readFile(filepath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Generate a filename for a memory item
 *
 * Uses structured naming: key_timestamp for conversations, key for others.
 *
 * @param type - Memory type
 * @param key - Base key for the filename
 * @param timestamp - Optional timestamp (defaults to now)
 * @returns Generated filename with appropriate extension
 */
export function generateMemoryFilename(
  type: MemoryTypeValue,
  key: string,
  timestamp?: number
): string {
  const ext = type === 'preference' ? '.yaml' : '.md';

  if (type === 'conversation') {
    const ts = timestamp ?? Date.now();
    return `${key}_${ts}${ext}`;
  }

  return `${key}${ext}`;
}

