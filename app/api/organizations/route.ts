/**
 * Organizations API
 *
 * GET  /api/organizations — list user's organizations (via org_members)
 * POST /api/organizations — create new org (user becomes admin)
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrgSector } from '@/lib/supabase/types';
import { validateBody } from '@/lib/api/validate';
import { organizationsCreateSchema } from '@/lib/api/schemas';

export async function GET(): Promise<Response> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
  }

  // Fetch memberships with joined organization data
  const { data: memberships, error } = await supabase
    .from('org_members')
    .select('role, org_id')
    .eq('user_id', user.id);

  if (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to fetch memberships',
      error.message,
    );
  }

  if (!memberships || memberships.length === 0) {
    return apiSuccess({ organizations: [] });
  }

  const orgIds = memberships.map((m) => m.org_id);
  const { data: organizations, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .in('id', orgIds);

  if (orgError) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to fetch organizations',
      orgError.message,
    );
  }

  // Merge role info into each organization
  const roleMap = new Map(memberships.map((m) => [m.org_id, m.role]));
  const result = (organizations ?? []).map((org) => ({
    ...org,
    userRole: roleMap.get(org.id) ?? 'apprenant',
  }));

  return apiSuccess({ organizations: result });
}

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const validation = validateBody(organizationsCreateSchema, rawBody);
  if (!validation.success) return validation.response;
  const { data } = validation;

  const name = data.name.trim();
  if (!name) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Organization name is required');
  }

  const sector: OrgSector | null = data.sector ?? null;
  const defaultLocale = data.default_locale ?? 'fr-FR';

  // The first membership cannot satisfy the normal admin RLS policy yet. The
  // RPC creates both rows atomically and derives the member id from auth.uid().
  const { data: org, error: orgError } = await supabase
    .rpc('create_organization_with_admin', {
      organization_name: name,
      organization_sector: sector,
      organization_default_locale: defaultLocale,
    })
    .single();

  if (orgError || !org) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create organization',
      orgError?.message,
    );
  }

  return apiSuccess({ organization: { ...org, userRole: 'admin' } }, 201);
}
