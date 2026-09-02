import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

import { POST } from '@/app/api/certificates/generate/route';

const USER_ID = '00000000-0000-4000-8000-000000000007';
const ORG_ID = '00000000-0000-4000-8000-000000000008';
const STAGE_ID = 'certificate-stage';

const existingCertificate = {
  id: '00000000-0000-4000-8000-000000000009',
  user_id: USER_ID,
  stage_id: STAGE_ID,
  course_name: 'Pilotage budgétaire',
  learner_name: 'Amina',
  completion_date: '2026-09-02T12:00:00.000Z',
  score: 80,
  skills: ['Arbitrage'],
  verification_code: 'QAL-2026-TEST0001',
  issued_by: 'Organisation test',
  org_id: ORG_ID,
  created_at: '2026-09-02T12:00:00.000Z',
};

type QueryResult = { data: unknown; error?: { code?: string; message: string } | null };

function query(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'insert']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function certificateRaceClient() {
  const queues: Record<string, Array<ReturnType<typeof query>>> = {
    certificates: [
      query({ data: null, error: null }),
      query({ data: null, error: { code: '23505', message: 'duplicate key' } }),
      query({ data: existingCertificate, error: null }),
    ],
    stages: [query({ data: { id: STAGE_ID, name: 'Pilotage budgétaire', org_id: ORG_ID } })],
    scenes: [
      query({
        data: [{ id: 'quiz-scene', type: 'quiz', title: 'Arbitrage' }],
        error: null,
      }),
    ],
    quiz_results: [query({ data: [{ scene_id: 'quiz-scene', score: 80 }], error: null })],
    profiles: [query({ data: { nickname: 'Amina' }, error: null })],
    organizations: [query({ data: { name: 'Organisation test' }, error: null })],
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: USER_ID, email: 'amina@example.test' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      const next = queues[table]?.shift();
      if (!next) throw new Error(`Unexpected query for ${table}`);
      return next;
    }),
  };
}

describe('POST /api/certificates/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses an unauthenticated issuance before querying certificate data', async () => {
    const from = vi.fn();
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
      from,
    });

    const response = await POST(
      new NextRequest('https://qalem.ma/api/certificates/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageId: STAGE_ID }),
      }),
    );

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses issuance when row-level security hides a stage outside the learner rights', async () => {
    const queues: Record<string, Array<ReturnType<typeof query>>> = {
      certificates: [query({ data: null, error: null })],
      stages: [query({ data: null, error: { code: 'PGRST116', message: 'not found' } })],
    };
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: USER_ID, email: 'amina@example.test' } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => queues[table].shift()),
    });

    const response = await POST(
      new NextRequest('https://qalem.ma/api/certificates/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageId: 'stage-outside-rights' }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('returns one existing issuance unchanged when the learner retries', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: USER_ID, email: 'amina@example.test' } },
          error: null,
        })),
      },
      from: vi.fn(() => query({ data: existingCertificate, error: null })),
    });

    const response = await POST(
      new NextRequest('https://qalem.ma/api/certificates/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageId: STAGE_ID }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      alreadyExisted: true,
      certificate: {
        id: existingCertificate.id,
        verificationCode: existingCertificate.verification_code,
      },
    });
  });

  it('returns the existing certificate when a concurrent issuance wins the unique constraint', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(certificateRaceClient());

    const response = await POST(
      new NextRequest('https://qalem.ma/api/certificates/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageId: STAGE_ID }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      alreadyExisted: true,
      certificate: {
        id: existingCertificate.id,
        userId: USER_ID,
        stageId: STAGE_ID,
        verificationCode: existingCertificate.verification_code,
      },
    });
  });
});
