/**
 * Tests for dynamic status messages helper (FR47).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see Story 7.3 - Contextual Tool Feedback
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup (AC3)
 * @see FR47 - Dynamic status messages via setStatus({ loading_messages: [...] })
 */

import { describe, it, expect } from 'vitest';

import { buildLoadingMessages } from '@/slack/status-messages.js';

describe('buildLoadingMessages', () => {
  describe('legacy API (backwards compatibility)', () => {
    it('should return a default rotating list', () => {
      const msgs = buildLoadingMessages();
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      // Either has ellipsis (legacy) or follows new format
      expect(msgs[0]?.length).toBeGreaterThan(0);
    });

    it('should handle toolName only (legacy)', () => {
      const msgs = buildLoadingMessages({ toolName: 'some_tool' });
      // Returns generic message
      expect(msgs[0]).toBe('Working on your request…');
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

  /**
   * Story 7.3 + Story 8.5: Tool with query (AC1, AC2, AC3)
   *
   * Story 8.5 changes format from "Using X" to "{Action} X - "{context}""
   * Action is inferred from tool name (search, fetch, call, etc.)
   */
  describe('Story 7.3 + 8.5: Tool with query (AC1, AC2, AC3)', () => {
    it('should format MCP search tool with query', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'msci-reports__search_reports',
        toolInput: { query: 'Hulu' },
      });
      // Story 8.5: Uses inferred action verb based on tool name
      // search_reports -> action: 'search' -> 'Searching'
      expect(msgs[0]).toBe('Searching Msci Reports: Search Reports - "Hulu"');
    });

    it('should format fetch tool without query', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'jira__get_issue',
        toolInput: {},
      });
      // get_issue -> action: 'fetch' -> 'Fetching'
      expect(msgs[0]).toBe('Fetching Jira: Get Issue');
    });

    it('should truncate long queries', () => {
      const longQuery = 'a'.repeat(100);
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'rube__search',
        toolInput: { query: longQuery },
      });
      // Story 8.5: Uses maxContextLength: 50 in buildSingleToolMessage
      expect(msgs[0]).toContain('...');
      expect(msgs[0].length).toBeLessThan(150);
    });

    it('should handle unknown server name', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'newserver__action',
        toolInput: { query: 'test' },
      });
      // action -> defaults to 'call' -> 'Calling'
      expect(msgs[0]).toBe('Calling Newserver: Action - "test"');
    });

    it('should handle static tools (no server prefix)', () => {
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'memory_recall',
        toolInput: { query: 'user prefs' },
      });
      // memory_recall has no keyword match -> defaults to 'call' -> 'Calling'
      expect(msgs[0]).toBe('Calling Memory Recall - "user prefs"');
    });
  });

  describe('Story 7.3 + 8.5: Multi-tool parallel display (AC4)', () => {
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
      // Single tool = full format with action verb (Story 8.5)
      expect(msgs[0]).toBe('Searching Rube: Search - "test"');
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
      // Story 8.5: action -> defaults to 'call' -> 'Calling', no context
      expect(msgs[0]).toBe('Calling Test: Action');
    });
  });

  /**
   * Story 6.3 + 8.5: PTC status messages
   *
   * Tests for Programmatic Tool Calling (PTC) status message.
   * Story 8.5 changed PTC message format to use formatToolSummary:
   * 'Executing code - "running analysis"'
   *
   * @see Story 6.3 - Anthropic Managed Programmatic Tool Calling
   * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup (AC3)
   * @see AC#9 - Slack status updates for PTC
   */
  describe('Story 6.3 + 8.5: PTC status messages (AC9)', () => {
    // AC9: PTC status message for code_execution tool
    it('PTC: should return PTC status for code_execution tool (AC9)', () => {
      // Given: Tool phase with code_execution tool
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'code_execution',
      });

      // Then: Story 8.5 format: 'Executing code - "running analysis"'
      expect(msgs[0]).toBe('Executing code - "running analysis"');
    });

    // AC9: PTC mode input handling
    it('PTC: should handle PTC mode input (AC9)', () => {
      // Given: Tool phase with code_execution and programmatic_batch mode
      const msgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'code_execution',
        toolInput: { mode: 'programmatic_batch' },
      });

      // Then: Story 8.5 format: 'Executing code - "running analysis"'
      expect(msgs[0]).toBe('Executing code - "running analysis"');
    });

    // AC9: Differentiate from regular tool messages
    it('PTC: should differ from regular tool messages', () => {
      // Given: PTC tool vs regular tool
      const ptcMsgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'code_execution',
      });
      const regularMsgs = buildLoadingMessages({
        phase: 'tool',
        toolName: 'search__web',
      });

      // Then: Messages should be different
      expect(ptcMsgs[0]).not.toBe(regularMsgs[0]);
      // Story 8.5: PTC uses 'Executing code' format
      expect(ptcMsgs[0]).toContain('Executing');
      expect(ptcMsgs[0]).toContain('code');
    });
  });
});
