/**
 * Organizations API
 *
 * GET  /api/organizations — list user's organizations (via org_members)
 * POST /api/organizations — legacy endpoint; tenant provisioning is centralized
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { validateBody } from '@/lib/api/validate';
import { organizationsCreateSchema } from '@/lib/api/schemas';
import { requireSuperAdmin } from '@/lib/api/auth';

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
    .in('id', orgIds)
    .eq('status', 'active');

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
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const validation = validateBody(organizationsCreateSchema, rawBody);
  if (!validation.success) return validation.response;
  return apiError(
    API_ERROR_CODES.INVALID_REQUEST,
    409,
    'Tenant provisioning requires an administrator invitation',
    'Use POST /api/admin/tenants with a seat limit and administrator email',
  );
}
