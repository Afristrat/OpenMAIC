// =============================================================================
// LTI 1.3 Tool Provider — Core Library
// Lightweight implementation using jose for JWT verification.
// No dependency on ltijs or MongoDB.
// =============================================================================

import * as jose from 'jose';
import { createLogger } from '@/lib/logger';
import type { LTIPlatformConfig, LTILaunchContext } from './types';
import { parseVerifiedLaunchClaims } from './launch-claims';

const log = createLogger('LTI');

// ---------------------------------------------------------------------------
// Platform config lookup (from Supabase via service role)
// ---------------------------------------------------------------------------

async function readPlatform(
  field: 'client_id' | 'issuer',
  value: string,
): Promise<LTIPlatformConfig | null> {
  const { createServiceSupabaseClient } = await import('@/lib/supabase/service');
  const { data, error } = await createServiceSupabaseClient()
    .from('lti_registrations')
    .select('id, client_id, issuer, jwks_url, auth_url, token_url, deployment_id')
    .eq(field, value)
    .maybeSingle();
  // No row is different from a failed lookup (including ambiguous issuers).
  if (error) throw new Error('LTI platform lookup unavailable');
  if (!data) return null;
  return {
    id: data.id as string,
    clientId: data.client_id as string,
    issuer: data.issuer as string,
    jwksUrl: data.jwks_url as string,
    authUrl: data.auth_url as string,
    tokenUrl: data.token_url as string,
    deploymentId: data.deployment_id as string,
  };
}

export function getPlatformConfig(clientId: string): Promise<LTIPlatformConfig | null> {
  return readPlatform('client_id', clientId);
}

export function getPlatformConfigByIssuer(issuer: string): Promise<LTIPlatformConfig | null> {
  return readPlatform('issuer', issuer);
}

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

/**
 * Verify an LTI 1.3 id_token JWT against the platform's JWKS endpoint,
 * then extract the launch context claims.
 */
export async function verifyLTIToken(
  idToken: string,
  platform: LTIPlatformConfig,
): Promise<LTILaunchContext> {
  // Fetch the platform's JWKS for signature verification
  const jwks = jose.createRemoteJWKSet(new URL(platform.jwksUrl));

  const { payload } = await jose.jwtVerify(idToken, jwks, {
    issuer: platform.issuer,
    audience: platform.clientId,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
  });

  return parseVerifiedLaunchClaims(payload, platform);
}

// ---------------------------------------------------------------------------
// Nonce management
// ---------------------------------------------------------------------------

/**
 * Store a nonce in Supabase with a 10-minute expiry for replay protection.
 */
export async function storeNonce(nonce: string, clientId: string): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE env vars for nonce storage');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase.from('lti_nonces').insert({
    nonce,
    client_id: clientId,
    expires_at: expiresAt,
  });

  if (error) {
    log.error('Failed to store LTI nonce:', error.message);
    throw new Error('Failed to store nonce');
  }
}

/**
 * Consume a nonce — marks it as used and returns true if it was valid.
 * Returns false if the nonce was already consumed, expired, or not found.
 */
export async function consumeNonce(nonce: string, clientId: string): Promise<boolean> {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    log.error('Missing SUPABASE env vars for nonce consumption');
    return false;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Atomically consume: update only if not consumed and not expired
  const { data, error } = await supabase
    .from('lti_nonces')
    .update({ consumed: true })
    .eq('nonce', nonce)
    .eq('client_id', clientId)
    .eq('consumed', false)
    .gt('expires_at', new Date().toISOString())
    .select('nonce')
    .single();

  if (error || !data) {
    log.warn('LTI nonce invalid or already consumed');
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// RSA key pair for our JWKS endpoint
// ---------------------------------------------------------------------------

let cachedKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey; kid: string } | null = null;

/**
 * Get or generate the RSA key pair used by Qalem for signing.
 * In production, this should be loaded from env or a secrets manager.
 */
export async function getKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  kid: string;
}> {
  if (cachedKeyPair) return cachedKeyPair;

  // Check for environment-provided keys first
  const privateKeyPem = process.env.LTI_PRIVATE_KEY;
  const publicKeyPem = process.env.LTI_PUBLIC_KEY;
  const kid = process.env.LTI_KEY_ID ?? 'qalem-lti-key-1';

  if (privateKeyPem && publicKeyPem) {
    const privateKey = await jose.importPKCS8(privateKeyPem, 'RS256');
    const publicKey = await jose.importSPKI(publicKeyPem, 'RS256');
    cachedKeyPair = { publicKey, privateKey, kid };
    return cachedKeyPair;
  }

  // In production, refuse to start without proper keys
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'LTI_PRIVATE_KEY and LTI_PUBLIC_KEY must be set in production. ' +
        'Ephemeral key generation is disabled to prevent multi-process key drift.',
    );
  }

  // Generate a key pair (development only — not persisted across restarts)
  log.warn(
    'No LTI_PRIVATE_KEY/LTI_PUBLIC_KEY found. Generating ephemeral key pair (development only).',
  );
  const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
    extractable: true,
  });
  cachedKeyPair = { publicKey, privateKey, kid };
  return cachedKeyPair;
}

/**
 * Export the public key as a JWK for the JWKS endpoint.
 */
export async function getPublicJWK(): Promise<jose.JWK> {
  const { publicKey, kid } = await getKeyPair();
  const jwk = await jose.exportJWK(publicKey);
  return {
    ...jwk,
    kid,
    alg: 'RS256',
    use: 'sig',
  };
}
