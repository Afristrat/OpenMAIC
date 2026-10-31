import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { normalizeSearch } from '@/lib/referentiel/mirror';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NextRequest } from 'next/server';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Recherche de métiers ISCO-08 / ESCO dans le miroir : `?q=<texte>&isco=<1 à 4 chiffres>&limit=<n>`. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;
  const query = normalizeSearch(params.get('q') ?? '');
  const isco = params.get('isco') ?? '';
  const limit = Math.min(Math.max(Number(params.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  if (isco && !/^[0-9]{1,4}$/.test(isco)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'isco must be 1 to 4 digits');
  }
  if (!query && !isco) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'q or isco is required');
  }

  // Lecture avec la session de la personne : la politique de la table fait foi.
  let request_ = (await createServerSupabaseClient())
    .from('referentiel_occupations')
    .select(
      'uri, title_fr, title_ar, title_en, isco_code, document_id, referentiel_version, essential_uris, optional_uris',
    )
    .order('title_fr')
    .limit(limit);
  if (query) {
    // Les jokers de LIKE saisis par la personne sont neutralisés : on cherche une sous-chaîne littérale.
    request_ = request_.ilike(
      'search_text',
      `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
    );
  }
  if (isco) request_ = request_.like('isco_code', `${isco}%`);

  const { data, error } = await request_;
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to search occupations');

  return apiSuccess({
    occupations: (data ?? []).map((row) => ({
      id: row.uri.split('/').pop() ?? row.uri,
      uri: row.uri,
      titles: { fr: row.title_fr, ar: row.title_ar, en: row.title_en },
      iscoCode: row.isco_code,
      essentialCount: row.essential_uris.length,
      optionalCount: row.optional_uris.length,
    })),
  });
}
