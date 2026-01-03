/**
 * Type Definitions for Conversation Summarization
 *
 * @see Story 7.6 - Conversation Summarization
 */

import type { WebClient } from '@slack/web-api';
import type { TimeRange } from './parse-time-range.js';

/**
 * Result of any summarization operation.
 * Uses ToolResult pattern — never throws.
 *
 * NOTE: Summarization does NOT return multiple "sources" — the messages being
 * summarized ARE the input, not external citations. We provide a single
 * sourceUrl so users can jump to the conversation/thread.
 */
export interface SummaryResult {
  summary: string;
  messageCount: number;
  type: 'thread' | 'channel' | 'mpim' | 'im' | 'public_channel' | 'private_channel';
  participants?: string[];
  timeRange?: TimeRange;
  truncated?: boolean;
  /** Slack permalink to the summarized conversation/thread (single link) */
  sourceUrl?: string;
}

export interface SummarizeParams {
  userMessage: string;
  currentChannelId: string;
  currentThreadTs?: string;
  messageTs: string;
  client: WebClient;
  traceId: string;
}

export interface SummarizeThreadParams {
  client: WebClient;
  channel: string;
  threadTs: string;
  traceId: string;
}

export interface SummarizeConversationParams {
  userMessage: string;
  currentChannelId: string;
  client: WebClient;
  traceId: string;
}

