import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  abortSignal: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mocks }));
import { readConsent, readConsentState, setConsent } from '@/lib/telemetry/pedagogy-collector';

describe('consent storage failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
    mocks.from.mockReturnValue(mocks);
    mocks.select.mockReturnValue(mocks);
    mocks.eq.mockReturnValue(mocks);
    mocks.upsert.mockReturnValue(mocks);
    mocks.abortSignal.mockReturnValue(mocks);
  });
  it('distinguishes an absent row from an unavailable database', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await readConsent('user')).toBeNull();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'private detail' } });
    await expect(readConsent('user')).rejects.toThrow('Consent storage unavailable');
  });
  it('propagates a failed upsert instead of acknowledging it', async () => {
    mocks.abortSignal.mockResolvedValue({ error: { message: 'private detail' } });
    await expect(setConsent('user', false)).rejects.toThrow('Consent storage unavailable');
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user', pedagogy_consent: false }),
      { onConflict: 'user_id' },
    );
  });
  it('returns the database epoch and fails closed if it is absent', async () => {
    const epoch = '00000000-0036-4000-8000-000000000099';
    mocks.maybeSingle.mockResolvedValue({
      data: { pedagogy_consent: true, collection_epoch: epoch },
      error: null,
    });
    expect(await readConsentState('user')).toEqual({ choice: true, epoch });
    mocks.maybeSingle.mockResolvedValue({ data: { pedagogy_consent: true }, error: null });
    await expect(readConsentState('user')).rejects.toThrow('Consent storage unavailable');
  });
});
