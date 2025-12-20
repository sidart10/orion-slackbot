/**
 * Knowledge Storage Module
 *
 * Handles storage and retrieval of domain-specific knowledge.
 * Knowledge is stored as Markdown files in orion-context/knowledge/.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#5 - Knowledge stored in orion-context/knowledge/
 */

import { mkdir, readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import matter from 'gray-matter';
import { ORION_CONTEXT_ROOT } from './index.js';
import { logger } from '../utils/logger.js';

/** Directory for knowledge files */
const KNOWLEDGE_DIR = join(ORION_CONTEXT_ROOT, 'knowledge');

/**
 * Knowledge item data structure
 */
export interface Knowledge {
  /** Unique name/identifier */
  name: string;
  /** Knowledge content (markdown) */
  content: string;
  /** Category for organization */
  category: string;
  /** Tags for searchability */
  tags: string[];
  /** When knowledge was first created */
  createdAt: string;
  /** When knowledge was last updated */
  updatedAt: string;
}

/**
 * Get the file path for a knowledge item
 *
 * @param name - Knowledge item name
 * @returns Path to the knowledge file
 */
export function getKnowledgePath(name: string): string {
  return join(KNOWLEDGE_DIR, `${name}.md`);
}

/**
 * Save a knowledge item
 *
 * @param knowledge - Knowledge item to save
 */
export async function saveKnowledge(knowledge: Knowledge): Promise<void> {
  const path = getKnowledgePath(knowledge.name);

  // Build frontmatter
  const frontmatter = {
    type: 'knowledge',
    name: knowledge.name,
    category: knowledge.category,
    tags: knowledge.tags,
    createdAt: knowledge.createdAt,
    updatedAt: knowledge.updatedAt,
  };

  // Create markdown content with frontmatter
  const content = matter.stringify(knowledge.content, frontmatter);

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  // Write file
  await writeFile(path, content);

  logger.info({
    event: 'knowledge_saved',
    name: knowledge.name,
    category: knowledge.category,
    tagsCount: knowledge.tags.length,
    path,
  });
}

/**
 * Load a knowledge item by name
 *
 * @param name - Knowledge item name
 * @returns Knowledge item or null if not found
 */
export async function loadKnowledge(name: string): Promise<Knowledge | null> {
  const path = getKnowledgePath(name);

  try {
    const fileContent = await readFile(path, 'utf-8');
    const { data: frontmatter, content: body } = matter(fileContent);

    return {
      name: frontmatter.name || name,
      content: body,
      category: frontmatter.category || 'general',
      tags: frontmatter.tags || [],
      createdAt: frontmatter.createdAt || new Date().toISOString(),
      updatedAt: frontmatter.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * List all knowledge items, optionally filtered by category
 *
 * @param category - Optional category filter
 * @returns Array of knowledge items
 */
export async function listKnowledge(category?: string): Promise<Knowledge[]> {
  try {
    const entries = await readdir(KNOWLEDGE_DIR, { withFileTypes: true });
    const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

    const items: Knowledge[] = [];

    for (const file of mdFiles) {
      const filepath = join(KNOWLEDGE_DIR, file.name);
      try {
        const content = await readFile(filepath, 'utf-8');
        const { data: frontmatter, content: body } = matter(content);

        const knowledge: Knowledge = {
          name: frontmatter.name || file.name.replace('.md', ''),
          content: body,
          category: frontmatter.category || 'general',
          tags: frontmatter.tags || [],
          createdAt: frontmatter.createdAt || new Date().toISOString(),
          updatedAt: frontmatter.updatedAt || new Date().toISOString(),
        };

        // Filter by category if specified
        if (!category || knowledge.category === category) {
          items.push(knowledge);
        }
      } catch {
        // Skip invalid files
      }
    }

    return items;
  } catch {
    return [];
  }
}

/** Minimum relevance threshold (30% of keywords must match) */
const MIN_RELEVANCE_THRESHOLD = 0.3;

/** Maximum number of knowledge items to return */
const MAX_KNOWLEDGE_RESULTS = 5;

/**
 * Search knowledge items by query
 *
 * Returns knowledge items that match at least 30% of query keywords,
 * sorted by relevance score (highest first), limited to top 5 results.
 *
 * @param query - Search query string
 * @returns Array of matching knowledge items with sufficient relevance
 */
export async function searchKnowledge(query: string): Promise<Knowledge[]> {
  const allKnowledge = await listKnowledge();

  // Extract keywords (words > 2 chars)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  // Score and filter knowledge items
  const results = allKnowledge
    .map((k) => {
      const searchText = `${k.name} ${k.content} ${k.tags.join(' ')}`.toLowerCase();
      const score = keywords.reduce((acc, keyword) => {
        return acc + (searchText.includes(keyword) ? 1 : 0);
      }, 0);
      const relevance = score / keywords.length;
      return { knowledge: k, score, relevance };
    })
    .filter((r) => r.relevance >= MIN_RELEVANCE_THRESHOLD) // Only return sufficiently relevant items
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_KNOWLEDGE_RESULTS); // Limit results

  return results.map((r) => r.knowledge);
}

