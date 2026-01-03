/**
 * GCP Identity Token Fetching for Cloud Run Authentication
 *
 * When Orion calls Cloud Run services that require IAM auth
 * (--no-allow-unauthenticated), we need to fetch an identity token.
 *
 * This works in both environments:
 * - Local development: Uses Application Default Credentials (ADC) from gcloud CLI
 * - GCP (Cloud Run/GCE): Uses metadata server
 *
 * The token is cached and refreshed 5 minutes before expiry.
 *
 * @see https://cloud.google.com/run/docs/authenticating/service-to-service
 */

import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../utils/logger.js';

/** Token refresh buffer (refresh 5 min before expiry) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

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
 * Fetch a GCP identity token for the given audience.
 *
 * Works in both local development (via gcloud ADC) and on GCP (via metadata server).
 *
 * @param audience - The target service URL (e.g., https://mcp-imagen-xxx.run.app)
 * @returns Identity token string
 * @throws Error if authentication fails
 */
export async function getGcpIdentityToken(audience: string): Promise<string> {
  // Check cache
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return cached.token;
  }

  try {
    const auth = getAuthClient();
    const client = await auth.getIdTokenClient(audience);
    const headers = await client.getRequestHeaders();
    
    // Extract token from "Bearer xxx" header
    const authHeader = headers['Authorization'] || headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No Authorization header returned from getRequestHeaders');
    }
    
    const token = authHeader.slice(7);

    // Parse JWT to get expiry (tokens are typically valid for 1 hour)
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const expiresAt = payload.exp * 1000; // Convert to ms

      // Cache the token
      tokenCache.set(audience, { token, expiresAt });

      logger.debug({
        event: 'gcp.identity_token.fetched',
        audience,
        expiresIn: Math.round((expiresAt - Date.now()) / 1000),
      });
    } catch {
      // If we can't parse expiry, cache for 50 minutes (tokens last 1 hour)
      tokenCache.set(audience, { token, expiresAt: Date.now() + 50 * 60 * 1000 });
    }

    return token;
  } catch (error) {
    logger.error({
      event: 'gcp.identity_token.failed',
      audience,
      error: error instanceof Error ? error.message : String(error),
      hint: 'Run "gcloud auth application-default login" for local development',
    });
    throw error;
  }
}

/**
 * Check if GCP authentication is available.
 */
export async function isGcpAuthAvailable(): Promise<boolean> {
  try {
    const auth = getAuthClient();
    await auth.getCredentials();
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
