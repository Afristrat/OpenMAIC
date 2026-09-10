import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireOrgAdmin: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
import { GET } from '@/app/api/organizations/[orgId]/director-experiment/route';
import { buildDirectorExperimentReport } from '@/lib/orchestration/director-experiment-report';
const orgId = '00000000-0048-4000-8000-000000000032';
const context = { params: Promise.resolve({ orgId }) };
const request = () =>
  new NextRequest('https://qalem.test/api/report?stageId=stage-proof&userId=forged');
const row = {
  cohort: 'data-driven',
  language: 'fr-FR',
  assignedUnits: 2,
  unitsWithQuiz: 1,
  missingQuizUnits: 1,
  meanQuizScore: 0,
  unitsWithReportedTurns: 1,
  decisions: 3,
  selections: 2,
  suggestionSelections: 2,
  changedSelections: 1,
  completedGenerations: 2,
  failedGenerations: 0,
  emptyGenerations: 0,
  abortedGenerations: 0,
  pendingGenerations: 1,
  linkedTurns: 2,
  meanLookupMs: 4,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'verified-actor' } });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.read });
  mocks.read.mockResolvedValue({ data: [row], error: null });
});
it('authorizes the tenant before the service query and never takes an actor from the browser', async () => {
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('read_director_experiment', {
    p_actor: 'verified-actor',
    p_org: orgId,
    p_stage: 'stage-proof',
  });
  expect(response.headers.get('cache-control')).toContain('no-store');
  const report = await response.json();
  expect(report.cohorts[0]).toMatchObject({ assignedUnits: 2, decisions: 3, meanQuizScore: 0 });
  expect(report.comparisons[0].meanScoreDifference).toBeNull();
});
it('refuses malformed scope, unauthorized roles, and stale database authorization', async () => {
  expect((await GET(new NextRequest('https://qalem.test/api/report'), context)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValueOnce({ response: NextResponse.json({}, { status: 403 }) });
  expect((await GET(request(), context)).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.read.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
  expect((await GET(request(), context)).status).toBe(403);
});
it('does not turn query failures or invalid data into an empty or successful report', async () => {
  for (const result of [
    { data: null, error: { code: 'unavailable' } },
    { data: [{ ...row, unitsWithQuiz: 3 }], error: null },
  ]) {
    mocks.read.mockResolvedValueOnce(result);
    expect((await GET(request(), context)).status).toBe(503);
  }
});
it('compares within language only and keeps missing scores distinct from zero', () => {
  const classic = {
    ...row,
    cohort: 'classic',
    suggestionSelections: 0,
    changedSelections: 0,
    meanQuizScore: 1,
  };
  const report = buildDirectorExperimentReport([row, classic]);
  expect(report.comparisons[0].meanScoreDifference).toBe(-1);
  expect(report.evidence).toBe('observational');
  expect(buildDirectorExperimentReport([]).cohorts).toEqual([]);
  expect(
    buildDirectorExperimentReport([row, { ...classic, language: 'ar-MA' }]).comparisons.every(
      (r) => r.meanScoreDifference === null,
    ),
  ).toBe(true);
  expect(() => buildDirectorExperimentReport([row, row])).toThrow();
});
