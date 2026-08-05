/**
 * Single Organization API
 *
 * GET    /api/organizations/[orgId] — get org details (members only)
 * PATCH  /api/organizations/[orgId] — update org (admin only)
 * DELETE /api/organizations/[orgId] — delete org (admin only)
 */

import { NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrgMemberRole } from '@/lib/supabase/types';
import { validateBody } from '@/lib/api/validate';
import { organizationPatchSchema } from '@/lib/api/schemas';
import { validatePersonaSettings } from '@/lib/agents/persona-validation';
import { requireSuperAdminOrOrgAdmin, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { mergeOrganizationSettings } from '@/lib/org/organization-settings';

async function getUserMembership(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  orgId: string,
  userId: string,
): Promise<{ role: OrgMemberRole } | null> {
  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();
  return data as { role: OrgMemberRole } | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const auth = await requireSuperAdminOrOrgMember(request, orgId);
  if (auth.response) return auth.response;
  const supabase = createServiceSupabaseClient();
  const membership = await getUserMembership(supabase, orgId, auth.user.id);

  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 404, 'Organization not found');
  }

  return apiSuccess({ organization: { ...org, userRole: membership?.role ?? 'admin' } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const auth = await requireSuperAdminOrOrgAdmin(request, orgId);
  if (auth.response) return auth.response;
  const supabase = createServiceSupabaseClient();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const validation = validateBody(organizationPatchSchema, rawBody);
  if (!validation.success) return validation.response;
  const body = validation.data;

  const personaValidationError = validatePersonaSettings(body.settings);
  if (personaValidationError) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, personaValidationError);
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (body.sector !== undefined) {
    updates.sector = body.sector;
  }
  if (body.default_locale !== undefined) {
    updates.default_locale = body.default_locale;
  }
  if (body.settings !== undefined) {
    const { data: currentOrganization, error: settingsReadError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single();
    if (settingsReadError || !currentOrganization) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read organization settings');
    }
    updates.settings = mergeOrganizationSettings(currentOrganization.settings, body.settings);
  }
  if (body.logo !== undefined) {
    updates.logo = body.logo;
  }

  if (Object.keys(updates).length === 0) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'No valid fields to update');
  }

  const { data: org, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .single();

  if (error || !org) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update organization',
      error?.message,
    );
  }

  return apiSuccess({ organization: { ...org, userRole: 'admin' } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const auth = await requireSuperAdminOrOrgAdmin(request, orgId);
  if (auth.response) return auth.response;
  const supabase = createServiceSupabaseClient();

  const { error } = await supabase.from('organizations').delete().eq('id', orgId);

  if (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete organization',
      error.message,
    );
  }

  return apiSuccess({ deleted: true });
}
