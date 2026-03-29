/**
 * Marketplace Agents API
 *
 * GET  /api/marketplace/agents — list published agents with pagination, search, filters
 * POST /api/marketplace/agents — publish an agent (set is_published=true)
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { computeAgentScore, isTopAgent } from '@/lib/marketplace/ranking';

export async function GET(request: NextRequest): Promise<Response> {
  const supabase = await createServerSupabaseClient();
  const url = request.nextUrl;

  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const search = url.searchParams.get('search')?.trim() ?? '';
  const tag = url.searchParams.get('tag') ?? '';
  const level = url.searchParams.get('level') ?? '';
  const language = url.searchParams.get('language') ?? '';
  const sortBy = url.searchParams.get('sort') ?? 'score'; // score | rating | usage | recent

  const offset = (page - 1) * limit;

  let query = supabase
    .from('agent_configs')
    .select('id, name, role, description, avatar, color, tags, avg_rating, usage_count, created_at, persona', { count: 'exact' })
    .eq('is_published', true);

  // Search filter: name or description
  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  // Tag filter
  if (tag) {
    query = query.contains('tags', [tag]);
  }

  // Language filter (stored in persona or tags — filter on tags)
  if (language) {
    query = query.contains('tags', [language]);
  }

  // Level filter
  if (level) {
    query = query.contains('tags', [level]);
  }

  // Sorting
  switch (sortBy) {
    case 'rating':
      query = query.order('avg_rating', { ascending: false });
      break;
    case 'usage':
      query = query.order('usage_count', { ascending: false });
      break;
    case 'recent':
      query = query.order('created_at', { ascending: false });
      break;
    default:
      // score — sort by avg_rating as primary, usage_count as secondary
      query = query.order('avg_rating', { ascending: false }).order('usage_count', { ascending: false });
      break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data: agents, error, count } = await query;

  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch agents', error.message);
  }

  // Compute scores and top-agent badges
  const scored = (agents ?? []).map((a) => {
    const score = computeAgentScore({
      avgRating: a.avg_rating ?? 0,
      usageCount: a.usage_count ?? 0,
      avgQuizScore: 0.5,
    });
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      description: a.description,
      avatar: a.avatar,
      color: a.color,
      tags: a.tags,
      avgRating: a.avg_rating ?? 0,
      usageCount: a.usage_count ?? 0,
      compositeScore: score,
      isTopAgent: false,
      createdAt: a.created_at,
    };
  });

  // Compute top-agent badges from the full published population, not just the current page
  const { data: allPublishedAgents } = await supabase
    .from('agent_configs')
    .select('avg_rating, usage_count')
    .eq('is_published', true);

  const allScores = (allPublishedAgents ?? []).map((a) =>
    computeAgentScore({
      avgRating: a.avg_rating ?? 0,
      usageCount: a.usage_count ?? 0,
      avgQuizScore: 0.5,
    }),
  );

  for (const agent of scored) {
    agent.isTopAgent = isTopAgent(agent.compositeScore, allScores);
  }

  return apiSuccess({
    agents: scored,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  if (!agentId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'agentId is required');
  }

  // Verify ownership
  const { data: agent, error: fetchErr } = await supabase
    .from('agent_configs')
    .select('id, owner_id')
    .eq('id', agentId)
    .single();

  if (fetchErr || !agent) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Agent not found');
  }

  if (agent.owner_id !== user.id) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'You can only publish your own agents');
  }

  // Optional metadata updates
  const updates: Record<string, unknown> = { is_published: true };
  if (typeof body.description === 'string') updates.description = body.description;
  if (Array.isArray(body.tags)) updates.tags = body.tags;

  const { error: updateErr } = await supabase
    .from('agent_configs')
    .update(updates)
    .eq('id', agentId);

  if (updateErr) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to publish agent', updateErr.message);
  }

  return apiSuccess({ published: true, agentId });
}
