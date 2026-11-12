import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CLASSROOM_ID = 'j5j5TenqWz';
const ORG_ID = '00000000-0000-4000-8000-000000000054';
const OWNER_ID = '00000000-0000-4000-8000-000000000055';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  readOwnership: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgEditor: mocks.requireEditor }));
vi.mock('@/lib/server/classroom-storage', () => ({
  isValidClassroomId: (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id),
  readClassroomOwnership: mocks.readOwnership,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: { from: mocks.storageFrom },
    from: mocks.from,
  }),
}));

import { DELETE, GET, POST } from '@/app/api/classroom/[classroomId]/logo/route';

const url = `http://0.0.0.0:3000/api/classroom/${CLASSROOM_ID}/logo`;

function upload(file: File): NextRequest {
  const formData = new FormData();
  formData.set('logo', file);
  return new NextRequest(url, { method: 'POST', body: formData });
}

function params(classroomId = CLASSROOM_ID) {
  return { params: Promise.resolve({ classroomId }) };
}

describe('/api/classroom/[classroomId]/logo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
    mocks.readOwnership.mockResolvedValue({ ownerId: OWNER_ID, orgId: ORG_ID });
    mocks.requireEditor.mockResolvedValue({ user: { id: OWNER_ID } });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      download: mocks.download,
      remove: mocks.remove,
    });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ update: mocks.update });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('stores the logo under the classroom and records its public URL on the stage', async () => {
    const response = await POST(
      upload(new File(['png'], 'saham.png', { type: 'image/png' })),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireEditor).toHaveBeenCalledWith(
      expect.anything(),
      ORG_ID,
      OWNER_ID,
      CLASSROOM_ID,
    );
    expect(mocks.storageFrom).toHaveBeenCalledWith('classroom-media');
    expect(mocks.upload).toHaveBeenCalledWith(
      `classroom-brand/${CLASSROOM_ID}/logo`,
      expect.any(ArrayBuffer),
      { contentType: 'image/png', upsert: true },
    );
    expect(body.logoUrl).toMatch(
      new RegExp(`^https://qalem\\.ma/api/classroom/${CLASSROOM_ID}/logo\\?v=\\d+$`),
    );
    expect(mocks.from).toHaveBeenCalledWith('stages');
    expect(mocks.update).toHaveBeenCalledWith({ logo: body.logoUrl });
    expect(mocks.eq).toHaveBeenCalledWith('id', CLASSROOM_ID);
  });

  it('refuses a caller who cannot edit the classroom, before touching storage', async () => {
    mocks.requireEditor.mockResolvedValue({ response: new Response(null, { status: 403 }) });

    const response = await POST(
      upload(new File(['png'], 'saham.png', { type: 'image/png' })),
      params(),
    );

    expect(response.status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    ['image/svg+xml', 'logo.svg'],
    ['text/html', 'logo.html'],
  ])('rejects the unsafe format %s', async (type, name) => {
    const response = await POST(upload(new File(['<svg/>'], name, { type })), params());

    expect(response.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects a logo larger than 2 MB', async () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });

    const response = await POST(upload(big), params());

    expect(response.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown classroom', async () => {
    mocks.readOwnership.mockResolvedValue(null);

    const response = await POST(
      upload(new File(['png'], 'saham.png', { type: 'image/png' })),
      params(),
    );

    expect(response.status).toBe(404);
    expect(mocks.requireEditor).not.toHaveBeenCalled();
  });

  it('rejects a malformed classroom identifier', async () => {
    const response = await POST(
      upload(new File(['png'], 'saham.png', { type: 'image/png' })),
      params('../org'),
    );

    expect(response.status).toBe(400);
    expect(mocks.readOwnership).not.toHaveBeenCalled();
  });

  it('removes the classroom logo so the organisation mark applies again', async () => {
    const response = await DELETE(new NextRequest(url, { method: 'DELETE' }), params());

    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith([`classroom-brand/${CLASSROOM_ID}/logo`]);
    expect(mocks.update).toHaveBeenCalledWith({ logo: null });
  });

  it('serves the stored logo with its content type and refuses to sniff it', async () => {
    mocks.download.mockResolvedValue({
      data: new Blob(['png'], { type: 'image/png' }),
      error: null,
    });

    const response = await GET(new NextRequest(url), params());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers 404 when the classroom has no logo', async () => {
    mocks.download.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const response = await GET(new NextRequest(url), params());

    expect(response.status).toBe(404);
  });
});
