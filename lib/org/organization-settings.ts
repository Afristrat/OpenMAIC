export function mergeOrganizationSettings(
  current: unknown,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...((current && typeof current === 'object' ? current : {}) as Record<string, unknown>),
    ...incoming,
  };
}
