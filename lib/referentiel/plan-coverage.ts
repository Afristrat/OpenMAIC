/**
 * Couverture des compétences visées par les scènes d'un plan : chaque compétence du cadre reçoit un
 * code court (C1, C2…) que le modèle recopie dans `competencies` pour chaque scène ; le serveur ne
 * garde que les codes connus, et le plan n'est valide que si chaque compétence essentielle est
 * travaillée par au moins une scène.
 */

import type { SceneOutline } from '@/lib/types/generation';
import { z } from 'zod';
import type { FrameworkSkillNature, ResolvedCompetencyFramework } from './plan-framework';

export type PlanCompetency = {
  code: string;
  uri: string;
  title: string;
  nature: FrameworkSkillNature;
};

export const planCompetencyFrameworkSchema = z.object({
  occupation: z.object({
    uri: z.string().max(500),
    titleFr: z.string().max(500),
    isco08: z.string().max(8),
    referentialVersion: z.string().max(100),
  }),
  skills: z
    .array(
      z.object({
        code: z.string().max(8),
        uri: z.string().max(500),
        title: z.string().max(1000),
        nature: z.enum(['essentielle', 'optionnelle']),
      }),
    )
    .max(60),
});

export type PlanCompetencyFramework = {
  occupation: ResolvedCompetencyFramework['occupation'];
  skills: PlanCompetency[];
};

/** Donne à chaque compétence du cadre un code stable, dans l'ordre : essentielles d'abord. */
export function codeFramework(framework: ResolvedCompetencyFramework): PlanCompetencyFramework {
  const ordered = [
    ...framework.skills.filter((skill) => skill.nature === 'essentielle'),
    ...framework.skills.filter((skill) => skill.nature === 'optionnelle'),
  ];
  return {
    occupation: framework.occupation,
    skills: ordered.map((skill, index) => ({ ...skill, code: `C${index + 1}` })),
  };
}

/** Ne garde, pour chaque scène, que des codes du cadre, sans doublon, dans l'ordre du cadre. */
export function sanitizeSceneCompetencies(
  outlines: readonly SceneOutline[],
  framework: PlanCompetencyFramework,
): SceneOutline[] {
  const known = new Map(framework.skills.map((skill, index) => [skill.code, index]));
  return outlines.map((outline) => {
    const raw: unknown = outline.competencies;
    const wanted = Array.isArray(raw)
      ? raw.filter((code): code is string => typeof code === 'string')
      : [];
    const codes = [...new Set(wanted.map((code) => code.trim().toUpperCase()))]
      .filter((code) => known.has(code))
      .sort((a, b) => (known.get(a) ?? 0) - (known.get(b) ?? 0));
    return { ...outline, competencies: codes };
  });
}

/**
 * Compétences essentielles exigées à la création qu'aucune scène du plan approuvé ne travaille.
 * Le rapprochement se fait par URI, jamais par code : si la personne a changé sa sélection après la
 * génération du plan, une compétence que le plan ignore compte comme non travaillée.
 */
export function uncoveredRequiredEssentials(
  outlines: readonly { competencies?: readonly string[] }[],
  planFramework: PlanCompetencyFramework | undefined,
  required: ResolvedCompetencyFramework,
): { uri: string; title: string }[] {
  const worked = new Set(outlines.flatMap((outline) => outline.competencies ?? []));
  const codeByUri = new Map((planFramework?.skills ?? []).map((skill) => [skill.uri, skill.code]));
  return required.skills
    .filter((skill) => skill.nature === 'essentielle')
    .filter((skill) => {
      const code = codeByUri.get(skill.uri);
      return code === undefined || !worked.has(code);
    })
    .map((skill) => ({ uri: skill.uri, title: skill.title }));
}

/** Compétences essentielles du cadre qu'aucune scène ne travaille. */
export function uncoveredEssentials(
  outlines: readonly SceneOutline[],
  framework: PlanCompetencyFramework,
): PlanCompetency[] {
  const worked = new Set(outlines.flatMap((outline) => outline.competencies ?? []));
  return framework.skills.filter(
    (skill) => skill.nature === 'essentielle' && !worked.has(skill.code),
  );
}
