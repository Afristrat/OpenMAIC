import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '00000000-0000-4000-8000-000000000054';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: { from: mocks.storageFrom },
    from: mocks.from,
  }),
}));

import { POST } from '@/app/api/organizations/[orgId]/logo/route';

function request(file: File): NextRequest {
  const formData = new FormData();
  formData.set('logo', file);
  return new NextRequest(`http://0.0.0.0:3000/api/organizations/${ORG_ID}/logo`, {
    method: 'POST',
    body: formData,
  });
}

function params() {
  return { params: Promise.resolve({ orgId: ORG_ID }) };
}

describe('POST /api/organizations/[orgId]/logo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-id' } });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ update: mocks.update });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('persists a public logo URL instead of the internal container origin', async () => {
    const response = await POST(
      request(new File(['png'], 'logo.png', { type: 'image/png' })),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.logoUrl).toMatch(
      new RegExp(`^https://qalem\\.ma/api/organizations/${ORG_ID}/logo\\?v=\\d+$`),
    );
    expect(mocks.update).toHaveBeenCalledWith({ logo: body.logoUrl });
  });

  it.each([
    ['image/png', 'logo.png'],
    ['image/jpeg', 'logo.jpg'],
    ['image/webp', 'logo.webp'],
  ])('accepts the safe raster format %s', async (type, name) => {
    const response = await POST(request(new File(['image'], name, { type })), params());

    expect(response.status).toBe(200);
  });
});
