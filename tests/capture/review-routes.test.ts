import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase';

const mocks = vi.hoisted(() => ({
  author: vi.fn(),
  limit: vi.fn(),
  db: null as unknown,
  user: null as { id: string } | null,
  signed: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => mocks.db }));
vi.mock('@/lib/server/course-generation-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/course-generation-access')>()),
  assertGenerationAuthor: mocks.author,
  assertFreeCourseLimit: mocks.limit,
}));
vi.mock('@/lib/server/private-artifact-url', () => ({ privateArtifactUrl: mocks.signed }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/api/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: async () =>
      mocks.user
        ? { user: mocks.user, response: null }
        : { user: null, response: NextResponse.json({ success: false }, { status: 401 }) },
  };
});

import { CourseAccessError, FreeCourseLimitError } from '@/lib/server/course-generation-access';
import { GET as listCourses } from '@/app/api/capture/courses/route';
import { GET as readCourse } from '@/app/api/capture/courses/[courseId]/route';
import { POST as attach } from '@/app/api/capture/courses/[courseId]/attach/route';
import { PATCH as reviewStep } from '@/app/api/capture/steps/[stepId]/route';
import { GET as screenshot } from '@/app/api/capture/screenshots/[stepId]/route';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const COURSE = '33333333-3333-4333-8333-333333333333';
const OTHER_COURSE = '44444444-4444-4444-8444-444444444444';
const ORG = '55555555-5555-4555-8555-555555555555';
const OTHER_ORG = '66666666-6666-4666-8666-666666666666';
const OLD_SESSION = '77777777-7777-4777-8777-777777777777';
const NEW_SESSION = '88888888-8888-4888-8888-888888888888';
const FOREIGN_SESSION = '99999999-9999-4999-8999-999999999999';
const STEP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STEP_NO_IMAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_STEP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function db(): FakeSupabase {
  return mocks.db as FakeSupabase;
}

function request(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const stepRow = {
  action: 'click',
  url: 'https://app.exemple.com/factures',
  element: { label: 'Créer une facture' },
  description: 'Cliquez.',
  review: 'pending',
  reviewed_at: null,
};

beforeEach(() => {
  mocks.user = { id: OWNER };
  mocks.signed.mockReset();
  mocks.author.mockReset().mockResolvedValue(undefined);
  mocks.limit.mockReset().mockResolvedValue(undefined);
  mocks.signed.mockResolvedValue('https://storage.exemple.com/signed/abc');
  mocks.db = createFakeSupabase({
    courses: [
      { id: COURSE, owner_id: OWNER, org_id: null, title: 'Mon projet', status: 'draft' },
      { id: OTHER_COURSE, owner_id: OTHER, org_id: null, title: 'Autre', status: 'draft' },
    ],
    capture_sessions: [
      {
        id: OLD_SESSION,
        course_id: COURSE,
        owner_id: OWNER,
        domain: 'app.exemple.com',
        captured_at: '2026-10-20T10:00:00.000Z',
        status: 'complete',
        step_count: 1,
        supersedes_capture_id: null,
      },
      {
        id: NEW_SESSION,
        course_id: COURSE,
        owner_id: OWNER,
        domain: 'app.exemple.com',
        captured_at: '2026-10-28T10:00:00.000Z',
        status: 'complete',
        step_count: 1,
        supersedes_capture_id: OLD_SESSION,
      },
      {
        id: FOREIGN_SESSION,
        course_id: OTHER_COURSE,
        owner_id: OTHER,
        domain: 'secret.exemple.com',
        captured_at: '2026-10-28T10:00:00.000Z',
        status: 'complete',
        step_count: 1,
        supersedes_capture_id: null,
      },
    ],
    capture_steps: [
      { ...stepRow, id: STEP, session_id: NEW_SESSION, position: 0, screenshot_path: 'o/s/0.jpg' },
      {
        ...stepRow,
        id: STEP_NO_IMAGE,
        session_id: NEW_SESSION,
        position: 1,
        screenshot_path: null,
      },
      {
        ...stepRow,
        id: FOREIGN_STEP,
        session_id: FOREIGN_SESSION,
        position: 0,
        screenshot_path: 'x/y/0.jpg',
      },
    ],
  });
});

describe('liste des projets', () => {
  it('refuse sans session et ne liste que les projets de la personne, avec leurs sessions', async () => {
    mocks.user = null;
    expect((await listCourses(request('/api/capture/courses'))).status).toBe(401);
    mocks.user = { id: OWNER };
    const res = await listCourses(request('/api/capture/courses'));
    const body = (await res.json()) as { courses: Array<{ id: string; sessionCount: number }> };
    expect(body.courses).toEqual([expect.objectContaining({ id: COURSE, sessionCount: 2 })]);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('lecture des captures d’un projet', () => {
  const ctx = (courseId: string) => ({ params: Promise.resolve({ courseId }) });

  it('renvoie les sessions, marque la remplacée et ne divulgue aucun chemin de stockage', async () => {
    const res = await readCourse(request(`/api/capture/courses/${COURSE}`), ctx(COURSE));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('o/s/0.jpg');
    expect(text).not.toContain('screenshot_path');
    const body = JSON.parse(text) as {
      sessions: Array<{ id: string; replaced: boolean; steps: Array<{ hasScreenshot: boolean }> }>;
    };
    expect(body.sessions.find((s) => s.id === OLD_SESSION)?.replaced).toBe(true);
    const current = body.sessions.find((s) => s.id === NEW_SESSION);
    expect(current?.replaced).toBe(false);
    expect(current?.steps.map((s) => s.hasScreenshot)).toEqual([true, false]);
  });

  it('répond 404 pour le projet d’un autre et 400 pour un identifiant invalide', async () => {
    expect(
      (await readCourse(request(`/api/capture/courses/${OTHER_COURSE}`), ctx(OTHER_COURSE))).status,
    ).toBe(404);
    expect((await readCourse(request('/api/capture/courses/x'), ctx('x'))).status).toBe(400);
  });
});

describe('validation d’une étape', () => {
  const ctx = (stepId: string) => ({ params: Promise.resolve({ stepId }) });
  const patch = (stepId: string, body: unknown) =>
    reviewStep(request(`/api/capture/steps/${stepId}`, 'PATCH', body), ctx(stepId));
  const row = (id: string) =>
    db()
      .table('capture_steps')
      .find((r) => r.id === id);

  it('valide puis remet en attente, la date de relecture suivant l’état', async () => {
    expect((await patch(STEP, { review: 'approved' })).status).toBe(200);
    expect(row(STEP)).toMatchObject({ review: 'approved' });
    expect(row(STEP)?.reviewed_at).toBeTruthy();
    expect((await patch(STEP, { review: 'pending' })).status).toBe(200);
    expect(row(STEP)).toMatchObject({ review: 'pending', reviewed_at: null });
  });

  it('refuse l’étape d’un autre auteur sans la modifier, et les corps invalides', async () => {
    expect((await patch(FOREIGN_STEP, { review: 'approved' })).status).toBe(404);
    expect(row(FOREIGN_STEP)?.review).toBe('pending');
    expect((await patch(STEP, { review: 'maybe' })).status).toBe(400);
    expect((await patch(STEP, { review: 'approved', description: 'x' })).status).toBe(400);
    expect((await patch('pas-un-uuid', { review: 'approved' })).status).toBe(400);
  });

  it('refuse sans session', async () => {
    mocks.user = null;
    expect((await patch(STEP, { review: 'approved' })).status).toBe(401);
  });
});

describe('lecture d’une capture d’écran', () => {
  const ctx = (stepId: string) => ({ params: Promise.resolve({ stepId }) });
  const read = (stepId: string) =>
    screenshot(request(`/api/capture/screenshots/${stepId}`), ctx(stepId));

  it('redirige vers l’URL signée du bucket privé pour son propriétaire', async () => {
    const res = await read(STEP);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://storage.exemple.com/signed/abc');
    expect(mocks.signed).toHaveBeenCalledWith('capture-screenshots', 'o/s/0.jpg', false);
  });

  it('répond 404 pour l’étape d’un autre, ou sans image, sans jamais signer', async () => {
    expect((await read(FOREIGN_STEP)).status).toBe(404);
    expect((await read(STEP_NO_IMAGE)).status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it('répond 500 si la signature échoue', async () => {
    mocks.signed.mockRejectedValue(new Error('down'));
    expect((await read(STEP)).status).toBe(500);
  });
});

describe('rattachement à l’organisation', () => {
  const ctx = (courseId: string) => ({ params: Promise.resolve({ courseId }) });
  const post = (courseId: string, body: unknown) =>
    attach(request(`/api/capture/courses/${courseId}/attach`, 'POST', body), ctx(courseId));
  const course = (id: string) =>
    db()
      .table('courses')
      .find((r) => r.id === id);

  it('rattache un projet sans organisation après les contrôles de la génération, puis répond OK', async () => {
    expect((await post(COURSE, { orgId: ORG })).status).toBe(200);
    expect(course(COURSE)?.org_id).toBe(ORG);
    expect(mocks.author).toHaveBeenCalledWith(ORG, OWNER);
    expect(mocks.limit).toHaveBeenCalledWith(ORG);
    expect((await post(COURSE, { orgId: ORG })).status).toBe(200);
  });

  it('refuse sans rôle d’auteur dans l’organisation, sans rien écrire', async () => {
    mocks.author.mockRejectedValue(new CourseAccessError());
    expect((await post(COURSE, { orgId: OTHER_ORG })).status).toBe(403);
    expect(course(COURSE)?.org_id).toBeNull();
  });

  it('refuse au-delà de la limite du plan gratuit, sans rien écrire', async () => {
    mocks.limit.mockRejectedValue(new FreeCourseLimitError());
    expect((await post(COURSE, { orgId: ORG })).status).toBe(429);
    expect(course(COURSE)?.org_id).toBeNull();
  });

  it('refuse le projet d’un autre auteur', async () => {
    expect((await post(OTHER_COURSE, { orgId: ORG })).status).toBe(404);
    expect(mocks.author).not.toHaveBeenCalled();
  });

  it('refuse un projet déjà rattaché à une autre organisation', async () => {
    await post(COURSE, { orgId: ORG });
    expect((await post(COURSE, { orgId: OTHER_ORG })).status).toBe(409);
    expect(course(COURSE)?.org_id).toBe(ORG);
  });

  it('refuse un corps invalide', async () => {
    expect((await post(COURSE, { orgId: 'x' })).status).toBe(400);
    expect((await post(COURSE, { orgId: ORG, extra: 1 })).status).toBe(400);
  });
});
