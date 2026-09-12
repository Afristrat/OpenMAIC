import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  delivery: vi.fn(),
  getUser: vi.fn(),
  insert: vi.fn(),
  reflection: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table !== 'anchor_deliveries')
        throw new Error(`Unexpected authenticated table: ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: mocks.delivery }) }) };
    },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== 'anchor_reflections') throw new Error(`Unexpected service table: ${table}`);
      return {
        insert: (value: unknown) => {
          mocks.insert(value);
          return { select: () => ({ single: mocks.reflection }) };
        },
      };
    },
  }),
}));

async function submit() {
  const { POST } = await import('@/app/api/anchor-deliveries/[id]/reflection/route');
  return POST(
    new Request('https://qalem.ma/api/anchor-deliveries/delivery-1/reflection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responseKind: 'action_in_practice',
        responseText: 'Je teste ce choix mardi.',
      }),
    }) as NextRequest,
    { params: Promise.resolve({ id: 'delivery-1' }) },
  );
}

describe('anchor reflection API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.delivery.mockResolvedValue({
      data: {
        id: 'delivery-1',
        seed_id: 'seed-1',
        sent_at: '2026-09-12T10:00:00.000Z',
        anchor_plans: { user_id: 'user-1' },
      },
      error: null,
    });
    mocks.reflection.mockResolvedValue({
      data: {
        id: 'reflection-1',
        response_kind: 'action_in_practice',
        resolved_at: '2026-09-12T10:05:00.000Z',
      },
      error: null,
    });
  });

  it('persists one authorized answer for a delivered seed', async () => {
    const response = await submit();

    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith({
      delivery_id: 'delivery-1',
      seed_id: 'seed-1',
      user_id: 'user-1',
      response_kind: 'action_in_practice',
      response_text: 'Je teste ce choix mardi.',
    });
  });

  it('refuses a second resolution instead of repeating the resolved reminder', async () => {
    mocks.reflection.mockResolvedValueOnce({ data: null, error: { code: '23505' } });

    expect((await submit()).status).toBe(409);
  });

  it('does not accept an unsent or another learner’s delivery', async () => {
    mocks.delivery.mockResolvedValueOnce({
      data: {
        id: 'delivery-1',
        seed_id: 'seed-1',
        sent_at: null,
        anchor_plans: { user_id: 'user-1' },
      },
      error: null,
    });
    expect((await submit()).status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
