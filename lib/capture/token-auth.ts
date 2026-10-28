/**
 * Authentification de l'extension de capture par jeton Bearer.
 *
 * Le jeton est tiré de 256 bits aléatoires : on retrouve la ligne par son empreinte SHA-256, sans
 * comparaison de chaînes à temps constant à faire (l'empreinte, pas le secret, sert de clé de
 * recherche). Un jeton révoqué ou inconnu donne la même réponse 401, sans indice.
 */

import type { NextRequest, NextResponse } from 'next/server';
import { bearerToken, sha256Hex } from '@/lib/capture/credentials';
import { apiError } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type CaptureTokenAuth =
  | { response: null; ownerId: string; tokenId: string }
  | { response: NextResponse; ownerId?: undefined; tokenId?: undefined };

export async function requireCaptureToken(request: NextRequest): Promise<CaptureTokenAuth> {
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) {
    return { response: apiError('UNAUTHORIZED', 401, 'Jeton de capture manquant ou invalide') };
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('capture_tokens')
    .select('id, owner_id')
    .eq('token_hash', sha256Hex(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (error || !data) {
    return { response: apiError('UNAUTHORIZED', 401, 'Jeton de capture manquant ou invalide') };
  }

  // Trace d'usage utile à l'auteur (« dernier usage ») ; un échec ici ne bloque pas l'envoi.
  await supabase
    .from('capture_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id as string);

  return { response: null, ownerId: data.owner_id as string, tokenId: data.id as string };
}
