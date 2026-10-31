import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const COURSE_ID = '00000000-0000-4000-8000-000000000031';
const ORG_ID = '00000000-0000-4000-8000-000000000032';
const OWNER_ID = '00000000-0000-4000-8000-000000000033';
const ACTOR_ID = '00000000-0000-4000-8000-000000000034';
const URI = 'http://data.europa.eu/esco/skill/abc';
const VERSION = 'doc-1@2026-10-31';

type Result = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  results: new Map<string, Result>(),
  calls: [] as { table: string; op: string; args: unknown[] }[],
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgEditor: mocks.guard }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const record =
        (op: string) =>
        (...args: unknown[]) => {
          mocks.calls.push({ table, op, args });
          return builder;
        };
      for (const op of ['select', 'eq', 'in', 'not', 'upsert', 'delete']) builder[op] = record(op);
      builder.maybeSingle = () => Promise.resolve(mocks.results.get(`${table}:single`));
      builder.then = (resolve: (value: Result | undefined) => unknown) =>
        resolve(mocks.results.get(table) ?? { data: [], error: null });
      return builder;
    },
  }),
}));

import { GET, PUT } from '@/app/api/courses/[courseId]/competencies/route';

const params = () => ({ params: Promise.resolve({ courseId: COURSE_ID }) });

function put(body: unknown): NextRequest {
  return new NextRequest(`https://qalem.ma/api/courses/${COURSE_ID}/competencies`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const get = () => new NextRequest(`https://qalem.ma/api/courses/${COURSE_ID}/competencies`);
const writes = (table: string, op: string) =>
  mocks.calls.filter((call) => call.table === table && call.op === op);

describe('/api/courses/[courseId]/competencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.results.clear();
    mocks.results.set('courses:single', {
      data: { id: COURSE_ID, org_id: ORG_ID, owner_id: OWNER_ID, stage_id: 'stageAbc123' },
      error: null,
    });
    mocks.guard.mockResolvedValue({ user: { id: ACTOR_ID, email: 'editor@qalem.ma' } });
  });

  it('answers 404 for an unknown course before any authorization or write', async () => {
    mocks.results.set('courses:single', { data: null, error: null });

    const response = await PUT(put({ course: [] }), params());

    expect(response.status).toBe(404);
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(writes('course_competencies', 'upsert')).toHaveLength(0);
  });

  it('refuses a caller who cannot edit the course organization', async () => {
    mocks.guard.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });

    const response = await PUT(put({ course: [{ uri: URI, version: VERSION }] }), params());

    expect(response.status).toBe(403);
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), ORG_ID, OWNER_ID, 'stageAbc123');
    expect(writes('course_competencies', 'upsert')).toHaveLength(0);
  });

  it('rejects an invalid body and an invalid ISCO group', async () => {
    expect((await PUT(put({}), params())).status).toBe(400);
    expect(
      (await PUT(put({ course: [{ uri: URI, version: VERSION, isco08: '25' }] }), params())).status,
    ).toBe(400);
    expect(writes('course_competencies', 'upsert')).toHaveLength(0);
  });

  it('saves course links with the acting user then prunes the removed ones', async () => {
    const response = await PUT(
      put({ course: [{ uri: URI, version: VERSION, isco08: '2513', nature: 'optionnelle' }] }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(writes('course_competencies', 'upsert')[0]?.args).toEqual([
      [
        {
          course_id: COURSE_ID,
          org_id: ORG_ID,
          competency_uri: URI,
          referential_version: VERSION,
          isco_08: '2513',
          nature: 'optionnelle',
          created_by: ACTOR_ID,
        },
      ],
      { onConflict: 'course_id,competency_uri' },
    ]);
    expect(writes('course_competencies', 'delete')).toHaveLength(1);
    expect(writes('course_competencies', 'not')[0]?.args[0]).toBe('competency_uri');
  });

  it('empties the course links when an empty list is submitted', async () => {
    const response = await PUT(put({ course: [] }), params());

    expect(response.status).toBe(200);
    expect(writes('course_competencies', 'upsert')).toHaveLength(0);
    expect(writes('course_competencies', 'delete')).toHaveLength(1);
    expect(writes('course_competencies', 'not')).toHaveLength(0);
  });

  it('refuses scene links on a scene that is not in the course classroom', async () => {
    mocks.results.set('scenes', { data: [], error: null });

    const response = await PUT(
      put({ scenes: [{ sceneId: 'foreign', uri: URI, version: VERSION }] }),
      params(),
    );

    expect(response.status).toBe(400);
    expect(writes('scene_competencies', 'upsert')).toHaveLength(0);
  });

  it('stamps the confirming person only on confirmed scene links', async () => {
    mocks.results.set('scenes', { data: [{ id: 's1' }, { id: 's2' }], error: null });

    const response = await PUT(
      put({
        scenes: [
          { sceneId: 's1', uri: URI, version: VERSION, nature: 'evaluee', statut: 'confirme' },
          { sceneId: 's2', uri: URI, version: VERSION },
        ],
      }),
      params(),
    );

    expect(response.status).toBe(200);
    const rows = writes('scene_competencies', 'upsert')[0]?.args[0] as {
      statut: string;
      confirmed_by: string | null;
      confirmed_at: string | null;
    }[];
    expect(rows[0]).toMatchObject({ statut: 'confirme', confirmed_by: ACTOR_ID });
    expect(rows[0]?.confirmed_at).toEqual(expect.any(String));
    expect(rows[1]).toMatchObject({ statut: 'propose', confirmed_by: null, confirmed_at: null });
  });

  it('reads the links of the course and of its scenes', async () => {
    mocks.results.set('scenes', { data: [{ id: 's1' }], error: null });
    mocks.results.set('course_competencies', {
      data: [
        {
          competency_uri: URI,
          referential_version: VERSION,
          isco_08: '2513',
          nature: 'essentielle',
        },
      ],
      error: null,
    });

    const response = await GET(get(), params());
    const payload = (await response.json()) as { course: unknown[]; scenes: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.course).toHaveLength(1);
    expect(writes('scene_competencies', 'in')[0]?.args).toEqual(['scene_id', ['s1']]);
  });
});
