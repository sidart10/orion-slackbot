#!/usr/bin/env tsx
/**
 * Upload Custom Skills Script
 *
 * Uploads skills from .skills/ directory to Anthropic Skills API.
 * Can be run standalone or integrated into CI/CD pipelines.
 *
 * Usage:
 *   pnpm upload-skills              # Upload all skills
 *   pnpm upload-skills --skill foo  # Upload single skill
 *   pnpm upload-skills --dry-run    # Preview without uploading
 *   pnpm upload-skills --force      # Force re-upload all
 *   pnpm upload-skills --list       # List uploaded skills
 *
 * @see Story 6.9 - Upload Custom Skills Script
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';

// CRITICAL: Load dotenv BEFORE any imports that use environment.ts
import * as dotenv from 'dotenv';
dotenv.config();

import { SkillsApiClient } from '../src/skills/api-client.js';
import { hashSkillDirectory, loadSkillFiles } from '../src/skills/sync-service.js';
import { loadSkillMetadata } from '../src/skills/loader.js';
import { GKE_ONLY_SKILLS } from '../src/tools/orion-sandbox/allowed-skills.js';
import type { SkillCache, ApiSkill, SkillMetadata } from '../src/skills/types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_PATH = '.skills/.cache/skills.json';

/** Exit codes for CI/CD integration */
const EXIT_SUCCESS = 0;
const EXIT_PARTIAL_FAILURE = 1;
const EXIT_FATAL_ERROR = 2;

/** Skills that are built-in to Anthropic (don't upload) */
const SKIP_SKILLS = new Set(['xlsx', 'pdf', 'docx']);

/** Skills that require GKE sandbox - imported from allowed-skills.ts (single source of truth) */
const GKE_SKILLS_SET = new Set(GKE_ONLY_SKILLS);

/** Maximum concurrent uploads (rate limit friendly) */
const MAX_CONCURRENT_UPLOADS = 3;

// =============================================================================
// TYPES
// =============================================================================

export interface CliOptions {
  skill?: string;
  dryRun: boolean;
  force: boolean;
  list: boolean;
  verbose: boolean;
  help: boolean;
}

export interface UploadResults {
  uploaded: number;
  updated: number;
  cached: number;
  skipped: number;
  failed: number;
  skillIds: Record<string, string>;
}

// =============================================================================
// ARGUMENT PARSING (Task 1)
// =============================================================================

/**
 * Parse command line arguments.
 *
 * @returns Parsed CLI options
 * @see AC#1, AC#2, AC#3, AC#4, AC#5
 */
export function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    force: false,
    list: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--skill':
      case '-s':
        options.skill = args[++i];
        break;
      case '--dry-run':
      case '-n':
        options.dryRun = true;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--list':
      case '-l':
        options.list = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        // Positional argument as skill name
        if (!arg.startsWith('-')) {
          options.skill = arg;
        }
    }
  }

  return options;
}

// =============================================================================
// HELP OUTPUT
// =============================================================================

/**
 * Display help message.
 */
function showHelp(): void {
  console.log(`
Upload Custom Skills Script

Uploads skills from .skills/ directory to Anthropic Skills API.

Usage:
  pnpm upload-skills              Upload all skills
  pnpm upload-skills --skill foo  Upload single skill by name
  pnpm upload-skills --dry-run    Preview without uploading
  pnpm upload-skills --force      Force re-upload (ignore cache)
  pnpm upload-skills --list       List currently uploaded skills

Options:
  --skill, -s <name>   Upload only the specified skill
  --dry-run, -n        Show what would be uploaded without making API calls
  --force, -f          Force re-upload even if content hash matches cache
  --list, -l           List all skills currently uploaded to Anthropic
  --verbose, -v        Enable detailed logging
  --help, -h           Show this help message

Exit Codes:
  0   Success
  1   Partial failure (some skills failed)
  2   Fatal error (no skills uploaded or missing configuration)

Examples:
  pnpm upload-skills                     # Upload all custom skills
  pnpm upload-skills -s summarize        # Upload only 'summarize' skill
  pnpm upload-skills --dry-run --force   # Preview forced re-upload
  pnpm upload-skills --list              # Show uploaded skills
`);
}

// =============================================================================
// ENVIRONMENT VALIDATION (Task 2)
// =============================================================================

/**
 * Validate required environment variables.
 *
 * @throws Error if ANTHROPIC_API_KEY is missing
 * @see AC#8
 */
export function validateEnvironment(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
        'Set it in .env file or export it before running this script.'
    );
  }
}

// =============================================================================
// SKILL FILTERING
// =============================================================================

/**
 * Check if a skill should be skipped (Anthropic built-in).
 *
 * @param skillName - Name of the skill
 * @returns true if skill should be skipped
 */
export function shouldSkipSkill(skillName: string): boolean {
  return SKIP_SKILLS.has(skillName);
}

/**
 * Check if a skill should show a warning (GKE-only).
 * Uses GKE_ONLY_SKILLS from allowed-skills.ts (single source of truth).
 *
 * @param skillName - Name of the skill
 * @returns true if skill needs warning (requires GKE sandbox)
 * @see Story 6.12 - GKE Sandbox Scope Reduction
 */
export function shouldWarnSkill(skillName: string): boolean {
  return GKE_SKILLS_SET.has(skillName);
}

// =============================================================================
// CACHE MANAGEMENT (Task 5)
// =============================================================================

/**
 * Load skill cache from disk.
 *
 * @returns Cached skill data or empty cache
 * @see AC#9
 */
export async function loadCache(): Promise<SkillCache> {
  const cachePath = resolve(CACHE_PATH);

  if (!existsSync(cachePath)) {
    return { skills: {} };
  }

  try {
    const content = await readFile(cachePath, 'utf-8');
    return JSON.parse(content) as SkillCache;
  } catch {
    console.warn('[WARN] Cache corrupt, starting fresh');
    return { skills: {} };
  }
}

/**
 * Save skill cache to disk.
 *
 * @param cache - Cache data to persist
 * @see AC#9
 */
export async function saveCache(cache: SkillCache): Promise<void> {
  const cachePath = resolve(CACHE_PATH);
  const cacheDir = join(cachePath, '..');

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

// =============================================================================
// LIST SKILLS (Task 3)
// =============================================================================

/**
 * List all uploaded skills from Anthropic API.
 *
 * @param apiClient - Skills API client
 * @returns Array of uploaded skills
 * @see AC#5
 */
export async function listUploadedSkills(apiClient: SkillsApiClient): Promise<ApiSkill[]> {
  return apiClient.listSkills('custom');
}

/**
 * Format and display list of uploaded skills.
 *
 * @param skills - Array of skills to display
 * @see AC#5
 */
function displaySkillList(skills: ApiSkill[]): void {
  console.log('\n============================================================');
  console.log('                  UPLOADED SKILLS LIST');
  console.log('============================================================\n');

  if (skills.length === 0) {
    console.log('No skills uploaded to Anthropic yet.');
    console.log('\nRun `pnpm upload-skills` to upload skills from .skills/ directory.\n');
    return;
  }

  console.log(
    'Name                 | Skill ID                          | Version            | Type'
  );
  console.log(
    '---------------------|-----------------------------------|--------------------|---------'
  );

  const customCount = skills.filter((s) => s.source === 'custom').length;
  const anthropicCount = skills.filter((s) => s.source === 'anthropic').length;

  for (const skill of skills) {
    const name = skill.display_title.padEnd(20).slice(0, 20);
    const id = (skill.id.length > 33 ? skill.id.slice(0, 30) + '...' : skill.id).padEnd(33);
    const version = skill.latest_version.padEnd(18).slice(0, 18);
    const type = skill.source;

    console.log(`${name} | ${id} | ${version} | ${type}`);
  }

  console.log(`\nTotal: ${skills.length} skills (${customCount} custom, ${anthropicCount} built-in)\n`);
}

// =============================================================================
// UPLOAD LOGIC (Task 4)
// =============================================================================

/**
 * Upload a single skill to Anthropic.
 *
 * @param apiClient - Skills API client
 * @param skill - Skill metadata
 * @param options - CLI options
 * @param cache - Current cache (modified in place)
 * @returns Upload result with action taken and skill ID
 * @see AC#1, AC#2, AC#3, AC#4, AC#6, AC#7
 */
export async function uploadSkill(
  apiClient: SkillsApiClient,
  skill: SkillMetadata,
  options: CliOptions,
  cache: SkillCache
): Promise<{ action: 'uploaded' | 'updated' | 'cached' | 'skipped'; skillId: string; skillName: string }> {
  const { name, skillPath } = skill;

  // Compute content hash
  const contentHash = await hashSkillDirectory(skillPath);
  const cached = cache.skills[name];

  // Check if unchanged (unless --force)
  if (!options.force && cached && cached.contentHash === contentHash) {
    if (options.verbose) {
      console.log(`[CACHED] ${name} - content unchanged`);
    }
    return { action: 'cached', skillId: cached.skillId, skillName: name };
  }

  // Dry-run mode - don't make API calls
  if (options.dryRun) {
    const action = cached ? 'Would update' : 'Would upload';
    console.log(`[DRY RUN] ${action}: ${name}`);
    return { action: 'skipped', skillId: cached?.skillId ?? 'new', skillName: name };
  }

  // Load files for upload (use skillPath = directory path)
  const files = await loadSkillFiles(skillPath);

  // Determine if new skill or new version
  if (cached) {
    // Create new version
    try {
      const version = await apiClient.createSkillVersion(cached.skillId, files, name);

      // Update cache
      cache.skills[name] = {
        skillId: cached.skillId,
        latestVersion: version.version,
        contentHash,
        lastSynced: new Date().toISOString(),
      };

      if (options.verbose) {
        console.log(`[UPDATED] ${name} → ${cached.skillId} (version ${version.version})`);
      } else {
        console.log(`[UPDATED] ${name}`);
      }

      return { action: 'updated', skillId: cached.skillId, skillName: name };
    } catch (error) {
      // Skill may have been deleted from API - create new
      if (options.verbose) {
        console.warn(
          `[WARN] Failed to create version for ${name}, creating new skill: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // Fall through to create new skill
    }
  }

  // Create new skill
  const created = await apiClient.createSkill(name, files);

  // Update cache
  cache.skills[name] = {
    skillId: created.id,
    latestVersion: created.latest_version,
    contentHash,
    lastSynced: new Date().toISOString(),
  };

  if (options.verbose) {
    console.log(`[UPLOADED] ${name} → ${created.id}`);
  } else {
    console.log(`[UPLOADED] ${name}`);
  }

  return { action: 'uploaded', skillId: created.id, skillName: name };
}

// =============================================================================
// OUTPUT FORMATTING (Task 6)
// =============================================================================

/**
 * Format skill ID mapping for YAML output.
 *
 * @param skillIds - Map of skill name to skill ID
 * @returns YAML-formatted string
 * @see AC#6
 */
export function formatSkillMapping(skillIds: Record<string, string>): string {
  const lines = ['skills:'];

  for (const [name, id] of Object.entries(skillIds).sort()) {
    lines.push(`  ${name}:`);
    lines.push(`    type: custom`);
    lines.push(`    skill_id: ${id}`);
    lines.push(`    version: latest`);
  }

  return lines.join('\n');
}

/**
 * Print upload summary.
 *
 * @param results - Upload results
 * @see AC#6
 */
function printSummary(results: UploadResults): void {
  console.log('\n============================================================');
  console.log('                    SKILL UPLOAD SUMMARY');
  console.log('============================================================\n');

  console.log(`Skills Uploaded: ${results.uploaded}`);
  console.log(`Skills Updated:  ${results.updated}`);
  console.log(`Skills Cached:   ${results.cached}`);
  console.log(`Skills Skipped:  ${results.skipped}`);
  console.log(`Skills Failed:   ${results.failed}`);

  if (Object.keys(results.skillIds).length > 0) {
    console.log('\nSkill ID Mapping (for .orion/skills.yaml):');
    console.log('------------------------------------------------------------');
    console.log(formatSkillMapping(results.skillIds));
    console.log('------------------------------------------------------------');
  }

  console.log('\nCache updated: .skills/.cache/skills.json\n');
}

// =============================================================================
// MAIN UPLOAD FUNCTION
// =============================================================================

/**
 * Upload all skills (or filtered by --skill flag).
 *
 * @param options - CLI options (optional, defaults to parseArgs())
 * @returns Upload results
 * @see AC#1, AC#2, AC#7
 */
export async function uploadAllSkills(options?: CliOptions): Promise<UploadResults> {
  const opts = options ?? parseArgs();
  const traceId = `upload-script-${Date.now()}`;
  const apiClient = new SkillsApiClient(traceId);
  const cache = await loadCache();

  const results: UploadResults = {
    uploaded: 0,
    updated: 0,
    cached: 0,
    skipped: 0,
    failed: 0,
    skillIds: {},
  };

  // Load all skill metadata
  let skills = await loadSkillMetadata(traceId);

  // Filter to single skill if specified
  if (opts.skill) {
    const found = skills.find((s) => s.name === opts.skill);
    if (!found) {
      console.error(`[ERROR] Skill not found: ${opts.skill}`);
      console.error(`Available skills: ${skills.map((s) => s.name).join(', ')}`);
      throw new Error(`Skill not found: ${opts.skill}`);
    }
    skills = [found];
  }

  // Filter out built-in and warn skills
  const uploadableSkills = skills.filter((skill) => {
    if (shouldSkipSkill(skill.name)) {
      console.log(`[SKIP] ${skill.name} - Anthropic built-in skill`);
      results.skipped++;
      return false;
    }

    if (shouldWarnSkill(skill.name)) {
      console.warn(`[WARN] ${skill.name} - Requires GKE sandbox (not uploading to Anthropic)`);
      results.skipped++;
      return false;
    }

    return true;
  });

  if (uploadableSkills.length === 0) {
    console.log('\nNo skills to upload.');
    printSummary(results);
    return results;
  }

  if (opts.dryRun) {
    console.log('\n[DRY RUN MODE - No API calls will be made]\n');
  }

  // Process skills with concurrency limit
  const processSkill = async (skill: SkillMetadata) => {
    try {
      const result = await uploadSkill(apiClient, skill, opts, cache);

      switch (result.action) {
        case 'uploaded':
          results.uploaded++;
          results.skillIds[result.skillName] = result.skillId;
          break;
        case 'updated':
          results.updated++;
          results.skillIds[result.skillName] = result.skillId;
          break;
        case 'cached':
          results.cached++;
          results.skillIds[result.skillName] = result.skillId;
          break;
        case 'skipped':
          // Dry-run skips don't count as actual skips
          break;
      }
    } catch (error) {
      results.failed++;
      console.error(
        `[ERROR] Failed to upload ${skill.name}: ${error instanceof Error ? error.message : String(error)}`
      );
      // Continue with remaining skills (AC#7)
    }
  };

  // Process in batches for rate limit friendliness
  for (let i = 0; i < uploadableSkills.length; i += MAX_CONCURRENT_UPLOADS) {
    const batch = uploadableSkills.slice(i, i + MAX_CONCURRENT_UPLOADS);
    await Promise.all(batch.map(processSkill));
  }

  // Save updated cache (unless dry-run)
  if (!opts.dryRun) {
    await saveCache(cache);
  }

  printSummary(results);

  return results;
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Main entry point.
 *
 * @returns Exit code (0 = success, 1 = partial failure, 2 = fatal error)
 */
export async function main(): Promise<number> {
  const options = parseArgs();

  // Show help and exit
  if (options.help) {
    showHelp();
    return EXIT_SUCCESS;
  }

  // Validate environment
  try {
    validateEnvironment();
  } catch (error) {
    console.error(`[FATAL] ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_FATAL_ERROR;
  }

  const traceId = `upload-script-${Date.now()}`;
  const apiClient = new SkillsApiClient(traceId);

  // Handle --list command
  if (options.list) {
    try {
      const skills = await listUploadedSkills(apiClient);
      displaySkillList(skills);
      return EXIT_SUCCESS;
    } catch (error) {
      console.error(`[ERROR] Failed to list skills: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT_FATAL_ERROR;
    }
  }

  // Upload skills
  try {
    const results = await uploadAllSkills(options);

    // Determine exit code
    if (results.failed > 0 && results.uploaded + results.updated === 0) {
      return EXIT_FATAL_ERROR;
    }

    return results.failed > 0 ? EXIT_PARTIAL_FAILURE : EXIT_SUCCESS;
  } catch (error) {
    console.error(`[FATAL] ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_FATAL_ERROR;
  }
}

// Run if called directly (not during tests)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1]?.endsWith('upload-skills.ts') && !process.argv[1]?.includes('vitest'));

if (isMainModule && typeof globalThis.vi === 'undefined') {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('[FATAL] Unexpected error:', error);
      process.exit(EXIT_FATAL_ERROR);
    });
}
