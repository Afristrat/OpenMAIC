import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { adminTenantCreateSchema } from '@/lib/api/schemas';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  organizationInvitationUrl,
  sendOrganizationInvitationEmail,
} from '@/lib/server/organization-invitation-email';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 50);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
  const query = (url.searchParams.get('query') ?? '').trim().slice(0, 100);
  const status = url.searchParams.get('status');
  if (status !== null && status !== 'active' && status !== 'suspended') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid tenant status filter');
  }
  const supabase = createServiceSupabaseClient();
  let tenantQuery = supabase.from('organizations').select(
    'id, name, sector, default_locale, status, seat_limit, created_at, updated_at',
    { count: 'exact' },
  ).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (query) tenantQuery = tenantQuery.ilike('name', `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
  if (status) tenantQuery = tenantQuery.eq('status', status);
  const { data: tenants, error, count } = await tenantQuery;
  if (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list tenants',
      error.message,
    );
  }

  const tenantIds = (tenants ?? []).map((tenant) => tenant.id);
  const [{ data: members, error: membersError }, { data: invitations, error: invitationsError }] = tenantIds.length
    ? await Promise.all([
        supabase.from('org_members').select('org_id').in('org_id', tenantIds),
        supabase.from('org_invitations').select('org_id').in('org_id', tenantIds).is('used_at', null).gt('expires_at', new Date().toISOString()),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (membersError || invitationsError) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to load tenant summary');

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
    page: { offset, limit, total: count ?? 0 },
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

  const provisioned = data as {
    invitation_token: string;
    id: string;
    name: string;
    [key: string]: unknown;
  };
  const { invitation_token: invitationToken, ...tenant } = provisioned;
  let administratorInvitationUrl: string;
  try {
    administratorInvitationUrl = organizationInvitationUrl(invitationToken);
  } catch {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Invitation origin is not configured');
  }

  let administratorInvitationEmailSent = true;
  try {
    await sendOrganizationInvitationEmail({
      invitationId: `${tenant.id}:${input.administratorEmail.toLowerCase()}`,
      recipient: input.administratorEmail.toLowerCase(),
      organizationName: tenant.name,
      locale: input.defaultLocale,
      inviteUrl: administratorInvitationUrl,
    });
  } catch {
    // The invitation and its seat reservation remain valid. Returning the link
    // is an explicit, recoverable fallback when the provider is temporarily down.
    administratorInvitationEmailSent = false;
  }
  return apiSuccess({ tenant, administratorInvitationUrl, administratorInvitationEmailSent }, 201);
}
