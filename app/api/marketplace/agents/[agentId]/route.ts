/**
 * Marketplace Agent Details API
 *
 * GET  /api/marketplace/agents/[agentId] — get agent details + reviews
 * POST /api/marketplace/agents/[agentId] — submit a review (rating 1-5 + optional comment)
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { validateBody } from '@/lib/api/validate';
import { marketplaceReviewSchema } from '@/lib/api/schemas';

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<Response> {
  const { agentId } = await params;
  const supabase = await createServerSupabaseClient();

  // Fetch agent
  const { data: agent, error: agentErr } = await supabase
    .from('agent_configs')
    .select('id, name, role, description, avatar, color, tags, avg_rating, usage_count, owner_id, persona, created_at, is_published')
    .eq('id', agentId)
    .single();

  if (agentErr || !agent) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Agent not found');
  }

  if (!agent.is_published) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Agent not found');
  }

  // Fetch reviews
  const { data: reviews, error: reviewErr } = await supabase
    .from('agent_reviews')
    .select('id, user_id, rating, comment, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });

  if (reviewErr) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch reviews', reviewErr.message);
  }

  // Fetch reviewer profiles
  const reviewerIds = [...new Set((reviews ?? []).map((r) => r.user_id))];
  const profileMap = new Map<string, string>();
  if (reviewerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname')
      .in('id', reviewerIds);
    for (const p of profiles ?? []) {
      if (p.nickname) profileMap.set(p.id, p.nickname);
    }
  }

  // Fetch owner nickname
  let ownerNickname: string | null = null;
  if (agent.owner_id) {
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('nickname')
      .eq('id', agent.owner_id)
      .single();
    ownerNickname = ownerProfile?.nickname ?? null;
  }

  const enrichedReviews = (reviews ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    authorNickname: profileMap.get(r.user_id) ?? null,
  }));

  return apiSuccess({
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      avatar: agent.avatar,
      color: agent.color,
      tags: agent.tags,
      avgRating: agent.avg_rating,
      usageCount: agent.usage_count,
      persona: agent.persona,
      ownerNickname,
      createdAt: agent.created_at,
    },
    reviews: enrichedReviews,
  });
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<Response> {
  const { agentId } = await params;
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

  const validation = validateBody(marketplaceReviewSchema, rawBody);
  if (!validation.success) return validation.response;
  const body = validation.data;

  const rating = body.rating;
  const comment = body.comment?.trim() ?? null;

  // Verify agent exists and is published
  const { data: agent, error: agentErr } = await supabase
    .from('agent_configs')
    .select('id, is_published')
    .eq('id', agentId)
    .single();

  if (agentErr || !agent || !agent.is_published) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Agent not found');
  }

  // Upsert review (unique on agent_id + user_id)
  const { error: upsertErr } = await supabase
    .from('agent_reviews')
    .upsert(
      {
        agent_id: agentId,
        user_id: user.id,
        rating,
        comment,
      },
      { onConflict: 'agent_id,user_id' },
    );

  if (upsertErr) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to submit review', upsertErr.message);
  }

  // Recompute average rating
  const { data: allReviews } = await supabase
    .from('agent_reviews')
    .select('rating')
    .eq('agent_id', agentId);

  if (allReviews && allReviews.length > 0) {
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await supabase
      .from('agent_configs')
      .update({ avg_rating: Math.round(avg * 10) / 10 })
      .eq('id', agentId);
  }

  return apiSuccess({ submitted: true });
}
