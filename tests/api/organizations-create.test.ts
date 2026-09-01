import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
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
    vi.stubEnv('SUPER_ADMIN_EMAILS', 'root@qalem.ma');
    mocks.createServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'root-id', email: 'root@qalem.ma' } },
          error: null,
        }),
      },
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('refuses anonymous tenant creation', async () => {
    mocks.createServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
  });

  it('retires self-service bootstrap in favor of named administrator provisioning', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.details).toContain('/api/admin/tenants');
  });
});
