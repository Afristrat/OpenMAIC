/**
 * Agent Marketplace — Ranking System
 *
 * Computes a composite score for agents based on quiz performance,
 * user ratings, and usage popularity.
 */

import { tryCreateClient } from '@/lib/supabase/client';

export interface RankedAgent {
  id: string;
  name: string;
  role: string;
  description: string | null;
  avatar: string | null;
  color: string | null;
  tags: string[] | null;
  avgRating: number;
  usageCount: number;
  compositeScore: number;
  isTopAgent: boolean;
  ownerNickname: string | null;
  createdAt: string;
}

/**
 * Compute composite score for an agent.
 *
 * Weighted formula:
 * - 40 % quiz performance (avgQuizScore, 0-1)
 * - 30 % user rating (avgRating / 5, 0-1)
 * - 30 % usage popularity (log scale, 0-1)
 */
export function computeAgentScore(agent: {
  avgRating: number;
  usageCount: number;
  avgQuizScore: number;
}): number {
  const usageScore = Math.min(Math.log10(agent.usageCount + 1) / 3, 1);
  return agent.avgQuizScore * 0.4 + (agent.avgRating / 5) * 0.3 + usageScore * 0.3;
}

/**
 * Check if an agent qualifies for the "Top Agent" badge (top 10 %).
 */
export function isTopAgent(score: number, allScores: number[]): boolean {
  if (allScores.length === 0) return false;
  const sorted = [...allScores].sort((a, b) => b - a);
  const threshold = sorted[Math.max(0, Math.floor(sorted.length * 0.1) - 1)];
  return score >= threshold;
}

/**
 * Fetch top agents for a given category (tag) from the client side.
 * Returns ranked agents sorted by composite score descending.
 */
export async function getTopAgents(
  category: string,
  limit: number,
): Promise<RankedAgent[]> {
  const supabase = tryCreateClient();
  if (!supabase) return [];

  let query = supabase
    .from('agent_configs')
    .select('id, name, role, description, avatar, color, tags, avg_rating, usage_count, created_at')
    .eq('is_published', true)
    .order('avg_rating', { ascending: false })
    .limit(limit);

  if (category && category !== 'all') {
    query = query.contains('tags', [category]);
  }

  const { data: agents, error } = await query;
  if (error || !agents) return [];

  // Compute scores
  const scored = agents.map((a) => {
    const score = computeAgentScore({
      avgRating: a.avg_rating ?? 0,
      usageCount: a.usage_count ?? 0,
      avgQuizScore: 0.5, // Default when no quiz data available
    });
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      description: a.description ?? null,
      avatar: a.avatar ?? null,
      color: a.color ?? null,
      tags: a.tags ?? null,
      avgRating: a.avg_rating ?? 0,
      usageCount: a.usage_count ?? 0,
      compositeScore: score,
      isTopAgent: false,
      ownerNickname: null as string | null,
      createdAt: a.created_at,
    };
  });

  // Determine top-agent badges using the full population of published agents,
  // not just the limited result set, to avoid incorrect percentile thresholds.
  // Note: supabase is guaranteed non-null here (early return above).
  let allPublishedQuery = supabase
    .from('agent_configs')
    .select('avg_rating, usage_count')
    .eq('is_published', true);

  if (category && category !== 'all') {
    allPublishedQuery = allPublishedQuery.contains('tags', [category]);
  }

  const { data: allAgents } = await allPublishedQuery;
  const allScores = (allAgents ?? []).map((a) =>
    computeAgentScore({
      avgRating: a.avg_rating ?? 0,
      usageCount: a.usage_count ?? 0,
      avgQuizScore: 0.5,
    }),
  );

  for (const agent of scored) {
    agent.isTopAgent = isTopAgent(agent.compositeScore, allScores);
  }

  // Sort by composite score descending
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  return scored;
}
