/**
 * Skills API Client
 *
 * Wrapper around Anthropic SDK beta Skills API endpoints.
 * Handles CRUD operations for custom skills with retry logic.
 *
 * @see Story 6.2 - Skills API Client for Anthropic Container Integration
 * @see AC#1 - Skills uploaded to Anthropic Skills API
 * @see AC#3 - Skill appears with correct metadata and version
 * @see AC#5 - Correct beta headers included
 */

import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { zipSync } from 'fflate';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { getLangfuse } from '../observability/langfuse.js';
import type { ApiSkill, ApiSkillVersion, SkillFile } from './types.js';

/** Maximum retry attempts for transient errors */
const MAX_RETRIES = 3;

/** Retry delays in milliseconds (exponential backoff: 1s, 2s, 4s) */
const RETRY_DELAYS = [1000, 2000, 4000];

/** Maximum skill display title length per API spec */
const MAX_TITLE_LENGTH = 64;

/**
 * Check if an error is retryable (5xx or 429).
 */
function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 429 || (status >= 500 && status < 600);
  }
  return false;
}

/**
 * Check if error is a rate limit (429).
 */
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

/**
 * Check if error is a server error (5xx).
 */
function isServerError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status >= 500 && status < 600;
  }
  return false;
}

/**
 * Check if error is a not found error (404).
 */
function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 404;
  }
  return false;
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a ZIP file containing all skill files.
 *
 * The Anthropic Skills API requires files to be in a directory structure:
 * - `{skill_name}/SKILL.md` must exist at the root
 * - All files share the same root directory
 *
 * Since the SDK's multipart handling strips directory paths from filenames,
 * we create a ZIP file instead which preserves the directory structure.
 *
 * @param skillFiles - Array of skill files with name and content
 * @param skillName - Name of the skill (used as directory prefix in ZIP)
 * @returns Single File object containing the ZIP
 */
async function createSkillZip(skillFiles: SkillFile[], skillName: string): Promise<File> {
  // Build ZIP file structure: { "skillName/filename": Uint8Array }
  const zipData: Record<string, Uint8Array> = {};

  for (const skillFile of skillFiles) {
    // Convert content to Uint8Array
    const content =
      typeof skillFile.content === 'string'
        ? new TextEncoder().encode(skillFile.content)
        : new Uint8Array(skillFile.content);

    // Path in ZIP: skillName/filename (e.g., "summarize/SKILL.md")
    const zipPath = `${skillName}/${skillFile.name}`;
    zipData[zipPath] = content;
  }

  // Create ZIP synchronously (skill files are small)
  const zipped = zipSync(zipData);

  // Convert to File for SDK upload
  return toFile(zipped, `${skillName}.zip`, { type: 'application/zip' });
}

/**
 * Skills API Client for Anthropic's managed container system.
 *
 * Provides CRUD operations for custom skills with automatic retry
 * for transient errors (5xx, 429) using exponential backoff.
 *
 * @example
 * ```typescript
 * const client = new SkillsApiClient();
 * const skills = await client.listSkills('custom');
 * ```
 */
export class SkillsApiClient {
  private client: Anthropic;
  private traceId?: string;

  constructor(traceId?: string) {
    this.traceId = traceId;

    // Initialize Anthropic client with skills beta header
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
      defaultHeaders: {
        'anthropic-beta': config.anthropic?.allBetas?.join(',') ?? 'skills-2025-10-02',
      },
    });
  }

  /**
   * Execute an API call with retry logic for transient errors.
   *
   * Implements exponential backoff: 1s, 2s, 4s delays between retries.
   * Emits Langfuse events for rate limits and API unavailability.
   *
   * @param operation - Name of the operation (for logging)
   * @param fn - Async function to execute
   * @returns Result of the function
   * @throws Error if all retries fail
   */
  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    const langfuse = getLangfuse();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Emit Langfuse events for specific error types
        if (isRateLimitError(error) && langfuse?.event) {
          langfuse.event({
            name: 'skills.api.rate_limited',
            metadata: {
              traceId: this.traceId,
              operation,
              attempt,
            },
          });
        }

        // Only retry on transient errors
        if (!isRetryableError(error)) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= MAX_RETRIES) {
          // Emit unavailable event for persistent 5xx errors
          if (isServerError(error) && langfuse?.event) {
            langfuse.event({
              name: 'skills.api.unavailable',
              metadata: {
                traceId: this.traceId,
                operation,
                statusCode: (error as { status?: number }).status,
                message: (error as { message?: string }).message,
              },
            });
          }
          throw error;
        }

        // Wait before retrying (exponential backoff)
        const delay = RETRY_DELAYS[attempt] ?? 4000;
        logger.warn({
          event: 'skills.api.retry',
          traceId: this.traceId,
          operation,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          error: (error as { message?: string }).message,
        });

        await sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * List skills from the API.
   *
   * @param source - Filter by 'custom' or 'anthropic' (optional)
   * @returns Array of skills
   *
   * @see AC#3 - Skill appears with correct metadata and version
   */
  async listSkills(source?: 'custom' | 'anthropic'): Promise<ApiSkill[]> {
    logger.debug({
      event: 'skills.api.list',
      traceId: this.traceId,
      source,
    });

    // Type assertion for beta API that may not be in SDK types yet
    const beta = this.client.beta as unknown as {
      skills: {
        list: (params?: { source?: string }) => Promise<{ data: ApiSkill[] }>;
      };
    };

    const result = await this.withRetry('listSkills', async () => {
      const params = source ? { source } : undefined;
      return beta.skills.list(params);
    });

    return result.data;
  }

  /**
   * Create a new skill.
   *
   * @param displayTitle - Display name for the skill (max 64 chars)
   * @param files - Array of files to include in the skill
   * @returns Created skill with ID
   * @throws Error if title exceeds 64 characters
   *
   * @see AC#1 - Skills uploaded to Anthropic Skills API
   */
  async createSkill(displayTitle: string, files: SkillFile[]): Promise<ApiSkill> {
    // Validate title length
    if (displayTitle.length > MAX_TITLE_LENGTH) {
      throw new Error(`Skill display title must not exceed ${MAX_TITLE_LENGTH} characters`);
    }

    logger.debug({
      event: 'skills.api.create',
      traceId: this.traceId,
      displayTitle,
      fileCount: files.length,
    });

    // Create ZIP file containing all skill files
    // ZIP is required because the SDK strips directory paths from filenames,
    // but the API requires files in a {skillName}/ directory structure
    const zipFile = files.length > 0 ? await createSkillZip(files, displayTitle) : undefined;

    // Type assertion for beta API
    const beta = this.client.beta as unknown as {
      skills: {
        create: (params: { display_title: string; files?: File[] }) => Promise<ApiSkill>;
      };
    };

    return this.withRetry('createSkill', async () => {
      return beta.skills.create({
        display_title: displayTitle,
        files: zipFile ? [zipFile] : undefined,
      });
    });
  }

  /**
   * Retrieve a skill by ID.
   *
   * @param skillId - The skill ID
   * @returns Skill metadata
   * @throws Error if skill not found
   *
   * @see AC#3 - Skill appears with correct metadata and version
   */
  async retrieveSkill(skillId: string): Promise<ApiSkill> {
    logger.debug({
      event: 'skills.api.retrieve',
      traceId: this.traceId,
      skillId,
    });

    // Type assertion for beta API
    const beta = this.client.beta as unknown as {
      skills: {
        retrieve: (id: string) => Promise<ApiSkill>;
      };
    };

    try {
      return await this.withRetry('retrieveSkill', async () => {
        return beta.skills.retrieve(skillId);
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error(`Skill not found: ${skillId}`);
      }
      throw error;
    }
  }

  /**
   * Create a new version of an existing skill.
   *
   * @param skillId - The skill ID
   * @param files - Array of files for the new version
   * @param skillName - Name of the skill (used for file path prefix)
   * @returns Created version metadata
   *
   * @see AC#4 - Modified SKILL.md creates new version, not new skill
   */
  async createSkillVersion(
    skillId: string,
    files: SkillFile[],
    skillName: string
  ): Promise<ApiSkillVersion> {
    logger.debug({
      event: 'skills.api.version.create',
      traceId: this.traceId,
      skillId,
      skillName,
      fileCount: files.length,
    });

    // Create ZIP file containing all skill files (same as createSkill)
    const zipFile = files.length > 0 ? await createSkillZip(files, skillName) : undefined;

    // Type assertion for beta API
    const beta = this.client.beta as unknown as {
      skills: {
        versions: {
          create: (skillId: string, params: { files?: File[] }) => Promise<ApiSkillVersion>;
        };
      };
    };

    return this.withRetry('createSkillVersion', async () => {
      return beta.skills.versions.create(skillId, {
        files: zipFile ? [zipFile] : undefined,
      });
    });
  }

  /**
   * Delete a specific version of a skill.
   *
   * @param skillId - The skill ID
   * @param version - The version to delete
   */
  async deleteSkillVersion(skillId: string, version: string): Promise<void> {
    logger.debug({
      event: 'skills.api.version.delete',
      traceId: this.traceId,
      skillId,
      version,
    });

    // Type assertion for beta API
    const beta = this.client.beta as unknown as {
      skills: {
        versions: {
          delete: (skillId: string, version: string) => Promise<unknown>;
        };
      };
    };

    await this.withRetry('deleteSkillVersion', async () => {
      return beta.skills.versions.delete(skillId, version);
    });
  }

  /**
   * Delete a skill and all its versions.
   *
   * @param skillId - The skill ID to delete
   */
  async deleteSkill(skillId: string): Promise<void> {
    logger.debug({
      event: 'skills.api.delete',
      traceId: this.traceId,
      skillId,
    });

    // Type assertion for beta API
    const beta = this.client.beta as unknown as {
      skills: {
        delete: (id: string) => Promise<unknown>;
      };
    };

    await this.withRetry('deleteSkill', async () => {
      return beta.skills.delete(skillId);
    });
  }
}
