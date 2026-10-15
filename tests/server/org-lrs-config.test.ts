import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateUrlForSSRF: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: mocks.validateUrlForSSRF }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({ upsert: mocks.upsert }),
  }),
}));

describe('saveOrganizationLrsConfig : garde SSRF à l’enregistrement', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.validateUrlForSSRF.mockReset();
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    process.env.LRS_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('refuse un endpoint résolu vers le réseau privé et n’écrit rien', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue('Local/private network URLs are not allowed');
    const { saveOrganizationLrsConfig, LrsEndpointBlockedError } =
      await import('@/lib/server/org-lrs-config');
    await expect(
      saveOrganizationLrsConfig({
        orgId: 'org-1',
        endpoint: 'https://169.254.169.254/xapi',
        auth: 'Basic abc',
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(LrsEndpointBlockedError);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('enregistre un endpoint public après contrôle de l’URL normalisée', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    const { saveOrganizationLrsConfig } = await import('@/lib/server/org-lrs-config');
    await saveOrganizationLrsConfig({
      orgId: 'org-1',
      endpoint: 'https://lrs.example.com/xapi/?a=1#x',
      auth: 'Basic abc',
      enabled: true,
    });
    expect(mocks.validateUrlForSSRF).toHaveBeenCalledWith('https://lrs.example.com/xapi');
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      org_id: 'org-1',
      endpoint: 'https://lrs.example.com/xapi',
    });
  });
});
