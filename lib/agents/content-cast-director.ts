import type { TenantPersonaProfile } from '@/lib/agents/persona-catalog';

export function buildContentCastPrompt({
  courseTitle,
  outlines,
  personas,
}: {
  courseTitle: string;
  outlines: unknown[];
  personas: TenantPersonaProfile[];
}): string {
  const availableMechanisms = personas
    .filter((persona) => persona.enabled && persona.role !== 'teacher')
    .map(({ id, label, persona }) => ({ id, label, persona }));

  return `Select the 3 most useful classroom mechanisms for this course. You must select only IDs from the supplied roster. Do not invent people, names, voices, avatars, roles, or mechanisms. Return only JSON: {"mechanismIds":["id","id","id"]}.

Course: ${courseTitle}
Outlines: ${JSON.stringify(outlines)}
Available mechanisms: ${JSON.stringify(availableMechanisms)}`;
}

export function parseContentCastMechanisms(
  raw: string,
  allowedMechanismIds: readonly string[],
): string[] {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as { mechanismIds?: unknown };
    if (!Array.isArray(parsed.mechanismIds)) return [];
    return [...new Set(parsed.mechanismIds)]
      .filter((id): id is string => typeof id === 'string' && allowedMechanismIds.includes(id))
      .slice(0, 3);
  } catch {
    return [];
  }
}
