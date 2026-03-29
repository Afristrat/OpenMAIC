/**
 * Curriculum Links API
 *
 * GET    /api/organizations/[orgId]/curriculum — list all curriculum links with stage names
 * POST   /api/organizations/[orgId]/curriculum — create a link
 * DELETE  /api/organizations/[orgId]/curriculum — delete a link (body: { id })
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrgMemberRole, CurriculumRelationType } from '@/lib/supabase/types';

const VALID_RELATION_TYPES: CurriculumRelationType[] = [
  'prerequisite',
  'follows',
  'deepens',
  'reviews',
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

  // Fetch curriculum links
  const { data: links, error } = await supabase
    .from('curriculum_links')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch curriculum links', error.message);
  }

  // Fetch stage names for all referenced stages
  const stageIds = [
    ...new Set((links ?? []).flatMap((l) => [l.from_stage_id, l.to_stage_id])),
  ];

  let stageMap: Record<string, string> = {};
  if (stageIds.length > 0) {
    const { data: stages } = await supabase
      .from('stages')
      .select('id, name')
      .in('id', stageIds);

    stageMap = Object.fromEntries((stages ?? []).map((s) => [s.id, s.name]));
  }

  const enrichedLinks = (links ?? []).map((link) => ({
    ...link,
    from_stage_name: stageMap[link.from_stage_id] ?? link.from_stage_id,
    to_stage_name: stageMap[link.to_stage_id] ?? link.to_stage_id,
  }));

  return apiSuccess({ links: enrichedLinks });
}

export async function POST(
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
  if (
    !membership ||
    !['admin', 'manager', 'formateur'].includes(membership.role)
  ) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Insufficient permissions');
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const { from_stage_id, to_stage_id, relation_type } = body;

  if (typeof from_stage_id !== 'string' || !from_stage_id) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'from_stage_id is required');
  }
  if (typeof to_stage_id !== 'string' || !to_stage_id) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'to_stage_id is required');
  }
  if (
    typeof relation_type !== 'string' ||
    !VALID_RELATION_TYPES.includes(relation_type as CurriculumRelationType)
  ) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid relation_type');
  }
  if (from_stage_id === to_stage_id) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Cannot link a stage to itself');
  }

  const { data: link, error } = await supabase
    .from('curriculum_links')
    .insert({
      from_stage_id,
      to_stage_id,
      relation_type,
      org_id: orgId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'This link already exists');
    }
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create curriculum link', error.message);
  }

  return apiSuccess({ link }, 201);
}

export async function DELETE(
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
  if (
    !membership ||
    !['admin', 'manager', 'formateur'].includes(membership.role)
  ) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Insufficient permissions');
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const { id } = body;
  if (typeof id !== 'string' || !id) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'id is required');
  }

  const { error } = await supabase
    .from('curriculum_links')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete curriculum link', error.message);
  }

  return apiSuccess({ deleted: true });
}
