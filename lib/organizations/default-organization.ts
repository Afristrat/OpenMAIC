export type DefaultOrganizationCandidate = {
  id: string;
  created_at: string;
  isDirectMember?: boolean;
};

/**
 * Chooses the organization a user lands in when the browser has no usable choice.
 *
 * The API order is not a contract: it lists a super-administrator's tenants newest
 * first and other members' tenants in database order. Taking "the first direct
 * membership" therefore moved a user's workspace to whichever tenant was created
 * last, hiding their courses. The default is instead the oldest organization the
 * user belongs to directly, which is stable when memberships are added later.
 *
 * A remembered choice wins only while it is still allowed: the user is a direct
 * member, or the tenant is the one a super-administrator is explicitly testing.
 */
export function pickDefaultOrganization<T extends DefaultOrganizationCandidate>(
  organizations: readonly T[],
  context: { savedOrganizationId: string | null; testedTenantId: string | null },
): T | null {
  const saved = context.savedOrganizationId
    ? organizations.find((organization) => organization.id === context.savedOrganizationId)
    : undefined;
  if (saved && (saved.isDirectMember || context.testedTenantId === saved.id)) return saved;

  const oldestDirect = organizations
    .filter((organization) => organization.isDirectMember)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
  return oldestDirect ?? organizations[0] ?? null;
}
