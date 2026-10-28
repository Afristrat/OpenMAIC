/**
 * POST /api/capture/ingest/pair : l'extension échange un code d'appairage contre son jeton.
 *
 * Route sans cookie ni jeton (le code fait foi), donc exemptée du contrôle d'origine (voir
 * CSRF_EXEMPT_PREFIXES) et protégée par une limite d'essais par adresse cliente. Le jeton n'est
 * rendu qu'ici, une seule fois, à l'extension.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  generateCaptureToken,
  isWellFormedPairingCode,
  normalizePairingCode,
  sha256Hex,
} from '@/lib/capture/credentials';
import {
  accessCodeThrottleStatus,
  clearAccessCodeFailures,
  recordAccessCodeFailure,
} from '@/lib/server/access-code-throttle';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { trustedClientIp } from '@/lib/server/client-ip-bucket';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CapturePairAPI');

const bodySchema = z.strictObject({
  code: z.string().min(1).max(32),
  label: z.string().trim().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const throttleKey = `capture-pair:${trustedClientIp(request.headers)}`;
  const throttle = accessCodeThrottleStatus(throttleKey);
  if (throttle.blocked) {
    const response = apiError('RATE_LIMITED', 429, 'Trop d’essais, réessayez plus tard');
    response.headers.set('Retry-After', String(throttle.retryAfterSeconds));
    return response;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    recordAccessCodeFailure(throttleKey);
    return apiError('INVALID_REQUEST', 400, 'Requête invalide');
  }
  const code = normalizePairingCode(parsed.data.code);
  if (!isWellFormedPairingCode(code)) {
    recordAccessCodeFailure(throttleKey);
    return apiError('UNAUTHORIZED', 401, 'Code invalide ou expiré');
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  // Consommation atomique : une seule requête marque le code utilisé et ne rend la ligne qu'une fois.
  const { data: consumed, error: consumeError } = await supabase
    .from('capture_pairing_codes')
    .update({ used_at: now })
    .eq('code_hash', sha256Hex(code))
    .is('used_at', null)
    .gt('expires_at', now)
    .select('owner_id')
    .maybeSingle();
  if (consumeError) {
    log.error('Failed to consume pairing code', consumeError.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de l’appairage');
  }
  if (!consumed) {
    recordAccessCodeFailure(throttleKey);
    return apiError('UNAUTHORIZED', 401, 'Code invalide ou expiré');
  }

  const { token, hash } = generateCaptureToken();
  const { error: insertError } = await supabase.from('capture_tokens').insert({
    owner_id: consumed.owner_id as string,
    token_hash: hash,
    label: parsed.data.label ?? '',
  });
  if (insertError) {
    log.error('Failed to insert capture token', insertError.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de l’appairage');
  }

  clearAccessCodeFailures(throttleKey);
  const response = apiSuccess({ token }, 201);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
