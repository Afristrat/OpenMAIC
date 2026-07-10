/**
 * Institutional Reports API
 *
 * GET /api/organizations/[orgId]/reports — aggregate metrics
 * Query params: dateFrom, dateTo, format (json/csv)
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrgMemberRole } from '@/lib/supabase/types';

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

interface LearnerRow {
  user_id: string;
  nickname: string;
  classrooms_completed: number;
  avg_score: number;
  time_spent: number;
  last_active: string;
}

interface FormationRow {
  stage_id: string;
  name: string;
  learner_count: number;
  avg_score: number;
  completion_rate: number;
}

function toCsv(learners: LearnerRow[], formations: FormationRow[]): string {
  const lines: string[] = [];

  lines.push('=== Learners ===');
  lines.push('user_id,nickname,classrooms_completed,avg_score,time_spent,last_active');
  for (const l of learners) {
    lines.push(
      `${l.user_id},"${l.nickname}",${l.classrooms_completed},${l.avg_score.toFixed(1)},${l.time_spent},${l.last_active}`,
    );
  }

  lines.push('');
  lines.push('=== Formations ===');
  lines.push('stage_id,name,learner_count,avg_score,completion_rate');
  for (const f of formations) {
    lines.push(
      `${f.stage_id},"${f.name}",${f.learner_count},${f.avg_score.toFixed(1)},${f.completion_rate.toFixed(1)}`,
    );
  }

  return lines.join('\n');
}

export async function GET(
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
  if (!membership) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Not a member of this organization');
  }

  if (!['admin', 'manager', 'formateur'].includes(membership.role)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Insufficient role');
  }

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const format = url.searchParams.get('format') ?? 'json';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const perPage = Math.min(500, Math.max(1, parseInt(url.searchParams.get('perPage') ?? '100', 10)));

  // 1. Get org members (apprenants)
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', orgId);

  const learnerIds = (members ?? [])
    .filter((m) => m.role === 'apprenant')
    .map((m) => m.user_id);

  const allMemberIds = (members ?? []).map((m) => m.user_id);

  // 2. Get org stages (via shared_classrooms)
  const { data: sharedClassrooms } = await supabase
    .from('shared_classrooms')
    .select('stage_id')
    .eq('org_id', orgId);

  const orgStageIds = (sharedClassrooms ?? []).map((sc) => sc.stage_id);

  // Also get stages owned by the org
  const { data: ownedStages } = await supabase
    .from('stages')
    .select('id')
    .eq('org_id', orgId);

  const allStageIds = [...new Set([...orgStageIds, ...(ownedStages ?? []).map((s) => s.id)])];

  // 3. Get stage details
  let stageMap: Record<string, string> = {};
  if (allStageIds.length > 0) {
    const { data: stages } = await supabase
      .from('stages')
      .select('id, name')
      .in('id', allStageIds);
    stageMap = Object.fromEntries((stages ?? []).map((s) => [s.id, s.name]));
  }

  // 4. Fetch quiz results for these stages in the date range
  let quizQuery = supabase
    .from('quiz_results')
    .select('*');

  if (allStageIds.length > 0) {
    quizQuery = quizQuery.in('stage_id', allStageIds);
  }
  if (dateFrom) {
    quizQuery = quizQuery.gte('completed_at', dateFrom);
  }
  if (dateTo) {
    quizQuery = quizQuery.lte('completed_at', dateTo);
  }

  const { data: quizResults } = await quizQuery.limit(10000);

  // 5. Fetch telemetry data
  let telemetryQuery = supabase
    .from('pedagogy_telemetry')
    .select('*');

  if (allStageIds.length > 0) {
    telemetryQuery = telemetryQuery.in('stage_id', allStageIds);
  }
  if (dateFrom) {
    telemetryQuery = telemetryQuery.gte('created_at', dateFrom);
  }
  if (dateTo) {
    telemetryQuery = telemetryQuery.lte('created_at', dateTo);
  }

  const { data: telemetry } = await telemetryQuery.limit(10000);

  // 6. Get profiles for names
  let profileMap: Record<string, string> = {};
  if (allMemberIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname')
      .in('id', allMemberIds);
    profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.nickname ?? p.id.slice(0, 8)]),
    );
  }

  // ---- Compute metrics ----

  const totalLearners = learnerIds.length;
  const activeClassrooms = allStageIds.length;

  // Average score across all quiz results
  const scores = (quizResults ?? [])
    .map((qr) => qr.score)
    .filter((s): s is number => s !== null);
  const avgScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  // Completion rate from telemetry
  const completionRates = (telemetry ?? [])
    .map((t) => t.completion_rate)
    .filter((c): c is number => c !== null);
  const overallCompletionRate = completionRates.length > 0
    ? completionRates.reduce((a, b) => a + b, 0) / completionRates.length
    : 0;

  // Per-learner stats
  const learnerStats: LearnerRow[] = learnerIds.map((uid) => {
    const userQuizzes = (quizResults ?? []).filter((qr) => qr.user_id === uid);
    const userScores = userQuizzes
      .map((qr) => qr.score)
      .filter((s): s is number => s !== null);
    const completedStages = new Set(userQuizzes.map((qr) => qr.stage_id)).size;

    // Time from telemetry (approximate via user_hash — imperfect but best available)
    const userTelemetry = (telemetry ?? []).filter(
      (t) => t.user_hash === uid,
    );
    const totalDuration = userTelemetry.reduce(
      (sum, t) => sum + (t.total_duration ?? 0),
      0,
    );

    const lastQuiz = userQuizzes.length > 0
      ? userQuizzes.sort(
          (a, b) =>
            new Date(b.completed_at).getTime() -
            new Date(a.completed_at).getTime(),
        )[0].completed_at
      : '';

    return {
      user_id: uid,
      nickname: profileMap[uid] ?? uid.slice(0, 8),
      classrooms_completed: completedStages,
      avg_score:
        userScores.length > 0
          ? userScores.reduce((a, b) => a + b, 0) / userScores.length
          : 0,
      time_spent: Math.round(totalDuration),
      last_active: lastQuiz,
    };
  });

  // Per-formation stats
  const formationStats: FormationRow[] = allStageIds.map((stageId) => {
    const stageQuizzes = (quizResults ?? []).filter(
      (qr) => qr.stage_id === stageId,
    );
    const stageScores = stageQuizzes
      .map((qr) => qr.score)
      .filter((s): s is number => s !== null);
    const uniqueLearners = new Set(stageQuizzes.map((qr) => qr.user_id)).size;

    const stageTelemetry = (telemetry ?? []).filter(
      (t) => t.stage_id === stageId,
    );
    const stageCompletions = stageTelemetry
      .map((t) => t.completion_rate)
      .filter((c): c is number => c !== null);

    return {
      stage_id: stageId,
      name: stageMap[stageId] ?? stageId,
      learner_count: uniqueLearners,
      avg_score:
        stageScores.length > 0
          ? stageScores.reduce((a, b) => a + b, 0) / stageScores.length
          : 0,
      completion_rate:
        stageCompletions.length > 0
          ? stageCompletions.reduce((a, b) => a + b, 0) /
            stageCompletions.length
          : 0,
    };
  });

  // Paginate learnerStats
  const totalLearnerRows = learnerStats.length;
  const startIdx = (page - 1) * perPage;
  const paginatedLearners = learnerStats.slice(startIdx, startIdx + perPage);

  if (format === 'csv') {
    const csvContent = toCsv(paginatedLearners, formationStats);
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="report-${orgId}.csv"`,
      },
    });
  }

  return apiSuccess({
    metrics: {
      totalLearners,
      activeClassrooms,
      avgScore: Math.round(avgScore * 10) / 10,
      completionRate: Math.round(overallCompletionRate * 10) / 10,
    },
    learners: paginatedLearners,
    formations: formationStats,
    pagination: {
      page,
      perPage,
      total: totalLearnerRows,
      totalPages: Math.ceil(totalLearnerRows / perPage),
    },
  });
}
