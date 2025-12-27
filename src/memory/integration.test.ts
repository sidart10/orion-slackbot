/**
 * Memory Integration Tests
 *
 * Verification tests for the memory system - validates module exports and types.
 * Unit tests in individual modules verify the actual behavior.
 *
 * @see Story 2.8 - File-Based Memory
 * @see Task 7: Verification - Validates all acceptance criteria
 */

import { describe, it, expect, vi } from 'vitest';

// Mock fs/promises - each module uses its own mock
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  readdir: vi.fn().mockResolvedValue([]),
}));

describe('Memory Module Exports (Task 7 Verification)', () => {
  describe('Core Memory Module (AC#1, AC#2)', () => {
    it('should export MemoryType enum', async () => {
      const { MemoryType } = await import('./index.js');
      expect(MemoryType.CONVERSATION).toBe('conversation');
      expect(MemoryType.PREFERENCE).toBe('preference');
      expect(MemoryType.KNOWLEDGE).toBe('knowledge');
    });

    it('should export saveMemory function', async () => {
      const { saveMemory } = await import('./index.js');
      expect(typeof saveMemory).toBe('function');
    });

    it('should export searchMemory function', async () => {
      const { searchMemory } = await import('./index.js');
      expect(typeof searchMemory).toBe('function');
    });

    it('should export ORION_CONTEXT_ROOT constant', async () => {
      const { ORION_CONTEXT_ROOT } = await import('./index.js');
      expect(ORION_CONTEXT_ROOT).toBe('./orion-context');
    });

    it('should export getMemoryPath function', async () => {
      const { getMemoryPath } = await import('./index.js');
      expect(typeof getMemoryPath).toBe('function');
    });
  });

  describe('Storage Module', () => {
    it('should export TYPE_DIRECTORIES mapping', async () => {
      const { TYPE_DIRECTORIES } = await import('./storage.js');
      expect(TYPE_DIRECTORIES.conversation).toBe('conversations');
      expect(TYPE_DIRECTORIES.preference).toBe('user-preferences');
      expect(TYPE_DIRECTORIES.knowledge).toBe('knowledge');
    });

    it('should export getTypeDirectory function', async () => {
      const { getTypeDirectory } = await import('./storage.js');
      expect(typeof getTypeDirectory).toBe('function');
    });

    it('should export listMemoryFiles function', async () => {
      const { listMemoryFiles } = await import('./storage.js');
      expect(typeof listMemoryFiles).toBe('function');
    });

    it('should export parseMemoryFile function', async () => {
      const { parseMemoryFile } = await import('./storage.js');
      expect(typeof parseMemoryFile).toBe('function');
    });

    it('should export writeMemoryFile function', async () => {
      const { writeMemoryFile } = await import('./storage.js');
      expect(typeof writeMemoryFile).toBe('function');
    });

    it('should export readMemoryFile function', async () => {
      const { readMemoryFile } = await import('./storage.js');
      expect(typeof readMemoryFile).toBe('function');
    });

    it('should export generateMemoryFilename function', async () => {
      const { generateMemoryFilename } = await import('./storage.js');
      expect(typeof generateMemoryFilename).toBe('function');
    });
  });

  describe('Preferences Module (AC#3)', () => {
    it('should export saveUserPreference function', async () => {
      const { saveUserPreference } = await import('./preferences.js');
      expect(typeof saveUserPreference).toBe('function');
    });

    it('should export loadUserPreference function', async () => {
      const { loadUserPreference } = await import('./preferences.js');
      expect(typeof loadUserPreference).toBe('function');
    });

    it('should export getUserPreferenceValue function', async () => {
      const { getUserPreferenceValue } = await import('./preferences.js');
      expect(typeof getUserPreferenceValue).toBe('function');
    });

    it('should export getPreferencePath function', async () => {
      const { getPreferencePath } = await import('./preferences.js');
      expect(typeof getPreferencePath).toBe('function');
    });

    it('should generate paths in user-preferences directory', async () => {
      const { getPreferencePath } = await import('./preferences.js');
      const path = getPreferencePath('U123');
      expect(path).toMatch(/user-preferences/);
      expect(path).toMatch(/U123\.yaml$/);
    });
  });

  describe('Conversations Module (AC#4)', () => {
    it('should export saveConversationSummary function', async () => {
      const { saveConversationSummary } = await import('./conversations.js');
      expect(typeof saveConversationSummary).toBe('function');
    });

    it('should export loadConversationSummary function', async () => {
      const { loadConversationSummary } = await import('./conversations.js');
      expect(typeof loadConversationSummary).toBe('function');
    });

    it('should export listConversationsByChannel function', async () => {
      const { listConversationsByChannel } = await import('./conversations.js');
      expect(typeof listConversationsByChannel).toBe('function');
    });

    it('should export getConversationPath function', async () => {
      const { getConversationPath } = await import('./conversations.js');
      expect(typeof getConversationPath).toBe('function');
    });

    it('should generate paths in conversations directory', async () => {
      const { getConversationPath } = await import('./conversations.js');
      const path = getConversationPath('C123', '1702848000.123456');
      expect(path).toMatch(/conversations/);
      expect(path).toMatch(/C123_1702848000\.123456\.md$/);
    });
  });

  describe('Knowledge Module (AC#5)', () => {
    it('should export saveKnowledge function', async () => {
      const { saveKnowledge } = await import('./knowledge.js');
      expect(typeof saveKnowledge).toBe('function');
    });

    it('should export loadKnowledge function', async () => {
      const { loadKnowledge } = await import('./knowledge.js');
      expect(typeof loadKnowledge).toBe('function');
    });

    it('should export listKnowledge function', async () => {
      const { listKnowledge } = await import('./knowledge.js');
      expect(typeof listKnowledge).toBe('function');
    });

    it('should export searchKnowledge function', async () => {
      const { searchKnowledge } = await import('./knowledge.js');
      expect(typeof searchKnowledge).toBe('function');
    });

    it('should export getKnowledgePath function', async () => {
      const { getKnowledgePath } = await import('./knowledge.js');
      expect(typeof getKnowledgePath).toBe('function');
    });

    it('should generate paths in knowledge directory', async () => {
      const { getKnowledgePath } = await import('./knowledge.js');
      const path = getKnowledgePath('test-doc');
      expect(path).toMatch(/knowledge/);
      expect(path).toMatch(/test-doc\.md$/);
    });
  });

  describe('Directory Structure Verification', () => {
    it('AC#1: orion-context/ is the root directory', async () => {
      const { ORION_CONTEXT_ROOT } = await import('./index.js');
      expect(ORION_CONTEXT_ROOT).toBe('./orion-context');
    });

    it('AC#3: user-preferences/ is the preference directory', async () => {
      const { TYPE_DIRECTORIES } = await import('./storage.js');
      expect(TYPE_DIRECTORIES.preference).toBe('user-preferences');
    });

    it('AC#4: conversations/ is the conversation directory', async () => {
      const { TYPE_DIRECTORIES } = await import('./storage.js');
      expect(TYPE_DIRECTORIES.conversation).toBe('conversations');
    });

    it('AC#5: knowledge/ is the knowledge directory', async () => {
      const { TYPE_DIRECTORIES } = await import('./storage.js');
      expect(TYPE_DIRECTORIES.knowledge).toBe('knowledge');
    });
  });

  describe('Memory Type to Path Mapping', () => {
    it('should map PREFERENCE to user-preferences directory', async () => {
      const { MemoryType, getMemoryPath } = await import('./index.js');
      const memory = {
        type: MemoryType.PREFERENCE,
        key: 'U123',
        content: '{}',
        metadata: { createdAt: '2025-01-01T00:00:00.000Z', userId: 'U123' },
      };
      const path = getMemoryPath(memory);
      expect(path).toContain('user-preferences');
      expect(path).toMatch(/\.yaml$/);
    });

    it('should map CONVERSATION to conversations directory', async () => {
      const { MemoryType, getMemoryPath } = await import('./index.js');
      const memory = {
        type: MemoryType.CONVERSATION,
        key: 'C123_1702848000',
        content: 'summary',
        metadata: { createdAt: '2025-01-01T00:00:00.000Z', channelId: 'C123' },
      };
      const path = getMemoryPath(memory);
      expect(path).toContain('conversations');
      expect(path).toMatch(/\.md$/);
    });

    it('should map KNOWLEDGE to knowledge directory', async () => {
      const { MemoryType, getMemoryPath } = await import('./index.js');
      const memory = {
        type: MemoryType.KNOWLEDGE,
        key: 'test-doc',
        content: 'content',
        metadata: { createdAt: '2025-01-01T00:00:00.000Z' },
      };
      const path = getMemoryPath(memory);
      expect(path).toContain('knowledge');
      expect(path).toMatch(/\.md$/);
    });
  });
});

