/**
 * Tests for parseConversationTarget utility.
 *
 * @see Story 7.6 - Conversation Summarization
 * @see AC#2 - Identify Conversation Target
 */

import { describe, it, expect } from 'vitest';
import { parseConversationTarget } from './parse-conversation-target.js';

describe('parseConversationTarget', () => {
  const CURRENT_CHANNEL = 'C123CURRENT';

  describe('AC2: Identify conversation target', () => {
    it('parses channel mention <#C123|channel-name>', () => {
      const result = parseConversationTarget(
        'Summarize <#C456ABC|sales-enablement-hub> for the past week',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe('C456ABC');
      expect(result.channelName).toBe('sales-enablement-hub');
      expect(result.type).toBe('public_channel');
    });

    it('parses "this channel" → current conversation', () => {
      const result = parseConversationTarget(
        'Summarize this channel',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe(CURRENT_CHANNEL);
      expect(result.type).toBe('current');
    });

    it('parses "this chat" → current conversation', () => {
      const result = parseConversationTarget(
        'What happened in this chat?',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe(CURRENT_CHANNEL);
      expect(result.type).toBe('current');
    });

    it('parses "this group" → current conversation', () => {
      const result = parseConversationTarget(
        'Summarize this group',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe(CURRENT_CHANNEL);
      expect(result.type).toBe('current');
    });

    it('parses "here" → current conversation', () => {
      const result = parseConversationTarget(
        'What happened here today?',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe(CURRENT_CHANNEL);
      expect(result.type).toBe('current');
    });

    it('parses "my DM with [name]" as IM type (requires lookup)', () => {
      const result = parseConversationTarget(
        'Summarize my DM with John',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe(''); // Empty - needs resolution
      expect(result.channelName).toBe('John');
      expect(result.type).toBe('im');
    });

    it('parses "DM with [name]" (without "my")', () => {
      const result = parseConversationTarget(
        'Summarize DM with Sarah',
        CURRENT_CHANNEL
      );
      expect(result.channelName).toBe('Sarah');
      expect(result.type).toBe('im');
    });

    it('defaults to current conversation when no target specified', () => {
      const result = parseConversationTarget(
        'Summarize the past week',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe(CURRENT_CHANNEL);
      expect(result.type).toBe('current');
    });

    it('is case-insensitive for keywords', () => {
      const result = parseConversationTarget(
        'Summarize THIS CHANNEL',
        CURRENT_CHANNEL
      );
      expect(result.channelId).toBe(CURRENT_CHANNEL);
      expect(result.type).toBe('current');
    });
  });
});

