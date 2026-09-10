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
import {
  readConsent,
  readConsentState,
  setConsent,
  readXapiConsent,
  setXapiConsent,
} from '@/lib/telemetry/pedagogy-collector';

describe('consent storage failures', () => {
  it('writes only the xAPI choice and refuses false success on failure', async () => {
    mocks.abortSignal.mockResolvedValue({ error: null });
    await setXapiConsent('user', true);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { user_id: 'user', xapi_consent: true, consented_at: expect.any(String) },
      { onConflict: 'user_id' },
    );
    mocks.abortSignal.mockResolvedValue({ error: { message: 'private' } });
    await expect(setXapiConsent('user', false)).rejects.toThrow('Consent storage unavailable');
  });
  it('defaults xAPI to false and propagates read errors', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await readXapiConsent('user')).toBe(false);
    mocks.maybeSingle.mockResolvedValue({ data: { xapi_consent: true }, error: null });
    expect(await readXapiConsent('user')).toBe(true);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'private' } });
    await expect(readXapiConsent('user')).rejects.toThrow('Consent storage unavailable');
  });
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
      expect.objectContaining({
        user_id: 'user',
        pedagogy_consent: false,
        pedagogy_consent_decided_at: expect.any(String),
      }),
      { onConflict: 'user_id' },
    );
  });
  it('returns a stored choice only after an explicit decision', async () => {
    const epoch = '00000000-0036-4000-8000-000000000099';
    mocks.maybeSingle.mockResolvedValue({
      data: {
        pedagogy_consent: true,
        pedagogy_consent_decided_at: '2026-09-10T00:00:00.000Z',
        collection_epoch: epoch,
      },
      error: null,
    });
    expect(await readConsentState('user')).toEqual({ choice: true, epoch });
    mocks.maybeSingle.mockResolvedValue({
      data: { pedagogy_consent: false, pedagogy_consent_decided_at: null, collection_epoch: epoch },
      error: null,
    });
    expect(await readConsentState('user')).toEqual({ choice: null, epoch });
    mocks.maybeSingle.mockResolvedValue({
      data: { pedagogy_consent: true, pedagogy_consent_decided_at: null },
      error: null,
    });
    await expect(readConsentState('user')).rejects.toThrow('Consent storage unavailable');
  });
});
