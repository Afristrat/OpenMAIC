import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

import { GET } from '@/app/api/certificates/route';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const certificate = {
  id: '00000000-0000-4000-8000-000000000081',
  user_id: USER_ID,
  stage_id: 'stage-certificate',
  course_name: 'Pilotage budgétaire',
  learner_name: 'Amina',
  completion_date: '2026-09-02T12:00:00.000Z',
  score: 84,
  skills: ['Arbitrage'],
  verification_code: 'QAL-2026-PERSIST1',
  issued_by: 'Qalem',
  org_id: null,
  created_at: '2026-09-02T12:00:00.000Z',
};

function query(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe('GET /api/certificates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuse un appel anonyme avant toute lecture de certificats', async () => {
    const from = vi.fn();
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      from,
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('renvoie uniquement les certificats du bénéficiaire authentifié', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
      },
      from: vi.fn(() => query({ data: [certificate], error: null })),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, certificates: [certificate] });
  });

  it('rend une erreur serveur explicite quand la lecture échoue', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
      },
      from: vi.fn(() => query({ data: null, error: { message: 'database unavailable' } })),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, error: 'Failed to load certificates' });
  });
});
