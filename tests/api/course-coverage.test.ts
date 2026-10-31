import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const COURSE_ID = '00000000-0000-4000-8000-000000000041';
const ORG_ID = '00000000-0000-4000-8000-000000000042';
const OWNER_ID = '00000000-0000-4000-8000-000000000043';
const OCCUPATION = 'http://data.europa.eu/esco/occupation/00000000-0000-4000-8000-000000000044';
const SKILL = 'http://data.europa.eu/esco/skill/a';

type Result = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  fetchCasePackage: vi.fn(),
  competenciesOfOccupation: vi.fn(),
  results: new Map<string, Result>(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgEditor: mocks.guard }));
vi.mock('@/lib/referentiel/case-client', () => ({
  fetchCasePackage: mocks.fetchCasePackage,
  competenciesOfOccupation: mocks.competenciesOfOccupation,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'eq']) builder[op] = () => builder;
      builder.maybeSingle = () => Promise.resolve(mocks.results.get(`${table}:single`));
      builder.then = (resolve: (value: Result | undefined) => unknown) =>
        resolve(mocks.results.get(table) ?? { data: [], error: null });
      return builder;
    },
  }),
}));

import { GET } from '@/app/api/courses/[courseId]/coverage/route';

const params = () => ({ params: Promise.resolve({ courseId: COURSE_ID }) });

function get(query: Record<string, string>): NextRequest {
  const search = new URLSearchParams(query).toString();
  return new NextRequest(`https://qalem.ma/api/courses/${COURSE_ID}/coverage?${search}`);
}

const valid = { document: 'a91169ef-a63d-5d43-b843-e7ab0450c14a', occupation: OCCUPATION };

describe('GET /api/courses/[courseId]/coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.results.clear();
    mocks.results.set('courses:single', {
      data: { id: COURSE_ID, org_id: ORG_ID, owner_id: OWNER_ID, stage_id: 'stageAbc123' },
      error: null,
    });
    mocks.results.set('course_competencies', { data: [{ competency_uri: SKILL }], error: null });
    mocks.guard.mockResolvedValue({ user: { id: 'u', email: 'editor@qalem.ma' } });
    mocks.fetchCasePackage.mockResolvedValue({ package: true });
    mocks.competenciesOfOccupation.mockReturnValue({
      occupation: {
        title: 'Dév',
        escoUri: OCCUPATION,
        iscoCode: '2513',
        referentielVersion: 'd@v',
      },
      essential: [
        {
          competenceUri: SKILL,
          escoUri: SKILL,
          title: 'A',
          titles: { fr: 'A', ar: null, en: null },
        },
        { competenceUri: 'b', escoUri: null, title: 'B', titles: { fr: 'B', ar: null, en: null } },
      ],
      optional: [],
    });
  });

  it('rejects a missing document or a malformed occupation before reading anything', async () => {
    expect((await GET(get({ occupation: OCCUPATION }), params())).status).toBe(400);
    expect((await GET(get({ ...valid, occupation: 'http://evil/x' }), params())).status).toBe(400);
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.fetchCasePackage).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown course and 403 for a caller who cannot edit it', async () => {
    mocks.results.set('courses:single', { data: null, error: null });
    expect((await GET(get(valid), params())).status).toBe(404);

    mocks.results.set('courses:single', {
      data: { id: COURSE_ID, org_id: ORG_ID, owner_id: OWNER_ID, stage_id: null },
      error: null,
    });
    mocks.guard.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await GET(get(valid), params())).status).toBe(403);
    expect(mocks.fetchCasePackage).not.toHaveBeenCalled();
  });

  it('answers 502 when the referential cannot be read and 404 when the occupation is absent', async () => {
    mocks.fetchCasePackage.mockRejectedValueOnce(new Error('HTTP 500'));
    expect((await GET(get(valid), params())).status).toBe(502);

    mocks.competenciesOfOccupation.mockReturnValueOnce(null);
    expect((await GET(get(valid), params())).status).toBe(404);
  });

  it('returns the coverage of the occupation by the course links', async () => {
    const response = await GET(get(valid), params());
    const payload = (await response.json()) as {
      essential: { total: number; covered: number; missing: { title: string }[] };
    };

    expect(response.status).toBe(200);
    expect(mocks.fetchCasePackage).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\//),
      valid.document,
    );
    expect(payload.essential).toMatchObject({ total: 2, covered: 1 });
    expect(payload.essential.missing.map((item) => item.title)).toEqual(['B']);
  });
});
