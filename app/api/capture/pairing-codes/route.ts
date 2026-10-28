/**
 * POST /api/capture/pairing-codes : l'auteur connecté (cookie de session) demande un code
 * d'appairage à usage unique pour relier son extension de capture à son compte.
 *
 * Le code vit 5 minutes. Il transite par le pont de la page vers l'extension, qui l'échange
 * contre un jeton auprès de /api/capture/ingest/pair : la page ne voit jamais le jeton.
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { PAIRING_CODE_TTL_MS, generatePairingCode } from '@/lib/capture/credentials';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CapturePairingCodesAPI');

/** Au plus 5 codes émis par personne sur 10 minutes. */
const MAX_CODES_PER_WINDOW = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error: countError } = await supabase
    .from('capture_pairing_codes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', auth.user.id)
    .gt('created_at', since);
  if (countError) {
    log.error('Failed to count pairing codes', countError.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la création du code');
  }
  if ((count ?? 0) >= MAX_CODES_PER_WINDOW) {
    return apiError('RATE_LIMITED', 429, 'Trop de codes demandés, réessayez dans quelques minutes');
  }

  const { code, hash } = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
  const { error } = await supabase
    .from('capture_pairing_codes')
    .insert({ owner_id: auth.user.id, code_hash: hash, expires_at: expiresAt });
  if (error) {
    log.error('Failed to insert pairing code', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la création du code');
  }

  const response = apiSuccess({ code, expiresAt }, 201);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
