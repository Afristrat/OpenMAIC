import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
import { GET } from '@/app/api/account/export/route';
const request = () => new NextRequest('http://localhost/api/account/export?userId=attacker');
describe('account export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'verified-user', email: 'test@example.test' } });
    mocks.rpc.mockImplementation((name, args) => ({ abortSignal: () => mocks.read(name, args) }));
    mocks.read.mockResolvedValue({ data: [], error: null });
  });
  it('requires authentication before data access', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('streams every page for the verified actor and finishes only after all sections', async () => {
    mocks.read.mockImplementation(async (_name, args) => ({
      error: null,
      data:
        args.p_section !== 'pedagogy_telemetry'
          ? []
          : args.p_after === null
            ? Array.from({ length: 100 }, (_, i) => ({
                cursor: String(i).padStart(4, '0'),
                value: { id: i },
              }))
            : [{ cursor: '0100', value: { id: 100 } }],
    }));
    const response = await GET(request());
    const body = await response.json();
    expect(body.pedagogy_telemetry).toHaveLength(101);
    expect(body.complete).toBe(true);
    expect(body.includedSections).toHaveLength(11);
    expect(response.headers.get('cache-control')).toBe('no-store');
    for (const call of mocks.rpc.mock.calls) expect(call[1].p_actor).toBe('verified-user');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'read_account_export_page',
      expect.objectContaining({ p_section: 'pedagogy_telemetry', p_after: '0099' }),
    );
  });
  it('returns an opaque failure before streaming when the schema is unavailable', async () => {
    mocks.read.mockResolvedValue({ error: { message: 'private database detail' }, data: null });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
  it('aborts a partial download on a later failure instead of certifying an incomplete export', async () => {
    mocks.read.mockImplementation(async (_name, args) =>
      args.p_section === 'scenes' ? { error: {}, data: null } : { error: null, data: [] },
    );
    const response = await GET(request());
    await expect(response.text()).rejects.toThrow('interrupted');
  });
});
