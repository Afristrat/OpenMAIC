// =============================================================================
// Qalem — xAPI Configuration
// =============================================================================

export interface XAPIConfig {
  /** LRS endpoint URL */
  endpoint: string;
  /** Basic auth or Bearer token for the LRS */
  auth: string;
  /** Whether telemetry is enabled */
  enabled: boolean;
}

/**
 * Build xAPI config from environment variables.
 * Returns null when the required env vars are missing or telemetry is
 * explicitly disabled via XAPI_ENABLED=false.
 */
export function getXAPIConfig(): XAPIConfig | null {
  const endpoint = process.env.XAPI_ENDPOINT;
  const auth = process.env.XAPI_AUTH;

  if (!endpoint || !auth) {
    return null;
  }

  const enabled = process.env.XAPI_ENABLED !== 'false';

  return { endpoint, auth, enabled };
}
