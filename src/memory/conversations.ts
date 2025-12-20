/**
 * Conversation Summaries Module
 *
 * Handles storage and retrieval of thread conversation summaries.
 * Summaries are stored as Markdown files in orion-context/conversations/.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#4 - Conversation summaries stored in orion-context/conversations/
 */

import { mkdir, readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import matter from 'gray-matter';
import { ORION_CONTEXT_ROOT } from './index.js';
import { logger } from '../utils/logger.js';

/** Directory for conversation summary files */
const CONVERSATIONS_DIR = join(ORION_CONTEXT_ROOT, 'conversations');

/**
 * Conversation summary data structure
 */
export interface ConversationSummary {
  /** Slack channel ID */
  channelId: string;
  /** Thread timestamp */
  threadTs: string;
  /** Summary content (markdown) */
  summary: string;
  /** List of user IDs who participated */
  participants: string[];
  /** Extracted topics/keywords */
  topics: string[];
  /** When summary was created */
  createdAt: string;
}

/**
 * Get the file path for a conversation summary
 *
 * @param channelId - Slack channel ID
 * @param threadTs - Thread timestamp
 * @returns Path to the summary file
 */
export function getConversationPath(channelId: string, threadTs: string): string {
  const filename = `${channelId}_${threadTs}.md`;
  return join(CONVERSATIONS_DIR, filename);
}

/**
 * Save a conversation summary
 *
 * @param summary - Conversation summary to save
 */
export async function saveConversationSummary(summary: ConversationSummary): Promise<void> {
  const path = getConversationPath(summary.channelId, summary.threadTs);

  // Build frontmatter
  const frontmatter = {
    type: 'conversation',
    channelId: summary.channelId,
    threadTs: summary.threadTs,
    participants: summary.participants,
    topics: summary.topics,
    createdAt: summary.createdAt,
  };

  // Create markdown content with frontmatter
  const content = matter.stringify(summary.summary, frontmatter);

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  // Write file
  await writeFile(path, content);

  logger.info({
    event: 'conversation_summary_saved',
    channelId: summary.channelId,
    threadTs: summary.threadTs,
    topicsCount: summary.topics.length,
    participantsCount: summary.participants.length,
    path,
  });
}

/**
 * Load a conversation summary by channel and thread
 *
 * @param channelId - Slack channel ID
 * @param threadTs - Thread timestamp
 * @returns Conversation summary or null if not found
 */
export async function loadConversationSummary(
  channelId: string,
  threadTs: string
): Promise<ConversationSummary | null> {
  const path = getConversationPath(channelId, threadTs);

  try {
    const fileContent = await readFile(path, 'utf-8');
    const { data: frontmatter, content: body } = matter(fileContent);

    return {
      channelId: frontmatter.channelId || channelId,
      threadTs: frontmatter.threadTs || threadTs,
      summary: body,
      participants: frontmatter.participants || [],
      topics: frontmatter.topics || [],
      createdAt: frontmatter.createdAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * List all conversation summaries for a channel
 *
 * @param channelId - Slack channel ID
 * @returns Array of conversation summaries
 */
export async function listConversationsByChannel(
  channelId: string
): Promise<ConversationSummary[]> {
  try {
    const entries = await readdir(CONVERSATIONS_DIR, { withFileTypes: true });
    const channelFiles = entries.filter(
      (e) => e.isFile() && e.name.startsWith(`${channelId}_`) && e.name.endsWith('.md')
    );

    const summaries: ConversationSummary[] = [];

    for (const file of channelFiles) {
      const filepath = join(CONVERSATIONS_DIR, file.name);
      try {
        const content = await readFile(filepath, 'utf-8');
        const { data: frontmatter, content: body } = matter(content);

        summaries.push({
          channelId: frontmatter.channelId || channelId,
          threadTs: frontmatter.threadTs || '',
          summary: body,
          participants: frontmatter.participants || [],
          topics: frontmatter.topics || [],
          createdAt: frontmatter.createdAt || new Date().toISOString(),
        });
      } catch {
        // Skip invalid files
      }
    }

    return summaries;
  } catch {
    return [];
  }
}

