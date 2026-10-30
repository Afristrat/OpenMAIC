import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShareRepository } from './publish-to-library';

/** Dépôt de partages adossé à Supabase : les politiques RLS et le déclencheur de la base restent seuls juges. */
export function supabaseShareRepository(client: SupabaseClient): ShareRepository {
  return {
    async listExisting(orgId, stageIds) {
      const { data, error } = await client
        .from('shared_classrooms')
        .select('id, stage_id, visibility')
        .eq('org_id', orgId)
        .in('stage_id', [...stageIds]);
      if (error) throw new Error(`Lecture de la bibliothèque impossible : ${error.message}`);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        stageId: String(row.stage_id),
        visibility: String(row.visibility),
      }));
    },
    async insert(orgId, stageId) {
      const { error } = await client
        .from('shared_classrooms')
        .insert({ org_id: orgId, stage_id: stageId, visibility: 'organization' });
      return error ? (error.code ?? 'unknown') : null;
    },
    async makeVisibleToOrganization(shareId) {
      const { error } = await client
        .from('shared_classrooms')
        .update({ visibility: 'organization' })
        .eq('id', shareId);
      return error ? (error.code ?? 'unknown') : null;
    },
  };
}
