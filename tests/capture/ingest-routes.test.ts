import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase';
import { generateCaptureToken, generatePairingCode, sha256Hex } from '@/lib/capture/credentials';
import { resetAccessCodeThrottle } from '@/lib/server/access-code-throttle';

const mocks = vi.hoisted(() => ({ db: null as unknown, user: null as { id: string } | null }));

vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => mocks.db }));
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

import { POST as createPairingCode } from '@/app/api/capture/pairing-codes/route';
import { POST as pair } from '@/app/api/capture/ingest/pair/route';
import {
  GET as listProjects,
  POST as createProject,
} from '@/app/api/capture/ingest/projects/route';
import { GET as listSessions, POST as openSession } from '@/app/api/capture/ingest/sessions/route';
import { POST as addStep } from '@/app/api/capture/ingest/sessions/[id]/steps/route';
import { POST as completeSession } from '@/app/api/capture/ingest/sessions/[id]/complete/route';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const COURSE = '33333333-3333-4333-8333-333333333333';
const OTHER_COURSE = '44444444-4444-4444-8444-444444444444';

function db(): FakeSupabase {
  return mocks.db as FakeSupabase;
}

function post(path: string, body: unknown, token?: string, ip = '203.0.113.7'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function get(path: string, token?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jpegBase64(): string {
  const bytes = Buffer.alloc(64, 0x11);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[62] = 0xff;
  bytes[63] = 0xd9;
  return bytes.toString('base64');
}

const cleanStep = {
  position: 0,
  capturedAt: '2026-10-28T10:00:00.000Z',
  action: 'click',
  url: 'https://app.exemple.com/factures',
  element: { label: 'Créer une facture', role: 'button' },
  pointer: { x: 10, y: 20 },
  viewport: { w: 1280, h: 720 },
  description: 'Cliquez sur « Créer une facture ».',
};

let token: string;

beforeEach(() => {
  resetAccessCodeThrottle();
  const issued = generateCaptureToken();
  token = issued.token;
  mocks.user = { id: OWNER };
  mocks.db = createFakeSupabase({
    capture_tokens: [{ id: 't1', owner_id: OWNER, token_hash: issued.hash, revoked_at: null }],
    courses: [
      { id: COURSE, owner_id: OWNER, title: 'Mon projet', language: 'fr-FR', status: 'draft' },
      { id: OTHER_COURSE, owner_id: OTHER, title: 'Autre', language: 'fr-FR', status: 'draft' },
    ],
  });
});

describe('appairage', () => {
  it('émet un code, ne le stocke qu’empreinté, et limite le nombre de codes', async () => {
    const res = await createPairingCode(post('/api/capture/pairing-codes', {}));
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    const stored = db().table('capture_pairing_codes');
    expect(stored).toHaveLength(1);
    expect(stored[0].code_hash).toBe(sha256Hex(code));
    expect(JSON.stringify(stored)).not.toContain(code);

    for (let i = 0; i < 4; i += 1) {
      expect((await createPairingCode(post('/api/capture/pairing-codes', {}))).status).toBe(201);
    }
    expect((await createPairingCode(post('/api/capture/pairing-codes', {}))).status).toBe(429);
  });

  it('refuse l’émission sans session connectée', async () => {
    mocks.user = null;
    expect((await createPairingCode(post('/api/capture/pairing-codes', {}))).status).toBe(401);
  });

  it('échange un code contre un jeton, une seule fois, et ne stocke que l’empreinte du jeton', async () => {
    const { code, hash } = generatePairingCode();
    db()
      .table('capture_pairing_codes')
      .push({
        id: 'c1',
        owner_id: OWNER,
        code_hash: hash,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used_at: null,
      });

    const first = await pair(post('/api/capture/ingest/pair', { code: code.toLowerCase() }));
    expect(first.status).toBe(201);
    const { token: issued } = (await first.json()) as { token: string };
    expect(issued.startsWith('qcap_')).toBe(true);
    const tokens = db().table('capture_tokens');
    expect(tokens.some((row) => row.token_hash === sha256Hex(issued))).toBe(true);
    expect(JSON.stringify(tokens)).not.toContain(issued);

    const second = await pair(post('/api/capture/ingest/pair', { code }));
    expect(second.status).toBe(401);
  });

  it('refuse un code expiré, inconnu ou mal formé, avec la même réponse', async () => {
    const { code, hash } = generatePairingCode();
    db()
      .table('capture_pairing_codes')
      .push({
        id: 'c2',
        owner_id: OWNER,
        code_hash: hash,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        used_at: null,
      });
    for (const attempt of [code, generatePairingCode().code, 'ABC', '0O1I0O1I']) {
      const res = await pair(post('/api/capture/ingest/pair', { code: attempt }));
      expect(res.status).toBe(401);
    }
  });

  it('bloque une adresse après 5 échecs, même avec un bon code ensuite', async () => {
    for (let i = 0; i < 5; i += 1) {
      await pair(post('/api/capture/ingest/pair', { code: generatePairingCode().code }));
    }
    const { code, hash } = generatePairingCode();
    db()
      .table('capture_pairing_codes')
      .push({
        id: 'c3',
        owner_id: OWNER,
        code_hash: hash,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used_at: null,
      });
    const res = await pair(post('/api/capture/ingest/pair', { code }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).not.toBeNull();
  });
});

describe('authentification par jeton', () => {
  it('refuse l’absence de jeton, un jeton inconnu et un jeton révoqué', async () => {
    expect((await listProjects(get('/api/capture/ingest/projects'))).status).toBe(401);
    const unknown = generateCaptureToken().token;
    expect((await listProjects(get('/api/capture/ingest/projects', unknown))).status).toBe(401);
    db().table('capture_tokens')[0].revoked_at = new Date().toISOString();
    expect((await listProjects(get('/api/capture/ingest/projects', token))).status).toBe(401);
  });

  it('ne liste que les projets de la personne et enregistre le dernier usage', async () => {
    const res = await listProjects(get('/api/capture/ingest/projects', token));
    const body = (await res.json()) as { projects: Array<{ id: string }> };
    expect(body.projects.map((p) => p.id)).toEqual([COURSE]);
    expect(db().table('capture_tokens')[0].last_used_at).toBeTruthy();
  });

  it('crée un projet en brouillon au nom de la personne', async () => {
    const res = await createProject(
      post(
        '/api/capture/ingest/projects',
        { title: 'Nouvelle formation', language: 'fr-FR' },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const created = db()
      .table('courses')
      .find((row) => row.title === 'Nouvelle formation');
    expect(created).toMatchObject({ owner_id: OWNER, status: 'draft', source_kind: 'generated' });
    const bad = await createProject(
      post('/api/capture/ingest/projects', { title: ' ', language: 'de-DE' }, token),
    );
    expect(bad.status).toBe(400);
  });
});

describe('sessions et étapes', () => {
  async function newSession(domain = 'app.exemple.com'): Promise<string> {
    const res = await openSession(
      post(
        '/api/capture/ingest/sessions',
        { courseId: COURSE, domain, toolVersion: '1.3.0', rightsAttested: true },
        token,
      ),
    );
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  it('liste les sessions terminées du projet, sans celles qu’une recapture remplace ni celles d’un autre', async () => {
    const first = await newSession('app.exemple.com');
    const second = await newSession('autre.exemple.com');
    for (const id of [first, second])
      db()
        .table('capture_sessions')
        .find((r) => r.id === id)!.status = 'complete';
    const replacement = await openSession(
      post(
        '/api/capture/ingest/sessions',
        {
          courseId: COURSE,
          domain: 'app.exemple.com',
          toolVersion: '1.5.0',
          rightsAttested: true,
          supersedesCaptureId: first,
        },
        token,
      ),
    );
    const replacementId = ((await replacement.json()) as { id: string }).id;
    db()
      .table('capture_sessions')
      .find((r) => r.id === replacementId)!.status = 'complete';
    db().table('capture_sessions').push({
      id: 'foreign',
      course_id: COURSE,
      owner_id: OTHER,
      domain: 'prive.exemple.com',
      captured_at: new Date().toISOString(),
      status: 'complete',
      step_count: 1,
      supersedes_capture_id: null,
    });

    const res = await listSessions(get(`/api/capture/ingest/sessions?courseId=${COURSE}`, token));
    const body = (await res.json()) as { sessions: Array<{ id: string; domain: string }> };
    expect(body.sessions.map((s) => s.id).sort()).toEqual([second, replacementId].sort());
    expect(JSON.stringify(body)).not.toContain('prive.exemple.com');
    expect((await listSessions(get('/api/capture/ingest/sessions?courseId=x', token))).status).toBe(
      400,
    );
    expect(
      (await listSessions(get(`/api/capture/ingest/sessions?courseId=${COURSE}`))).status,
    ).toBe(401);
  });

  it('refuse une session sans attestation de droit, ou dans le projet d’un autre', async () => {
    const base = { courseId: COURSE, domain: 'app.exemple.com', toolVersion: '1.3.0' };
    for (const body of [
      { ...base },
      { ...base, rightsAttested: false },
      { ...base, rightsAttested: true, courseId: OTHER_COURSE },
      { ...base, rightsAttested: true, domain: 'https://app.exemple.com/x' },
    ]) {
      const res = await openSession(post('/api/capture/ingest/sessions', body, token));
      expect([400, 404]).toContain(res.status);
    }
    expect(db().table('capture_sessions')).toHaveLength(0);
  });

  it('enregistre l’attestation avec sa date', async () => {
    await newSession();
    const [session] = db().table('capture_sessions');
    expect(session.rights_attested_at).toBeTruthy();
    expect(session.owner_id).toBe(OWNER);
  });

  it('dépose une étape propre avec sa capture, empreintes calculées côté serveur', async () => {
    const id = await newSession();
    const res = await addStep(
      post(
        `/api/capture/ingest/sessions/${id}/steps`,
        { ...cleanStep, screenshot: jpegBase64() },
        token,
      ),
      ctx(id),
    );
    expect(res.status).toBe(201);
    const [step] = db().table('capture_steps');
    expect(step).toMatchObject({
      session_id: id,
      position: 0,
      url: 'https://app.exemple.com/factures',
    });
    expect(step.screenshot_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(step.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(db().uploads).toEqual([
      { path: `${OWNER}/${id}/0.jpg`, size: 64, contentType: 'image/jpeg' },
    ]);
    expect(db().table('capture_sessions')[0].step_count).toBe(1);
  });

  it.each([
    ['URL avec requête', { url: 'https://app.exemple.com/a?token=abc' }, 422],
    ['URL avec fragment', { url: 'https://app.exemple.com/a#x' }, 422],
    ['URL hors du domaine', { url: 'https://autre.example/a' }, 422],
    ['courriel dans la description', { description: 'Écrivez à jean@exemple.com' }, 422],
    ['jeton dans l’étiquette', { element: { label: 'Bearer abcdefghijklmnop1234' } }, 422],
    ['champ inconnu', { href: 'https://app.exemple.com/?x=1' }, 400],
    [
      'image qui n’est pas un JPEG',
      { screenshot: Buffer.from('pas une image').toString('base64') },
      422,
    ],
  ])('refuse une étape : %s, sans rien stocker', async (_label, patch, status) => {
    const id = await newSession();
    const res = await addStep(
      post(`/api/capture/ingest/sessions/${id}/steps`, { ...cleanStep, ...patch }, token),
      ctx(id),
    );
    expect(res.status).toBe(status);
    expect(db().table('capture_steps')).toHaveLength(0);
    expect(db().uploads).toHaveLength(0);
  });

  it('ne reproduit pas la valeur refusée dans la réponse', async () => {
    const id = await newSession();
    const res = await addStep(
      post(
        `/api/capture/ingest/sessions/${id}/steps`,
        { ...cleanStep, description: 'Écrivez à jean@exemple.com' },
        token,
      ),
      ctx(id),
    );
    const text = await res.text();
    expect(text).toContain('description:email');
    expect(text).not.toContain('jean');
  });

  it('accepte un sous-domaine du domaine de la session', async () => {
    const id = await newSession('exemple.com');
    const res = await addStep(
      post(
        `/api/capture/ingest/sessions/${id}/steps`,
        { ...cleanStep, url: 'https://login.exemple.com/' },
        token,
      ),
      ctx(id),
    );
    expect(res.status).toBe(201);
  });

  it('refuse une position déjà prise sans redéposer d’image', async () => {
    const id = await newSession();
    const send = () =>
      addStep(
        post(
          `/api/capture/ingest/sessions/${id}/steps`,
          { ...cleanStep, screenshot: jpegBase64() },
          token,
        ),
        ctx(id),
      );
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(409);
    expect(db().uploads).toHaveLength(1);
    expect(db().table('capture_steps')).toHaveLength(1);
  });

  it('ne laisse pas une autre personne écrire dans la session', async () => {
    const id = await newSession();
    const intruder = generateCaptureToken();
    db().table('capture_tokens').push({
      id: 't2',
      owner_id: OTHER,
      token_hash: intruder.hash,
      revoked_at: null,
    });
    const res = await addStep(
      post(`/api/capture/ingest/sessions/${id}/steps`, cleanStep, intruder.token),
      ctx(id),
    );
    expect(res.status).toBe(404);
    expect(db().table('capture_steps')).toHaveLength(0);
  });

  it('clôt la session, puis refuse d’autres étapes', async () => {
    const id = await newSession();
    const empty = await completeSession(
      post(`/api/capture/ingest/sessions/${id}/complete`, {}, token),
      ctx(id),
    );
    expect(empty.status).toBe(409);

    await addStep(post(`/api/capture/ingest/sessions/${id}/steps`, cleanStep, token), ctx(id));
    const done = await completeSession(
      post(`/api/capture/ingest/sessions/${id}/complete`, {}, token),
      ctx(id),
    );
    expect(done.status).toBe(200);
    expect(db().table('capture_sessions')[0].status).toBe('complete');

    const late = await addStep(
      post(`/api/capture/ingest/sessions/${id}/steps`, { ...cleanStep, position: 1 }, token),
      ctx(id),
    );
    expect(late.status).toBe(409);
  });
});
