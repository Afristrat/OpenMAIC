import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/documents/diwan/[organizationId]/route';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  execute: vi.fn(),
  ingest: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgAuthor: mocks.auth }));
vi.mock('@/lib/diwan/client', async (original) => ({
  ...(await original<typeof import('@/lib/diwan/client')>()),
  listDiwanSources: mocks.list,
  executeDiwanCommand: mocks.execute,
  ingestDiwanSources: mocks.ingest,
}));
const org = '00000000-0000-4000-8000-000000000001';
const context = { params: Promise.resolve({ organizationId: org }) };
function request(body?: unknown, origin = 'https://qalem.ma') {
  return new NextRequest(
    `https://qalem.ma/api/documents/diwan/${org}`,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
}
describe('Diwan author API boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
    mocks.auth.mockResolvedValue({ user: { id: 'author' } });
    mocks.list.mockResolvedValue({ items: [] });
    mocks.execute.mockResolvedValue({ status: 'revoked' });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([GET, POST])(
    'refuses a foreign organization before any upstream call',
    async (handler) => {
      mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
      expect((await handler(request(), context)).status).toBe(403);
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.auth).toHaveBeenCalledWith(expect.any(NextRequest), org, {
        requireMembership: true,
      });
    },
  );
  it('lists only the server-authorized organization and prevents caching', async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.list).toHaveBeenCalledWith(org, { page: 1, pageSize: 20 });
  });
  it('blocks cross-origin mutations, unknown operations and oversized bodies', async () => {
    const command = { operation: 'revoke', corpusId: 'corpus:1' };
    expect((await POST(request(command, 'https://other.example'), context)).status).toBe(403);
    expect((await POST(request({ ...command, token: 'supplied' }), context)).status).toBe(400);
    expect((await POST(request({ ...command, corpusId: 'a'.repeat(65536) }), context)).status).toBe(
      413,
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('forwards validated operations only after the author gate', async () => {
    const command = { operation: 'revoke', corpusId: 'corpus:1' };
    expect((await POST(request(command), context)).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(org, command);
  });
  it('accepts a native multipart file without accepting a tenant override', async () => {
    const form = new FormData();
    form.set('files', new File(['Document autorisé'], 'source.txt', { type: 'text/plain' }));
    form.set('idempotencyKey', 'import-1');
    mocks.ingest.mockResolvedValue({ status: 'queued' });
    const req = new NextRequest(`https://qalem.ma/api/documents/diwan/${org}`, {
      method: 'POST',
      headers: { origin: 'https://qalem.ma' },
      body: form,
    });
    expect((await POST(req, context)).status).toBe(202);
    expect(mocks.ingest.mock.calls[0][0]).toBe(org);
    expect(mocks.ingest.mock.calls[0][1].get('files').name).toBe('source.txt');
  });
});
