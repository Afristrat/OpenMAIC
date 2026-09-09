import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createInstitutionalReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-private-free')),
  tableCalls: [] as string[],
  membershipRole: 'admin' as string | null,
  telemetryFilters: [] as unknown[][],
  failedTable: null as string | null,
  telemetryRows: null as Array<{ stage_id: string; completion_rate: number }> | null,
  ranges: [] as number[][],
}));

function queryResult(result: { data: unknown; error?: unknown }) {
  let from = 0,
    to = Number.MAX_SAFE_INTEGER;
  const response = () => ({
    ...result,
    error: result.error ?? null,
    data: Array.isArray(result.data) ? result.data.slice(from, to + 1) : result.data,
    count: Array.isArray(result.data) ? result.data.length : null,
  });
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    gte: () => query,
    lte: () => query,
    order: () => query,
    range: (start: number, end: number) => {
      from = start;
      to = end;
      mocks.ranges.push([start, end]);
      return query;
    },
    abortSignal: () => query,
    single: () => Promise.resolve(response()),
    maybeSingle: () => Promise.resolve(response()),
    then: (
      resolve: (value: ReturnType<typeof response>) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(response()).then(resolve, reject),
  };
  return query;
}

function createSupabaseFixture() {
  const responseIndex = new Map<string, number>();
  const responses: Record<string, Array<{ data: unknown }>> = {
    org_members: [
      { data: mocks.membershipRole ? { role: mocks.membershipRole } : null },
      { data: [{ user_id: 'learner-secret-id', role: 'apprenant' }] },
    ],
    organizations: [{ data: { name: 'Organisation A' } }],
    shared_classrooms: [{ data: [] }],
    stages: [
      { data: [{ id: 'stage-1' }] },
      { data: [{ id: 'stage-1', name: 'Formation agrégée' }] },
    ],
    quiz_results: [
      {
        data: [
          {
            user_id: 'learner-secret-id',
            stage_id: 'stage-1',
            score: 80,
            completed_at: '2026-09-04T00:00:00.000Z',
          },
        ],
      },
    ],
    pedagogy_telemetry: [
      {
        data: [
          {
            user_hash: 'learner-secret-id',
            stage_id: 'stage-1',
            completion_rate: 0.75,
            total_duration: 600,
          },
        ],
      },
    ],
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'manager-1' } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      mocks.tableCalls.push(table);
      const index = responseIndex.get(table) ?? 0;
      responseIndex.set(table, index + 1);
      if (mocks.failedTable === table)
        return queryResult({ data: null, error: { message: 'private DB failure' } });
      if (table === 'pedagogy_telemetry' && mocks.telemetryRows)
        return queryResult({ data: mocks.telemetryRows });
      const options = responses[table] ?? [{ data: [] }];
      return queryResult(options[Math.min(index, options.length - 1)]);
    }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => createSupabaseFixture()),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      const query = createSupabaseFixture().from(table);
      query.eq = (...args: unknown[]) => {
        mocks.telemetryFilters.push(args);
        return query;
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/reports/pdf', () => ({
  createInstitutionalReportPdf: mocks.createInstitutionalReportPdf,
}));

describe('institutional report privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tableCalls.length = 0;
    mocks.membershipRole = 'admin';
    mocks.telemetryFilters.length = 0;
    mocks.failedTable = null;
    mocks.telemetryRows = null;
    mocks.ranges.length = 0;
  });

  it('refuses a user who is not a member of the requested organization', async () => {
    mocks.membershipRole = null;
    const { GET } = await import('@/app/api/organizations/[orgId]/reports/route');
    const response = await GET(
      new Request('http://localhost/api/organizations/foreign-org/reports') as NextRequest,
      { params: Promise.resolve({ orgId: 'foreign-org' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.tableCalls).toEqual(['org_members']);
  });

  it('returns organization and formation aggregates without individual learner data', async () => {
    const { GET } = await import('@/app/api/organizations/[orgId]/reports/route');
    const response = await GET(
      new Request('http://localhost/api/organizations/org-1/reports') as NextRequest,
      { params: Promise.resolve({ orgId: 'org-1' }) },
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.metrics.totalLearners).toBe(1);
    expect(body.metrics.completionRate).toBe(75);
    expect(mocks.telemetryFilters).toContainEqual(['org_id', 'org-1']);
    expect(body.formations).toEqual([
      {
        stage_id: 'stage-1',
        name: 'Formation agrégée',
        learner_count: 1,
        avg_score: 80,
        completion_rate: 75,
      },
    ]);
    expect(body).not.toHaveProperty('learners');
    expect(body).not.toHaveProperty('pagination');
    expect(serialized).not.toContain('learner-secret-id');
    expect(mocks.tableCalls).not.toContain('profiles');
  });

  it('exports only formation aggregates to CSV', async () => {
    const { GET } = await import('@/app/api/organizations/[orgId]/reports/route');
    const response = await GET(
      new Request('http://localhost/api/organizations/org-1/reports?format=csv') as NextRequest,
      { params: Promise.resolve({ orgId: 'org-1' }) },
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain('=== Formations ===');
    expect(csv).not.toContain('learner-secret-id');
    expect(csv).not.toContain('nickname');
    expect(csv).not.toContain('user_id');
  });

  it('never passes individual learner rows to the PDF renderer', async () => {
    const { GET } = await import('@/app/api/organizations/[orgId]/reports/route');
    const response = await GET(
      new Request('http://localhost/api/organizations/org-1/reports?format=pdf') as NextRequest,
      { params: Promise.resolve({ orgId: 'org-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.createInstitutionalReportPdf).toHaveBeenCalledOnce();
    const input = mocks.createInstitutionalReportPdf.mock.calls[0][0];
    expect(input).not.toHaveProperty('learners');
    expect(JSON.stringify(input)).not.toContain('learner-secret-id');
  });

  it.each([
    'org_members',
    'organizations',
    'shared_classrooms',
    'stages',
    'quiz_results',
    'pedagogy_telemetry',
  ])('fails closed when %s is unavailable', async (table) => {
    mocks.failedTable = table;
    const { GET } = await import('@/app/api/organizations/[orgId]/reports/route');
    const response = await GET(new Request('http://localhost/reports?format=pdf') as NextRequest, {
      params: Promise.resolve({ orgId: 'org-1' }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).not.toHaveProperty('metrics');
    expect(JSON.stringify(body)).not.toContain('private DB failure');
    expect(mocks.createInstitutionalReportPdf).not.toHaveBeenCalled();
  });

  it('includes observations beyond the former 10000-row ceiling', async () => {
    mocks.telemetryRows = Array.from({ length: 10001 }, (_, index) => ({
      stage_id: 'stage-1',
      completion_rate: index < 10000 ? 0 : 1,
    }));
    const { GET } = await import('@/app/api/organizations/[orgId]/reports/route');
    const response = await GET(new Request('http://localhost/reports') as NextRequest, {
      params: Promise.resolve({ orgId: 'org-1' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.formations[0].completion_rate).toBeCloseTo(100 / 10001, 10);
    expect(mocks.ranges).toContainEqual([10000, 10099]);
  });
});
