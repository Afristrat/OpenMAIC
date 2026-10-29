/**
 * Organisation débitée par les appels d'IA de l'extension : celle dont l'auteur est membre.
 *
 * Rien n'est stocké sur le jeton : l'appartenance est relue à chaque appel, pour qu'une
 * organisation quittée ou suspendue ne soit jamais débitée. Si l'auteur appartient à plusieurs
 * organisations, la plus ancienne gagne (règle déterministe, décidée par Amine : l'organisation
 * associée à l'adresse de l'auteur, sans choix à faire dans l'extension).
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';

const AUTHORING_ROLES = ['admin', 'manager', 'author', 'formateur'];

export async function resolveBillingOrganization(userId: string): Promise<string | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('org_members')
    .select('org_id, organizations!inner(status)')
    .eq('user_id', userId)
    .eq('organizations.status', 'active')
    .in('role', AUTHORING_ROLES)
    .order('created_at', { ascending: true })
    .limit(1)
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error('Billing organization lookup unavailable');
  const orgId = data?.[0]?.org_id;
  return typeof orgId === 'string' ? orgId : null;
}
