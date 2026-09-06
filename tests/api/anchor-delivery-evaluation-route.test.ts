import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  delivery: vi.fn(),
  evaluation: vi.fn(),
  evaluationInsert: vi.fn(),
  getUser: vi.fn(),
  markOpened: vi.fn(),
  queueXapi: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'anchor_deliveries') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: mocks.delivery }) }),
        };
      }
      if (table === 'evaluations') {
        return {
          insert: (value: unknown) => {
            mocks.evaluationInsert(value);
            return { select: () => ({ single: mocks.evaluation }) };
          },
        };
      }
      throw new Error(`Unexpected authenticated table: ${table}`);
    },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== 'anchor_deliveries') throw new Error(`Unexpected service table: ${table}`);
      return {
        update: () => ({ eq: () => ({ not: mocks.markOpened }) }),
      };
    },
  }),
}));

vi.mock('@/lib/anchoring/xapi-outbox', () => ({
  enqueueAnchorEvaluationStatement: mocks.queueXapi,
}));

async function submit() {
  const { POST } = await import('@/app/api/anchor-deliveries/[id]/evaluation/route');
  return POST(
    new Request('https://qalem.ma/api/anchor-deliveries/delivery-1/evaluation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useful: 5, confidence: 4 }),
    }) as NextRequest,
    { params: Promise.resolve({ id: 'delivery-1' }) },
  );
}

function coldDelivery(sentAt: string | null) {
  return {
    id: 'delivery-1',
    delivery_kind: 'cold_eval',
    payload: { phase: 'cold_30' },
    sent_at: sentAt,
    anchor_plans: { session_id: 'session-1', user_id: 'user-1' },
  };
}

describe('cold evaluation delivery API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.delivery.mockResolvedValue({
      data: coldDelivery('2026-10-06T12:00:00.000Z'),
      error: null,
    });
    mocks.evaluation.mockResolvedValue({
      data: { id: 'evaluation-1', phase: 'cold_30', score: 90 },
      error: null,
    });
    mocks.markOpened.mockResolvedValue({ error: null });
    mocks.queueXapi.mockResolvedValue(true);
  });

  it('refuses a cold evaluation before its reminder has actually been sent', async () => {
    mocks.delivery.mockResolvedValueOnce({ data: coldDelivery(null), error: null });

    const response = await submit();

    expect(response.status).toBe(409);
    expect(mocks.evaluationInsert).not.toHaveBeenCalled();
  });

  it('records the delivered phase once and rejects its duplicate', async () => {
    const response = await submit();

    expect(response.status).toBe(201);
    expect(mocks.evaluationInsert).toHaveBeenCalledWith({
      session_id: 'session-1',
      user_id: 'user-1',
      phase: 'cold_30',
      answers: { useful: 5, confidence: 4 },
      score: 90,
    });
    expect(mocks.markOpened).toHaveBeenCalled();

    mocks.evaluation.mockResolvedValueOnce({ data: null, error: { code: '23505' } });
    expect((await submit()).status).toBe(409);
  });
});
