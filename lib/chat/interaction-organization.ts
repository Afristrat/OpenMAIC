/**
 * `serverOrganizationId` has three states:
 * - string: the server authorized this classroom interaction;
 * - null: the server explicitly denied interaction for this public classroom;
 * - undefined: local/unsaved classroom, where the selected organization is authoritative.
 */
export function resolveInteractionOrganizationId(
  serverOrganizationId: string | null | undefined,
  localOrganizationId: string | null,
): string | null {
  return serverOrganizationId === undefined ? localOrganizationId : serverOrganizationId;
}
