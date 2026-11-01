/**
 * Cadre de compétences d'une formation : le métier ESCO visé (avec son code ISCO-08) et les
 * compétences que la formation travaille. Exigé dès le plan à valider et à la création : le client
 * n'envoie que des identifiants, le serveur les relit dans le miroir du référentiel et n'accepte
 * ni un métier inconnu, ni un code ISCO inexploitable, ni une compétence étrangère à ce métier.
 */

import { z } from 'zod';

export const MAX_FRAMEWORK_SKILLS = 60;

export const competencyFrameworkSchema = z.strictObject({
  occupationUri: z.string().trim().min(1).max(500),
  skillUris: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_FRAMEWORK_SKILLS),
});

export type CompetencyFrameworkInput = z.infer<typeof competencyFrameworkSchema>;

export type FrameworkSkillNature = 'essentielle' | 'optionnelle';

export type ResolvedCompetencyFramework = {
  occupation: { uri: string; titleFr: string; isco08: string; referentialVersion: string };
  skills: { uri: string; title: string; nature: FrameworkSkillNature }[];
};

export type FrameworkErrorCode = 'COMPETENCY_FRAMEWORK_REQUIRED' | 'COMPETENCY_FRAMEWORK_INVALID';

export class FrameworkError extends Error {
  constructor(
    readonly code: FrameworkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FrameworkError';
  }
}

const ISCO_BASE_GROUP = /^[0-9]{4}$/;

/** Rattache chaque compétence demandée à la liste du métier ; renvoie aussi celles qui lui sont étrangères. */
export function classifyRequestedSkills(
  occupation: { essential_uris: readonly string[]; optional_uris: readonly string[] },
  requested: readonly string[],
): { accepted: { uri: string; nature: FrameworkSkillNature }[]; foreign: string[] } {
  const essential = new Set(occupation.essential_uris);
  const optional = new Set(occupation.optional_uris);
  const accepted: { uri: string; nature: FrameworkSkillNature }[] = [];
  const foreign: string[] = [];
  const seen = new Set<string>();
  for (const uri of requested) {
    if (seen.has(uri)) continue;
    seen.add(uri);
    if (essential.has(uri)) accepted.push({ uri, nature: 'essentielle' });
    else if (optional.has(uri)) accepted.push({ uri, nature: 'optionnelle' });
    else foreign.push(uri);
  }
  return { accepted, foreign };
}

/** Code ISCO-08 de groupe de base (quatre chiffres) du métier, ou erreur : un code partiel n'est pas exploitable. */
export function requireBaseIscoCode(iscoCode: string | null | undefined): string {
  if (typeof iscoCode === 'string' && ISCO_BASE_GROUP.test(iscoCode)) return iscoCode;
  throw new FrameworkError(
    'COMPETENCY_FRAMEWORK_INVALID',
    "Le métier choisi n'a pas de code ISCO-08 à quatre chiffres : choisissez un métier du référentiel qui en porte un.",
  );
}

/** Consigne ajoutée au plan : ce que la formation doit faire acquérir, pour que le plan parte du référentiel. */
export function frameworkDirective(framework: ResolvedCompetencyFramework): string {
  const essential = framework.skills.filter((skill) => skill.nature === 'essentielle');
  const optional = framework.skills.filter((skill) => skill.nature === 'optionnelle');
  const lines = [
    `TARGET OCCUPATION (ESCO, ISCO-08 ${framework.occupation.isco08}): ${framework.occupation.titleFr}.`,
    'The plan must train the learner to master the target skills below. Each learning objective must serve at least one of them, and every essential skill must be worked by at least one scene.',
    ...(essential.length
      ? ['Essential skills:', ...essential.map((skill) => `- ${skill.title}`)]
      : []),
    ...(optional.length
      ? [
          'Optional skills (cover them when time allows):',
          ...optional.map((skill) => `- ${skill.title}`),
        ]
      : []),
  ];
  return lines.join('\n');
}
