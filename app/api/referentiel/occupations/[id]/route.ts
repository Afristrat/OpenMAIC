import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NextRequest } from 'next/server';

const ESCO_OCCUPATION_PREFIX = 'http://data.europa.eu/esco/occupation/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Skill = { title_fr: string; title_ar: string | null; title_en: string | null; uri: string };

function skillView(skill: Skill) {
  return {
    uri: skill.uri,
    // Seules les compétences ESCO ont une fiche publique ; les compétences d'organisme n'en ont pas.
    escoUri: skill.uri.includes('/esco/skill/') ? skill.uri : null,
    titles: { fr: skill.title_fr, ar: skill.title_ar, en: skill.title_en },
  };
}

/** Fiche d'un métier : ses titres, son code ISCO-08 et ses compétences essentielles et optionnelles. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  if (!UUID.test(id))
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid occupation id');

  const supabase = await createServerSupabaseClient();
  const { data: occupation, error } = await supabase
    .from('referentiel_occupations')
    .select('*')
    .eq('uri', `${ESCO_OCCUPATION_PREFIX}${id}`)
    .maybeSingle();
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read occupation');
  if (!occupation) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Occupation not found');

  const uris = [...occupation.essential_uris, ...occupation.optional_uris];
  const { data: skills, error: skillsError } = uris.length
    ? await supabase
        .from('referentiel_skills')
        .select('uri, title_fr, title_ar, title_en')
        .in('uri', uris)
    : { data: [], error: null };
  if (skillsError) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read skills');

  const byUri = new Map((skills ?? []).map((skill) => [skill.uri, skill]));
  const view = (list: string[]) =>
    list.flatMap((uri) => {
      const skill = byUri.get(uri);
      return skill ? [skillView(skill)] : [];
    });

  return apiSuccess({
    occupation: {
      id,
      uri: occupation.uri,
      titles: { fr: occupation.title_fr, ar: occupation.title_ar, en: occupation.title_en },
      iscoCode: occupation.isco_code,
      documentId: occupation.document_id,
      referentielVersion: occupation.referentiel_version,
    },
    essential: view(occupation.essential_uris),
    optional: view(occupation.optional_uris),
  });
}
