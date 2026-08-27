import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const USER_ID = '00000000-0000-4000-8000-000000000039';
const ORG_ID = '00000000-0000-4000-8000-000000000040';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerClient,
}));

import { POST } from '@/app/api/organizations/route';

function request() {
  return new NextRequest('https://qalem.ma/api/organizations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'École de preuve', sector: 'education' }),
  });
}

describe('POST /api/organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.single.mockResolvedValue({
      data: {
        id: ORG_ID,
        name: 'École de preuve',
        sector: 'education',
        default_locale: 'fr-FR',
        settings: {},
      },
      error: null,
    });
    mocks.rpc.mockReturnValue({ single: mocks.single });
    mocks.createServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
      },
      rpc: mocks.rpc,
    });
  });

  it('refuses an anonymous bootstrap before invoking the privileged RPC', async () => {
    mocks.createServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      rpc: mocks.rpc,
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('creates the organization and its first admin in one authenticated RPC', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('create_organization_with_admin', {
      organization_name: 'École de preuve',
      organization_sector: 'education',
      organization_default_locale: 'fr-FR',
    });
    expect(body.organization).toMatchObject({ id: ORG_ID, userRole: 'admin' });
  });

  it('returns a server error when the atomic bootstrap fails', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: 'bootstrap failed' },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.details).toBe('bootstrap failed');
  });
});
