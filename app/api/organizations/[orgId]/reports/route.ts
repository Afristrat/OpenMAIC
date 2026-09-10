/**
 * Institutional Reports API
 *
 * GET /api/organizations/[orgId]/reports — aggregate metrics
 * Query params: dateFrom, dateTo, format (json/csv)
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrgMemberRole } from '@/lib/supabase/types';
import { createInstitutionalReportPdf } from '@/lib/reports/pdf';
import { readReportPages } from '@/lib/reports/read-report-pages';
import { REPORT_COVERAGE_NOTE } from '@/lib/reports/coverage';

async function getUserMembership(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  orgId: string,
  userId: string,
): Promise<{ role: OrgMemberRole } | null> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Membership unavailable');
  return data as { role: OrgMemberRole } | null;
}

interface FormationRow {
  stage_id: string;
  name: string;
  learner_count: number;
  avg_score: number | null;
  completion_rate: number | null;
}

function toCsv(formations: FormationRow[]): string {
  const lines = [csvCell(REPORT_COVERAGE_NOTE), '=== Formations ==='];
  lines.push('stage_id,name,learner_count,avg_score,completion_rate');
  for (const f of formations) {
    lines.push(
      `${csvCell(f.stage_id)},${csvCell(f.name)},${f.learner_count},${f.avg_score?.toFixed(1) ?? ''},${f.completion_rate?.toFixed(1) ?? ''}`,
    );
  }

  return lines.join('\n');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  try {
    const response = await readReport(request, context);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    const response = apiError(API_ERROR_CODES.INTERNAL_ERROR, 503, 'Learning report unavailable');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}

async function readReport(
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

  const signal = AbortSignal.timeout(30000);
  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('name, status')
    .eq('id', orgId)
    .single();
  if (organizationError || !organization) throw new Error('Organization unavailable');
  if (organization.status !== 'active')
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Organization inactive');

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const format = url.searchParams.get('format') ?? 'json';
  let totalLearners = 0;
  for await (const member of readReportPages((from, to) =>
    supabase
      .from('org_members')
      .select('user_id, role', { count: 'exact' })
      .eq('org_id', orgId)
      .order('user_id')
      .range(from, to)
      .abortSignal(signal),
  )) {
    if (member.role === 'apprenant') totalLearners++;
  }

  // 2. Get org stages (via shared_classrooms)
  const stageIds = new Set<string>();
  for await (const classroom of readReportPages((from, to) =>
    supabase
      .from('shared_classrooms')
      .select('stage_id', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('authorization_verified', true)
      .in('visibility', ['organization', 'public'])
      .order('stage_id')
      .range(from, to)
      .abortSignal(signal),
  )) {
    stageIds.add(classroom.stage_id);
  }

  // Also get stages owned by the org
  for await (const stage of readReportPages((from, to) =>
    supabase
      .from('stages')
      .select('id', { count: 'exact' })
      .eq('org_id', orgId)
      .order('id')
      .range(from, to)
      .abortSignal(signal),
  ))
    stageIds.add(stage.id);
  const allStageIds = [...stageIds].sort();

  // 3. Get stage details
  const stageMap = new Map<string, string>();
  for (let index = 0; index < allStageIds.length; index += 100) {
    const ids = allStageIds.slice(index, index + 100);
    for await (const stage of readReportPages((from, to) =>
      supabase
        .from('stages')
        .select('id, name', { count: 'exact' })
        .in('id', ids)
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ))
      stageMap.set(stage.id, stage.name);
  }
  if (stageMap.size !== allStageIds.length) throw new Error('Stage details unavailable');

  // 4. Fetch quiz results for these stages in the date range
  const stats = new Map(
    allStageIds.map((id) => [
      id,
      {
        learners: new Set<string>(),
        scoreSum: 0,
        scoreCount: 0,
        completionSum: 0,
        completionCount: 0,
      },
    ]),
  );
  let scoreSum = 0,
    scoreCount = 0,
    completionSum = 0,
    completionCount = 0;
  const service = allStageIds.length ? createServiceSupabaseClient() : null;
  for (let index = 0; service && index < allStageIds.length; index += 100) {
    const ids = allStageIds.slice(index, index + 100);
    for await (const row of readReportPages((from, to) => {
      let quizQuery = service
        .from('quiz_results')
        .select('user_id, stage_id, score', { count: 'exact' })
        .eq('org_id', orgId)
        .in('stage_id', ids);
      if (dateFrom) {
        quizQuery = quizQuery.gte('completed_at', dateFrom);
      }
      if (dateTo) {
        quizQuery = quizQuery.lte('completed_at', dateTo);
      }
      return quizQuery.order('id').range(from, to).abortSignal(signal);
    })) {
      const stat = stats.get(row.stage_id);
      if (!stat) throw new Error('Unexpected report stage');
      stat.learners.add(row.user_id);
      if (row.score !== null) {
        stat.scoreSum += row.score;
        stat.scoreCount++;
        scoreSum += row.score;
        scoreCount++;
      }
    }
  }

  // 5. Fetch telemetry data
  for (let index = 0; service && index < allStageIds.length; index += 100) {
    const ids = allStageIds.slice(index, index + 100);
    // Telemetry rows are service-only. Authorization above precedes this query;
    // the explicit tenant filter prevents shared/transferred stages leaking data.
    for await (const row of readReportPages((from, to) => {
      let telemetryQuery = service
        .from('pedagogy_telemetry')
        .select('stage_id, completion_rate', { count: 'exact' })
        .eq('org_id', orgId)
        .in('stage_id', ids);
      if (dateFrom) {
        telemetryQuery = telemetryQuery.gte('created_at', dateFrom);
      }
      if (dateTo) {
        telemetryQuery = telemetryQuery.lte('created_at', dateTo);
      }
      return telemetryQuery.order('id').range(from, to).abortSignal(signal);
    })) {
      const stat = stats.get(row.stage_id);
      if (!stat) throw new Error('Unexpected report stage');
      if (row.completion_rate !== null) {
        stat.completionSum += row.completion_rate;
        stat.completionCount++;
        completionSum += row.completion_rate;
        completionCount++;
      }
    }
  }

  // ---- Compute metrics ----

  const activeClassrooms = allStageIds.length;

  // Average score across all quiz results
  const avgScore = scoreCount ? scoreSum / scoreCount : 0;

  // Completion rate from telemetry
  const overallCompletionRate = completionCount ? completionSum / completionCount : 0;

  // Per-formation stats
  const formationStats: FormationRow[] = allStageIds.map((stageId) => {
    const stat = stats.get(stageId)!;

    return {
      stage_id: stageId,
      name: stageMap.get(stageId)!,
      learner_count: stat.learners.size,
      avg_score: stat.scoreCount ? stat.scoreSum / stat.scoreCount : null,
      completion_rate: stat.completionCount
        ? (100 * stat.completionSum) / stat.completionCount
        : null,
    };
  });

  const metrics = {
    totalLearners,
    activeClassrooms,
    avgScore: scoreCount ? Math.round(avgScore * 10) / 10 : null,
    completionRate: completionCount ? Math.round(overallCompletionRate * 1000) / 10 : null,
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
    coverage: {
      scope: 'organization_attributed',
      unattributedHistory: 'excluded',
      quizResults: scoreCount,
      learningObservations: completionCount,
    },
    metrics,
    formations: formationStats,
  });
}
