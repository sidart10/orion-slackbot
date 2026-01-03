/**
 * GCP Identity Token Fetching for Cloud Run Authentication
 *
 * When Orion calls Cloud Run services that require IAM auth
 * (--no-allow-unauthenticated), we need to fetch an identity token
 * from the GCP metadata server.
 *
 * The token is cached and refreshed 5 minutes before expiry.
 *
 * @see https://cloud.google.com/run/docs/authenticating/service-to-service
 */

import { logger } from '../../utils/logger.js';

/** Metadata server URL */
const METADATA_SERVER = 'http://metadata.google.internal';

/** Token refresh buffer (refresh 5 min before expiry) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Cache of identity tokens by audience */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Fetch a GCP identity token for the given audience.
 *
 * @param audience - The target service URL (e.g., https://mcp-imagen-xxx.run.app)
 * @returns Identity token string
 * @throws Error if not running on GCP or metadata server unavailable
 */
export async function getGcpIdentityToken(audience: string): Promise<string> {
  // Check cache
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return cached.token;
  }

  const url = `${METADATA_SERVER}/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Metadata-Flavor': 'Google',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Metadata server returned ${response.status}: ${await response.text()}`);
    }

    const token = await response.text();

    // Parse JWT to get expiry (tokens are typically valid for 1 hour)
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000; // Convert to ms

    // Cache the token
    tokenCache.set(audience, { token, expiresAt });

    logger.debug({
      event: 'gcp.identity_token.fetched',
      audience,
      expiresIn: Math.round((expiresAt - Date.now()) / 1000),
    });

    return token;
  } catch (error) {
    // Check if we're not on GCP (local development)
    if (error instanceof Error && error.message.includes('ENOTFOUND')) {
      logger.warn({
        event: 'gcp.identity_token.not_on_gcp',
        audience,
        message: 'Not running on GCP - identity token unavailable',
      });
      throw new Error('Not running on GCP - cannot fetch identity token');
    }

    logger.error({
      event: 'gcp.identity_token.failed',
      audience,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Check if running on GCP (Cloud Run, GCE, etc.)
 */
export async function isRunningOnGcp(): Promise<boolean> {
  try {
    const response = await fetch(`${METADATA_SERVER}/`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
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

