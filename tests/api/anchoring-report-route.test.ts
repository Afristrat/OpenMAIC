import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

async function get(url: string) {
  const { GET } = await import('@/app/api/organizations/[orgId]/anchoring-report/route');
  return GET(new Request(url), { params: Promise.resolve({ orgId: 'org-1' }) });
}

describe('organization anchoring journey report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          hot_relevance_response_count: 3,
          hot_return_intent_response_count: 2,
          cold_application_response_count: 1,
          resume_sent_count: 4,
          resume_opened_count: 2,
        },
      ],
      error: null,
    });
  });

  it('passes the requested window and documents every denominator', async () => {
    const response = await get(
      'https://qalem.ma/api/organizations/org-1/anchoring-report?dateFrom=2026-08-01T00%3A00%3A00.000Z&dateTo=2026-09-01T00%3A00%3A00.000Z',
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('anchor_org_report', {
      target_org_id: 'org-1',
      p_from: '2026-08-01T00:00:00.000Z',
      p_to: '2026-09-01T00:00:00.000Z',
    });
    expect(body.window).toEqual({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
    expect(body.definitions.relevance).toContain('3');
    expect(body.definitions.returnIntent).toContain('2');
    expect(body.definitions.application).toContain('1');
    expect(body.definitions.effectiveResume).toContain('2');
    expect(body.definitions.effectiveResume).toContain('4');
    expect(JSON.stringify(body)).toContain('Aucun gain d’apprentissage');
  });

  it('rejects an absent, invalid, reversed, or overlong window', async () => {
    expect((await get('https://qalem.ma/api/organizations/org-1/anchoring-report')).status).toBe(
      400,
    );
    expect(
      (
        await get(
          'https://qalem.ma/api/organizations/org-1/anchoring-report?dateFrom=nope&dateTo=2026-09-01T00:00:00.000Z',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await get(
          'https://qalem.ma/api/organizations/org-1/anchoring-report?dateFrom=2026-09-02T00:00:00.000Z&dateTo=2026-09-01T00:00:00.000Z',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await get(
          'https://qalem.ma/api/organizations/org-1/anchoring-report?dateFrom=2024-01-01T00:00:00.000Z&dateTo=2026-09-01T00:00:00.000Z',
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
