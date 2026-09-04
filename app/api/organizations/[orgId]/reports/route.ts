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
import { createInstitutionalReportPdf } from '@/lib/reports/pdf';

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

interface FormationRow {
  stage_id: string;
  name: string;
  learner_count: number;
  avg_score: number;
  completion_rate: number;
}

function toCsv(formations: FormationRow[]): string {
  const lines = ['=== Formations ==='];
  lines.push('stage_id,name,learner_count,avg_score,completion_rate');
  for (const f of formations) {
    lines.push(
      `${csvCell(f.stage_id)},${csvCell(f.name)},${f.learner_count},${f.avg_score.toFixed(1)},${f.completion_rate.toFixed(1)}`,
    );
  }

  return lines.join('\n');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
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

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const format = url.searchParams.get('format') ?? 'json';
  // 1. Get org members (apprenants)
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', orgId);

  const learnerIds = (members ?? []).filter((m) => m.role === 'apprenant').map((m) => m.user_id);

  // 2. Get org stages (via shared_classrooms)
  const { data: sharedClassrooms } = await supabase
    .from('shared_classrooms')
    .select('stage_id')
    .eq('org_id', orgId);

  const orgStageIds = (sharedClassrooms ?? []).map((sc) => sc.stage_id);

  // Also get stages owned by the org
  const { data: ownedStages } = await supabase.from('stages').select('id').eq('org_id', orgId);

  const allStageIds = [...new Set([...orgStageIds, ...(ownedStages ?? []).map((s) => s.id)])];

  // 3. Get stage details
  let stageMap: Record<string, string> = {};
  if (allStageIds.length > 0) {
    const { data: stages } = await supabase.from('stages').select('id, name').in('id', allStageIds);
    stageMap = Object.fromEntries((stages ?? []).map((s) => [s.id, s.name]));
  }

  // 4. Fetch quiz results for these stages in the date range
  let quizResults: Array<{ user_id: string; stage_id: string; score: number | null }> = [];
  if (allStageIds.length > 0) {
    let quizQuery = supabase
      .from('quiz_results')
      .select('user_id, stage_id, score')
      .in('stage_id', allStageIds);
    if (dateFrom) {
      quizQuery = quizQuery.gte('completed_at', dateFrom);
    }
    if (dateTo) {
      quizQuery = quizQuery.lte('completed_at', dateTo);
    }
    const { data } = await quizQuery.limit(10000);
    quizResults = data ?? [];
  }

  // 5. Fetch telemetry data
  let telemetry: Array<{ stage_id: string; completion_rate: number | null }> = [];
  if (allStageIds.length > 0) {
    let telemetryQuery = supabase
      .from('pedagogy_telemetry')
      .select('stage_id, completion_rate')
      .in('stage_id', allStageIds);
    if (dateFrom) {
      telemetryQuery = telemetryQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      telemetryQuery = telemetryQuery.lte('created_at', dateTo);
    }
    const { data } = await telemetryQuery.limit(10000);
    telemetry = data ?? [];
  }

  // ---- Compute metrics ----

  const totalLearners = learnerIds.length;
  const activeClassrooms = allStageIds.length;

  // Average score across all quiz results
  const scores = quizResults.map((qr) => qr.score).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // Completion rate from telemetry
  const completionRates = telemetry
    .map((t) => t.completion_rate)
    .filter((c): c is number => c !== null);
  const overallCompletionRate =
    completionRates.length > 0
      ? completionRates.reduce((a, b) => a + b, 0) / completionRates.length
      : 0;

  // Per-formation stats
  const formationStats: FormationRow[] = allStageIds.map((stageId) => {
    const stageQuizzes = quizResults.filter((qr) => qr.stage_id === stageId);
    const stageScores = stageQuizzes.map((qr) => qr.score).filter((s): s is number => s !== null);
    const uniqueLearners = new Set(stageQuizzes.map((qr) => qr.user_id)).size;

    const stageTelemetry = telemetry.filter((t) => t.stage_id === stageId);
    const stageCompletions = stageTelemetry
      .map((t) => t.completion_rate)
      .filter((c): c is number => c !== null);

    return {
      stage_id: stageId,
      name: stageMap[stageId] ?? stageId,
      learner_count: uniqueLearners,
      avg_score:
        stageScores.length > 0 ? stageScores.reduce((a, b) => a + b, 0) / stageScores.length : 0,
      completion_rate:
        stageCompletions.length > 0
          ? stageCompletions.reduce((a, b) => a + b, 0) / stageCompletions.length
          : 0,
    };
  });

  const metrics = {
    totalLearners,
    activeClassrooms,
    avgScore: Math.round(avgScore * 10) / 10,
    completionRate: Math.round(overallCompletionRate * 10) / 10,
  };

  if (format === 'csv') {
    const csvContent = toCsv(formationStats);
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="report-${orgId}.csv"`,
      },
    });
  }

  if (format === 'pdf') {
    const pdf = await createInstitutionalReportPdf({
      organizationName: organization?.name ?? 'Organisation',
      dateFrom,
      dateTo,
      metrics,
      formations: formationStats,
    });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${orgId}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return apiSuccess({
    metrics,
    formations: formationStats,
  });
}
