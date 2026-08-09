const LEAKED_MACHINE_CONTRACT =
  /(?:return|retourne[rz]?|أرجع|أعد|field|champ|حقل|object|objet|كائن)[^\n]{0,160}(?:json)[^\n]{0,160}(?:requirement)|(?:requirement)[^\n]{0,160}(?:json|field|champ|حقل)/i;

export function parseRefinedRequirement(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { requirement?: unknown };
    if (typeof parsed.requirement !== 'string' || !parsed.requirement.trim()) return null;
    const requirement = parsed.requirement.trim();
    return LEAKED_MACHINE_CONTRACT.test(requirement) ? null : requirement;
  } catch {
    return null;
  }
}
