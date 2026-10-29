import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase';
import { generateCaptureToken } from '@/lib/capture/credentials';
import { resetDescribeQuota, resetMediaQuota } from '@/lib/capture/describe-limit';

const OWNER = '11111111-1111-4111-8111-111111111111';
const COURSE = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({ db: null as unknown, call: vi.fn() }));

vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => mocks.db }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.call }));

import {
  GET as listProjects,
  POST as createProject,
} from '@/app/api/capture/ingest/projects/route';
import { GET as listSessions, POST as openSession } from '@/app/api/capture/ingest/sessions/route';
import { GET as readOptions } from '@/app/api/capture/ingest/options/route';
import { PUT as savePreferences } from '@/app/api/capture/ingest/preferences/route';
import { POST as describe_ } from '@/app/api/capture/ingest/describe/route';
import { POST as transcribe } from '@/app/api/capture/ingest/transcribe/route';
import { POST as speak } from '@/app/api/capture/ingest/speak/route';

let token: string;

function db(): FakeSupabase {
  return mocks.db as FakeSupabase;
}

function call(method: string, path: string, bearer?: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const routes: Array<[string, (bearer?: string) => Promise<Response>]> = [
  ['liste des projets', (b) => listProjects(call('GET', '/api/capture/ingest/projects', b))],
  [
    'création de projet',
    (b) =>
      createProject(
        call('POST', '/api/capture/ingest/projects', b, { title: 'T', language: 'fr-FR' }),
      ),
  ],
  [
    'liste des sessions',
    (b) => listSessions(call('GET', `/api/capture/ingest/sessions?courseId=${COURSE}`, b)),
  ],
  [
    'ouverture de session',
    (b) => openSession(call('POST', '/api/capture/ingest/sessions', b, { courseId: COURSE })),
  ],
  ['réglages', (b) => readOptions(call('GET', '/api/capture/ingest/options', b))],
  [
    'préférences',
    (b) =>
      savePreferences(call('PUT', '/api/capture/ingest/preferences', b, { captureMode: 'ai' })),
  ],
  [
    'rédaction par IA',
    (b) =>
      describe_(call('POST', '/api/capture/ingest/describe', b, { task: 'step', prompt: 'x' })),
  ],
  ['narration', (b) => transcribe(call('POST', '/api/capture/ingest/transcribe', b))],
  ['voix off', (b) => speak(call('POST', '/api/capture/ingest/speak', b, { text: 'Bonjour' }))],
];

beforeEach(() => {
  resetDescribeQuota();
  resetMediaQuota();
  mocks.call.mockReset();
  const issued = generateCaptureToken();
  token = issued.token;
  mocks.db = createFakeSupabase({
    capture_tokens: [{ id: 't1', owner_id: OWNER, token_hash: issued.hash, revoked_at: null }],
  });
});

describe('révocation du jeton de capture', () => {
  it.each(routes)('%s : sans jeton ou avec un jeton inconnu, 401', async (_name, run) => {
    expect((await run()).status).toBe(401);
    expect((await run(generateCaptureToken().token)).status).toBe(401);
  });

  it.each(routes)(
    '%s : un jeton révoqué est refusé partout, sans rien consommer',
    async (_name, run) => {
      db().table('capture_tokens')[0].revoked_at = new Date().toISOString();
      expect((await run(token)).status).toBe(401);
      expect(mocks.call).not.toHaveBeenCalled();
    },
  );
});
