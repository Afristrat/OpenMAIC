import type { OrgMemberRole } from '@/lib/supabase/types';

/**
 * Seuls les administrateurs et les gestionnaires publient dans la bibliothèque d'une organisation.
 * La même liste vit dans la base (déclencheur `guard_share` et politique d'insertion de
 * `shared_classrooms`) : la modifier ici sans la migration correspondante ferait afficher des gestes
 * que la base refuse.
 */
const LIBRARY_PUBLISHER_ROLES: readonly OrgMemberRole[] = ['admin', 'manager'];

export function canPublishToLibrary(role: OrgMemberRole | null | undefined): boolean {
  return role != null && LIBRARY_PUBLISHER_ROLES.includes(role);
}
