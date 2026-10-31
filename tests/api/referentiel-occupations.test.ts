import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ID = '00000000-0000-4000-8000-000000000051';
const URI = `http://data.europa.eu/esco/occupation/${ID}`;
const SKILL_A = 'http://data.europa.eu/esco/skill/a';
const SKILL_B = 'https://referentiel.ai-mpower.com/ims/case/v1p0/CFItems/b';

type Result = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  results: new Map<string, Result>(),
  calls: [] as { table: string; op: string; args: unknown[] }[],
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'in', 'order', 'limit', 'ilike', 'like']) {
        builder[op] = (...args: unknown[]) => {
          mocks.calls.push({ table, op, args });
          return builder;
        };
      }
      builder.maybeSingle = () =>
        Promise.resolve(mocks.results.get(`${table}:single`) ?? { data: null, error: null });
      builder.then = (resolve: (value: Result | undefined) => unknown) =>
        resolve(mocks.results.get(table) ?? { data: [], error: null });
      return builder;
    },
  }),
}));

import { GET as search } from '@/app/api/referentiel/occupations/route';
import { GET as detail } from '@/app/api/referentiel/occupations/[id]/route';

const searchRequest = (query: string) =>
  new NextRequest(`https://qalem.ma/api/referentiel/occupations?${query}`);
const calls = (table: string, op: string) =>
  mocks.calls.filter((call) => call.table === table && call.op === op);

describe('GET /api/referentiel/occupations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.results.clear();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'u', email: 'a@qalem.ma' } });
  });

  it('requires a signed-in account before reading anything', async () => {
    mocks.requireAuth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });

    expect((await search(searchRequest('q=web'))).status).toBe(401);
    expect(mocks.calls).toHaveLength(0);
  });

  it('rejects an empty search and a malformed ISCO code', async () => {
    expect((await search(searchRequest(''))).status).toBe(400);
    expect((await search(searchRequest('isco=25a'))).status).toBe(400);
    expect(mocks.calls).toHaveLength(0);
  });

  it('searches the normalized text, neutralizes LIKE wildcards and caps the limit', async () => {
    await search(searchRequest('q=D%C3%A9veloppeur%25_&limit=999'));

    expect(calls('referentiel_occupations', 'ilike')[0]?.args).toEqual([
      'search_text',
      '%developpeur\\%\\_%',
    ]);
    expect(calls('referentiel_occupations', 'limit')[0]?.args).toEqual([50]);
  });

  it('filters by ISCO prefix and returns titles in three languages with counts', async () => {
    mocks.results.set('referentiel_occupations', {
      data: [
        {
          uri: URI,
          title_fr: 'développeur web',
          title_ar: 'مطور ويب',
          title_en: 'web developer',
          isco_code: '2513',
          essential_uris: [SKILL_A, SKILL_B],
          optional_uris: [SKILL_B],
        },
      ],
      error: null,
    });

    const response = await search(searchRequest('isco=25'));
    const payload = (await response.json()) as { occupations: Record<string, unknown>[] };

    expect(calls('referentiel_occupations', 'like')[0]?.args).toEqual(['isco_code', '25%']);
    expect(payload.occupations[0]).toEqual({
      id: ID,
      uri: URI,
      titles: { fr: 'développeur web', ar: 'مطور ويب', en: 'web developer' },
      iscoCode: '2513',
      essentialCount: 2,
      optionalCount: 1,
    });
  });
});

describe('GET /api/referentiel/occupations/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const request = () => new NextRequest(`https://qalem.ma/api/referentiel/occupations/${ID}`);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.results.clear();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'u', email: 'a@qalem.ma' } });
  });

  it('rejects a non-UUID id and answers 404 for an unknown occupation', async () => {
    expect((await detail(request(), params('not-a-uuid'))).status).toBe(400);
    expect((await detail(request(), params(ID))).status).toBe(404);
  });

  it('returns the occupation with its essential and optional skills, ESCO link only for ESCO skills', async () => {
    mocks.results.set('referentiel_occupations:single', {
      data: {
        uri: URI,
        title_fr: 'développeur web',
        title_ar: null,
        title_en: 'web developer',
        isco_code: '2513',
        document_id: 'doc-1',
        referentiel_version: 'doc-1@2026-10-31',
        essential_uris: [SKILL_A],
        optional_uris: [SKILL_B, 'http://missing'],
      },
      error: null,
    });
    mocks.results.set('referentiel_skills', {
      data: [
        { uri: SKILL_A, title_fr: 'programmer', title_ar: 'برمجة', title_en: 'program' },
        { uri: SKILL_B, title_fr: 'gérer', title_ar: null, title_en: null },
      ],
      error: null,
    });

    const response = await detail(request(), params(ID));
    const payload = (await response.json()) as {
      occupation: { referentielVersion: string; iscoCode: string };
      essential: { escoUri: string | null }[];
      optional: { escoUri: string | null; titles: { fr: string } }[];
    };

    expect(response.status).toBe(200);
    expect(payload.occupation).toMatchObject({
      referentielVersion: 'doc-1@2026-10-31',
      iscoCode: '2513',
    });
    expect(payload.essential[0]?.escoUri).toBe(SKILL_A);
    expect(payload.optional).toHaveLength(1);
    expect(payload.optional[0]).toMatchObject({ escoUri: null, titles: { fr: 'gérer' } });
  });
});
