import { callLLM } from '@/lib/ai/llm';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { runWithUsageMeteringContext, withStableIdempotencyKey } from '@/lib/billing/usage-context';
import { createLogger } from '@/lib/logger';
import {
  excerptOf,
  parseProposals,
  proposalPrompt,
  type ProposalCompetency,
  type ProposalScene,
} from '@/lib/referentiel/scene-proposal';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { creditsErrorResponse } from '@/lib/server/credit-error-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

const log = createLogger('CompetencyLinks');

export const maxDuration = 90;

/**
 * Propose, pour chaque scène de la formation, les compétences visées qu'elle travaille ou évalue.
 * Les propositions sont enregistrées au statut « proposé » : rien n'est émis vers un LRS tant qu'une
 * personne ne les a pas confirmées. Un lien déjà confirmé n'est jamais modifié.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  const supabase = createServiceSupabaseClient();
  const { data: course, error } = await supabase
    .from('courses')
    .select('id, org_id, owner_id, stage_id')
    .eq('id', courseId)
    .maybeSingle();
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read course');
  if (!course?.org_id) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
  if (!course.stage_id) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Course has no classroom');
  }

  const auth = await requireSuperAdminOrOrgEditor(
    request,
    course.org_id,
    course.owner_id,
    course.stage_id,
  );
  if (auth.response) return auth.response;

  try {
    const [links, scenesResult] = await Promise.all([
      supabase.from('course_competencies').select('competency_uri').eq('course_id', courseId),
      supabase
        .from('scenes')
        .select('id, title, type, content')
        .eq('stage_id', course.stage_id)
        .order('order'),
    ]);
    if (links.error || scenesResult.error) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read course data');
    }
    const uris = (links.data ?? []).map((link) => link.competency_uri);
    if (uris.length === 0) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Target competencies must be chosen on the course first',
      );
    }

    const { data: skills, error: skillsError } = await supabase
      .from('referentiel_skills')
      .select('uri, title_fr')
      .in('uri', uris);
    if (skillsError) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read skills');
    const titles = new Map((skills ?? []).map((skill) => [skill.uri, skill.title_fr]));
    const competencies: ProposalCompetency[] = uris.map((uri) => ({
      uri,
      title: titles.get(uri) ?? uri.split('/').pop() ?? uri,
    }));
    const scenes: ProposalScene[] = (scenesResult.data ?? []).map((scene) => ({
      id: scene.id,
      title: scene.title ?? '',
      type: scene.type,
      excerpt: excerptOf(scene.content),
    }));
    if (scenes.length === 0) return apiSuccess({ proposed: 0 });

    // Rattacher une scène à une compétence est un jugement court : l'étape a son propre réglage de modèle.
    const { model, thinkingConfig } = await resolveModelFromRequest(
      request,
      null,
      'competency-links',
    );
    const { system, prompt } = proposalPrompt(scenes, competencies);
    const response = await runWithUsageMeteringContext(
      withStableIdempotencyKey(request.headers),
      auth.user.id,
      course.org_id,
      () =>
        callLLM(
          { model, system, prompt },
          'competency-links',
          { retries: 1, validate: (text) => parseProposals(text, scenes, competencies) !== null },
          thinkingConfig,
        ),
    );
    const proposals = parseProposals(response.text, scenes, competencies);
    if (!proposals) return apiError('PARSE_FAILED', 502, 'The proposal is unreadable');
    if (proposals.length === 0) return apiSuccess({ proposed: 0 });

    const version = await referentielVersionOf(supabase, courseId, uris);
    const { error: upsertError } = await supabase.from('scene_competencies').upsert(
      proposals.flatMap((proposal) => {
        const referentialVersion = version.get(proposal.uri);
        return referentialVersion
          ? [
              {
                scene_id: proposal.sceneId,
                org_id: course.org_id,
                competency_uri: proposal.uri,
                referential_version: referentialVersion,
                nature: proposal.nature,
                statut: 'propose',
              },
            ]
          : [];
      }),
      // Un lien déjà présent, proposé ou confirmé, reste tel quel.
      { onConflict: 'scene_id,competency_uri,nature', ignoreDuplicates: true },
    );
    if (upsertError) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to save the proposals');
    }
    return apiSuccess({ proposed: proposals.length });
  } catch (caught) {
    const creditsResponse = creditsErrorResponse(caught);
    if (creditsResponse) return creditsResponse;
    log.error('Competency link proposal failed:', caught);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Competency link proposal failed');
  }
}

/** Version du référentiel enregistrée au niveau formation pour chaque compétence visée. */
async function referentielVersionOf(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  courseId: string,
  uris: string[],
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('course_competencies')
    .select('competency_uri, referential_version')
    .eq('course_id', courseId)
    .in('competency_uri', uris);
  return new Map((data ?? []).map((row) => [row.competency_uri, row.referential_version]));
}
