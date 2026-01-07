/**
 * GCP Identity Token Fetching for Cloud Run Authentication
 *
 * When Orion calls Cloud Run services that require IAM auth
 * (--no-allow-unauthenticated), we need to fetch an identity token.
 *
 * This works in both environments:
 * - Local development: Uses `gcloud auth print-identity-token` CLI
 * - GCP (Cloud Run/GCE): Uses metadata server or service account
 *
 * The token is cached and refreshed 5 minutes before expiry.
 *
 * @see https://cloud.google.com/run/docs/authenticating/service-to-service
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../utils/logger.js';

const execFileAsync = promisify(execFile);

/** Token refresh buffer (refresh 5 min before expiry) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Timeout for google-auth-library operations (can hang on metadata server issues) */
const AUTH_LIBRARY_TIMEOUT_MS = 10000;

/** Cache of identity tokens by audience */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Shared GoogleAuth instance */
let authClient: GoogleAuth | null = null;

/**
 * Get or create the GoogleAuth client.
 */
function getAuthClient(): GoogleAuth {
  if (!authClient) {
    authClient = new GoogleAuth();
  }
  return authClient;
}

/**
 * Parse JWT expiry from token.
 */
function parseTokenExpiry(token: string): number {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return Date.now() + 50 * 60 * 1000;

    // JWTs are base64url encoded (not base64). Node supports 'base64url' decoding.
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return payload.exp * 1000; // Convert to ms
  } catch {
    // Default to 50 minutes (tokens typically last 1 hour)
    return Date.now() + 50 * 60 * 1000;
  }
}

/**
 * Try to get identity token using google-auth-library (works on GCP).
 * Includes timeout to prevent hanging on metadata server issues.
 */
async function tryGoogleAuthLibrary(
  audience: string,
  traceId?: string
): Promise<string | null> {
  try {
    const auth = getAuthClient();

    // Wrap in timeout to prevent hanging on metadata server issues
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Auth library timeout')),
        AUTH_LIBRARY_TIMEOUT_MS
      );
    });

    const authPromise = (async () => {
      const client = await auth.getIdTokenClient(audience);
      const headers = await client.getRequestHeaders();
      
      // google-auth-library returns WHATWG Headers in recent versions, but be robust
      // across possible header shapes.
      const maybeHeaders = headers as unknown as {
        get?: (name: string) => string | null;
        Authorization?: string;
        authorization?: string;
      };
      const authHeader =
        maybeHeaders.get?.('Authorization') ??
        maybeHeaders.get?.('authorization') ??
        maybeHeaders.Authorization ??
        maybeHeaders.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
      }
      return null;
    })();

    try {
      return await Promise.race([authPromise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.debug({
      event: 'gcp.auth.library_failed',
      audience,
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });
    return null;
  }
}

/** Service account to impersonate for local dev - requires GCP_IMPERSONATE_SA env var */
const IMPERSONATE_SA = process.env.GCP_IMPERSONATE_SA;

/**
 * Fallback: Get identity token using gcloud CLI with SA impersonation.
 * User accounts can't get identity tokens with --audiences directly,
 * so we impersonate a service account that has invoker access.
 *
 * Requires GCP_IMPERSONATE_SA env var for impersonation mode.
 */
async function tryGcloudCli(audience: string, traceId?: string): Promise<string | null> {
  // Try with impersonation first (for user accounts) - requires GCP_IMPERSONATE_SA
  if (IMPERSONATE_SA) {
    try {
      const { stdout } = await execFileAsync(
        'gcloud',
        [
          'auth',
          'print-identity-token',
          `--impersonate-service-account=${IMPERSONATE_SA}`,
          `--audiences=${audience}`,
        ],
        { timeout: 15000 }
      );
      
      const token = stdout.trim();
      if (token && token.includes('.')) {
        logger.debug({ event: 'gcp.auth.impersonation_success', audience, traceId });
        return token;
      }
    } catch (error) {
      logger.debug({
        event: 'gcp.auth.impersonation_failed',
        audience,
        sa: IMPERSONATE_SA,
        error: error instanceof Error ? error.message : String(error),
        traceId,
      });
    }
  }
  
  // Fallback: try without impersonation (for service accounts or users with direct access)
  try {
    const { stdout } = await execFileAsync(
      'gcloud',
      ['auth', 'print-identity-token', `--audiences=${audience}`],
      { timeout: 10000 }
    );
    
    const token = stdout.trim();
    if (token && token.includes('.')) {
      return token;
    }
  } catch (error) {
    logger.debug({
      event: 'gcp.auth.gcloud_failed',
      audience,
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });
  }
  
  return null;
}

/**
 * Fetch a GCP identity token for the given audience.
 *
 * Tries multiple methods in order:
 * 1. google-auth-library (works on GCP, service accounts)
 * 2. gcloud CLI (works locally with user credentials)
 *
 * @param audience - The target service URL (e.g., https://mcp-imagen-xxx.run.app)
 * @returns Identity token string
 * @throws Error if all methods fail
 */
export async function getGcpIdentityToken(
  audience: string,
  traceId?: string
): Promise<string> {
  // Check cache
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return cached.token;
  }

  // Try google-auth-library first (works on GCP)
  let token = await tryGoogleAuthLibrary(audience, traceId);
  
  // Fallback to gcloud CLI (works locally)
  if (!token) {
    token = await tryGcloudCli(audience, traceId);
  }

  if (!token) {
    const error = new Error(
      'Failed to get GCP identity token. ' +
      'Run "gcloud auth login" and ensure you have access to the target service.'
    );
    logger.error({
      event: 'gcp.identity_token.all_methods_failed',
      audience,
      hint: 'Run "gcloud auth login" for local development',
      traceId,
    });
    throw error;
  }

  // Cache the token
  const expiresAt = parseTokenExpiry(token);
  tokenCache.set(audience, { token, expiresAt });

  logger.debug({
    event: 'gcp.identity_token.fetched',
    audience,
    expiresIn: Math.round((expiresAt - Date.now()) / 1000),
    traceId,
  });

  return token;
}

/**
 * Check if GCP authentication is available.
 */
export async function isGcpAuthAvailable(): Promise<boolean> {
  try {
    // Try a quick gcloud check
    await execFileAsync('gcloud', ['auth', 'list', '--format=value(account)'], {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear token cache (for testing)
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}
