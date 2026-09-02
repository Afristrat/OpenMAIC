import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}));

import { GET } from '@/app/api/certificates/verify/[code]/route';

const row = {
  id: '00000000-0000-4000-8000-000000000081',
  course_name: 'Pilotage budgétaire',
  learner_name: 'Amina',
  completion_date: '2026-09-02T12:00:00.000Z',
  score: 84,
  skills: ['Arbitrage'],
  verification_code: 'QAL-2026-PERSIST1',
  issued_by: 'Qalem',
};

function verificationClient() {
  const result = { data: row, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return { from: vi.fn(() => builder) };
}

describe('GET /api/certificates/verify/[code]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerSupabaseClient.mockRejectedValue(
      new Error('La vérification publique ne doit pas dépendre de la session visiteur'),
    );
    mocks.createServiceSupabaseClient.mockReturnValue(verificationClient());
  });

  it('vérifie publiquement un code sans rouvrir la table aux visiteurs', async () => {
    const response = await GET(
      new NextRequest('https://qalem.ma/api/certificates/verify/QAL-2026-PERSIST1'),
      { params: Promise.resolve({ code: 'QAL-2026-PERSIST1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      verified: true,
      certificate: {
        courseName: 'Pilotage budgétaire',
        learnerName: 'Amina',
        completionDate: '2026-09-02T12:00:00.000Z',
        score: 84,
        skills: ['Arbitrage'],
        verificationCode: 'QAL-2026-PERSIST1',
        issuedBy: 'Qalem',
      },
    });
  });
});
