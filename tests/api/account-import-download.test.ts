import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), signed: vi.fn(), bucket: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc, storage: { from: mocks.bucket } }),
}));
import { GET } from '@/app/api/account/export/imports/[id]/route';
const id = '00000000-0036-4000-8000-000000000351';
const path = `00000000-0036-4000-8000-000000000352/course-imports/${id}.pdf`;
const get = (value = id) =>
  GET(new NextRequest('https://qalem.test/api/account/export/imports/' + value + '?path=foreign'), {
    params: Promise.resolve({ id: value }),
  });
describe('personal import download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    mocks.auth.mockResolvedValue({ user: { id: 'verified' } });
    mocks.rpc.mockResolvedValue({ data: { id, storagePath: path }, error: null });
    mocks.bucket.mockReturnValue({ createSignedUrl: mocks.signed });
    mocks.signed.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.test/storage/v1/object/sign/proof?token=synthetic',
      },
      error: null,
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('requires a session and never trusts query paths', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await get()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses the authorized persisted path even after author reclaim', async () => {
    const response = await get();
    expect(response.status).toBe(303);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(mocks.rpc).toHaveBeenCalledWith('read_account_import_download', {
      p_actor: 'verified',
      p_import: id,
    });
    expect(mocks.bucket).toHaveBeenCalledWith('classroom-media');
    expect(mocks.signed).toHaveBeenCalledWith(path, 60, { download: true });
  });
  it('rejects invalid ids before database access', async () => {
    expect((await get('bad')).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not sign an inaccessible import', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await get()).status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it.each([
    { id, storagePath: '../foreign.pdf' },
    { id: '00000000-0036-4000-8000-000000000359', storagePath: path },
  ])('rejects an invalid persisted record', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await get()).status).toBe(503);
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it('hides lookup errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private' } });
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { message: 'private' } },
    { data: { signedUrl: 'https://attacker.test/file' }, error: null },
  ])('rejects failed or unexpected Storage responses', async (result) => {
    mocks.signed.mockResolvedValue(result);
    expect((await get()).status).toBe(503);
  });
});
