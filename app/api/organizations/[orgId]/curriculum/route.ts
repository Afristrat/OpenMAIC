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
import type { OrgMemberRole } from '@/lib/supabase/types';
import { validateBody } from '@/lib/api/validate';
import { curriculumCreateSchema, curriculumDeleteSchema } from '@/lib/api/schemas';

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

  const { data: sharedClassrooms, error: sharedError } = await supabase
    .from('shared_classrooms')
    .select('stage_id')
    .eq('org_id', orgId);
  const { data: ownedStages, error: ownedError } = await supabase
    .from('stages')
    .select('id')
    .eq('org_id', orgId);

  if (sharedError || ownedError) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to fetch curriculum classrooms',
      sharedError?.message ?? ownedError?.message,
    );
  }

  const orgStageIds = [
    ...new Set([
      ...(sharedClassrooms ?? []).map((classroom) => classroom.stage_id),
      ...(ownedStages ?? []).map((stage) => stage.id),
    ]),
  ];

  let curriculumStages: Array<{
    id: string;
    name: string;
    scene_count: number;
    type_badges: string[];
  }> = [];
  if (orgStageIds.length > 0) {
    const [{ data: stages, error: stagesError }, { data: scenes, error: scenesError }] =
      await Promise.all([
        supabase.from('stages').select('id, name').in('id', orgStageIds),
        supabase.from('scenes').select('stage_id, type').in('stage_id', orgStageIds),
      ]);
    if (stagesError || scenesError) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to fetch curriculum contents',
        stagesError?.message ?? scenesError?.message,
      );
    }
    const sceneCounts = new Map<string, number>();
    const sceneTypes = new Map<string, Set<string>>();
    for (const scene of scenes ?? []) {
      sceneCounts.set(scene.stage_id, (sceneCounts.get(scene.stage_id) ?? 0) + 1);
      const types = sceneTypes.get(scene.stage_id) ?? new Set<string>();
      types.add(scene.type);
      sceneTypes.set(scene.stage_id, types);
    }
    curriculumStages = (stages ?? []).map((stage) => ({
      id: stage.id,
      name: stage.name,
      scene_count: sceneCounts.get(stage.id) ?? 0,
      type_badges: [...(sceneTypes.get(stage.id) ?? [])],
    }));
  }

  // Fetch curriculum links
  const { data: links, error } = await supabase
    .from('curriculum_links')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to fetch curriculum links',
      error.message,
    );
  }

  // Fetch stage names for all referenced stages
  const stageIds = [...new Set((links ?? []).flatMap((l) => [l.from_stage_id, l.to_stage_id]))];

  let stageMap: Record<string, string> = {};
  if (stageIds.length > 0) {
    const { data: stages } = await supabase.from('stages').select('id, name').in('id', stageIds);

    stageMap = Object.fromEntries((stages ?? []).map((s) => [s.id, s.name]));
  }

  const enrichedLinks = (links ?? []).map((link) => ({
    ...link,
    from_stage_name: stageMap[link.from_stage_id] ?? link.from_stage_id,
    to_stage_name: stageMap[link.to_stage_id] ?? link.to_stage_id,
  }));

  return apiSuccess({ links: enrichedLinks, stages: curriculumStages, userRole: membership.role });
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
  if (!membership || !['admin', 'manager', 'formateur'].includes(membership.role)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Insufficient permissions');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const validation = validateBody(curriculumCreateSchema, rawBody);
  if (!validation.success) return validation.response;
  const { from_stage_id, to_stage_id, relation_type } = validation.data;

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
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create curriculum link',
      error.message,
    );
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
  if (!membership || !['admin', 'manager', 'formateur'].includes(membership.role)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Insufficient permissions');
  }

  let rawDeleteBody: unknown;
  try {
    rawDeleteBody = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const deleteValidation = validateBody(curriculumDeleteSchema, rawDeleteBody);
  if (!deleteValidation.success) return deleteValidation.response;
  const { id } = deleteValidation.data;

  const { error } = await supabase
    .from('curriculum_links')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete curriculum link',
      error.message,
    );
  }

  return apiSuccess({ deleted: true });
}
