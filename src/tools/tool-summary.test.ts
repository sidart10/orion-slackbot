/**
 * Unit tests for Tool Summary Formatter Module.
 *
 * @see Story 8.5 - Tool Call Summary & Sandbox Output Cleanup
 * @see AC#6 - Test coverage for filtering
 */

import { describe, it, expect } from 'vitest';
import {
  formatToolSummary,
  getActionVerb,
  inferActionFromToolName,
  formatToolName,
  type ToolAction,
} from './tool-summary.js';

describe('tool-summary', () => {
  describe('getActionVerb', () => {
    it('should return correct verbs for all action types', () => {
      expect(getActionVerb('search')).toBe('Searching');
      expect(getActionVerb('call')).toBe('Calling');
      expect(getActionVerb('execute')).toBe('Executing');
      expect(getActionVerb('analyze')).toBe('Analyzing');
      expect(getActionVerb('generate')).toBe('Generating');
      expect(getActionVerb('fetch')).toBe('Fetching');
    });

    it('should capitalize unknown action types', () => {
      expect(getActionVerb('process' as ToolAction)).toBe('Process');
      expect(getActionVerb('validate' as ToolAction)).toBe('Validate');
    });

    it('should handle empty string gracefully', () => {
      expect(getActionVerb('' as ToolAction)).toBe('Using');
    });
  });

  describe('inferActionFromToolName', () => {
    it('should infer search action', () => {
      expect(inferActionFromToolName('search_reports')).toBe('search');
      expect(inferActionFromToolName('query_database')).toBe('search');
      expect(inferActionFromToolName('find_user')).toBe('search');
    });

    it('should infer fetch action', () => {
      expect(inferActionFromToolName('get_user_data')).toBe('fetch');
      expect(inferActionFromToolName('fetch_records')).toBe('fetch');
      expect(inferActionFromToolName('retrieve_document')).toBe('fetch');
      expect(inferActionFromToolName('list_items')).toBe('fetch');
    });

    it('should infer generate action', () => {
      expect(inferActionFromToolName('generate_report')).toBe('generate');
      expect(inferActionFromToolName('create_file')).toBe('generate');
      expect(inferActionFromToolName('build_summary')).toBe('generate');
    });

    it('should infer analyze action', () => {
      expect(inferActionFromToolName('analyze_data')).toBe('analyze');
      expect(inferActionFromToolName('process_input')).toBe('analyze');
      expect(inferActionFromToolName('parse_document')).toBe('analyze');
    });

    it('should infer execute action', () => {
      expect(inferActionFromToolName('execute_code')).toBe('execute');
      expect(inferActionFromToolName('run_script')).toBe('execute');
      expect(inferActionFromToolName('code_runner')).toBe('execute');
    });

    it('should default to call for unknown patterns', () => {
      expect(inferActionFromToolName('some_api_tool')).toBe('call');
      expect(inferActionFromToolName('random_tool')).toBe('call');
    });
  });

  describe('formatToolName', () => {
    it('should format MCP tool names (server__tool)', () => {
      expect(formatToolName('msci-reports__search_reports')).toBe('Msci Reports: Search Reports');
      expect(formatToolName('google__calendar')).toBe('Google: Calendar');
    });

    it('should format snake_case tool names', () => {
      expect(formatToolName('search_user_data')).toBe('Search User Data');
      expect(formatToolName('get_report')).toBe('Get Report');
    });

    it('should format kebab-case tool names', () => {
      expect(formatToolName('search-reports')).toBe('Search Reports');
      expect(formatToolName('user-lookup')).toBe('User Lookup');
    });

    it('should handle single word', () => {
      expect(formatToolName('search')).toBe('Search');
      expect(formatToolName('calendar')).toBe('Calendar');
    });
  });

  describe('formatToolSummary', () => {
    describe('with context', () => {
      it('should format search action with context', () => {
        const result = formatToolSummary({
          toolName: 'MSCI Reports',
          action: 'search',
          context: 'Hulu Q3 revenue',
        });
        expect(result).toBe('Searching MSCI Reports - "Hulu Q3 revenue"');
      });

      it('should format call action with context', () => {
        const result = formatToolSummary({
          toolName: 'Audience Manager',
          action: 'call',
          context: 'segment ID 12345',
        });
        expect(result).toBe('Calling Audience Manager - "segment ID 12345"');
      });

      it('should format execute action with context', () => {
        const result = formatToolSummary({
          toolName: 'code',
          action: 'execute',
          context: 'generating Excel report',
        });
        expect(result).toBe('Executing code - "generating Excel report"');
      });

      it('should format analyze action with context', () => {
        const result = formatToolSummary({
          toolName: 'document',
          action: 'analyze',
          context: 'Q4 financial summary.pdf',
        });
        expect(result).toBe('Analyzing document - "Q4 financial summary.pdf"');
      });
    });

    describe('without context', () => {
      it('should format without context', () => {
        const result = formatToolSummary({
          toolName: 'Confluence',
          action: 'search',
        });
        expect(result).toBe('Searching Confluence');
      });

      it('should handle empty context string', () => {
        const result = formatToolSummary({
          toolName: 'API',
          action: 'call',
          context: '',
        });
        expect(result).toBe('Calling API');
      });

      it('should handle whitespace-only context', () => {
        const result = formatToolSummary({
          toolName: 'API',
          action: 'call',
          context: '   ',
        });
        expect(result).toBe('Calling API');
      });
    });

    describe('context truncation', () => {
      it('should truncate long context with default max length', () => {
        const longContext = 'This is a very long context string that should be truncated because it exceeds the maximum length';
        const result = formatToolSummary({
          toolName: 'Search',
          action: 'search',
          context: longContext,
        });
        expect(result).toContain('...');
        expect(result.length).toBeLessThan(`Searching Search - "${longContext}"`.length);
      });

      it('should respect custom maxContextLength', () => {
        const result = formatToolSummary({
          toolName: 'Search',
          action: 'search',
          context: 'Short context here',
          maxContextLength: 10,
        });
        expect(result).toBe('Searching Search - "Short cont..."');
      });

      it('should not truncate short context', () => {
        const result = formatToolSummary({
          toolName: 'Search',
          action: 'search',
          context: 'Short',
          maxContextLength: 40,
        });
        expect(result).toBe('Searching Search - "Short"');
        expect(result).not.toContain('...');
      });
    });

    describe('all action types', () => {
      const actions: ToolAction[] = ['search', 'call', 'execute', 'analyze', 'generate', 'fetch'];

      for (const action of actions) {
        it(`should format ${action} action`, () => {
          const result = formatToolSummary({
            toolName: 'TestTool',
            action,
            context: 'test query',
          });
          expect(result).toContain(' TestTool - "test query"');
          // First character should be uppercase (verb)
          expect(result[0]).toBe(result[0]?.toUpperCase());
        });
      }
    });

    describe('special characters in context', () => {
      it('should handle quotes in context', () => {
        const result = formatToolSummary({
          toolName: 'Search',
          action: 'search',
          context: 'query with "quotes"',
        });
        expect(result).toContain('query with "quotes"');
      });

      it('should handle newlines in context by preserving them', () => {
        const result = formatToolSummary({
          toolName: 'Search',
          action: 'search',
          context: 'line1\nline2',
        });
        expect(result).toContain('line1\nline2');
      });

      it('should handle special characters', () => {
        const result = formatToolSummary({
          toolName: 'Search',
          action: 'search',
          context: 'query & params = value',
        });
        expect(result).toContain('query & params = value');
      });
    });
  });
});
