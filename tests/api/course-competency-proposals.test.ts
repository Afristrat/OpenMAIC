import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const COURSE_ID = '00000000-0000-4000-8000-000000000081';
const ORG_ID = '00000000-0000-4000-8000-000000000082';
const OWNER_ID = '00000000-0000-4000-8000-000000000083';
const SKILL_A = 'http://data.europa.eu/esco/skill/a';
const SKILL_B = 'http://data.europa.eu/esco/skill/b';
const VERSION = 'doc-1@2026-10-31';

type Result = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  callLLM: vi.fn(),
  results: new Map<string, Result>(),
  calls: [] as { table: string; op: string; args: unknown[] }[],
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgEditor: mocks.guard }));
vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: async () => ({ model: 'fake-model', thinkingConfig: undefined }),
}));
vi.mock('@/lib/billing/usage-context', () => ({
  runWithUsageMeteringContext: (
    _headers: Headers,
    _user: string,
    _org: string,
    run: () => unknown,
  ) => run(),
  withStableIdempotencyKey: (headers: Headers) => headers,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'in', 'order', 'upsert']) {
        builder[op] = (...args: unknown[]) => {
          mocks.calls.push({ table, op, args });
          return builder;
        };
      }
      builder.maybeSingle = () =>
        Promise.resolve(mocks.results.get(`${table}:single`) ?? { data: null, error: null });
      builder.then = (resolve: (value: Result) => unknown) =>
        resolve(mocks.results.get(table) ?? { data: [], error: null });
      return builder;
    },
  }),
}));

import { POST } from '@/app/api/courses/[courseId]/competencies/propose/route';

const params = () => ({ params: Promise.resolve({ courseId: COURSE_ID }) });
const post = () =>
  new NextRequest(`https://qalem.ma/api/courses/${COURSE_ID}/competencies/propose`, {
    method: 'POST',
  });
const upserts = () => mocks.calls.filter((call) => call.table === 'scene_competencies');

describe('POST /api/courses/[courseId]/competencies/propose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.results.clear();
    mocks.results.set('courses:single', {
      data: { id: COURSE_ID, org_id: ORG_ID, owner_id: OWNER_ID, stage_id: 'stageAbc123' },
      error: null,
    });
    mocks.results.set('scenes', {
      data: [
        { id: 's1', title: 'Introduction', type: 'slide', content: { text: 'Les balises' } },
        { id: 's2', title: 'Quiz', type: 'quiz', content: { question: 'Quelle balise ?' } },
      ],
      error: null,
    });
    mocks.results.set('course_competencies', {
      data: [
        { competency_uri: SKILL_A, referential_version: VERSION },
        { competency_uri: SKILL_B, referential_version: VERSION },
      ],
      error: null,
    });
    mocks.results.set('referentiel_skills', {
      data: [{ uri: SKILL_A, title_fr: 'utiliser des langages de balisage' }],
      error: null,
    });
    mocks.guard.mockResolvedValue({ user: { id: 'u', email: 'editor@qalem.ma' } });
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        links: [
          { sceneId: 's1', skillId: SKILL_A, nature: 'worked' },
          { sceneId: 's2', skillId: SKILL_A, nature: 'assessed' },
          { sceneId: 'ghost', skillId: SKILL_A, nature: 'worked' },
        ],
      }),
    });
  });

  it('answers 404 for an unknown course and 403 for a caller who cannot edit it, before any LLM call', async () => {
    mocks.results.set('courses:single', { data: null, error: null });
    expect((await POST(post(), params())).status).toBe(404);

    mocks.results.set('courses:single', {
      data: { id: COURSE_ID, org_id: ORG_ID, owner_id: OWNER_ID, stage_id: 'stageAbc123' },
      error: null,
    });
    mocks.guard.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await POST(post(), params())).status).toBe(403);
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('asks to choose the target competencies first when the course has none', async () => {
    mocks.results.set('course_competencies', { data: [], error: null });

    expect((await POST(post(), params())).status).toBe(409);
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('saves only valid proposals, at the proposed status, without touching existing links', async () => {
    const response = await POST(post(), params());
    const payload = (await response.json()) as { proposed: number };

    expect(response.status).toBe(200);
    expect(payload.proposed).toBe(2);
    const [upsert] = upserts().filter((call) => call.op === 'upsert');
    expect(upsert?.args[0]).toEqual([
      {
        scene_id: 's1',
        org_id: ORG_ID,
        competency_uri: SKILL_A,
        referential_version: VERSION,
        nature: 'travaillee',
        statut: 'propose',
      },
      {
        scene_id: 's2',
        org_id: ORG_ID,
        competency_uri: SKILL_A,
        referential_version: VERSION,
        nature: 'evaluee',
        statut: 'propose',
      },
    ]);
    expect(upsert?.args[1]).toEqual({
      onConflict: 'scene_id,competency_uri,nature',
      ignoreDuplicates: true,
    });
  });

  it('answers 502 and writes nothing when the model answer is unreadable', async () => {
    mocks.callLLM.mockResolvedValue({ text: 'pas du JSON' });

    expect((await POST(post(), params())).status).toBe(502);
    expect(upserts().filter((call) => call.op === 'upsert')).toHaveLength(0);
  });
});
