import { requireSuperAdmin } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

/** Membres d'une organisation pouvant recevoir une formation en propriété (rôles de création). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  const { tenantId } = await params;
  const supabase = createServiceSupabaseClient();
  const { data: members, error } = await supabase
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', tenantId)
    .in('role', ['admin', 'manager', 'formateur', 'author'])
    .limit(100);
  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to list members');
  }

  const owners = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data } = await supabase.auth.admin.getUserById(member.user_id);
      return { id: member.user_id, role: member.role, email: data.user?.email ?? null };
    }),
  );
  return apiSuccess({ owners });
}
