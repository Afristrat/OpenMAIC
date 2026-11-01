import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '00000000-0000-4000-8000-000000000061';

type Result = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  result: { data: [], error: null } as Result,
  calls: [] as { op: string; args: unknown[] }[],
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgMember: mocks.guard }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from() {
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'not', 'order']) {
        builder[op] = (...args: unknown[]) => {
          mocks.calls.push({ op, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: Result) => unknown) => resolve(mocks.result);
      return builder;
    },
  }),
}));

import { GET } from '@/app/api/referentiel/courses/route';

const get = (query: string) => new NextRequest(`https://qalem.ma/api/referentiel/courses${query}`);

describe('GET /api/referentiel/courses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.result = { data: [], error: null };
    mocks.guard.mockResolvedValue({ user: { id: 'u', email: 'a@qalem.ma' } });
  });

  it('requires an organization id and a member of that organization', async () => {
    expect((await GET(get(''))).status).toBe(400);

    mocks.guard.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await GET(get(`?orgId=${ORG_ID}`))).status).toBe(403);
    expect(mocks.calls).toHaveLength(0);
  });

  it('lists only the ready courses of the organization that have a classroom', async () => {
    mocks.result = { data: [{ id: 'c1', title: 'Excel', language: 'fr-FR' }], error: null };

    const response = await GET(get(`?orgId=${ORG_ID}`));
    const payload = (await response.json()) as { courses: { id: string }[] };

    expect(response.status).toBe(200);
    expect(payload.courses.map((course) => course.id)).toEqual(['c1']);
    expect(mocks.calls.filter((call) => call.op === 'eq').map((call) => call.args)).toEqual([
      ['org_id', ORG_ID],
      ['status', 'ready'],
    ]);
    expect(mocks.calls.find((call) => call.op === 'not')?.args).toEqual(['stage_id', 'is', null]);
  });
});
