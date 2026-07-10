/**
 * Organizations API
 *
 * GET  /api/organizations — list user's organizations (via org_members)
 * POST /api/organizations — create new org (user becomes admin)
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrganizationInsert, OrgSector } from '@/lib/supabase/types';
import { validateBody } from '@/lib/api/validate';
import { organizationsCreateSchema } from '@/lib/api/schemas';

const VALID_SECTORS: OrgSector[] = [
  'healthcare',
  'legal',
  'tech',
  'finance',
  'education',
  'industry',
];

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
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch memberships', error.message);
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
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch organizations', orgError.message);
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

  const orgInsert: OrganizationInsert = {
    name,
    sector,
    default_locale: defaultLocale,
    settings: {},
  };

  // Create organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert(orgInsert)
    .select()
    .single();

  if (orgError || !org) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create organization', orgError?.message);
  }

  // Add creator as admin
  const { error: memberError } = await supabase
    .from('org_members')
    .insert({ user_id: user.id, org_id: org.id, role: 'admin' });

  if (memberError) {
    // Rollback: delete the org if membership creation failed
    await supabase.from('organizations').delete().eq('id', org.id);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to add creator as admin', memberError.message);
  }

  return apiSuccess({ organization: { ...org, userRole: 'admin' } }, 201);
}
