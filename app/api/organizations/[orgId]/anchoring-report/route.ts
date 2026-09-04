import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { orgId } = await params;
  const { data, error } = await supabase.rpc('anchor_org_report', { target_org_id: orgId });
  if (error) return apiError('UNAUTHORIZED', 403, 'Accès aux agrégats d’ancrage refusé');
  return apiSuccess({ anchoring: data?.[0] ?? null });
}
