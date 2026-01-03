/**
 * Tests for dynamic status messages helper (FR47).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see Story 7.3 - Contextual Tool Feedback
 * @see FR47 - Dynamic status messages via setStatus({ loading_messages: [...] })
 */

import { describe, it, expect } from 'vitest';

import { buildLoadingMessages } from './status-messages.js';

describe('buildLoadingMessages', () => {
  describe('legacy API (backwards compatibility)', () => {
    it('should return a default rotating list', () => {
      const msgs = buildLoadingMessages();
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      expect(msgs[0]).toContain('…');
    });

    it('should handle toolName only (legacy)', () => {
      const msgs = buildLoadingMessages({ toolName: 'some_tool' });
      expect(msgs[0]).toContain('…');
    });
  });

  describe('Story 7.3: Phase-based messages (AC5)', () => {
    it('should return gather phase message', () => {
      const msgs = buildLoadingMessages({ phase: 'gather' });
      expect(msgs[0]).toBe('Gathering context…');
    });

    it('should return act phase message', () => {
      const msgs = buildLoadingMessages({ phase: 'act' });
      expect(msgs[0]).toBe('Working on your request…');
    });

    it('should return verify phase message', () => {
      const msgs = buildLoadingMessages({ phase: 'verify' });
      expect(msgs[0]).toBe('Checking results…');
    });

    it('should return nothing for final phase', () => {
      const msgs = buildLoadingMessages({ phase: 'final' });
      expect(msgs.length).toBe(0);
    });
  });

  describe('Story 7.3: Tool with query (AC1, AC2)', () => {
    it('should format MCP tool with query', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'msci-reports__search_reports',
        toolInput: { query: 'Hulu' },
      });
      expect(msgs[0]).toBe('Using Msci Reports: Search Reports — "Hulu"…');
    });

    it('should format tool without query (action only)', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'jira__get_issue',
        toolInput: {},
      });
      expect(msgs[0]).toBe('Using Jira: Get Issue…');
    });

    it('should truncate long queries', () => {
      const longQuery = 'a'.repeat(100);
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'rube__search',
        toolInput: { query: longQuery },
      });
      // summarizeToolInput truncates at 60 chars
      expect(msgs[0]).toContain('…');
      expect(msgs[0].length).toBeLessThan(150);
    });

    it('should handle unknown server name', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'newserver__action',
        toolInput: { query: 'test' },
      });
      expect(msgs[0]).toBe('Using Newserver: Action — "test"…');
    });

    it('should handle static tools (no server prefix)', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'memory_recall',
        toolInput: { query: 'user prefs' },
      });
      expect(msgs[0]).toBe('Using Memory Recall — "user prefs"…');
    });
  });

  describe('Story 7.3: Multi-tool parallel display (AC4)', () => {
    it('should show all tools when multiple execute in parallel', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        allTools: [
          { name: 'rube__search', input: { query: 'SF restaurants' } },
          { name: 'google__calendar', input: {} },
          { name: 'jira__list_issues', input: { filter: 'PROJ' } },
        ],
      });
      // Format: action1 + action2 + action3...
      expect(msgs[0]).toContain('+');
      expect(msgs[0]).toContain('Search');
      expect(msgs[0]).toContain('Calendar');
      expect(msgs[0]).toContain('List Issues');
    });

    it('should use first tool when only one provided', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'rube__search',
        toolInput: { query: 'test' },
        allTools: [{ name: 'rube__search', input: { query: 'test' } }],
      });
      // Single tool = full format, not multi-tool format
      expect(msgs[0]).toBe('Using Rube: Search — "test"…');
    });
  });

  describe('edge cases', () => {
    it('should fallback to generic message when no phase', () => {
      const msgs = buildLoadingMessages({ toolName: 'some_tool' });
      expect(msgs[0]).toBe('Working on your request…');
    });

    it('should handle null toolInput', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'test__action',
        toolInput: undefined,
      });
      expect(msgs[0]).toBe('Using Test: Action…');
    });
  });
});
