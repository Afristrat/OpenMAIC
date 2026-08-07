import type { OccupationalProfile } from '@/lib/agents/contextual-specialist';

export const ISCO_08_SOURCE_URL = 'https://isco.ilo.org/en/isco-08/';
export const ESCO_SOURCE_VERSION = 'v1.2.1' as const;

export interface EscoResourceLink {
  uri?: string;
  title?: string;
  skillType?: string;
}

export interface EscoOccupationResource {
  uri?: string;
  title?: string;
  description?: Record<string, { literal?: string }>;
  _links?: {
    hasEssentialSkill?: EscoResourceLink[];
    hasEssentialKnowledge?: EscoResourceLink[];
  };
}

function compact(text: string): string {
  return text
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.;]\s*$/u, '');
}

export function readDescription(resource: EscoOccupationResource): string {
  if (!resource.description) return '';
  const english = resource.description.en?.literal;
  if (english) return english.trim();
  return (
    Object.values(resource.description)
      .find((value) => value.literal?.trim())
      ?.literal?.trim() ?? ''
  );
}

export function parseIscoTasks(description: string): string[] {
  const taskSection = description.match(
    /Tasks include\s*-\s*([\s\S]*?)(?=\n\s*Examples of (?:the )?occupations|\n\s*Some related occupations|$)/iu,
  )?.[1];
  if (!taskSection) return [];

  return [...taskSection.matchAll(/\([a-z]\)\s*([\s\S]*?)(?=\s*\([a-z]\)\s|$)/giu)]
    .map((match) => compact(match[1] ?? ''))
    .filter(Boolean)
    .slice(0, 12);
}

function uniqueTitles(links: EscoResourceLink[] | undefined, limit: number): string[] {
  return [
    ...new Set(
      (links ?? [])
        .map((link) => link.title?.trim())
        .filter((title): title is string => Boolean(title)),
    ),
  ].slice(0, limit);
}

export function buildOccupationalProfile(input: {
  iscoCode: string;
  occupation: EscoOccupationResource;
  unitGroup: EscoOccupationResource;
  iscoUri: string;
}): OccupationalProfile | null {
  const unitGroupDescription = readDescription(input.unitGroup);
  const tasks = parseIscoTasks(unitGroupDescription);
  const occupationDescription = readDescription(input.occupation);
  if (
    !input.occupation.uri ||
    !input.unitGroup.title ||
    !occupationDescription ||
    tasks.length === 0
  ) {
    return null;
  }

  return {
    standard: 'ISCO-08',
    unitGroupCode: input.iscoCode,
    unitGroupTitle: input.unitGroup.title.trim(),
    occupationDescription: compact(occupationDescription),
    tasks,
    sourceTasks: [...tasks],
    taskLocale: 'en-US',
    sourceVersion: ESCO_SOURCE_VERSION,
    essentialSkills: uniqueTitles(input.occupation._links?.hasEssentialSkill, 12),
    knowledge: uniqueTitles(input.occupation._links?.hasEssentialKnowledge, 8),
    iscoUri: input.iscoUri,
    occupationUri: input.occupation.uri,
    sourceUrl: ISCO_08_SOURCE_URL,
  };
}

export function applyLocalizedTasks(
  profile: OccupationalProfile,
  localizedTasks: string[],
  locale: OccupationalProfile['taskLocale'],
): OccupationalProfile | null {
  const tasks = localizedTasks.map(compact).filter(Boolean);
  if (tasks.length !== profile.sourceTasks.length) return null;
  return { ...profile, tasks, taskLocale: locale };
}

export function buildSpecialistPersona(input: {
  name: string;
  occupationTitle: string;
  reason: string;
  profile: OccupationalProfile;
}): string {
  const tasks = input.profile.tasks.slice(0, 6).join('; ');
  const capabilities = [...input.profile.essentialSkills, ...input.profile.knowledge]
    .slice(0, 6)
    .join('; ');

  return [
    `You are ${input.name}, a professional specialist in ${input.occupationTitle}.`,
    `Your occupational grounding is ISCO-08 unit group ${input.profile.unitGroupCode}, ${input.profile.unitGroupTitle}.`,
    `Relevant official tasks: ${tasks}.`,
    capabilities ? `Relevant capabilities: ${capabilities}.` : '',
    `Reason for joining this classroom: ${input.reason}.`,
    'Intervene only when this professional lens materially improves understanding. Use concrete and transferable examples, use cases, objections and blind spots grounded in the course sources and this occupational profile. Do not imitate the permanent pedagogical personas. Never turn the training exchange into personalized consulting.',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4_000);
}
