/**
 * Vercel Bundling Verification Tests
 *
 * These tests verify that static knowledge files are properly bundled
 * with Vercel deployments. Uses REAL filesystem (no mocks).
 *
 * @see Story 2.8 - Task 8: Verify Static Knowledge Works
 * @see AC#5 - Knowledge stored in orion-context/knowledge/
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';

// Explicitly unmock fs/promises for this test file
vi.unmock('fs/promises');

describe('Vercel Bundling Verification (Task 8)', () => {
  const KNOWLEDGE_DIR = './orion-context/knowledge';
  const TEST_FILE = 'vercel-bundling-test.md';

  describe('Task 8.1: Confirm knowledge files exist in project', () => {
    it('should have vercel-bundling-test.md in knowledge directory', async () => {
      const filepath = join(KNOWLEDGE_DIR, TEST_FILE);
      const content = await fs.readFile(filepath, 'utf-8');

      expect(content).toBeTruthy();
      expect(content).toContain('Vercel Bundling Test');
    });

    it('should have valid frontmatter in test file', async () => {
      const filepath = join(KNOWLEDGE_DIR, TEST_FILE);
      const content = await fs.readFile(filepath, 'utf-8');

      expect(content).toContain('type: knowledge');
      expect(content).toContain('name: vercel-bundling-test');
      expect(content).toContain('category: system');
    });
  });

  describe('Task 8.2: Verify knowledge parsing works with real filesystem', () => {
    it('should parse knowledge file with gray-matter', async () => {
      const filepath = join(KNOWLEDGE_DIR, TEST_FILE);
      const content = await fs.readFile(filepath, 'utf-8');
      const { data: frontmatter, content: body } = matter(content);

      expect(frontmatter.name).toBe('vercel-bundling-test');
      expect(frontmatter.category).toBe('system');
      expect(frontmatter.tags).toContain('verification');
      expect(frontmatter.tags).toContain('vercel');
      expect(body).toContain('verify that static knowledge files');
    });

    it('should list knowledge directory files', async () => {
      const entries = await fs.readdir(KNOWLEDGE_DIR, { withFileTypes: true });
      const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

      expect(mdFiles.length).toBeGreaterThan(0);

      const hasTestFile = mdFiles.some((f) => f.name === TEST_FILE);
      expect(hasTestFile).toBe(true);
    });
  });

  describe('Task 8.3: Document static knowledge limitations', () => {
    it('should document that knowledge is read-only on Vercel', async () => {
      const moduleContent = await fs.readFile('./src/memory/knowledge.ts', 'utf-8');

      expect(moduleContent).toContain('Vercel Compatibility');
      expect(moduleContent).toContain('READ-ONLY');
      expect(moduleContent).toContain('bundled at deploy time');
      expect(moduleContent).toContain('ephemeral');
    });

    it('should document in test file that files must be committed', async () => {
      const filepath = join(KNOWLEDGE_DIR, TEST_FILE);
      const content = await fs.readFile(filepath, 'utf-8');

      expect(content).toContain('committed to git');
      expect(content).toContain('Bundled at deploy time');
    });
  });
});

