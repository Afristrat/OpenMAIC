import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), row: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.row }) }) }),
  }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
  }),
}));
import { GET as exportFile } from '@/app/api/export-jobs/[id]/route';
import { GET as videoFile } from '@/app/api/generate/video/[id]/route';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
  mocks.auth.mockResolvedValue({ user: { id: 'actor' } });
  mocks.sign.mockResolvedValue({
    data: { signedUrl: 'https://storage.example.test/file?token=fixture' },
  });
});
afterEach(() => vi.unstubAllEnvs());
for (const [name, route, row] of [
  [
    'export',
    exportFile,
    { id: 'job', stage_id: 'stage', format: 'mp4', status: 'done', storage_path: 'stage/job.mp4' },
  ],
  [
    'video',
    videoFile,
    { id: 'job', status: 'done', storage_path: 'generated-video/actor/job.mp4' },
  ],
] as const) {
  const request = (download = true) =>
    route(new NextRequest(`https://qalem.ma/api/file${download ? '?download=1' : ''}`), {
      params: Promise.resolve({ id: 'job' }),
    });
  it(`${name}: preserves polling and delivers an authenticated attachment`, async () => {
    mocks.row.mockResolvedValue({ data: row });
    expect((await (await request(false)).json()).downloadUrl).toContain(
      'https://storage.example.test/',
    );
    const response = await request();
    expect(response.status).toBe(307);
    expect(await response.text()).toBe('');
    expect(mocks.sign).toHaveBeenLastCalledWith(row.storage_path, 60, { download: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it(`${name}: rejects absent authorization, unfinished or mismatched artifacts`, async () => {
    mocks.auth.mockResolvedValueOnce({ response: NextResponse.json({}, { status: 401 }) });
    expect((await request()).status).toBe(401);
    mocks.row.mockResolvedValueOnce({ data: null });
    expect((await request()).status).toBe(404);
    mocks.row.mockResolvedValueOnce({ data: { ...row, status: 'queued' } });
    expect((await request()).status).toBe(409);
    mocks.row.mockResolvedValueOnce({ data: { ...row, storage_path: 'other/file.mp4' } });
    expect((await request()).status).toBe(503);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it(`${name}: fails closed on unavailable or foreign signing results`, async () => {
    mocks.row.mockResolvedValue({ data: row });
    mocks.sign.mockResolvedValueOnce({ error: { message: 'private details' } });
    expect((await request()).status).toBe(503);
    mocks.sign.mockResolvedValueOnce({ data: { signedUrl: 'https://foreign.example/file' } });
    expect((await request()).status).toBe(503);
  });
}
