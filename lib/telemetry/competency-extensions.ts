import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { xapiDeliveryId } from './xapi-delivery';
import type { XAPIStatement } from './xapi';

/** Extensions attendues par le récepteur xAPI de Taqwim (contrat Q6). */
export const COMPETENCY_EXTENSIONS = {
  competence: 'https://taqwim.ma/xapi/extensions/competence-uri',
  version: 'https://taqwim.ma/xapi/extensions/referentiel-version',
  isco: 'https://taqwim.ma/xapi/extensions/isco-08',
} as const;

export type CompetencyLink = {
  uri: string;
  /** « <id du CFDocument>@<version> », 100 caractères au plus. */
  version: string;
  /** Groupe de base ISCO-08, quatre chiffres ; null quand la formation ne le porte pas. */
  isco: string | null;
};

type SupabaseLike = Pick<ReturnType<typeof createServiceSupabaseClient>, 'from'>;

/** Identifiants de formation et de scène portés par l'IRI d'activité `https://qalem.app/stages/<id>/scenes/<id>`. */
export function activityScope(
  statement: XAPIStatement,
): { stageId: string; sceneId: string } | null {
  const match = /\/stages\/([^/]+)\/scenes\/([^/]+)$/.exec(statement.object.id);
  return match?.[1] && match[2] ? { stageId: match[1], sceneId: match[2] } : null;
}

/**
 * Compétences confirmées par une personne pour la scène du relevé. Une scène sans lien confirmé,
 * ou un relevé qui ne vise pas une scène, n'en porte aucune : le relevé part alors tel quel.
 */
export async function confirmedCompetencies(
  statement: XAPIStatement,
  supabase: SupabaseLike = createServiceSupabaseClient(),
): Promise<CompetencyLink[]> {
  const scope = activityScope(statement);
  if (!scope) return [];

  const { data: links, error } = await supabase
    .from('scene_competencies')
    .select('competency_uri, referential_version')
    .eq('scene_id', scope.sceneId)
    .eq('statut', 'confirme')
    .order('competency_uri');
  if (error) throw new Error(`Scene competencies lookup failed: ${error.message}`);
  if (!links || links.length === 0) return [];

  const iscoByUri = new Map<string, string>();
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('stage_id', scope.stageId)
    .maybeSingle();
  if (courseError) throw new Error(`Course lookup failed: ${courseError.message}`);
  if (course) {
    const { data: courseLinks, error: courseLinksError } = await supabase
      .from('course_competencies')
      .select('competency_uri, isco_08')
      .eq('course_id', course.id)
      .in(
        'competency_uri',
        links.map((link) => link.competency_uri),
      );
    if (courseLinksError) {
      throw new Error(`Course competencies lookup failed: ${courseLinksError.message}`);
    }
    for (const row of courseLinks ?? []) {
      if (row.isco_08) iscoByUri.set(row.competency_uri, row.isco_08);
    }
  }

  return links.map((link) => ({
    uri: link.competency_uri,
    version: link.referential_version,
    isco: iscoByUri.get(link.competency_uri) ?? null,
  }));
}

/** Le même relevé, avec la compétence visée portée par ses extensions de contexte. */
export function withCompetency(statement: XAPIStatement, link: CompetencyLink): XAPIStatement {
  return {
    ...statement,
    context: {
      ...statement.context,
      extensions: {
        ...statement.context?.extensions,
        [COMPETENCY_EXTENSIONS.competence]: link.uri,
        [COMPETENCY_EXTENSIONS.version]: link.version,
        ...(link.isco ? { [COMPETENCY_EXTENSIONS.isco]: link.isco } : {}),
      },
    },
  };
}

/**
 * Relevés à livrer pour un événement durable : un par compétence confirmée (le récepteur lit une seule
 * compétence par relevé), ou le relevé d'origine quand la scène n'en a aucune. L'identité de chaque
 * relevé est stable, donc une nouvelle tentative rejoue les mêmes PUT sans doublon.
 */
export function deliveryPlan(
  statement: XAPIStatement,
  links: readonly CompetencyLink[],
  orgId: string,
  dedupeKey: string,
): { statementId: string; statement: XAPIStatement }[] {
  if (links.length === 0) {
    return [{ statementId: xapiDeliveryId(orgId, dedupeKey), statement }];
  }
  return links.map((link) => ({
    statementId: xapiDeliveryId(orgId, `${dedupeKey}|${link.uri}`),
    statement: withCompetency(statement, link),
  }));
}
