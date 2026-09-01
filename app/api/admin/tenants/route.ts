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
  const [
    { data: tenants, error },
    { data: members, error: membersError },
    { data: invitations, error: invitationsError },
  ] = await Promise.all([
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

  if (error || membersError || invitationsError) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list tenants',
      error?.message ?? membersError?.message ?? invitationsError?.message,
    );
  }

  // ponytail: one reconciliation RPC per tenant; replace with a set-returning
  // RPC only if measured tenant volume makes this administration view slow.
  const creditStates = await Promise.all(
    (tenants ?? []).map(async (tenant) => {
      const { data, error: creditError } = await supabase
        .rpc('reconcile_tenant_credit_wallet', { tenant_id: tenant.id })
        .single();
      return {
        tenantId: tenant.id,
        state: data as { balance_microunits: number | string; consistent: boolean } | null,
        error: creditError,
      };
    }),
  );
  if (creditStates.some((credit) => credit.error || !credit.state)) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to reconcile tenant credits');
  }
  if (creditStates.some((credit) => !credit.state?.consistent)) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 409, 'Credit ledger divergence');
  }

  const memberCounts = new Map<string, number>();
  const invitationCounts = new Map<string, number>();
  const creditBalances = new Map<string, number>();
  for (const member of members ?? []) {
    memberCounts.set(member.org_id, (memberCounts.get(member.org_id) ?? 0) + 1);
  }
  for (const invitation of invitations ?? []) {
    invitationCounts.set(invitation.org_id, (invitationCounts.get(invitation.org_id) ?? 0) + 1);
  }
  for (const credit of creditStates) {
    creditBalances.set(credit.tenantId, Number(credit.state?.balance_microunits ?? 0));
  }

  return apiSuccess({
    tenants: (tenants ?? []).map((tenant) => ({
      ...tenant,
      memberCount: memberCounts.get(tenant.id) ?? 0,
      pendingInvitationCount: invitationCounts.get(tenant.id) ?? 0,
      creditBalanceMicrounits: creditBalances.get(tenant.id) ?? 0,
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
  const provisioned = data as {
    invitation_token: string;
    [key: string]: unknown;
  };
  const { invitation_token: invitationToken, ...tenant } = provisioned;
  return apiSuccess(
    { tenant, administratorInvitationUrl: `${origin}/auth?invite=${invitationToken}` },
    201,
  );
}
