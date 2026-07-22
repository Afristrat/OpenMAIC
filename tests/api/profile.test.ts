import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClientMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

vi.mock('@/lib/flags', () => ({
  isFeatureEnabled: isFeatureEnabledMock,
}));

import { GET, PATCH } from '@/app/api/profile/route';

const USER_ID = '4b6f84d5-0a85-41f9-b23e-8d837e735c11';

function authenticatedSupabase(from: ReturnType<typeof vi.fn>) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }) },
    from,
  };
}

describe('/api/profile — profil enrichi isolé', () => {
  beforeEach(() => {
    createServerSupabaseClientMock.mockReset();
    isFeatureEnabledMock.mockReset().mockResolvedValue(true);
  });

  it('lit uniquement user_profiles avec la clé propriétaire', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { culture: 'ma-ar', ui_language: 'ar-MA', preferences: { pace: 'slow' } },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    createServerSupabaseClientMock.mockResolvedValue(authenticatedSupabase(from));

    const response = await GET(
      new Request('http://localhost/api/profile') as Parameters<typeof GET>[0],
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(eq).toHaveBeenCalledWith('user_id', USER_ID);
    await expect(response.json()).resolves.toMatchObject({
      richProfileEnabled: true,
      culture: 'ma-ar',
      uiLanguage: 'ar-MA',
    });
  });

  it('écrit uniquement user_profiles avec un conflit sur user_id', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { culture: 'fr', ui_language: 'en-US', preferences: { humorOk: true } },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    createServerSupabaseClientMock.mockResolvedValue(authenticatedSupabase(from));

    const request = new Request('http://localhost/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        culture: 'fr',
        uiLanguage: 'en-US',
        preferences: { humorOk: true },
      }),
    });
    const response = await PATCH(request as Parameters<typeof PATCH>[0]);

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        culture: 'fr',
        ui_language: 'en-US',
        preferences: { humorOk: true },
      }),
      { onConflict: 'user_id' },
    );
  });
});
