/**
 * User Preferences Tests
 *
 * Tests for user preference storage and retrieval.
 *
 * @see Story 2.8 - File-Based Memory
 * @see AC#3 - User preferences stored in orion-context/user-preferences/
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  readdir: vi.fn().mockResolvedValue([]),
}));

describe('memory/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('UserPreference interface', () => {
    it('should support theme preference', async () => {
      type UP = import('./preferences.js').UserPreference;

      const pref: UP = {
        userId: 'U123',
        preferences: {
          theme: 'dark',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(pref.preferences.theme).toBe('dark');
    });

    it('should support formatting preference', async () => {
      type UP = import('./preferences.js').UserPreference;

      const pref: UP = {
        userId: 'U123',
        preferences: {
          formatting: 'bullet-points',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(pref.preferences.formatting).toBe('bullet-points');
    });

    it('should support communication style preference', async () => {
      type UP = import('./preferences.js').UserPreference;

      const pref: UP = {
        userId: 'U123',
        preferences: {
          communicationStyle: 'concise',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(pref.preferences.communicationStyle).toBe('concise');
    });

    it('should support custom key-value preferences', async () => {
      type UP = import('./preferences.js').UserPreference;

      const pref: UP = {
        userId: 'U123',
        preferences: {
          customField: 'customValue',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(pref.preferences.customField).toBe('customValue');
    });
  });

  describe('saveUserPreference', () => {
    it('should save preference to user-preferences directory (AC#3)', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveUserPreference } = await import('./preferences.js');

      await saveUserPreference('U123', { theme: 'dark' });

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('user-preferences'),
        expect.any(String)
      );
    });

    it('should use userId as filename', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveUserPreference } = await import('./preferences.js');

      await saveUserPreference('U456', { formatting: 'bullet-points' });

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('U456.yaml'),
        expect.any(String)
      );
    });

    it('should preserve existing preferences when updating', async () => {
      const { readFile, writeFile } = await import('fs/promises');
      const { saveUserPreference } = await import('./preferences.js');

      // Mock existing preferences
      vi.mocked(readFile).mockResolvedValue(`userId: U123
preferences:
  theme: dark
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
`);

      await saveUserPreference('U123', { formatting: 'bullet-points' });

      // Should merge with existing preferences
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain('theme');
      expect(writtenContent).toContain('formatting');
    });

    it('should update the updatedAt timestamp', async () => {
      const { writeFile } = await import('fs/promises');
      const { saveUserPreference } = await import('./preferences.js');

      const before = new Date().toISOString();
      await saveUserPreference('U123', { theme: 'light' });

      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain('updatedAt');
    });
  });

  describe('loadUserPreference', () => {
    it('should load preference from user-preferences directory', async () => {
      const { readFile } = await import('fs/promises');
      const { loadUserPreference } = await import('./preferences.js');

      vi.mocked(readFile).mockResolvedValue(`userId: U123
preferences:
  theme: dark
  formatting: bullet-points
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
`);

      const pref = await loadUserPreference('U123');

      expect(pref).not.toBeNull();
      expect(pref?.preferences.theme).toBe('dark');
      expect(pref?.preferences.formatting).toBe('bullet-points');
    });

    it('should return null when user has no preferences', async () => {
      const { readFile } = await import('fs/promises');
      const { loadUserPreference } = await import('./preferences.js');

      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const pref = await loadUserPreference('U999');

      expect(pref).toBeNull();
    });
  });

  describe('getUserPreferenceValue', () => {
    it('should return specific preference value', async () => {
      const { readFile } = await import('fs/promises');
      const { getUserPreferenceValue } = await import('./preferences.js');

      vi.mocked(readFile).mockResolvedValue(`userId: U123
preferences:
  theme: dark
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
`);

      const theme = await getUserPreferenceValue('U123', 'theme');

      expect(theme).toBe('dark');
    });

    it('should return undefined for missing preference', async () => {
      const { readFile } = await import('fs/promises');
      const { getUserPreferenceValue } = await import('./preferences.js');

      vi.mocked(readFile).mockResolvedValue(`userId: U123
preferences:
  theme: dark
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-01T00:00:00.000Z
`);

      const missing = await getUserPreferenceValue('U123', 'nonexistent');

      expect(missing).toBeUndefined();
    });

    it('should return undefined when user has no preferences file', async () => {
      const { readFile } = await import('fs/promises');
      const { getUserPreferenceValue } = await import('./preferences.js');

      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const value = await getUserPreferenceValue('U999', 'theme');

      expect(value).toBeUndefined();
    });
  });

  describe('getPreferencePath', () => {
    it('should return path in user-preferences directory', async () => {
      const { getPreferencePath } = await import('./preferences.js');

      const path = getPreferencePath('U123');

      expect(path).toContain('user-preferences');
      expect(path).toContain('U123');
      expect(path).toMatch(/\.yaml$/);
    });
  });
});

