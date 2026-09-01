import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { adminTenantCreateSchema } from '@/lib/api/schemas';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const [{ data: tenants, error }, { data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, sector, default_locale, status, seat_limit, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase.from('org_members').select('org_id'),
    supabase
      .from('org_invitations')
      .select('org_id')
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString()),
  ]);

  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to list tenants', error.message);
  }

  const memberCounts = new Map<string, number>();
  const invitationCounts = new Map<string, number>();
  for (const member of members ?? []) {
    memberCounts.set(member.org_id, (memberCounts.get(member.org_id) ?? 0) + 1);
  }
  for (const invitation of invitations ?? []) {
    invitationCounts.set(invitation.org_id, (invitationCounts.get(invitation.org_id) ?? 0) + 1);
  }

  return apiSuccess({
    tenants: (tenants ?? []).map((tenant) => ({
      ...tenant,
      memberCount: memberCounts.get(tenant.id) ?? 0,
      pendingInvitationCount: invitationCounts.get(tenant.id) ?? 0,
    })),
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }
  const validation = validateBody(adminTenantCreateSchema, body);
  if (!validation.success) return validation.response;

  const input = validation.data;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .rpc('provision_tenant_with_admin_invitation', {
      actor_user_id: auth.user.id,
      tenant_name: input.name,
      tenant_sector: input.sector,
      tenant_locale: input.defaultLocale,
      tenant_seat_limit: input.seatLimit,
      administrator_email: input.administratorEmail.toLowerCase(),
    })
    .single();

  if (error || !data) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to provision tenant',
      error?.message,
    );
  }

  const origin = request.headers.get('origin') ?? request.nextUrl.origin;
  const { invitation_token: invitationToken, ...tenant } = data;
  return apiSuccess(
    { tenant, administratorInvitationUrl: `${origin}/auth?invite=${invitationToken}` },
    201,
  );
}
