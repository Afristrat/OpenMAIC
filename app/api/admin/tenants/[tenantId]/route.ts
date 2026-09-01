import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { adminTenantPatchSchema } from '@/lib/api/schemas';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }
  const validation = validateBody(adminTenantPatchSchema, body);
  if (!validation.success) return validation.response;

  const { tenantId } = await params;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .rpc('update_tenant_controls', {
      actor_user_id: auth.user.id,
      tenant_id: tenantId,
      next_status: validation.data.status ?? null,
      next_seat_limit: validation.data.seatLimit ?? null,
    })
    .single();

  if (error || !data) {
    const conflict = /SEAT_LIMIT_BELOW_OCCUPANCY/i.test(error?.message ?? '');
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      conflict ? 409 : 500,
      conflict ? 'Seat limit is below current occupancy' : 'Failed to update tenant',
      error?.message,
    );
  }

  return apiSuccess({ tenant: data });
}
