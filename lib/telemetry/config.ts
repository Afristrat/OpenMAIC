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
 * explicitly enabled via XAPI_ENABLED=true (default: disabled).
 */
export function getXAPIConfig(): XAPIConfig | null {
  const endpoint = process.env.XAPI_ENDPOINT;
  const auth = process.env.XAPI_AUTH;

  if (!endpoint || !auth) {
    return null;
  }

  const enabled = process.env.XAPI_ENABLED === 'true';

  return { endpoint, auth, enabled };
}
