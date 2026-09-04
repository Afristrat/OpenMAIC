import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));

import { GET, PATCH } from '@/app/api/notification-preferences/route';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(method: 'GET' | 'PATCH', body?: unknown): NextRequest {
  return new NextRequest('https://qalem.ma/api/notification-preferences', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('/api/notification-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: USER_ID, email: 'learner@example.com' } });
  });

  it('returns disabled defaults scoped to the authenticated account', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    expect(eq).toHaveBeenCalledWith('user_id', USER_ID);
    await expect(response.json()).resolves.toMatchObject({
      email: false,
      whatsapp: false,
      whatsappNumber: null,
    });
  });

  it('persists explicit opt-ins and a normalized international number', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        email_enabled: true,
        whatsapp_enabled: true,
        whatsapp_number: '+212600000000',
        locale: 'fr-FR',
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mocks.from.mockReturnValue({ upsert });

    const response = await PATCH(
      request('PATCH', {
        email: true,
        whatsapp: true,
        whatsappNumber: '+212 600-000-000',
        locale: 'fr-FR',
      }),
    );

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        email_enabled: true,
        whatsapp_enabled: true,
        whatsapp_number: '+212600000000',
      }),
      { onConflict: 'user_id' },
    );
  });

  it('rejects an ambiguous local WhatsApp number before any write', async () => {
    const response = await PATCH(
      request('PATCH', {
        email: false,
        whatsapp: true,
        whatsappNumber: '0600000000',
        locale: 'fr-FR',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('clears the stored number when WhatsApp is disabled', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        email_enabled: false,
        whatsapp_enabled: false,
        whatsapp_number: null,
        locale: 'en-US',
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mocks.from.mockReturnValue({ upsert });

    await PATCH(
      request('PATCH', {
        email: false,
        whatsapp: false,
        whatsappNumber: '+212600000000',
        locale: 'en-US',
      }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_enabled: false, whatsapp_number: null }),
      { onConflict: 'user_id' },
    );
  });
});
