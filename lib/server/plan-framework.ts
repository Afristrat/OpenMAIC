/**
 * Cadre de compétences d'une formation côté serveur : relecture dans le miroir du référentiel,
 * exigence à la demande de plan et à la création, enregistrement des liens de la formation.
 */

import {
  classifyRequestedSkills,
  FrameworkError,
  requireBaseIscoCode,
  type CompetencyFrameworkInput,
  type ResolvedCompetencyFramework,
} from '@/lib/referentiel/plan-framework';
import { readReferentielSkills } from '@/lib/server/referentiel-skills';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

type OccupationRow = {
  uri: string;
  title_fr: string;
  isco_code: string | null;
  referentiel_version: string;
  essential_uris: string[];
  optional_uris: string[];
};

/** Relit le métier et ses compétences dans le miroir : le client ne fournit que des identifiants. */
export async function resolveCompetencyFramework(
  input: CompetencyFrameworkInput,
): Promise<ResolvedCompetencyFramework> {
  const supabase = createServiceSupabaseClient();
  const { data: occupation, error } = await supabase
    .from('referentiel_occupations')
    .select('uri, title_fr, isco_code, referentiel_version, essential_uris, optional_uris')
    .eq('uri', input.occupationUri)
    .maybeSingle<OccupationRow>();
  if (error) throw new Error(`Failed to read the occupation: ${error.message}`);
  if (!occupation) {
    throw new FrameworkError(
      'COMPETENCY_FRAMEWORK_INVALID',
      "Ce métier n'existe pas dans le référentiel ESCO de Qalem.",
    );
  }
  const isco08 = requireBaseIscoCode(occupation.isco_code);
  const { accepted, foreign } = classifyRequestedSkills(occupation, input.skillUris);
  if (foreign.length > 0 || accepted.length === 0) {
    throw new FrameworkError(
      'COMPETENCY_FRAMEWORK_INVALID',
      'Chaque compétence visée doit appartenir au métier choisi, et au moins une est nécessaire.',
    );
  }
  const { data: titles, error: titlesError } = await readReferentielSkills(
    supabase,
    accepted.map((skill) => skill.uri),
  );
  if (titlesError) throw new Error(`Failed to read the skills: ${titlesError.message}`);
  const titleOf = new Map(titles.map((row) => [row.uri, row.title_fr]));
  return {
    occupation: {
      uri: occupation.uri,
      titleFr: occupation.title_fr,
      isco08,
      referentialVersion: occupation.referentiel_version,
    },
    skills: accepted.map((skill) => ({
      uri: skill.uri,
      title: titleOf.get(skill.uri) ?? skill.uri.split('/').pop() ?? skill.uri,
      nature: skill.nature,
    })),
  };
}

/**
 * Exigence d'une création ou d'un plan : le cadre fourni est vérifié et renvoyé ; sans cadre, seule
 * une formation qui porte déjà des compétences visées peut continuer (reprise d'une formation
 * existante). Toute autre demande est refusée avec l'erreur que l'écran sait expliquer.
 */
export async function requireCompetencyFramework(params: {
  courseId?: string;
  framework?: CompetencyFrameworkInput;
}): Promise<ResolvedCompetencyFramework | null> {
  // Un cadre sans aucune compétence vaut absence de cadre : même refus, même message à l'écran.
  if (params.framework && params.framework.skillUris.length > 0) {
    return resolveCompetencyFramework(params.framework);
  }
  if (params.courseId) {
    const { count, error } = await createServiceSupabaseClient()
      .from('course_competencies')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', params.courseId);
    if (error) throw new Error(`Failed to read the course competencies: ${error.message}`);
    if ((count ?? 0) > 0) return null;
  }
  throw new FrameworkError(
    'COMPETENCY_FRAMEWORK_REQUIRED',
    'Choisissez le métier ESCO visé et au moins une compétence avant de continuer : la formation se construit à partir du référentiel.',
  );
}

/** Enregistre les compétences visées de la formation créée, avec le code ISCO-08 du métier. */
export async function saveCourseCompetencies(params: {
  courseId: string;
  orgId: string;
  userId: string;
  framework: ResolvedCompetencyFramework;
}): Promise<void> {
  const { courseId, orgId, userId, framework } = params;
  const { error } = await createServiceSupabaseClient()
    .from('course_competencies')
    .upsert(
      framework.skills.map((skill) => ({
        course_id: courseId,
        org_id: orgId,
        competency_uri: skill.uri,
        referential_version: framework.occupation.referentialVersion,
        isco_08: framework.occupation.isco08,
        nature: skill.nature,
        created_by: userId,
      })),
      { onConflict: 'course_id,competency_uri' },
    );
  if (error) throw new Error(`Failed to save the course competencies: ${error.message}`);
}
