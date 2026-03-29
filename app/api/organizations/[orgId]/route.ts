/**
 * Single Organization API
 *
 * GET    /api/organizations/[orgId] — get org details (members only)
 * PATCH  /api/organizations/[orgId] — update org (admin only)
 * DELETE /api/organizations/[orgId] — delete org (admin only)
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrgSector, OrgMemberRole } from '@/lib/supabase/types';

const VALID_SECTORS: OrgSector[] = [
  'healthcare',
  'legal',
  'tech',
  'finance',
  'education',
  'industry',
];

async function getUserMembership(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
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
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
  }

  const membership = await getUserMembership(supabase, orgId, user.id);
  if (!membership) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Not a member of this organization');
  }

  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 404, 'Organization not found');
  }

  return apiSuccess({ organization: { ...org, userRole: membership.role } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
  }

  const membership = await getUserMembership(supabase, orgId, user.id);
  if (!membership || membership.role !== 'admin') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Admin access required');
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.sector === 'string') {
    updates.sector = VALID_SECTORS.includes(body.sector as OrgSector) ? body.sector : null;
  }
  if (typeof body.default_locale === 'string') {
    updates.default_locale = body.default_locale;
  }
  if (typeof body.settings === 'object' && body.settings !== null) {
    updates.settings = body.settings;
  }
  if (typeof body.logo === 'string') {
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
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to update organization', error?.message);
  }

  return apiSuccess({ organization: { ...org, userRole: 'admin' } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
  }

  const membership = await getUserMembership(supabase, orgId, user.id);
  if (!membership || membership.role !== 'admin') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Admin access required');
  }

  const { error } = await supabase.from('organizations').delete().eq('id', orgId);

  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete organization', error.message);
  }

  return apiSuccess({ deleted: true });
}
