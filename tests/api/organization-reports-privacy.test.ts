import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createInstitutionalReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-private-free')),
  tableCalls: [] as string[],
  membershipRole: 'admin' as string | null,
}));

function queryResult<T>(result: T) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    gte: () => query,
    lte: () => query,
    limit: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
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
            completion_rate: 75,
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
      return queryResult(responses[table]?.[index] ?? { data: [] });
    }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => createSupabaseFixture()),
}));
vi.mock('@/lib/reports/pdf', () => ({
  createInstitutionalReportPdf: mocks.createInstitutionalReportPdf,
}));

describe('institutional report privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tableCalls.length = 0;
    mocks.membershipRole = 'admin';
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
});
