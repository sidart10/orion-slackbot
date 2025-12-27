/**
 * Conversation Summaries Module
 *
 * Handles storage and retrieval of thread conversation summaries.
 *
 * ## Storage Backend
 * - **Vercel Production**: Uses Vercel KV (Redis) for persistence across function invocations
 * - **Local Development**: Uses Markdown files in orion-context/conversations/
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#4 - Conversation summaries stored in orion-context/conversations/
 * @see Task 11: Migrate Conversations to Vercel KV
 */

import { mkdir, readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import matter from 'gray-matter';
import { ORION_CONTEXT_ROOT } from './index.js';
import { logger } from '../utils/logger.js';
import { saveToKV, loadFromKV, listKVKeys } from './vercel-kv-storage.js';

/**
 * Check if running on Vercel (production)
 * Vercel KV requires KV_REST_API_URL to be set
 */
function isVercelKVAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

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
 * Build the KV key for a conversation
 */
function buildConversationKey(channelId: string, threadTs: string): string {
  return `${channelId}_${threadTs}`;
}

/**
 * Save a conversation summary
 *
 * Uses Vercel KV on production, file-based storage locally.
 *
 * @param summary - Conversation summary to save
 */
export async function saveConversationSummary(summary: ConversationSummary): Promise<void> {
  if (isVercelKVAvailable()) {
    return saveConversationToKV(summary);
  }
  return saveConversationToFile(summary);
}

/**
 * Save conversation summary to Vercel KV
 */
async function saveConversationToKV(summary: ConversationSummary): Promise<void> {
  const key = buildConversationKey(summary.channelId, summary.threadTs);

  await saveToKV('conversation', key, summary);

  logger.info({
    event: 'conversation_summary_saved',
    channelId: summary.channelId,
    threadTs: summary.threadTs,
    topicsCount: summary.topics.length,
    participantsCount: summary.participants.length,
    storage: 'vercel-kv',
  });
}

/**
 * Save conversation summary to file (local development)
 */
async function saveConversationToFile(summary: ConversationSummary): Promise<void> {
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
 * Uses Vercel KV on production, file-based storage locally.
 *
 * @param channelId - Slack channel ID
 * @param threadTs - Thread timestamp
 * @returns Conversation summary or null if not found
 */
export async function loadConversationSummary(
  channelId: string,
  threadTs: string
): Promise<ConversationSummary | null> {
  if (isVercelKVAvailable()) {
    return loadConversationFromKV(channelId, threadTs);
  }
  return loadConversationFromFile(channelId, threadTs);
}

/**
 * Load conversation summary from Vercel KV
 */
async function loadConversationFromKV(
  channelId: string,
  threadTs: string
): Promise<ConversationSummary | null> {
  const key = buildConversationKey(channelId, threadTs);
  const result = await loadFromKV<ConversationSummary>('conversation', key);

  if (!result) return null;

  return {
    channelId: result.data.channelId || channelId,
    threadTs: result.data.threadTs || threadTs,
    summary: result.data.summary,
    participants: result.data.participants || [],
    topics: result.data.topics || [],
    createdAt: result.createdAt,
  };
}

/**
 * Load conversation summary from file (local development)
 */
async function loadConversationFromFile(
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
 * Uses Vercel KV on production, file-based storage locally.
 *
 * @param channelId - Slack channel ID
 * @returns Array of conversation summaries
 */
export async function listConversationsByChannel(
  channelId: string
): Promise<ConversationSummary[]> {
  if (isVercelKVAvailable()) {
    return listConversationsFromKV(channelId);
  }
  return listConversationsFromFile(channelId);
}

/**
 * List conversations from Vercel KV
 */
async function listConversationsFromKV(channelId: string): Promise<ConversationSummary[]> {
  // List keys with channel prefix
  const keys = await listKVKeys('conversation', `${channelId}_`);

  const summaries: ConversationSummary[] = [];

  for (const key of keys) {
    // Parse channelId and threadTs from key
    const parts = key.split('_');
    const threadTs = parts.slice(1).join('_'); // Handle timestamps with underscores

    const result = await loadFromKV<ConversationSummary>('conversation', key);
    if (result) {
      summaries.push({
        channelId: result.data.channelId || channelId,
        threadTs: result.data.threadTs || threadTs,
        summary: result.data.summary,
        participants: result.data.participants || [],
        topics: result.data.topics || [],
        createdAt: result.createdAt,
      });
    }
  }

  return summaries;
}

/**
 * List conversations from file (local development)
 */
async function listConversationsFromFile(channelId: string): Promise<ConversationSummary[]> {
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

