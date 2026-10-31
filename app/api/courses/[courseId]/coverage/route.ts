import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { competenciesOfOccupation, fetchCasePackage } from '@/lib/referentiel/case-client';
import { computeOccupationCoverage } from '@/lib/referentiel/coverage';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

const REFERENTIEL_URL = process.env.REFERENTIEL_URL ?? 'https://referentiel.ai-mpower.com';
const DOCUMENT_ID = /^[0-9a-f-]{36}$|^[A-Za-z0-9_-]{1,64}$/;
const ESCO_OCCUPATION_URI = /^http:\/\/data\.europa\.eu\/esco\/occupation\/[0-9a-f-]{36}$/;

/**
 * Couverture d'un métier du référentiel commun par une formation : parmi les compétences essentielles
 * et optionnelles du métier, celles que la formation vise (`course_competencies`) et celles qui manquent.
 * Requête : `?document=<id du CFDocument>&occupation=<URI ESCO du métier>`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  const document = request.nextUrl.searchParams.get('document') ?? '';
  const occupation = request.nextUrl.searchParams.get('occupation') ?? '';
  if (!DOCUMENT_ID.test(document) || !ESCO_OCCUPATION_URI.test(occupation)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'document and occupation are required');
  }

  const supabase = createServiceSupabaseClient();
  const { data: course, error } = await supabase
    .from('courses')
    .select('id, org_id, owner_id, stage_id')
    .eq('id', courseId)
    .maybeSingle();
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read course');
  if (!course?.org_id) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');

  const auth = await requireSuperAdminOrOrgEditor(
    request,
    course.org_id,
    course.owner_id,
    course.stage_id ?? undefined,
  );
  if (auth.response) return auth.response;

  const links = await supabase
    .from('course_competencies')
    .select('competency_uri')
    .eq('course_id', courseId);
  if (links.error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read competency links');
  }

  // ponytail: un paquet CASE lu à chaque requête (jusqu'à 13 s pour le plus gros document), cache mémoire à ajouter si l'appel devient fréquent
  let source;
  try {
    source = competenciesOfOccupation(
      await fetchCasePackage(REFERENTIEL_URL, document),
      occupation,
    );
  } catch {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 502, 'Referential unavailable');
  }
  if (!source) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Occupation not found in this document');
  }

  return apiSuccess(
    computeOccupationCoverage(
      source,
      (links.data ?? []).map((link) => link.competency_uri),
    ),
  );
}
